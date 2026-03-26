'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ActuatorSchedulesV1,
  ActuatorScheduleActuator,
  ActuatorScheduleMode,
  ActuatorSchedule,
} from '@/types/actuatorSchedule';

const ACTUATORS: Array<{ key: ActuatorScheduleActuator; label: string }> = [
  { key: 'led', label: 'LED(7)' },
  { key: 'pump', label: '펌프(4)' },
  { key: 'fan1', label: '팬1(5)' },
  { key: 'fan2', label: '팬2(6)' },
];

function ensureDefaults(data: ActuatorSchedulesV1): ActuatorSchedulesV1 {
  const base: ActuatorSchedulesV1 = {
    version: 1,
    updated_at: data.updated_at ?? new Date().toISOString(),
    actuators: {
      led: { mode: 'disabled', enabled: false },
      pump: { mode: 'disabled', enabled: false },
      fan1: { mode: 'disabled', enabled: false },
      fan2: { mode: 'disabled', enabled: false },
    },
  };
  return {
    ...base,
    ...data,
    actuators: { ...base.actuators, ...(data.actuators ?? {}) },
  };
}

export default function ActuatorScheduleSettings() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ActuatorSchedulesV1 | null>(null);

  const model = useMemo(() => (data ? ensureDefaults(data) : null), [data]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/actuator-schedules');
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || '스케줄을 불러오지 못했습니다.');
        if (!cancelled) setData(json.data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '알 수 없는 오류');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const updateActuator = (a: ActuatorScheduleActuator, next: ActuatorSchedule) => {
    setData((prev) => {
      const cur = prev ?? {
        version: 1,
        updated_at: new Date().toISOString(),
        actuators: { led: { mode: 'disabled', enabled: false }, pump: { mode: 'disabled', enabled: false }, fan1: { mode: 'disabled', enabled: false }, fan2: { mode: 'disabled', enabled: false } },
      };
      return {
        ...cur,
        actuators: {
          ...cur.actuators,
          [a]: next,
        },
      };
    });
  };

  const applyPreset = (a: ActuatorScheduleActuator, preset: 'day_on_night_off' | 'cycle_1_30') => {
    if (preset === 'day_on_night_off') {
      updateActuator(a, {
        mode: 'day_night',
        enabled: true,
        timezone: 'Asia/Seoul',
        day_start: '08:00',
        night_start: '20:00',
        day_state: 'on',
        night_state: 'off',
      });
    } else {
      updateActuator(a, {
        mode: 'cycle',
        enabled: true,
        timezone: 'Asia/Seoul',
        on_minutes: 1,
        off_minutes: 30,
      });
    }
  };

  const save = async () => {
    if (!model) return;
    try {
      setSaving(true);
      setError(null);
      const res = await fetch('/api/actuator-schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: model }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || '저장 실패');
      setData(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류');
    } finally {
      setSaving(false);
    }
  };

  const runTickNow = async () => {
    try {
      setError(null);
      const res = await fetch('/api/actuator-schedules/tick');
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || '실행 실패');
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류');
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-lg font-semibold text-gray-800">타임 설정</div>
          <div className="text-xs text-gray-500">주간ON/야간OFF, 1분ON/30분OFF 등</div>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="px-3 py-2 rounded-md text-sm font-medium bg-gray-900 text-white hover:bg-gray-800"
        >
          {open ? '닫기' : '열기'}
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-4">
          {loading && <div className="text-sm text-gray-600">불러오는 중...</div>}
          {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded">{error}</div>}

          {model && (
            <>
              {ACTUATORS.map(({ key, label }) => {
                const s = model.actuators[key];
                const mode: ActuatorScheduleMode = s.mode;
                const enabled = (s as any).enabled === true;

                return (
                  <div key={key} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold text-gray-800">{label}</div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => applyPreset(key, 'day_on_night_off')}
                          className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-50"
                        >
                          주간ON/야간OFF
                        </button>
                        <button
                          onClick={() => applyPreset(key, 'cycle_1_30')}
                          className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-50"
                        >
                          1분ON/30분OFF
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <label className="text-sm">
                        <div className="text-xs text-gray-500 mb-1">모드</div>
                        <select
                          value={mode}
                          onChange={(e) => {
                            const m = e.target.value as ActuatorScheduleMode;
                            if (m === 'disabled') updateActuator(key, { mode: 'disabled', enabled: false });
                            else if (m === 'day_night')
                              updateActuator(key, {
                                mode: 'day_night',
                                enabled: true,
                                timezone: 'Asia/Seoul',
                                day_start: '08:00',
                                night_start: '20:00',
                                day_state: 'on',
                                night_state: 'off',
                              });
                            else
                              updateActuator(key, {
                                mode: 'cycle',
                                enabled: true,
                                timezone: 'Asia/Seoul',
                                on_minutes: 1,
                                off_minutes: 30,
                              });
                          }}
                          className="w-full border border-gray-300 rounded px-2 py-2"
                        >
                          <option value="disabled">사용 안 함</option>
                          <option value="day_night">주간/야간</option>
                          <option value="cycle">반복(ON/OFF)</option>
                        </select>
                      </label>

                      <label className="text-sm">
                        <div className="text-xs text-gray-500 mb-1">활성</div>
                        <select
                          value={enabled ? 'on' : 'off'}
                          onChange={(e) => {
                            const en = e.target.value === 'on';
                            if (s.mode === 'disabled') return;
                            updateActuator(key, { ...(s as any), enabled: en });
                          }}
                          disabled={s.mode === 'disabled'}
                          className="w-full border border-gray-300 rounded px-2 py-2 disabled:bg-gray-100"
                        >
                          <option value="on">ON</option>
                          <option value="off">OFF</option>
                        </select>
                      </label>

                      <label className="text-sm">
                        <div className="text-xs text-gray-500 mb-1">타임존</div>
                        <input
                          value={s.mode === 'disabled' ? 'Asia/Seoul' : (s as any).timezone}
                          onChange={(e) => {
                            if (s.mode === 'disabled') return;
                            updateActuator(key, { ...(s as any), timezone: e.target.value });
                          }}
                          disabled={s.mode === 'disabled'}
                          className="w-full border border-gray-300 rounded px-2 py-2 disabled:bg-gray-100"
                        />
                      </label>
                    </div>

                    {s.mode === 'day_night' && (
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <label className="text-sm">
                          <div className="text-xs text-gray-500 mb-1">주간 시작</div>
                          <input
                            value={s.day_start}
                            onChange={(e) => updateActuator(key, { ...s, day_start: e.target.value })}
                            className="w-full border border-gray-300 rounded px-2 py-2"
                            placeholder="08:00"
                          />
                        </label>
                        <label className="text-sm">
                          <div className="text-xs text-gray-500 mb-1">야간 시작</div>
                          <input
                            value={s.night_start}
                            onChange={(e) => updateActuator(key, { ...s, night_start: e.target.value })}
                            className="w-full border border-gray-300 rounded px-2 py-2"
                            placeholder="20:00"
                          />
                        </label>
                        <label className="text-sm">
                          <div className="text-xs text-gray-500 mb-1">주간 상태</div>
                          <select
                            value={s.day_state}
                            onChange={(e) => updateActuator(key, { ...s, day_state: e.target.value as any })}
                            className="w-full border border-gray-300 rounded px-2 py-2"
                          >
                            <option value="on">ON</option>
                            <option value="off">OFF</option>
                          </select>
                        </label>
                        <label className="text-sm">
                          <div className="text-xs text-gray-500 mb-1">야간 상태</div>
                          <select
                            value={s.night_state}
                            onChange={(e) => updateActuator(key, { ...s, night_state: e.target.value as any })}
                            className="w-full border border-gray-300 rounded px-2 py-2"
                          >
                            <option value="off">OFF</option>
                            <option value="on">ON</option>
                          </select>
                        </label>
                      </div>
                    )}

                    {s.mode === 'cycle' && (
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <label className="text-sm">
                          <div className="text-xs text-gray-500 mb-1">ON (분)</div>
                          <input
                            type="number"
                            value={s.on_minutes}
                            onChange={(e) => updateActuator(key, { ...s, on_minutes: Number(e.target.value) })}
                            className="w-full border border-gray-300 rounded px-2 py-2"
                            min={0}
                          />
                        </label>
                        <label className="text-sm">
                          <div className="text-xs text-gray-500 mb-1">OFF (분)</div>
                          <input
                            type="number"
                            value={s.off_minutes}
                            onChange={(e) => updateActuator(key, { ...s, off_minutes: Number(e.target.value) })}
                            className="w-full border border-gray-300 rounded px-2 py-2"
                            min={0}
                          />
                        </label>
                        <div className="text-xs text-gray-500 flex items-end">
                          예: 1 / 30 = 1분 켜짐 → 30분 꺼짐 반복
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={save}
                  disabled={saving}
                  className="px-4 py-2 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300"
                >
                  {saving ? '저장 중...' : '저장'}
                </button>
                <button
                  onClick={runTickNow}
                  className="px-4 py-2 rounded-md text-sm font-medium bg-gray-100 border border-gray-300 hover:bg-gray-50"
                >
                  지금 실행(테스트)
                </button>
                <div className="text-xs text-gray-500">
                  실제 자동실행은 `/api/actuator-schedules/tick`를 1분마다 호출해야 합니다.
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

