import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getMQTTClient } from '@/lib/mqtt';
import { ActuatorSchedulesV2, ActuatorScheduleActuator } from '@/types/actuatorSchedule';
import { MQTTActuatorTopic } from '@/types/mqtt';

export const dynamic = 'force-dynamic';

const SETTING_KEY = 'actuator_schedules_v2';
const DEFAULT_TZ = 'Asia/Seoul';

function parseHHMM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function getLocalParts(timeZone: string, date = new Date()): { minutes: number; day: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  });
  const parts = fmt.formatToParts(date);
  const hh = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const wd = (parts.find((p) => p.type === 'weekday')?.value ?? 'Sun').toLowerCase();
  const map: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  return { minutes: hh * 60 + mm, day: map[wd] ?? 0 };
}

function desiredStateForSchedule(
  schedule: ActuatorSchedulesV2['actuators'][ActuatorScheduleActuator] | undefined,
  now: Date
): boolean | null {
  if (!schedule) return null;
  if (!schedule.auto_on) return null;

  const tz = schedule.timezone || DEFAULT_TZ;
  const { minutes: nowMin } = getLocalParts(tz, now);

  const onMin = parseHHMM(schedule.on_time) ?? 8 * 60;
  const offMin = parseHHMM(schedule.off_time) ?? 20 * 60;

  // 시간 범위(inWindow) 계산: 동일하면 "항상 윈도우"로 취급
  const inWindow =
    onMin === offMin
      ? true
      : onMin < offMin
        ? nowMin >= onMin && nowMin < offMin
        : nowMin >= onMin || nowMin < offMin;

  if (!inWindow) return false;

  const unitMul = schedule.repeat_unit === 'sec' ? 1 : 60;
  const onSec = Math.max(0, Math.floor(schedule.repeat_on * unitMul));
  const offSec = Math.max(0, Math.floor(schedule.repeat_off * unitMul));

  // 0,0이면 반복 없음: 윈도우 안에서는 ON 유지
  if (onSec === 0 && offSec === 0) return true;
  if (onSec <= 0 || offSec <= 0) return true;

  // 반복은 윈도우 시작 시간을 기준 anchor로 삼음
  const unixSec = Math.floor(now.getTime() / 1000);
  const period = onSec + offSec;
  if (period <= 0) return true;

  // anchor: 오늘의 on_time(로컬) -> 정확한 절대초 계산이 복잡하므로, 분 단위 anchor로 근사
  // (tick이 1초 주기로 호출되므로, 상태는 실제 동작에 충분히 안정적)
  const anchorMin = onMin;
  const posSec = ((nowMin - anchorMin + 24 * 60) % (24 * 60)) * 60;
  return (posSec % period) < onSec;
}

async function getSchedules(supabase: ReturnType<typeof createServiceClient>): Promise<ActuatorSchedulesV2 | null> {
  const { data, error } = await supabase
    .from('system_settings')
    .select('*')
    .eq('setting_key', SETTING_KEY)
    .limit(1);

  if (error) throw new Error(error.message);
  const row = data && data.length > 0 ? data[0] : null;
  return (row?.setting_value as ActuatorSchedulesV2 | null) ?? null;
}

async function getLatestAction(
  supabase: ReturnType<typeof createServiceClient>,
  actuatorType: ActuatorScheduleActuator
): Promise<'on' | 'off' | 'set' | null> {
  const { data, error } = await supabase
    .from('actuator_control')
    .select('*')
    .eq('actuator_type', actuatorType)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1);
  if (error) return null;
  const row = data && data.length > 0 ? data[0] : null;
  return (row?.action as any) ?? null;
}

async function applyActuator(actuatorType: ActuatorScheduleActuator, on: boolean) {
  const topic: MQTTActuatorTopic = `smartfarm/actuators/${actuatorType}` as MQTTActuatorTopic;
  const message = { state: on };

  const mqtt = getMQTTClient();
  if (!mqtt.getConnected()) {
    await mqtt.connect();
  }
  mqtt.publish(topic, message, { qos: 1 });

  const supabase = createServiceClient();
  await supabase.from('actuator_control').insert({
    actuator_type: actuatorType,
    action: on ? 'on' : 'off',
    value: null,
    user_id: null,
  });
}

/**
 * GET /api/actuator-schedules/tick
 *
 * 이 엔드포인트는 "현재 시간" 기준으로 스케줄을 평가해
 * 필요한 경우 MQTT로 on/off를 발행합니다.
 *
 * Vercel Cron 등으로 1분마다 호출하는 것을 권장합니다.
 */
export async function GET(_request: NextRequest) {
  try {
    const supabase = createServiceClient();
    const schedules = await getSchedules(supabase);
    if (!schedules) {
      return NextResponse.json({ success: true, applied: [], skipped: ['no_schedules'] });
    }

    const now = new Date();
    const actuators: ActuatorScheduleActuator[] = ['led', 'pump', 'fan1', 'fan2'];
    const applied: Array<{ actuator: ActuatorScheduleActuator; state: 'on' | 'off' }> = [];
    const skipped: Array<{ actuator: ActuatorScheduleActuator; reason: string }> = [];

    for (const a of actuators) {
      const schedule = schedules.actuators?.[a];
      const desired = desiredStateForSchedule(schedule, now);
      if (desired === null) {
        skipped.push({ actuator: a, reason: 'disabled_or_invalid' });
        continue;
      }

      const latest = await getLatestAction(supabase, a);
      const desiredAction: 'on' | 'off' = desired ? 'on' : 'off';
      if (latest === desiredAction) {
        skipped.push({ actuator: a, reason: 'already_in_state' });
        continue;
      }

      await applyActuator(a, desired);
      applied.push({ actuator: a, state: desiredAction });
    }

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      applied,
      skipped,
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'unknown error' },
      { status: 500 }
    );
  }
}

