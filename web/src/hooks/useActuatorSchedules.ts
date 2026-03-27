'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ActuatorScheduleActuator, ActuatorSchedulesV2 } from '@/types/actuatorSchedule';

type ApiOk = { success: true; data: ActuatorSchedulesV2 };
type ApiErr = { success: false; error: string };

export function useActuatorSchedules() {
  const [data, setData] = useState<ActuatorSchedulesV2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingBy, setSavingBy] = useState<Record<ActuatorScheduleActuator, boolean>>({
    led: false,
    pump: false,
    fan1: false,
    fan2: false,
  });

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/actuator-schedules', { cache: 'no-store' });
      const json = (await res.json()) as ApiOk | ApiErr;
      if (!res.ok || !json.success) return;
      setData(json.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSchedules();
  }, [fetchSchedules]);

  const updateActuator = useCallback(
    (actuator: ActuatorScheduleActuator, patch: Partial<ActuatorSchedulesV2['actuators'][ActuatorScheduleActuator]>) => {
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          actuators: {
            ...prev.actuators,
            [actuator]: { ...prev.actuators[actuator], ...patch },
          },
        };
      });
    },
    []
  );

  // 항상 서버의 최신값을 기준으로 해당 포트만 patch 저장(수동 기본을 깨지 않게)
  const saveActuatorPatch = useCallback(
    async (
      actuator: ActuatorScheduleActuator,
      patch: Partial<ActuatorSchedulesV2['actuators'][ActuatorScheduleActuator]>,
      options?: { silent?: boolean }
    ) => {
      const silent = options?.silent === true;
      if (!silent) {
        setSavingBy((prev) => ({ ...prev, [actuator]: true }));
      }
      try {
        const res0 = await fetch('/api/actuator-schedules', { cache: 'no-store' });
        const json0 = (await res0.json()) as ApiOk | ApiErr;
        if (!res0.ok || !json0.success) return false;

        const next: ActuatorSchedulesV2 = {
          ...json0.data,
          actuators: {
            ...json0.data.actuators,
            [actuator]: { ...json0.data.actuators[actuator], ...patch },
          },
        };

        const res = await fetch('/api/actuator-schedules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: next }),
        });
        const json = (await res.json()) as ApiOk | ApiErr;
        if (!res.ok || !json.success) return false;
        setData(json.data);
        return true;
      } finally {
        if (!silent) {
          setSavingBy((prev) => ({ ...prev, [actuator]: false }));
        }
      }
    },
    []
  );

  const saveAll = useCallback(async () => {
    if (!data) return false;
    setSavingBy({ led: true, pump: true, fan1: true, fan2: true });
    try {
      const res = await fetch('/api/actuator-schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      });
      const json = (await res.json()) as ApiOk | ApiErr;
      if (!res.ok || !json.success) return false;
      setData(json.data);
      return true;
    } finally {
      setSavingBy({ led: false, pump: false, fan1: false, fan2: false });
    }
  }, [data]);

  const anyAutoOn = useMemo(() => {
    if (!data) return false;
    return (['pump', 'fan1', 'fan2', 'led'] as const).some((k) => Boolean(data.actuators[k]?.auto_on));
  }, [data]);

  return {
    data,
    loading,
    savingBy,
    fetchSchedules,
    updateActuator,
    saveAll,
    saveActuatorPatch,
    anyAutoOn,
  };
}

