import { NextRequest, NextResponse } from 'next/server';
import { ActuatorType } from '@/types/actuator';
import mqtt from 'mqtt';

/**
 * 액츄에이터 현재 상태 조회 API
 * GET /api/actuators/status
 */

// 동적 렌더링 강제 (실시간 데이터 조회)
export const dynamic = 'force-dynamic';

type ActuatorKey = 'led' | 'pump' | 'fan1' | 'fan2';

async function readActuatorStatusFromMQTT(timeoutMs = 1500) {
  const brokerUrl = process.env.MQTT_BROKER_URL;
  const username = process.env.MQTT_USERNAME;
  const password = process.env.MQTT_PASSWORD;
  const clientId = `${process.env.MQTT_CLIENT_ID || 'smartfarm-web'}-status-${Date.now()}`;

  if (!brokerUrl || !username || !password) {
    throw new Error('MQTT env missing');
  }

  const topics: Record<ActuatorKey, string> = {
    led: 'smartfarm/actuator-status/led',
    pump: 'smartfarm/actuator-status/pump',
    fan1: 'smartfarm/actuator-status/fan1',
    fan2: 'smartfarm/actuator-status/fan2',
  };

  const got: Partial<Record<ActuatorKey, boolean>> = {};

  const client = mqtt.connect(brokerUrl, {
    clientId,
    username,
    password,
    clean: true,
    reconnectPeriod: 0,
    connectTimeout: 8000,
    keepalive: 30,
  });

  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('mqtt connect timeout')), 9000);
    client.once('connect', () => {
      clearTimeout(t);
      resolve();
    });
    client.once('error', (e) => {
      clearTimeout(t);
      reject(e);
    });
  });

  await new Promise<void>((resolve, reject) => {
    client.subscribe(Object.values(topics), { qos: 1 }, (err) => (err ? reject(err) : resolve()));
  });

  const done = await new Promise<boolean>((resolve) => {
    const t = setTimeout(() => resolve(false), timeoutMs);
    const onMsg = (topic: string, payload: Buffer) => {
      const key = (Object.keys(topics) as ActuatorKey[]).find((k) => topics[k] === topic);
      if (!key) return;
      try {
        const parsed = JSON.parse(payload.toString());
        if (typeof parsed?.state === 'boolean') {
          got[key] = parsed.state;
        }
      } catch {
        // ignore
      }

      const all = (Object.keys(topics) as ActuatorKey[]).every((k) => typeof got[k] === 'boolean');
      if (all) {
        clearTimeout(t);
        client.off('message', onMsg);
        resolve(true);
      }
    };
    client.on('message', onMsg);
  });

  try {
    client.end(true);
  } catch {
    // ignore
  }

  return { got, done };
}

export async function GET(request: NextRequest) {
  try {
    const { got, done } = await readActuatorStatusFromMQTT(1500);
    const states: Record<ActuatorKey, boolean> = {
      led: Boolean(got.led),
      pump: Boolean(got.pump),
      fan1: Boolean(got.fan1),
      fan2: Boolean(got.fan2),
    };

    return NextResponse.json({
      success: true,
      data: {
        led: {
          enabled: states.led,
          brightness: states.led ? 100 : 0,
        },
        pump: {
          enabled: states.pump,
        },
        fan1: {
          enabled: states.fan1,
        },
        fan2: {
          enabled: states.fan2,
        },
      },
      from_mqtt: true,
      complete: done,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[API] 액츄에이터 상태 조회 오류:', error);
    return NextResponse.json(
      { error: '액츄에이터 상태 조회에 실패했습니다.', details: error instanceof Error ? error.message : '알 수 없는 오류' },
      { status: 500 }
    );
  }
}
