export type ActuatorScheduleActuator = 'led' | 'pump' | 'fan1' | 'fan2';

export type RepeatUnit = 'sec' | 'min';

export interface ActuatorAutoScheduleV2 {
  // 기본은 수동 시작: auto_on=false
  auto_on: boolean;
  timezone: string; // e.g. "Asia/Seoul"
  on_time: string; // "HH:mm"
  off_time: string; // "HH:mm"
  repeat_on: number; // 0이면 반복 사용 안 함
  repeat_off: number; // 0이면 반복 사용 안 함
  repeat_unit: RepeatUnit; // sec or min
}

export interface ActuatorSchedulesV2 {
  version: 2;
  updated_at: string; // ISO
  actuators: Record<ActuatorScheduleActuator, ActuatorAutoScheduleV2>;
}

