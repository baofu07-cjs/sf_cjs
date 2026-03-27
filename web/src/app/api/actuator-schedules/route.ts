import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { ActuatorSchedulesV1 } from '@/types/actuatorSchedule';

export const dynamic = 'force-dynamic';

const SETTING_KEY = 'actuator_schedules_v1';

function defaultSchedules(): ActuatorSchedulesV1 {
  const now = new Date().toISOString();
  return {
    version: 1,
    updated_at: now,
    actuators: {
      led: {
        mode: 'manual',
        enabled: false,
      },
      pump: {
        mode: 'manual',
        enabled: false,
      },
      fan1: {
        mode: 'manual',
        enabled: false,
      },
      fan2: {
        mode: 'manual',
        enabled: false,
      },
    },
  };
}

function migrateLegacyModes(data: ActuatorSchedulesV1): ActuatorSchedulesV1 {
  const migrated: ActuatorSchedulesV1 = JSON.parse(JSON.stringify(data));
  (['led', 'pump', 'fan1', 'fan2'] as const).forEach((k) => {
    const s = migrated.actuators[k] as any;
    if (!s) return;
    if (s.mode === 'day_night') {
      migrated.actuators[k] = {
        mode: 'on_off_time',
        enabled: s.enabled !== false,
        timezone: s.timezone || 'Asia/Seoul',
        on_time: s.day_start || '08:00',
        off_time: s.night_start || '20:00',
      } as any;
    } else if (s.mode === 'cycle') {
      migrated.actuators[k] = {
        mode: 'cycle_5s_5m',
        enabled: s.enabled !== false,
        timezone: 'Asia/Seoul',
      } as any;
    } else if (s.mode === 'disabled') {
      migrated.actuators[k] = { mode: 'manual', enabled: false } as any;
    }
  });
  return migrated;
}

export async function GET(_request: NextRequest) {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('system_settings')
      .select('*')
      .eq('setting_key', SETTING_KEY)
      .limit(1);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const row = data && data.length > 0 ? data[0] : null;
    const value = (row?.setting_value as ActuatorSchedulesV1 | null) ?? null;
    const normalized = value ? migrateLegacyModes(value) : defaultSchedules();

    return NextResponse.json({
      success: true,
      data: normalized,
      from_db: Boolean(value),
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
    const body = (await request.json()) as { data?: ActuatorSchedulesV1 };
    if (!body?.data) {
      return NextResponse.json({ success: false, error: 'data is required' }, { status: 400 });
    }

    const next: ActuatorSchedulesV1 = {
      ...body.data,
      version: 1,
      updated_at: new Date().toISOString(),
    };

    const supabase = createServiceClient();

    // upsert by unique key
    const { error } = await supabase.from('system_settings').upsert(
      {
        setting_key: SETTING_KEY,
        setting_value: next as unknown as any,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'setting_key' }
    );

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: next });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'unknown error' },
      { status: 500 }
    );
  }
}

