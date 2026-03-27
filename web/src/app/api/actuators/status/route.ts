import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { ActuatorType } from '@/types/actuator';
import { initMQTTClient } from '@/lib/mqtt';
import { getMQTTClient } from '@/lib/mqtt';

/**
 * 액츄에이터 현재 상태 조회 API
 * GET /api/actuators/status
 */

// 동적 렌더링 강제 (실시간 데이터 조회)
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // 폴링 요청이 들어올 때마다 MQTT 연결을 보장해
    // 아두이노의 actuator-status 메시지가 DB에 저장되도록 유지
    try {
      await initMQTTClient();
    } catch (_) {
      // MQTT 연결 실패해도 상태 조회는 계속 진행
    }

    const supabase = createServiceClient();

    const actuatorTypes: ActuatorType[] = ['led', 'pump', 'fan1', 'fan2'];
    const states: Record<string, { enabled: boolean; value: number | null }> = {};

    for (const actuatorType of actuatorTypes) {
      // MQTT retained 상태를 즉시 읽어오면(DB 저장 지연/서버리스 레이스 없이) 수동 UI가 되돌아가지 않음
      try {
        const mqtt = getMQTTClient();
        const s = await mqtt.fetchActuatorStatusOnce(actuatorType, 1200);
        if (typeof s === 'boolean') {
          if (actuatorType === 'led') {
            states[actuatorType] = { enabled: s, value: s ? 100 : 0 };
          } else {
            states[actuatorType] = { enabled: s, value: null };
          }
          continue;
        }
      } catch (_) {
        // ignore and fallback to DB
      }

      // 1) Arduino 상태(user_id null) 우선
      const { data: statusRows } = await supabase
        .from('actuator_control')
        .select('*')
        .eq('actuator_type', actuatorType)
        .is('user_id', null)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(1);
      const statusLatest = statusRows && statusRows.length > 0 ? statusRows[0] : null;

      // 2) 최근 수동 명령(user_id not null)이 더 최신이면, 상태가 아직 안 올라온 것으로 보고 임시로 표시
      const { data: cmdRows } = await supabase
        .from('actuator_control')
        .select('*')
        .eq('actuator_type', actuatorType)
        .not('user_id', 'is', null)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(1);
      const cmdLatest = cmdRows && cmdRows.length > 0 ? cmdRows[0] : null;

      const latestRecord = (() => {
        if (!statusLatest && !cmdLatest) return null;
        if (statusLatest && !cmdLatest) return statusLatest;
        if (!statusLatest && cmdLatest) return cmdLatest;
        const statusT = new Date(statusLatest!.created_at).getTime();
        const cmdT = new Date(cmdLatest!.created_at).getTime();
        // status가 없고 명령만 최신인 경우가 길게 유지되면 실제 반영 실패이므로,
        // 명령 표시는 짧게(10초)만 허용하고 이후는 status 기준으로 되돌림
        if (cmdT > statusT && Date.now() - cmdT < 10_000) return cmdLatest!;
        return statusLatest!;
      })();

      if (latestRecord) {
        if (actuatorType === 'led') {
          // LED의 경우: 'off'이면 disabled, 'on' 또는 'set'이면 enabled
          let isEnabled = false;
          if (latestRecord.action === 'off') {
            isEnabled = false;
          } else if (latestRecord.action === 'on') {
            isEnabled = true;
          } else if (latestRecord.action === 'set') {
            // 'set' 액션의 경우 밝기가 0보다 크면 enabled
            isEnabled = latestRecord.value !== null && latestRecord.value > 0;
          }
          states[actuatorType] = {
            enabled: isEnabled,
            value: latestRecord.value,
          };
        } else {
          // 다른 액츄에이터의 경우:
          // - 'on'이면 enabled
          // - 'off'이면 disabled
          // - 'set'이면 value(0/1)로 판정
          let isEnabled = false;
          if (latestRecord.action === 'on') {
            isEnabled = true;
          } else if (latestRecord.action === 'off') {
            isEnabled = false;
          } else if (latestRecord.action === 'set') {
            isEnabled = latestRecord.value !== null && latestRecord.value > 0;
          }

          states[actuatorType] = {
            enabled: isEnabled,
            value: latestRecord.value,
          };
        }
      } else {
        states[actuatorType] = {
          enabled: false,
          value: null,
        };
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        led: {
          enabled: states.led.enabled,
          brightness: states.led.value,
        },
        pump: {
          enabled: states.pump.enabled,
        },
        fan1: {
          enabled: states.fan1.enabled,
        },
        fan2: {
          enabled: states.fan2.enabled,
        },
      },
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
