export type ActuatorScheduleMode = 'manual' | 'on_off_time' | 'cycle_5s_5m' | 'disabled' | 'day_night' | 'cycle';

export type ActuatorScheduleActuator = 'led' | 'pump' | 'fan1' | 'fan2';

export interface DayNightSchedule {
  mode: 'day_night';
  enabled: boolean;
  timezone: string; // e.g. "Asia/Seoul"
  day_start: string; // "HH:mm"
  night_start: string; // "HH:mm"
  day_state: 'on' | 'off';
  night_state: 'on' | 'off';
}

export interface OnOffTimeSchedule {
  mode: 'on_off_time';
  enabled: boolean;
  timezone: string; // e.g. "Asia/Seoul"
  on_time: string; // "HH:mm"
  off_time: string; // "HH:mm"
}

export interface Cycle5s5mSchedule {
  mode: 'cycle_5s_5m';
  enabled: boolean;
  timezone: string; // e.g. "Asia/Seoul"
}

export interface CycleSchedule {
  mode: 'cycle';
  enabled: boolean;
  timezone: string; // e.g. "Asia/Seoul"
  on_minutes: number; // e.g. 1
  off_minutes: number; // e.g. 30
  // anchor within day; simplest is midnight local time
}

export type ActuatorSchedule =
  | { mode: 'manual'; enabled: false }
  | { mode: 'disabled'; enabled: false } // legacy fallback
  | OnOffTimeSchedule
  | Cycle5s5mSchedule
  | DayNightSchedule
  | CycleSchedule;

export interface ActuatorSchedulesV1 {
  version: 1;
  updated_at: string; // ISO
  actuators: Record<ActuatorScheduleActuator, ActuatorSchedule>;
}

