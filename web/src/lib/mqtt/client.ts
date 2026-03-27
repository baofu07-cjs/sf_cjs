import type { MqttClient, IClientOptions } from 'mqtt';
import {
  MQTTSensorMessage,
  MQTTAllSensorMessage,
  MQTTActuatorMessage,
  MQTTStatusMessage,
  MQTTTopic,
} from '@/types/mqtt';
import { SensorType, SensorUnit } from '@/types/sensor';
import { saveSensorData, saveActuatorControl } from './db-handler';

// 서버 사이드에서만 동적으로 MQTT 모듈 로드
const getMqtt = () => {
  if (typeof window !== 'undefined') {
    throw new Error('MQTT 클라이언트는 서버 사이드에서만 사용할 수 있습니다.');
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('mqtt');
};

/**
 * MQTT 클라이언트 관리 클래스
 * HiveMQ Cloud 연결 및 메시지 처리
 */
class MQTTClientManager {
  private client: MqttClient | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 5000; // 5초
  private isConnecting = false; // 연결 시도 중 플래그
  private connectPromise: Promise<void> | null = null; // 중복 연결 방지

  /**
   * MQTT 클라이언트 연결
   */
  async connect(): Promise<void> {
    // 이미 연결되어 있으면 반환
    if (this.client?.connected) {
      return;
    }

    // 이미 연결 시도 중이면 기존 Promise 반환
    if (this.isConnecting && this.connectPromise) {
      return this.connectPromise;
    }

    const brokerUrl = process.env.MQTT_BROKER_URL;
    const username = process.env.MQTT_USERNAME;
    const password = process.env.MQTT_PASSWORD;
    // 고정된 클라이언트 ID 사용 (환경 변수 또는 고정값)
    const clientId = process.env.MQTT_CLIENT_ID || 'smartfarm-web-client';

    if (!brokerUrl || !username || !password) {
      throw new Error('MQTT 환경 변수가 설정되지 않았습니다.');
    }

    // 기존 클라이언트가 있으면 정리
    if (this.client) {
      try {
        this.client.removeAllListeners();
        this.client.end(true); // 강제 종료
      } catch (err) {
        // 무시
      }
      this.client = null;
    }

    this.isConnecting = true;
    const mqtt = getMqtt();
    
    const options: IClientOptions = {
      clientId,
      username,
      password,
      clean: true,
      reconnectPeriod: 0, // 자동 재연결 비활성화 (수동으로 관리)
      connectTimeout: 30000,
      keepalive: 60,
      will: {
        topic: 'smartfarm/status',
        payload: JSON.stringify({ status: 'offline', device_id: 'smartfarm-web' }),
        qos: 1,
        retain: false,
      },
    };

    this.connectPromise = new Promise((resolve, reject) => {
      try {
        this.client = mqtt.connect(brokerUrl, options);

        if (!this.client) {
          this.isConnecting = false;
          this.connectPromise = null;
          throw new Error('MQTT 클라이언트 생성 실패');
        }

        const connectTimeout = setTimeout(() => {
          if (!this.isConnected) {
            console.error('[MQTT] 연결 타임아웃');
            this.isConnecting = false;
            this.connectPromise = null;
            reject(new Error('MQTT 연결 타임아웃'));
          }
        }, 30000);

        this.client.on('connect', () => {
          clearTimeout(connectTimeout);
          console.log('[MQTT] 연결 성공');
          this.isConnected = true;
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.connectPromise = null;
          this.subscribeToTopics();
          resolve();
        });

        this.client.on('error', (error) => {
          clearTimeout(connectTimeout);
          console.error('[MQTT] 연결 오류:', error);
          this.isConnected = false;
          this.isConnecting = false;
          this.connectPromise = null;
          // 에러가 발생해도 재연결은 시도하지 않음 (수동 재연결만 허용)
          reject(error);
        });

        this.client.on('close', () => {
          console.log('[MQTT] 연결 종료');
          this.isConnected = false;
          this.isConnecting = false;
          this.connectPromise = null;
          // 자동 재연결 비활성화
        });

        this.client.on('offline', () => {
          console.log('[MQTT] 오프라인 상태');
          this.isConnected = false;
        });

        this.client.on('message', (topic, message) => {
          this.handleMessage(topic.toString(), message.toString());
        });

        // 재연결 이벤트는 더 이상 사용하지 않음 (자동 재연결 비활성화)
      } catch (error) {
        this.isConnecting = false;
        this.connectPromise = null;
        reject(error);
      }
    });

    return this.connectPromise;
  }

  /**
   * MQTT 토픽 구독
   */
  private subscribeToTopics(): void {
    if (!this.client?.connected) {
      return;
    }

    const topics: MQTTTopic[] = [
      'smartfarm/sensors/temperature',
      'smartfarm/sensors/humidity',
      'smartfarm/sensors/ec',
      'smartfarm/sensors/ph',
      'smartfarm/sensors/all',
      'smartfarm/actuators/led',
      'smartfarm/actuators/pump',
      'smartfarm/actuators/fan1',
      'smartfarm/actuators/fan2',
      'smartfarm/actuator-status/led',
      'smartfarm/actuator-status/pump',
      'smartfarm/actuator-status/fan1',
      'smartfarm/actuator-status/fan2',
      'smartfarm/status',
    ];

    topics.forEach((topic) => {
      this.client?.subscribe(topic, { qos: 1 }, (error) => {
        if (error) {
          console.error(`[MQTT] 구독 실패: ${topic}`, error);
        } else {
          console.log(`[MQTT] 구독 성공: ${topic}`);
        }
      });
    });
  }

  /**
   * MQTT 메시지 처리
   */
  private async handleMessage(topic: string, message: string): Promise<void> {
    try {
      const parsed = JSON.parse(message);

      if (topic.startsWith('smartfarm/sensors/')) {
        await this.handleSensorMessage(topic, parsed);
      } else if (topic.startsWith('smartfarm/actuator-status/')) {
        // 상태 토픽만 DB에 반영 (Arduino 실상태가 소스 오브 트루스)
        await this.handleActuatorMessage(topic, parsed);
      } else if (topic.startsWith('smartfarm/actuators/')) {
        // 제어 토픽은 DB 상태로 저장하지 않음 (수동 상태 되돌림/레이스 방지)
        // 필요하면 별도 "명령 로그" 테이블로 저장하도록 분리한다.
      } else if (topic === 'smartfarm/status') {
        await this.handleStatusMessage(parsed);
      }
    } catch (error) {
      console.error(`[MQTT] 메시지 처리 오류 (${topic}):`, error);
    }
  }

  /**
   * 센서 메시지 처리
   */
  private async handleSensorMessage(
    topic: string,
    message: MQTTSensorMessage | MQTTAllSensorMessage
  ): Promise<void> {
    if (topic === 'smartfarm/sensors/all') {
      // 모든 센서 데이터를 한 번에 받는 경우 (통합 메시지만 처리)
      // 이렇게 하면 항상 동일한 타임스탬프의 데이터가 저장되어 데이터 일관성 보장
      const allData = message as MQTTAllSensorMessage;
      await saveSensorData({
        sensor_type: 'temperature',
        value: allData.temperature,
        unit: '°C',
        device_id: 'arduino-uno-r4',
      });
      await saveSensorData({
        sensor_type: 'humidity',
        value: allData.humidity,
        unit: '%',
        device_id: 'arduino-uno-r4',
      });
      await saveSensorData({
        sensor_type: 'ec',
        value: allData.ec,
        unit: 'mS/cm',
        device_id: 'arduino-uno-r4',
      });
      await saveSensorData({
        sensor_type: 'ph',
        value: allData.ph,
        unit: 'pH',
        device_id: 'arduino-uno-r4',
      });
    } else {
      // 개별 센서 데이터는 무시 (통합 메시지만 사용하여 데이터 일관성 보장)
      // 개별 메시지와 통합 메시지가 순서대로 도착하지 않을 수 있어
      // 통합 메시지만 처리하여 항상 동일한 타임스탬프의 데이터를 저장
      console.log(`[MQTT] 개별 센서 메시지 무시: ${topic} (통합 메시지만 처리)`);
    }
  }

  /**
   * 액츄에이터 메시지 처리
   */
  private async handleActuatorMessage(
    topic: string,
    message: MQTTActuatorMessage
  ): Promise<void> {
    const last = topic.split('/').pop();
    const actuatorType = (last === 'led' || last === 'pump' || last === 'fan1' || last === 'fan2') ? last : null;
    if (!actuatorType) return;
    
    let action: 'on' | 'off' | 'set' = 'off';
    let value: number | null = null;

    if (message.state !== undefined) {
      action = message.state ? 'on' : 'off';
    } else if (message.brightness !== undefined) {
      action = 'set';
      value = message.brightness;
    } else if (message.value !== undefined) {
      action = 'set';
      value = message.value;
    }

    await saveActuatorControl({
      actuator_type: actuatorType,
      action,
      value,
      user_id: null, // MQTT에서 직접 받은 경우는 사용자 ID 없음
    });
  }

  /**
   * 상태 메시지 처리
   */
  private async handleStatusMessage(message: MQTTStatusMessage): Promise<void> {
    console.log(`[MQTT] 디바이스 상태: ${message.device_id} - ${message.status}`);
    // 필요시 상태를 DB에 저장하거나 다른 처리를 수행
  }

  /**
   * 메시지 발행
   */
  publish(topic: MQTTTopic, message: unknown, options?: { qos?: 0 | 1 | 2 }): void {
    if (!this.client?.connected) {
      throw new Error('MQTT 클라이언트가 연결되지 않았습니다.');
    }

    const payload = JSON.stringify(message);
    const qos = options?.qos ?? 1;

    this.client.publish(topic, payload, { qos }, (error) => {
      if (error) {
        console.error(`[MQTT] 발행 실패: ${topic}`, error);
        throw error;
      } else {
        console.log(`[MQTT] 발행 성공: ${topic}`);
      }
    });
  }

  /**
   * MQTT 클라이언트 연결 해제
   */
  disconnect(): void {
    if (this.client) {
      try {
        this.client.removeAllListeners();
        this.client.end(true); // 강제 종료
      } catch (err) {
        console.error('[MQTT] 연결 해제 오류:', err);
      }
      this.client = null;
      this.isConnected = false;
      this.isConnecting = false;
      this.connectPromise = null;
      console.log('[MQTT] 연결 해제');
    }
  }

  /**
   * 연결 상태 확인
   */
  getConnected(): boolean {
    // 실제 클라이언트의 연결 상태를 우선적으로 확인
    // 클라이언트가 존재하고 연결되어 있으면 true
    const clientConnected = this.client?.connected === true;
    
    if (clientConnected) {
      // 실제 연결 상태와 내부 플래그 동기화
      if (!this.isConnected) {
        this.isConnected = true;
      }
      return true;
    }
    
    // 클라이언트가 없거나 연결되지 않은 경우
    // 내부 플래그도 false로 설정
    if (this.isConnected) {
      this.isConnected = false;
    }
    
    return false;
  }

  /**
   * 실제 MQTT 클라이언트 인스턴스 반환 (상태 확인용)
   */
  getClientInstance(): MqttClient | null {
    return this.client;
  }
}

// 싱글톤 인스턴스
let mqttClientManager: MQTTClientManager | null = null;

/**
 * MQTT 클라이언트 매니저 인스턴스 가져오기
 */
export function getMQTTClient(): MQTTClientManager {
  if (!mqttClientManager) {
    mqttClientManager = new MQTTClientManager();
  }
  return mqttClientManager;
}

/**
 * MQTT 클라이언트 초기화 및 연결
 */
export async function initMQTTClient(): Promise<void> {
  const client = getMQTTClient();
  if (!client.getConnected()) {
    await client.connect();
  }
}
