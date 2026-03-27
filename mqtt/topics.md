# MQTT 토픽 구조

HiveMQ Cloud를 사용하는 스마트팜 시스템의 MQTT 토픽 구조입니다.

## 토픽 네이밍 규칙

모든 토픽은 `smartfarm/` 접두사를 사용합니다.

## 센서 토픽

### 개별 센서 토픽
- `smartfarm/sensors/temperature` - 온도 센서 데이터
- `smartfarm/sensors/humidity` - 습도 센서 데이터
- `smartfarm/sensors/ec` - EC (전기전도도) 센서 데이터
- `smartfarm/sensors/ph` - pH 센서 데이터

### 통합 센서 토픽
- `smartfarm/sensors/all` - 모든 센서 데이터를 한 번에 전송

## 액츄에이터 토픽

### 개별 액츄에이터 토픽
- `smartfarm/actuators/led` - LED 제어
- `smartfarm/actuators/pump` - 펌프 제어
- `smartfarm/actuators/fan1` - 팬1 제어
- `smartfarm/actuators/fan2` - 팬2 제어

### 통합 액츄에이터 토픽
- `smartfarm/actuators/all` - 모든 액츄에이터 제어

## 시스템 토픽

- `smartfarm/status` - 디바이스 상태 메시지

## 메시지 형식

### 센서 메시지 (개별)

```json
{
  "sensor": "temperature",
  "value": 25.5,
  "unit": "°C",
  "timestamp": 1234567890
}
```

### 센서 메시지 (통합)

```json
{
  "temperature": 25.5,
  "humidity": 60.0,
  "ec": 1.2,
  "ph": 6.5,
  "timestamp": 1234567890
}
```

### 액츄에이터 메시지

```json
{
  "state": true
}
```

또는

```json
{
  "brightness": 128
}
```

또는

```json
{
  "value": 50
}
```

### 상태 메시지

```json
{
  "status": "online",
  "device_id": "arduino-uno-r4",
  "timestamp": 1234567890
}
```

## QoS 레벨

- **QoS 1**: 모든 토픽에 적용 (최소 한 번 전달 보장)

## 발행/구독 방향

### 발행 (Publish)
- **하드웨어 → 브로커**: 센서 데이터, 상태 메시지
- **웹 애플리케이션 → 브로커**: 액츄에이터 제어 명령

### 구독 (Subscribe)
- **웹 애플리케이션**: 모든 센서 토픽, 액츄에이터 응답 토픽, 상태 토픽
- **하드웨어**: 액츄에이터 제어 토픽

## 토픽별 Publish / Subscribe 매트릭스

| 토픽 | Publisher (발행) | Subscriber (구독) | 용도 |
|---|---|---|---|
| `smartfarm/sensors/temperature` | 아두이노 | 웹 서버 MQTT 클라이언트 | 온도 개별 센서값 |
| `smartfarm/sensors/humidity` | 아두이노 | 웹 서버 MQTT 클라이언트 | 습도 개별 센서값 |
| `smartfarm/sensors/ec` | 아두이노 | 웹 서버 MQTT 클라이언트 | EC 개별 센서값 |
| `smartfarm/sensors/ph` | 아두이노 | 웹 서버 MQTT 클라이언트 | pH 개별 센서값 |
| `smartfarm/sensors/all` | 아두이노 | 웹 서버 MQTT 클라이언트 | 통합 센서값(주 처리 대상) |
| `smartfarm/actuators/led` | 웹 API(`/api/actuators`, `/api/actuator-schedules/tick`) + 외부 클라이언트 가능 | 아두이노 (+ 웹 서버도 구독) | LED 제어 명령 |
| `smartfarm/actuators/pump` | 웹 API(`/api/actuators`, `/api/actuator-schedules/tick`) + 외부 클라이언트 가능 | 아두이노 (+ 웹 서버도 구독) | 펌프 제어 명령 |
| `smartfarm/actuators/fan1` | 웹 API(`/api/actuators`, `/api/actuator-schedules/tick`) + 외부 클라이언트 가능 | 아두이노 (+ 웹 서버도 구독) | 팬1 제어 명령 |
| `smartfarm/actuators/fan2` | 웹 API(`/api/actuators`, `/api/actuator-schedules/tick`) + 외부 클라이언트 가능 | 아두이노 (+ 웹 서버도 구독) | 팬2 제어 명령 |
| `smartfarm/actuators/all` | 외부 클라이언트 가능(코드상 지원) | 아두이노 | 액츄에이터 일괄 제어 |
| `smartfarm/status` | 웹 서버 MQTT 클라이언트(LWT offline) | 웹 서버 MQTT 클라이언트 | 상태 토픽 |
