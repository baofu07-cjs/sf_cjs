import { NextRequest, NextResponse } from 'next/server';
import { getMQTTClient } from '@/lib/mqtt';
import { MQTTTopic } from '@/types/mqtt';

/**
 * MQTT 메시지 발행 프록시 API
 * POST /api/mqtt/publish
 */

// 동적 렌더링 강제 (POST 요청 + 실시간 처리)
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { topic, message } = body;

    if (!topic || !message) {
      return NextResponse.json(
        { error: 'topic과 message가 필요합니다.' },
        { status: 400 }
      );
    }

    // 토픽 유효성 검사
    const validTopics: MQTTTopic[] = [
      'smartfarm/sensors/temperature',
      'smartfarm/sensors/humidity',
      'smartfarm/sensors/ec',
      'smartfarm/sensors/ph',
      'smartfarm/sensors/all',
      'smartfarm/actuators/led',
      'smartfarm/actuators/pump',
      'smartfarm/actuators/fan1',
      'smartfarm/actuators/fan2',
      'smartfarm/actuators/all',
      'smartfarm/actuator-status/led',
      'smartfarm/actuator-status/pump',
      'smartfarm/actuator-status/fan1',
      'smartfarm/actuator-status/fan2',
      'smartfarm/status',
    ];

    if (!validTopics.includes(topic as MQTTTopic)) {
      return NextResponse.json(
        { error: '유효하지 않은 토픽입니다.' },
        { status: 400 }
      );
    }

    const client = getMQTTClient();
    
    if (!client.getConnected()) {
      await client.connect();
    }

    client.publish(topic as MQTTTopic, message, { qos: 1 });

    return NextResponse.json({
      success: true,
      message: '메시지가 발행되었습니다.',
      topic,
    });
  } catch (error) {
    console.error('[API] MQTT 발행 오류:', error);
    return NextResponse.json(
      { error: '메시지 발행에 실패했습니다.', details: error instanceof Error ? error.message : '알 수 없는 오류' },
      { status: 500 }
    );
  }
}
