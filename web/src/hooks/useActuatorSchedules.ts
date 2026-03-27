'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ActuatorScheduleActuator, ActuatorSchedulesV2 } from '@/types/actuatorSchedule';

type ApiOk = { success: true; data: ActuatorSchedulesV2 };
type ApiErr = { success: false; error: string };

export function useActuatorSchedules() {
  const [data, setData] = useState<ActuatorSchedulesV2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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

  const save = useCallback(async () => {
    if (!data) return false;
    setSaving(true);
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
      setSaving(false);
    }
  }, [data]);

  const anyAutoOn = useMemo(() => {
    if (!data) return false;
    return (['pump', 'fan1', 'fan2', 'led'] as const).some((k) => Boolean(data.actuators[k]?.auto_on));
  }, [data]);

  return { data, loading, saving, fetchSchedules, updateActuator, save, anyAutoOn };
}

