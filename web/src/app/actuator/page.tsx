'use client';

import ActuatorControl from '@/components/ActuatorControl';
import ActuatorScheduleSettings from '@/components/ActuatorScheduleSettings';
import { useActuatorControl } from '@/hooks/useActuatorControl';

export default function ActuatorPage() {
  const { state, loading, controlActuator } = useActuatorControl();

  const disableScheduleFor = async (type: 'led' | 'pump' | 'fan1' | 'fan2') => {
    try {
      const res = await fetch('/api/actuator-schedules');
      const json = await res.json();
      if (!res.ok || !json.success) return;
      const data = json.data;
      data.actuators[type] = { mode: 'manual', enabled: false };
      await fetch('/api/actuator-schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      });
    } catch (_) {
      // ignore; manual control should still attempt
    }
  };

  const handleToggle = async (type: 'led' | 'pump' | 'fan1' | 'fan2') => {
    // 수동 조작 시 해당 포트 스케줄을 끄고(수동), 명령이 되돌아가지 않게 함
    await disableScheduleFor(type);
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
              <div className="mb-6">
                <ActuatorScheduleSettings />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
                <ActuatorControl
                  type="pump"
                  label="펌프"
                  icon="⚙️"
                  color="#3b82f6"
                  enabled={state.pump.enabled}
                  loading={loading}
                  onToggle={() => handleToggle('pump')}
                />
                <ActuatorControl
                  type="fan1"
                  label="팬 1"
                  icon="🔄"
                  color="#a3e635"
                  enabled={state.fan1.enabled}
                  loading={loading}
                  onToggle={() => handleToggle('fan1')}
                />
                <ActuatorControl
                  type="fan2"
                  label="팬 2"
                  icon="🔄"
                  color="#a3e635"
                  enabled={state.fan2.enabled}
                  loading={loading}
                  onToggle={() => handleToggle('fan2')}
                />
                <ActuatorControl
                  type="led"
                  label="LED"
                  icon="💡"
                  color="#eab308"
                  enabled={state.led.enabled}
                  loading={loading}
                  onToggle={() => handleToggle('led')}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
