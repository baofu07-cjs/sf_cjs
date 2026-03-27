import { NextRequest, NextResponse } from 'next/server';
import { ActuatorType } from '@/types/actuator';
import { createServiceClient } from '@/lib/supabase/server';
import { initMQTTClient } from '@/lib/mqtt';

/**
 * 액츄에이터 현재 상태 조회 API
 * GET /api/actuators/status
 */

// 동적 렌더링 강제 (실시간 데이터 조회)
export const dynamic = 'force-dynamic';

type ActuatorKey = 'led' | 'pump' | 'fan1' | 'fan2';

export async function GET(request: NextRequest) {
  try {
    // 서버 프로세스가 살아있는 동안 MQTT 구독으로 DB가 최신 상태를 유지한다.
    try {
      await initMQTTClient();
    } catch (_) {
      // ignore
    }

    const supabase = createServiceClient();
    const readLatest = async (k: ActuatorKey): Promise<boolean> => {
      const { data } = await supabase
        .from('actuator_control')
        .select('action,value')
        .eq('actuator_type', k)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(1);
      const row = data && data.length > 0 ? (data[0] as any) : null;
      if (!row) return false;
      if (k === 'led') {
        if (row.action === 'off') return false;
        if (row.action === 'on') return true;
        if (row.action === 'set') return row.value !== null && row.value > 0;
        return false;
      }
      if (row.action === 'on') return true;
      if (row.action === 'off') return false;
      if (row.action === 'set') return row.value !== null && row.value > 0;
      return false;
    };

    const states: Record<ActuatorKey, boolean> = {
      led: await readLatest('led'),
      pump: await readLatest('pump'),
      fan1: await readLatest('fan1'),
      fan2: await readLatest('fan2'),
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
      from_db: true,
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
