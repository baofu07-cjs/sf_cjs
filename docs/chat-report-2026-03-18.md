# SmartFarm 배포/연동 작업 보고서 (2026-03-18)

## 개요
본 문서는 2026-03-18 진행한 SmartFarm 프로젝트의 GitHub 업로드 및 MQTT→DB→웹 대시보드 데이터 연동 이슈 분석/해결 과정을 요약합니다.

## 작업 환경
- **OS**: Windows 10 (win32 10.0.19045)
- **Workspace**: `D:\Cursor\cjs_farm_cks\07_Deploy`
- **Web**: Next.js 14 (`web/`)
- **MQTT Broker**: HiveMQ Cloud
- **DB**: Supabase (Cloud)

## 1) GitHub 업로드

### 1.1 기존 원격 저장소 확인
- 로컬 저장소는 이미 GitHub 원격 `origin`이 설정되어 있었으나, 기존 원격이 `KevinCKS/SmartFarmWeb`를 가리키고 있었습니다.
- 푸시 시도 결과 **권한(403) 오류**가 발생했습니다.

### 1.2 새 원격으로 변경 후 푸시 완료
- 사용자 제공 원격: `https://github.com/baofu07-cjs/sf_cjs.git`
- 처리:
  - `origin` URL을 위 주소로 변경
  - `main` 브랜치를 `origin/main`으로 푸시 및 업스트림 설정
- 결과:
  - GitHub 리포지터리에 업로드 완료
  - 확인 주소: `https://github.com/baofu07-cjs/sf_cjs`

## 2) MQTT 클라이언트 ID 의미

### 2.1 의미
- Arduino 코드의 `mqtt_client_id`는 **MQTT 브로커에서 클라이언트를 식별하는 고유 ID**입니다.
- 같은 브로커에 **동일 client_id로 동시 접속하면 충돌**(기존 연결 끊김)이 발생할 수 있습니다.

### 2.2 변경 방법
- 아래 문자열을 원하는 값으로 변경하면 됩니다.
- 예:
  - `const char* mqtt_client_id = "arduino-uno-r4-myname-001";`

## 3) “대시보드가 0.0만 표시” 이슈 분석

### 3.1 증상
- Arduino(UNO R4)가 MQTT로 온도/습도/EC/pH를 발행 중인데,
- 웹 대시보드에는 값이 갱신되지 않고 **0.0**으로만 표시됨.

### 3.2 실제 데이터 흐름 구조(중요)
이 프로젝트는 브라우저가 MQTT를 직접 구독하는 구조가 아니라 다음 구조입니다.

1. **Next.js 서버(API)**가 MQTT를 **구독**
2. 수신한 센서값을 **Supabase `sensor_data` 테이블에 INSERT**
3. 프론트는 `/api/sensors/all?device_id=...`로 **DB에서 최신값 조회**
4. (옵션) Supabase Realtime로 화면 자동 갱신

즉, **DB에 값이 쌓이지 않으면 화면은 0.0**으로 보이게 됩니다.

### 3.3 원인 1: “MQTT 연결됨” 표시가 거짓 양성
- `/api/mqtt/status`가 환경변수만 존재해도 connected처럼 보이게 되어 있어,
  - 실제 MQTT 연결/구독이 없는데도 UI에 “연결됨”으로 표시될 수 있었습니다.
- 수정:
  - `connected`는 **실제 소켓 연결 상태**(client.connected) 기준으로만 판단
  - 환경변수 준비 여부는 `ready`로 분리 제공
- 수정 파일:
  - `web/src/app/api/mqtt/status/route.ts`

### 3.4 원인 2(핵심): Supabase에 테이블이 없어서 DB 저장 실패
- MQTT는 실제로 메시지를 받고 있었으나, 서버 로그에 다음 에러가 발생:
  - `Could not find the table 'public.sensor_data' in the schema cache (PGRST205)`
- 따라서 `/api/sensors/all`은 계속 `null`을 반환했고,
  - 프론트 훅에서 `value || 0` 처리로 인해 0.0만 표시되었습니다.

## 4) 해결: Supabase 마이그레이션 적용 후 정상 동작 확인

### 4.1 로컬 Supabase 시도(실패)
- `npx supabase start`를 사용하려 했으나,
  - Supabase config에서 `edge_runtime.port` 키가 현재 CLI 버전과 호환되지 않아 1차 실패
  - `edge_runtime.port` 제거 후 재시도했으나,
  - Windows 환경에서 Docker Desktop 미설치/미실행으로 인해 로컬 스택 실행 불가
- 수정 파일(호환성):
  - `supabase/config.toml`에서 `[edge_runtime]`의 `port` 제거

### 4.2 클라우드 Supabase에 마이그레이션 실행(성공)
사용자가 Supabase 대시보드 SQL Editor에서 마이그레이션을 실행하여 테이블 생성 완료.
- 적용 파일(순서):
  - `supabase/migrations/001_initial_schema.sql`
  - `supabase/migrations/002_add_indexes.sql`
  - `supabase/migrations/003_add_rls_policies.sql`
  - `supabase/seed.sql`

### 4.3 정상 수신 확인(검증)
- MQTT 서버 연결:
  - `POST /api/mqtt/connect` 성공
- 센서 API 응답:
  - `GET /api/sensors/all?device_id=arduino-uno-r4`가 `temperature/humidity/ec/ph` **실측값을 반환**하며, `null`이 사라짐
- 결론:
  - **MQTT → 서버 구독 → Supabase 저장 → 웹 조회** 파이프라인이 정상 복구

## 5) 운영(배포) 관점 주의사항
- 현재 구조는 “서버가 계속 살아있으며 MQTT를 계속 구독”해야 합니다.
- 서버리스(예: Vercel) 환경에서는 요청이 없으면 프로세스가 내려가 **지속 구독이 끊길 수 있음**.
- 프로덕션에서는 다음 중 하나를 권장:
  - 별도의 상시 실행 프로세스(예: VPS/PM2/Docker)로 MQTT 브리지 분리
  - `mqtt-service/`를 독립 서비스로 운영

## 부록: 관련 설정/포인트
- Arduino MQTT 발행 토픽:
  - `smartfarm/sensors/temperature`
  - `smartfarm/sensors/humidity`
  - `smartfarm/sensors/ec`
  - `smartfarm/sensors/ph`
  - `smartfarm/sensors/all` (통합 JSON)
- Web MQTT 환경 변수(`web/.env.local`):
  - `MQTT_BROKER_URL` (wss)
  - `MQTT_USERNAME`, `MQTT_PASSWORD`, `MQTT_CLIENT_ID`

