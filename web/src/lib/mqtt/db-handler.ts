import { createServiceClient } from '@/lib/supabase/server';
import { SensorDataInsert } from '@/types/sensor';
import { ActuatorControlInsert } from '@/types/actuator';

/**
 * 센서 데이터를 DB에 저장
 */
export async function saveSensorData(data: SensorDataInsert): Promise<void> {
  try {
    const supabase = createServiceClient();
    
    const { error } = await supabase
      .from('sensor_data')
      .insert({
        sensor_type: data.sensor_type,
        value: data.value,
        unit: data.unit,
        device_id: data.device_id || 'arduino-uno-r4',
      });

    if (error) {
      console.error('[DB] 센서 데이터 저장 실패:', error);
      throw error;
    }

    console.log(`[DB] 센서 데이터 저장 성공: ${data.sensor_type} = ${data.value} ${data.unit}`);
  } catch (error) {
    console.error('[DB] 센서 데이터 저장 중 오류:', error);
    throw error;
  }
}

/**
 * 액츄에이터 제어 이력을 DB에 저장
 */
export async function saveActuatorControl(data: ActuatorControlInsert): Promise<void> {
  try {
    const supabase = createServiceClient();

    // retained 상태 메시지로 인해 동일 상태가 반복 저장되는 것을 방지
    const { data: latest } = await supabase
      .from('actuator_control')
      .select('action,value,user_id')
      .eq('actuator_type', data.actuator_type)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1);
    const prev = latest && latest.length > 0 ? (latest[0] as any) : null;
    if (
      prev &&
      prev.user_id === null &&
      (data.user_id ?? null) === null &&
      prev.action === data.action &&
      (prev.value ?? null) === (data.value ?? null)
    ) {
      return;
    }
    
    const { error } = await supabase
      .from('actuator_control')
      .insert({
        actuator_type: data.actuator_type,
        action: data.action,
        value: data.value ?? null,
        user_id: data.user_id ?? null,
      });

    if (error) {
      console.error('[DB] 액츄에이터 제어 이력 저장 실패:', error);
      throw error;
    }

    console.log(`[DB] 액츄에이터 제어 이력 저장 성공: ${data.actuator_type} - ${data.action}`);
  } catch (error) {
    console.error('[DB] 액츄에이터 제어 이력 저장 중 오류:', error);
    throw error;
  }
}
