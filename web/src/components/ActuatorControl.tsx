'use client';

import { useState } from 'react';

interface ActuatorControlProps {
  type: 'led' | 'pump' | 'fan1' | 'fan2';
  label: string;
  icon: string;
  color?: string; // 버튼 색상
  enabled: boolean;
  loading: boolean;
  onToggle: () => Promise<void>;
}

export default function ActuatorControl({ type, label, icon, color, enabled, loading, onToggle }: ActuatorControlProps) {
  const [isControlling, setIsControlling] = useState(false);

  const isEnabled = enabled;

  const handleToggle = async () => {
    setIsControlling(true);
    await onToggle();
    setIsControlling(false);
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-9 border border-gray-200 flex flex-col h-full">
      <div className="flex items-center gap-5 mb-6">
        <span className="text-4xl">{icon}</span>
        <h3 className="text-xl font-semibold text-gray-700 whitespace-nowrap">{label}</h3>
      </div>

      <div className="mt-auto">
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
    </div>
  );
}
