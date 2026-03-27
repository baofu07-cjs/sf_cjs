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
      led: { mode: 'manual', enabled: false } as any,
      pump: { mode: 'manual', enabled: false } as any,
      fan1: { mode: 'manual', enabled: false } as any,
      fan2: { mode: 'manual', enabled: false } as any,
    },
  };
  const merged = {
    ...base,
    ...data,
    actuators: { ...base.actuators, ...(data.actuators ?? {}) },
  };
  // legacy mode migration for UI
  (['led', 'pump', 'fan1', 'fan2'] as const).forEach((k) => {
    const s = (merged.actuators as any)[k];
    if (!s) return;
    if (s.mode === 'day_night') {
      (merged.actuators as any)[k] = {
        mode: 'on_off_time',
        enabled: s.enabled !== false,
        timezone: s.timezone || 'Asia/Seoul',
        on_time: s.day_start || '08:00',
        off_time: s.night_start || '20:00',
      };
    } else if (s.mode === 'cycle') {
      (merged.actuators as any)[k] = {
        mode: 'cycle_5s_5m',
        enabled: s.enabled !== false,
        timezone: s.timezone || 'Asia/Seoul',
      };
    } else if (s.mode === 'disabled') {
      (merged.actuators as any)[k] = { mode: 'manual', enabled: false };
    }
  });
  return merged;
}

export default function ActuatorScheduleSettings() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ActuatorSchedulesV1 | null>(null);

  const model = useMemo(() => (data ? ensureDefaults(data) : null), [data]);

  useEffect(() => {
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
  }, []);

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

  const applyPreset = (a: ActuatorScheduleActuator, preset: 'on_off_8_20' | 'cycle_5s_5m') => {
    if (preset === 'on_off_8_20') {
      updateActuator(a, {
        mode: 'on_off_time',
        enabled: true,
        timezone: 'Asia/Seoul',
        on_time: '08:00',
        off_time: '20:00',
      });
    } else {
      updateActuator(a, {
        mode: 'cycle_5s_5m',
        enabled: true,
        timezone: 'Asia/Seoul',
      });
    }
  };

  useEffect(() => {
    if (!model) return;
    const hasAutoMode = ACTUATORS.some(({ key }) => {
      const m = model.actuators[key].mode;
      return m === 'on_off_time' || m === 'cycle_5s_5m';
    });
    if (!hasAutoMode) return;

    const runTick = async () => {
      try {
        await fetch('/api/actuator-schedules/tick');
      } catch (_) {
        // ignore transient network/runtime errors
      }
    };

    runTick();
    const id = setInterval(runTick, 5000);
    return () => clearInterval(id);
  }, [model]);

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
          <div className="text-xs text-gray-500">1) 수동 2) ON/OFF 시간 3) 5초ON/5분OFF</div>
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
                const modeForSelect: ActuatorScheduleMode = mode;
                const enabled = (s as any).enabled === true;

                return (
                  <div key={key} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold text-gray-800">{label}</div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => applyPreset(key, 'on_off_8_20')}
                          className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-50"
                        >
                          ON 08:00 / OFF 20:00
                        </button>
                        <button
                          onClick={() => applyPreset(key, 'cycle_5s_5m')}
                          className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-50"
                        >
                          5초ON/5분OFF
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <label className="text-sm">
                        <div className="text-xs text-gray-500 mb-1">모드</div>
                        <select
                          value={modeForSelect}
                          onChange={(e) => {
                            const m = e.target.value as ActuatorScheduleMode;
                            if (m === 'manual') updateActuator(key, { mode: 'manual', enabled: false } as any);
                            else if (m === 'on_off_time')
                              updateActuator(key, {
                                mode: 'on_off_time',
                                enabled: true,
                                timezone: 'Asia/Seoul',
                                on_time: '08:00',
                                off_time: '20:00',
                              });
                            else
                              updateActuator(key, {
                                mode: 'cycle_5s_5m',
                                enabled: true,
                                timezone: 'Asia/Seoul',
                              });
                          }}
                          className="w-full border border-gray-300 rounded px-2 py-2"
                        >
                          <option value="manual">수동</option>
                          <option value="on_off_time">ON/OFF 시간</option>
                          <option value="cycle_5s_5m">5초ON/5분OFF</option>
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
                          disabled={s.mode === 'manual'}
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

                    {s.mode === 'on_off_time' && (
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {(() => {
                          const onTime = s.on_time;
                          const offTime = s.off_time;
                          return (
                            <>
                        <label className="text-sm">
                          <div className="text-xs text-gray-500 mb-1">ON 시간</div>
                          <input
                            value={onTime}
                            onChange={(e) =>
                              updateActuator(key, {
                                mode: 'on_off_time',
                                enabled,
                                timezone: (s as any).timezone || 'Asia/Seoul',
                                on_time: e.target.value,
                                off_time: offTime,
                              })
                            }
                            className="w-full border border-gray-300 rounded px-2 py-2"
                            placeholder="08:00"
                          />
                        </label>
                        <label className="text-sm">
                          <div className="text-xs text-gray-500 mb-1">OFF 시간</div>
                          <input
                            value={offTime}
                            onChange={(e) =>
                              updateActuator(key, {
                                mode: 'on_off_time',
                                enabled,
                                timezone: (s as any).timezone || 'Asia/Seoul',
                                on_time: onTime,
                                off_time: e.target.value,
                              })
                            }
                            className="w-full border border-gray-300 rounded px-2 py-2"
                            placeholder="20:00"
                          />
                        </label>
                            </>
                          );
                        })()}
                      </div>
                    )}

                    {s.mode === 'cycle_5s_5m' && (
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="text-sm">
                          <div className="text-xs text-gray-500 mb-1">고정 반복</div>
                          <input
                            value="ON 5초 / OFF 5분"
                            readOnly
                            className="w-full border border-gray-300 rounded px-2 py-2 bg-gray-50"
                          />
                        </label>
                        <div className="text-xs text-gray-500 flex items-end">
                          자동 실행 중 (5초 주기로 tick 평가)
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
                  이 화면이 열려있는 동안 `/api/actuator-schedules/tick`가 자동 호출됩니다.
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

