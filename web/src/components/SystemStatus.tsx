'use client';

import { useState, useEffect } from 'react';

interface SystemStatusProps {
  mqttConnected?: boolean;
}

export default function SystemStatus({ mqttConnected }: SystemStatusProps) {
  const [mqttStatus, setMqttStatus] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const fetchMQTTStatus = async () => {
    try {
      const response = await fetch('/api/mqtt/status');
      const result = await response.json();
      setMqttStatus(result.connected || false);
    } catch (err) {
      setMqttStatus(false);
    } finally {
      setLoading(false);
    }
  };

  const connectMQTT = async () => {
    setConnecting(true);
    try {
      const response = await fetch('/api/mqtt/connect', {
        method: 'POST',
      });
      const result = await response.json();
      
      if (result.success || result.connected) {
        await fetchMQTTStatus();
      } else {
        alert(`MQTT 연결 실패: ${result.error || result.details || '알 수 없는 오류'}`);
      }
    } catch (err) {
      alert(`MQTT 연결 오류: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
    } finally {
      setConnecting(false);
    }
  };

  useEffect(() => {
    fetchMQTTStatus();
    const interval = setInterval(fetchMQTTStatus, 5000);

    return () => clearInterval(interval);
  }, []);

  const isConnected = mqttConnected ?? mqttStatus;

  return (
    <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 border border-gray-200">
      <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-8">
        {/* 제목 */}
        <h3 className="text-xl sm:text-2xl font-bold text-gray-700 flex-shrink-0">
          시스템 상태
        </h3>

        {/* 상태 목록 */}
        <div className="flex-1 space-y-4 w-full">
          <div className="flex items-center justify-start gap-4">
            <span className="text-sm sm:text-base text-gray-600 font-semibold w-28 sm:w-32">
              MQTT 연결
            </span>
            {loading ? (
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
            ) : (
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <span className={`text-sm sm:text-base font-semibold ${isConnected ? 'text-green-700' : 'text-red-700'}`}>
                    {isConnected ? '연결됨' : '연결 끊김'}
                  </span>
                </div>
                {!isConnected && (
                  <button
                    onClick={connectMQTT}
                    disabled={connecting}
                    className={`px-4 py-2 text-sm rounded-md font-medium transition-colors ${
                      connecting
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-blue-500 text-white hover:bg-blue-600'
                    }`}
                  >
                    {connecting ? '연결 중...' : '연결'}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-start gap-4">
            <span className="text-sm sm:text-base text-gray-600 font-semibold w-28 sm:w-32">
              데이터베이스
            </span>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-green-500"></div>
              <span className="text-sm sm:text-base font-semibold text-green-700">연결됨</span>
            </div>
          </div>

          <div className="flex items-center justify-start gap-4">
            <span className="text-sm sm:text-base text-gray-600 font-semibold w-28 sm:w-32">
              실시간 업데이트
            </span>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-green-500"></div>
              <span className="text-sm sm:text-base font-semibold text-green-700">활성화</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
