'use client';

import { useState } from 'react';
import type { ActuatorAutoScheduleV2, ActuatorScheduleActuator, RepeatUnit } from '@/types/actuatorSchedule';

interface ActuatorControlProps {
  type: ActuatorScheduleActuator;
  label: string;
  icon: string;
  color?: string; // 버튼 색상
  enabled: boolean;
  loading: boolean;
  onToggle: () => Promise<void>;
  schedule: ActuatorAutoScheduleV2 | null;
  scheduleSaving: boolean;
  onScheduleChange: (patch: Partial<ActuatorAutoScheduleV2>) => void;
  onScheduleSave: () => Promise<boolean>;
  onAutoToggle: (nextAutoOn: boolean) => Promise<void>;
}

export default function ActuatorControl({
  type,
  label,
  icon,
  color,
  enabled,
  loading,
  onToggle,
  schedule,
  scheduleSaving,
  onScheduleChange,
  onScheduleSave,
  onAutoToggle,
}: ActuatorControlProps) {
  const [isControlling, setIsControlling] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const isEnabled = enabled;

  const handleToggle = async () => {
    setIsControlling(true);
    await onToggle();
    setIsControlling(false);
  };

  const handleSave = async () => {
    setNotice(null);
    const ok = await onScheduleSave();
    setNotice(ok ? '저장됨' : '저장 실패');
    setTimeout(() => setNotice(null), 1500);
  };

  const handleAutoToggle = async () => {
    if (!schedule) return;
    setNotice(null);
    const next = !schedule.auto_on;
    await onAutoToggle(next);
  };

  const repeatUnit: RepeatUnit = schedule?.repeat_unit ?? 'min';
  const unitLabel = repeatUnit === 'sec' ? '초' : '분';

  return (
    <div className="bg-white rounded-lg shadow-md p-9 border border-gray-200 flex flex-col h-full">
      <div className="flex items-center gap-5 mb-6">
        <span className="text-4xl">{icon}</span>
        <h3 className="text-xl font-semibold text-gray-700 whitespace-nowrap">{label}</h3>
      </div>

      <div>
        {loading || isControlling ? (
          <div className="flex items-center justify-center h-14">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          </div>
        ) : (
          <button
            onClick={handleToggle}
            className={`
              relative w-full h-14 rounded-full transition-all duration-300 ease-in-out
              focus:outline-none focus:ring-2 focus:ring-offset-2
              ${isEnabled 
                ? 'bg-green-500 focus:ring-green-500' 
                : 'bg-gray-300 focus:ring-gray-400'
              }
            `}
          >
            {/* 토글 스위치 내부 레이아웃 */}
            <div className="relative w-full h-full flex items-center justify-between px-4">
              {/* ON 텍스트 */}
              <span className={`
                text-sm font-semibold transition-opacity duration-300
                ${isEnabled ? 'opacity-100 text-white' : 'opacity-0'}
              `}>
                ON
              </span>
              
              {/* OFF 텍스트 */}
              <span className={`
                text-sm font-semibold transition-opacity duration-300
                ${isEnabled ? 'opacity-0' : 'opacity-100 text-gray-600'}
              `}>
                OFF
              </span>
            </div>

            {/* 흰색 원형 손잡이 */}
            <div
              className={`
                absolute top-1 w-12 h-12 bg-white rounded-full shadow-lg
                transition-all duration-300 ease-in-out
                ${isEnabled ? 'left-[calc(100%-3.25rem)]' : 'left-1'}
              `}
            />
          </button>
        )}
      </div>

      {/* 자동 설정 (수동 기준, 자동은 버튼으로 시작) */}
      <div className="mt-6 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs font-semibold text-gray-500 mb-1">ON 시간</div>
            <input
              type="time"
              value={schedule?.on_time ?? '08:00'}
              onChange={(e) => onScheduleChange({ on_time: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-500 mb-1">OFF 시간</div>
            <input
              type="time"
              value={schedule?.off_time ?? '20:00'}
              onChange={(e) => onScheduleChange({ off_time: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs font-semibold text-gray-500 mb-1">반복 ON ({unitLabel})</div>
            <input
              inputMode="numeric"
              value={String(schedule?.repeat_on ?? 0)}
              onChange={(e) => onScheduleChange({ repeat_on: Number(e.target.value || 0) })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-500 mb-1">반복 OFF ({unitLabel})</div>
            <input
              inputMode="numeric"
              value={String(schedule?.repeat_off ?? 0)}
              onChange={(e) => onScheduleChange({ repeat_off: Number(e.target.value || 0) })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <select
            value={repeatUnit}
            onChange={(e) => onScheduleChange({ repeat_unit: e.target.value as RepeatUnit })}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="sec">초</option>
            <option value="min">분</option>
          </select>

          <button
            onClick={handleSave}
            disabled={scheduleSaving}
            className="px-4 py-2 rounded-md bg-gray-900 text-white text-sm font-semibold disabled:opacity-60"
          >
            {scheduleSaving ? '저장중…' : '저장'}
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-700">자동</div>
          <button
            onClick={handleAutoToggle}
            disabled={!schedule || scheduleSaving}
            className={`
              relative w-24 h-10 rounded-full transition-all duration-300
              ${schedule?.auto_on ? 'bg-green-500' : 'bg-gray-300'}
            `}
          >
            <span className="sr-only">자동 ON/OFF</span>
            <div
              className={`
                absolute top-1 w-8 h-8 bg-white rounded-full shadow
                transition-all duration-300 ease-in-out
                ${schedule?.auto_on ? 'left-[calc(100%-2.25rem)]' : 'left-1'}
              `}
            />
            <div className="absolute inset-0 flex items-center justify-between px-3 text-xs font-semibold">
              <span className={schedule?.auto_on ? 'text-white' : 'text-gray-500'}>ON</span>
              <span className={!schedule?.auto_on ? 'text-gray-700' : 'text-white/80'}>OFF</span>
            </div>
          </button>
        </div>

        {notice ? <div className="text-xs text-gray-500">{notice}</div> : null}
        <div className="text-xs text-gray-400">
          반복 ON/OFF가 <b>0,0</b>이면 반복 없이 시간(ON~OFF)만 적용됩니다. 자동 동작은 <b>자동 ON</b>을 눌러야 시작합니다.
        </div>
      </div>
    </div>
  );
}
