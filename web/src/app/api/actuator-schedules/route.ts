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
        mode: 'day_night',
        enabled: true,
        timezone: 'Asia/Seoul',
        day_start: '08:00',
        night_start: '20:00',
        day_state: 'on',
        night_state: 'off',
      },
      pump: {
        mode: 'cycle',
        enabled: true,
        timezone: 'Asia/Seoul',
        on_minutes: 1,
        off_minutes: 30,
      },
      fan1: { mode: 'disabled', enabled: false },
      fan2: { mode: 'disabled', enabled: false },
    },
  };
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

    return NextResponse.json({
      success: true,
      data: value ?? defaultSchedules(),
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

