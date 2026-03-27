'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ActuatorState } from '@/types/actuator';
import { createClient } from '@/lib/supabase/client';

interface UseActuatorControlOptions {
  useRealtime?: boolean; // Supabase Realtime 사용 여부
}

export function useActuatorControl(options: UseActuatorControlOptions = {}) {
  const { useRealtime = true } = options;
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  if (!supabaseRef.current) {
    supabaseRef.current = createClient();
  }
  const supabase = supabaseRef.current;
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  
  const [state, setState] = useState<ActuatorState>({
    led: { enabled: false, brightness: 0 },
    pump: { enabled: false },
    fan1: { enabled: false },
    fan2: { enabled: false },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/actuators/status');
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || '액츄에이터 상태를 가져오는데 실패했습니다.');
      }

      console.log('[useActuatorControl] 상태 업데이트:', result.data);
      setState(result.data);
      setLoading(false);
      setError(null);
    } catch (err) {
      console.error('[useActuatorControl] 상태 조회 오류:', err);
      setLoading(false);
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
    }
  }, []);

  const controlActuator = useCallback(async (
    actuatorType: 'led' | 'pump' | 'fan1' | 'fan2',
    action: 'on' | 'off' | 'set',
    value?: number
  ) => {
    try {
      const response = await fetch('/api/actuators', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          actuator_type: actuatorType,
          action,
          value,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || '액츄에이터 제어에 실패했습니다.');
      }

      console.log('[useActuatorControl] 제어 명령 성공:', { actuatorType, action, value });

      // 제어 성공 시 즉시 로컬 상태 업데이트 (낙관적 업데이트)
      setState((prev) => {
        const updated = { ...prev };
        
        if (actuatorType === 'led') {
          if (action === 'off') {
            updated.led = { enabled: false, brightness: 0 };
          } else if (action === 'on') {
            updated.led = { enabled: true, brightness: prev.led.brightness || 100 };
          } else if (action === 'set' && value !== undefined) {
            updated.led = { enabled: value > 0, brightness: value };
          }
        } else if (actuatorType === 'pump') {
          updated.pump = { enabled: action === 'on' };
        } else if (actuatorType === 'fan1') {
          updated.fan1 = { enabled: action === 'on' };
        } else if (actuatorType === 'fan2') {
          updated.fan2 = { enabled: action === 'on' };
        }
        
        return updated;
      });

      // Realtime 구독이 자동으로 상태를 업데이트하므로 
      // 명시적인 fetchStatus() 호출은 제거
      // (명시적 호출 시 DB의 이전 상태가 반영되어 버튼이 되돌아가는 문제 방지)
      
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.',
      };
    }
  }, []);

  useEffect(() => {
    // 초기 로드
    fetchStatus();

    // Realtime이 지연되거나 누락되는 경우를 대비해 주기적으로 폴링
    const pollId = setInterval(fetchStatus, 2000);

    if (useRealtime) {
      // Supabase Realtime 구독 (PRD 요구사항)
      const channel = supabase
        .channel('actuator-control-realtime')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'actuator_control',
          },
          () => {
            // 액츄에이터 제어 이력이 추가되면 상태 갱신
            fetchStatus();
          }
        )
        .subscribe();

      channelRef.current = channel;

      return () => {
        clearInterval(pollId);
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current);
        }
      };
    }

    return () => {
      clearInterval(pollId);
    };
  }, [fetchStatus, useRealtime]);

  return {
    state,
    loading,
    error,
    controlActuator,
    refetch: fetchStatus,
  };
}
