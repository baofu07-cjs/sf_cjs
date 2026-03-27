import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { ActuatorSchedulesV2 } from '@/types/actuatorSchedule';

export const dynamic = 'force-dynamic';

const SETTING_KEY_V1 = 'actuator_schedules_v1';
const SETTING_KEY_V2 = 'actuator_schedules_v2';
const DEFAULT_TZ = 'Asia/Seoul';

function forceAllAutoOff(s: ActuatorSchedulesV2): ActuatorSchedulesV2 {
  const next: ActuatorSchedulesV2 = JSON.parse(JSON.stringify(s));
  (['led', 'pump', 'fan1', 'fan2'] as const).forEach((k) => {
    if (next.actuators?.[k]) {
      next.actuators[k].auto_on = false;
    }
  });
  next.version = 2;
  next.updated_at = new Date().toISOString();
  return next;
}

function defaultSchedules(): ActuatorSchedulesV2 {
  const now = new Date().toISOString();
  return {
    version: 2,
    updated_at: now,
    actuators: {
      led: { auto_on: false, timezone: DEFAULT_TZ, on_time: '08:00', off_time: '20:00', repeat_on: 0, repeat_off: 0, repeat_unit: 'min' },
      pump: { auto_on: false, timezone: DEFAULT_TZ, on_time: '08:00', off_time: '20:00', repeat_on: 0, repeat_off: 0, repeat_unit: 'min' },
      fan1: { auto_on: false, timezone: DEFAULT_TZ, on_time: '08:00', off_time: '20:00', repeat_on: 0, repeat_off: 0, repeat_unit: 'min' },
      fan2: { auto_on: false, timezone: DEFAULT_TZ, on_time: '08:00', off_time: '20:00', repeat_on: 0, repeat_off: 0, repeat_unit: 'min' },
    },
  };
}

function migrateV1ToV2(v1: any): ActuatorSchedulesV2 {
  const base = defaultSchedules();
  const next: ActuatorSchedulesV2 = JSON.parse(JSON.stringify(base));

  (['led', 'pump', 'fan1', 'fan2'] as const).forEach((k) => {
    const s = v1?.actuators?.[k];
    if (!s) return;

    // 이전 구조에서 enabled=true인 경우만 auto_on으로 해석
    const enabled = Boolean(s.enabled);
    const tz = s.timezone || DEFAULT_TZ;

    if (s.mode === 'on_off_time') {
      next.actuators[k] = {
        auto_on: enabled,
        timezone: tz,
        on_time: s.on_time || '08:00',
        off_time: s.off_time || '20:00',
        repeat_on: 0,
        repeat_off: 0,
        repeat_unit: 'min',
      };
      return;
    }

    if (s.mode === 'cycle_5s_5m') {
      next.actuators[k] = {
        auto_on: enabled,
        timezone: tz,
        on_time: '00:00',
        off_time: '00:00',
        repeat_on: 5,
        repeat_off: 5,
        repeat_unit: 'min',
      };
      return;
    }

    // 그 외는 수동 시작으로 둠
    next.actuators[k] = { ...base.actuators[k], auto_on: false, timezone: tz };
  });

  next.updated_at = new Date().toISOString();
  return next;
}

export async function GET(_request: NextRequest) {
  try {
    const supabase = createServiceClient();

    // v2 우선 조회
    const { data, error } = await supabase
      .from('system_settings')
      .select('*')
      .in('setting_key', [SETTING_KEY_V2, SETTING_KEY_V1])
      .limit(1);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const rows = data || [];
    const rowV2 = rows.find((r: any) => r.setting_key === SETTING_KEY_V2) ?? null;
    const rowV1 = rows.find((r: any) => r.setting_key === SETTING_KEY_V1) ?? null;

    const valueV2 = (rowV2?.setting_value as ActuatorSchedulesV2 | null) ?? null;
    if (valueV2?.version === 2) {
      const forced = forceAllAutoOff(valueV2);
      // DB에 auto_on=true가 남아있으면 즉시 OFF로 덮어씀 (수동 기본 원칙)
      const hadAnyAutoOn = (['led', 'pump', 'fan1', 'fan2'] as const).some((k) => Boolean(valueV2.actuators?.[k]?.auto_on));
      if (hadAnyAutoOn) {
        await supabase.from('system_settings').upsert(
          {
            setting_key: SETTING_KEY_V2,
            setting_value: forced as unknown as any,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'setting_key' }
        );
      }
      return NextResponse.json({ success: true, data: forced, from_db: true });
    }

    const valueV1 = (rowV1?.setting_value as any) ?? null;
    const normalized = forceAllAutoOff(valueV1 ? migrateV1ToV2(valueV1) : defaultSchedules());

    return NextResponse.json({
      success: true,
      data: normalized,
      from_db: Boolean(valueV2 || valueV1),
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { data?: ActuatorSchedulesV2 };
    if (!body?.data) {
      return NextResponse.json({ success: false, error: 'data is required' }, { status: 400 });
    }

    const next: ActuatorSchedulesV2 = {
      ...body.data,
      version: 2,
      updated_at: new Date().toISOString(),
    };
    const forced = forceAllAutoOff(next);

    const supabase = createServiceClient();

    // upsert by unique key
    const { error } = await supabase.from('system_settings').upsert(
      {
        setting_key: SETTING_KEY_V2,
        setting_value: forced as unknown as any,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'setting_key' }
    );

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: forced });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'unknown error' },
      { status: 500 }
    );
  }
}

