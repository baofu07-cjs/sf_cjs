'use client';

import ActuatorControl from '@/components/ActuatorControl';
import { useActuatorControl } from '@/hooks/useActuatorControl';
import { useActuatorSchedules } from '@/hooks/useActuatorSchedules';
import { useEffect } from 'react';

export default function ActuatorPage() {
  const { state, loading, controlActuator } = useActuatorControl();
  const { data: schedules, savingBy, updateActuator, saveAll, saveActuatorPatch, anyAutoOn } = useActuatorSchedules();

  useEffect(() => {
    if (!anyAutoOn) return;
    const id = window.setInterval(() => {
      fetch('/api/actuator-schedules/tick').catch(() => {});
    }, 1000);
    return () => window.clearInterval(id);
  }, [anyAutoOn]);

  const handleToggle = async (type: 'led' | 'pump' | 'fan1' | 'fan2') => {
    // 수동 조작 시 자동을 끄고(수동 기준), 명령이 되돌아가지 않게 함
    updateActuator(type, { auto_on: false }); // UI 즉시 반영
    await saveActuatorPatch(type, { auto_on: false }); // 서버에 확정 저장
    const action = state[type].enabled ? 'off' : 'on';
    await controlActuator(type, action);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* 헤더 */}
        <div className="mb-8">
          <h1 className="text-5xl font-bold text-gray-900 mb-3">
            ⚙️ 액츄에이터 제어
          </h1>
          <div className="text-xl text-gray-500 font-semibold">
            {new Date().toLocaleDateString('ko-KR', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              weekday: 'long',
            })} {new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
          </div>
        </div>

        {/* 액츄에이터 섹션 */}
        <div className="bg-green-100 rounded-xl p-8 border-2 border-green-400 shadow-lg">
          <div className="mb-6">
            <h2 className="text-3xl font-bold text-green-900 mb-2">액츄에이터 제어</h2>
            <div className="h-1 w-24 bg-green-600 rounded-full"></div>
          </div>

          <div className="space-y-6">
            <div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
                <ActuatorControl
                  type="pump"
                  label="펌프"
                  icon="⚙️"
                  color="#3b82f6"
                  enabled={state.pump.enabled}
                  loading={loading}
                  onToggle={() => handleToggle('pump')}
                  schedule={schedules?.actuators.pump ?? null}
                  scheduleSaving={savingBy.pump}
                  onScheduleChange={(patch) => updateActuator('pump', patch)}
                  onScheduleSave={async () => await saveActuatorPatch('pump', schedules?.actuators.pump ?? {})}
                  onAutoToggle={async (nextAutoOn) => {
                    updateActuator('pump', { auto_on: nextAutoOn });
                    await saveActuatorPatch('pump', { auto_on: nextAutoOn });
                  }}
                />
                <ActuatorControl
                  type="fan1"
                  label="팬 1"
                  icon="🔄"
                  color="#a3e635"
                  enabled={state.fan1.enabled}
                  loading={loading}
                  onToggle={() => handleToggle('fan1')}
                  schedule={schedules?.actuators.fan1 ?? null}
                  scheduleSaving={savingBy.fan1}
                  onScheduleChange={(patch) => updateActuator('fan1', patch)}
                  onScheduleSave={async () => await saveActuatorPatch('fan1', schedules?.actuators.fan1 ?? {})}
                  onAutoToggle={async (nextAutoOn) => {
                    updateActuator('fan1', { auto_on: nextAutoOn });
                    await saveActuatorPatch('fan1', { auto_on: nextAutoOn });
                  }}
                />
                <ActuatorControl
                  type="fan2"
                  label="팬 2"
                  icon="🔄"
                  color="#a3e635"
                  enabled={state.fan2.enabled}
                  loading={loading}
                  onToggle={() => handleToggle('fan2')}
                  schedule={schedules?.actuators.fan2 ?? null}
                  scheduleSaving={savingBy.fan2}
                  onScheduleChange={(patch) => updateActuator('fan2', patch)}
                  onScheduleSave={async () => await saveActuatorPatch('fan2', schedules?.actuators.fan2 ?? {})}
                  onAutoToggle={async (nextAutoOn) => {
                    updateActuator('fan2', { auto_on: nextAutoOn });
                    await saveActuatorPatch('fan2', { auto_on: nextAutoOn });
                  }}
                />
                <ActuatorControl
                  type="led"
                  label="LED"
                  icon="💡"
                  color="#eab308"
                  enabled={state.led.enabled}
                  loading={loading}
                  onToggle={() => handleToggle('led')}
                  schedule={schedules?.actuators.led ?? null}
                  scheduleSaving={savingBy.led}
                  onScheduleChange={(patch) => updateActuator('led', patch)}
                  onScheduleSave={async () => await saveActuatorPatch('led', schedules?.actuators.led ?? {})}
                  onAutoToggle={async (nextAutoOn) => {
                    updateActuator('led', { auto_on: nextAutoOn });
                    await saveActuatorPatch('led', { auto_on: nextAutoOn });
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
