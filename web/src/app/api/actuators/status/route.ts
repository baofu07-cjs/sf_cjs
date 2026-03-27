import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { ActuatorType } from '@/types/actuator';

/**
 * 액츄에이터 현재 상태 조회 API
 * GET /api/actuators/status
 */

// 동적 렌더링 강제 (실시간 데이터 조회)
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = createServiceClient();

    const actuatorTypes: ActuatorType[] = ['led', 'pump', 'fan1', 'fan2'];
    const states: Record<string, { enabled: boolean; value: number | null }> = {};

    for (const actuatorType of actuatorTypes) {
      const { data, error } = await supabase
        .from('actuator_control')
        .select('*')
        .eq('actuator_type', actuatorType)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(1);

      // .single() 대신 배열의 첫 번째 요소 사용
      const latestRecord = data && data.length > 0 ? data[0] : null;

      if (!error && latestRecord) {
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
