/*
 * 스마트팜 시스템 - Arduino UNO R4 WiFi
 * 
 * 센서:
 * - SHT31 (온도/습도)
 * - TDS Meter (EC): A0 핀 (현재 연결 안 됨, 랜덤 데이터 생성)
 * - pH 센서: A1 핀 (현재 연결 안 됨, 랜덤 데이터 생성)
 * 
 * 액추에이터:
 * - RELAY1 (Pump): 4번 핀
 * - RELAY2 (Fan1): 5번 핀
 * - RELAY3 (Fan2): 6번 핀
 * - RELAY4 (LED): 7번 핀
 * 수동 스위치 입력: D8, D9, D10, D11 (각 릴레이 ON/OFF 토글)
 * 
 * MQTT 토픽:
 * - 발행: smartfarm/sensors/temperature, humidity, ec, ph, all
 * - 구독: smartfarm/actuators/led, pump, fan1, fan2, all
 *
 * LCD (1602 I2C):
 * - 라이브러리: Arduino IDE → 라이브러리 관리자 → "LiquidCrystal I2C" (Frank de Brabander 등)
 * - I2C 주소: 모듈에 따라 0x27 또는 0x3F (스캔 스케치로 확인 가능)
 * - 1·2행을 합쳐 큰 숫자(커스텀 문자)로 표시, 항목(T/H/EC/pH/MQTT)은 약 3초마다 자동 전환
 */

#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <WiFiS3.h>
#include <PubSubClient.h>
#include "Adafruit_SHT31.h"         // SHT30 센서 라이브러리 (Adafruit_SHT31 사용)
#include <ArduinoJson.h>

// 1602 LCD I2C (필요 시 0x3F 로 변경)
#define LCD_I2C_ADDR 0x27
LiquidCrystal_I2C lcd(LCD_I2C_ADDR, 16, 2);

// WiFi 설정 (사용자의 WiFi 정보로 변경 필요)
const char* ssid = "daesin_302";
const char* password = "ds123456";

// MQTT 브로커 설정 (HiveMQ Cloud 정보로 변경 필요)
const char* mqtt_server = "594be237adfd43c1b465444227993f96.s1.eu.hivemq.cloud";
const int mqtt_port = 8883;  // TLS 포트
const char* mqtt_username = "ozilab68";
const char* mqtt_password = "@Maisil3747";
const char* mqtt_client_id = "aduino-uno-r4-smartfarm-cjs3747";

// 센서 핀 정의
#define EC_PIN A0
#define PH_PIN A1

// 릴레이 핀 정의 (4채널)
#define RELAY1_PIN 4
#define RELAY2_PIN 5
#define RELAY3_PIN 6
#define RELAY4_PIN 7

// 수동 스위치 핀 정의 (D8~D11)
#define BTN1_PIN 8
#define BTN2_PIN 9
#define BTN3_PIN 10
#define BTN4_PIN 11

// 릴레이 모듈이 Active-Low(LOW=ON)인지 여부
const bool RELAY_ACTIVE_LOW = false;

// 센서 및 네트워크 객체
Adafruit_SHT31 sht31 = Adafruit_SHT31();
WiFiSSLClient wifiClient;
PubSubClient mqttClient(wifiClient);

// 전역 변수
unsigned long lastSensorRead = 0;
// 센서 읽기/발행 간격 (10분)
const unsigned long sensorInterval = 10UL * 60UL * 1000UL;

// 릴레이 상태/수동 제어 상태
// - manualEnabled[i] == true 이면, 해당 릴레이는 자동제어보다 수동 상태를 우선 반영합니다.
bool manualEnabled[4] = { false, false, false, false };
bool manualState[4] = { false, false, false, false };

// 자동제어에서 계산된 목표 상태
bool autoState[4] = { false, false, false, false };
bool relayState[4] = { false, false, false, false };

const uint8_t relayPins[4] = { RELAY1_PIN, RELAY2_PIN, RELAY3_PIN, RELAY4_PIN };
const uint8_t btnPins[4] = { BTN1_PIN, BTN2_PIN, BTN3_PIN, BTN4_PIN };

// 릴레이 자동 사이클 (가정: 1분 간격으로 순차 ON -> 5분 후 1번부터 순차 OFF)
const unsigned long AUTO_INTERVAL_MS = 60UL * 1000UL; // 1분
const unsigned long AUTO_OFF_DELAY_FROM_START_MS = 5UL * 60UL * 1000UL; // 5분 후 OFF 시퀀스 시작
const unsigned long AUTO_CYCLE_END_MS = AUTO_OFF_DELAY_FROM_START_MS + 3UL * AUTO_INTERVAL_MS; // 마지막 릴레이 OFF 시점(8분)
unsigned long autoCycleStartMs = 0;

// 버튼 디바운스/토글
const unsigned long BUTTON_DEBOUNCE_MS = 50;
bool btnStable[4] = { true, true, true, true };
bool btnLastReading[4] = { true, true, true, true };
unsigned long btnLastChangeMs[4] = { 0, 0, 0, 0 };

// 랜덤 시드용
unsigned long lastRandomSeed = 0;

// ---- 1602 LCD: 2행 합친 큰 숫자 + 페이지 순환 ----
float lcdCacheT = 0, lcdCacheH = 0, lcdCacheEc = 0, lcdCachePh = 0;
bool lcdHasSensorCache = false;
uint8_t lcdBigPage = 0;
unsigned long lastLcdSensorMs = 0;
const unsigned long LCD_SENSOR_REFRESH_MS = 2000;
unsigned long lastLcdPageMs = 0;
const unsigned long LCD_PAGE_ROTATE_MS = 3000;
unsigned long lastLcdDrawMs = 0;
const unsigned long LCD_DRAW_MS = 500;

void lcdSetup();
void lcdInitBigDigitChars();
void lcdUpdateSensorCache(float t, float h, float ec, float ph);
void lcdDrawCurrentPage();
void lcdTickDisplay();
bool readSensorValues(float& temperature, float& humidity, float& ec, float& ph);

// 큰 숫자용 세그먼트 (CGRAM 0~7, Ronivaldo / Michael Pilcher 계열 패턴)
// 주의: LiquidCrystal_I2C::createChar()가 const 포인터를 받지 않는 구현이 있어
// const를 제거해(=RAM 배열) 호환성을 확보합니다.
static uint8_t LCD_BIG_BAR1[8] = { 0x1C, 0x1E, 0x1E, 0x1E, 0x1E, 0x1E, 0x1E, 0x1C };
static uint8_t LCD_BIG_BAR2[8] = { 0x07, 0x0F, 0x0F, 0x0F, 0x0F, 0x0F, 0x0F, 0x07 };
static uint8_t LCD_BIG_BAR3[8] = { 0x1F, 0x1F, 0x00, 0x00, 0x00, 0x00, 0x1F, 0x1F };
static uint8_t LCD_BIG_BAR4[8] = { 0x1E, 0x1C, 0x00, 0x00, 0x00, 0x00, 0x18, 0x1C };
static uint8_t LCD_BIG_BAR5[8] = { 0x0F, 0x07, 0x00, 0x00, 0x00, 0x00, 0x03, 0x07 };
static uint8_t LCD_BIG_BAR6[8] = { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1F, 0x1F };
static uint8_t LCD_BIG_BAR7[8] = { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x07, 0x0F };
static uint8_t LCD_BIG_BAR8[8] = { 0x1F, 0x1F, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 };

static void lcdBigDigit0(int col);
static void lcdBigDigit1(int col);
static void lcdBigDigit2(int col);
static void lcdBigDigit3(int col);
static void lcdBigDigit4(int col);
static void lcdBigDigit5(int col);
static void lcdBigDigit6(int col);
static void lcdBigDigit7(int col);
static void lcdBigDigit8(int col);
static void lcdBigDigit9(int col);

static void lcdPrintBigDigit(uint8_t d, int col) {
  void (*const fn[10])(int) = {
    lcdBigDigit0, lcdBigDigit1, lcdBigDigit2, lcdBigDigit3, lcdBigDigit4,
    lcdBigDigit5, lcdBigDigit6, lcdBigDigit7, lcdBigDigit8, lcdBigDigit9
  };
  if (d < 10) {
    fn[d](col);
  }
}

static void lcdClearBigCell(int col) {
  lcd.setCursor(col, 0);
  lcd.print(F("   "));
  lcd.setCursor(col, 1);
  lcd.print(F("   "));
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("=== 스마트팜 시스템 시작 ===");

  Wire.begin();
  lcdSetup();

  // 릴레이 초기화(OFF)
  for (uint8_t i = 0; i < 4; i++) {
    pinMode(relayPins[i], OUTPUT);
    digitalWrite(relayPins[i], RELAY_ACTIVE_LOW ? HIGH : LOW);
    relayState[i] = false;
  }

  // 버튼 초기화(INPUT_PULLUP: 기본 HIGH, 눌리면 LOW)
  for (uint8_t i = 0; i < 4; i++) {
    pinMode(btnPins[i], INPUT_PULLUP);
  }
  for (uint8_t i = 0; i < 4; i++) {
    bool r = digitalRead(btnPins[i]);
    btnStable[i] = r;
    btnLastReading[i] = r;
    btnLastChangeMs[i] = millis();
  }

  // 자동제어 사이클 시작
  autoCycleStartMs = millis();
  updateAutomationAndRelays();

  // SHT30 센서 초기화
  if (!sht31.begin(0x44)) {   // 기본 주소: 0x44 (확인 필요)
    Serial.println("SHT30 센서 초기화 실패!");
    Serial.println("SHT30 Error!");
    while(1) delay(1000);     // 센서 초기화 실패 시 무한 대기
  }
  // WiFi 연결
  setupWiFi();

  // MQTT 클라이언트 설정
  // HiveMQ Cloud는 TLS 인증서 검증 필요
  // Arduino R4 WiFi의 WiFiSSLClient 사용 (기본적으로 TLS 지원)
  mqttClient.setServer(mqtt_server, mqtt_port);
  mqttClient.setCallback(mqttCallback);

  // MQTT 연결
  connectMQTT();

  // 랜덤 시드 초기화
  randomSeed(analogRead(A2));  // A2 핀의 노이즈로 시드 생성

  Serial.println("=== 시스템 준비 완료 ===");
}

void loop() {
  // MQTT 연결 유지
  if (!mqttClient.connected()) {
    connectMQTT();
  }
  mqttClient.loop();

  // 수동 스위치 토글 처리
  handleManualButtons();

  // 자동제어(순차 ON/OFF) + 수동 우선 반영
  updateAutomationAndRelays();

  // 정기적으로 센서 데이터 읽기 및 발행
  unsigned long currentMillis = millis();
  if (currentMillis - lastSensorRead >= sensorInterval) {
    lastSensorRead = currentMillis;
    readAndPublishSensors();
  }

  // LCD: 표시용 센서 값 갱신 (MQTT 발행 주기와 별도)
  if (currentMillis - lastLcdSensorMs >= LCD_SENSOR_REFRESH_MS) {
    lastLcdSensorMs = currentMillis;
    float t, h, e, p;
    if (readSensorValues(t, h, e, p)) {
      lcdUpdateSensorCache(t, h, e, p);
    }
  }

  lcdTickDisplay();
}

void lcdSetup() {
  lcd.init();
  lcd.backlight();
  lcdInitBigDigitChars();
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("SmartFarm");
  lcd.setCursor(0, 1);
  lcd.print("LCD starting...");
  delay(600);
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Wait sensors...");
  lcd.setCursor(0, 1);
  lcd.print("                ");
}

void lcdInitBigDigitChars() {
  lcd.createChar(0, LCD_BIG_BAR1);
  lcd.createChar(1, LCD_BIG_BAR2);
  lcd.createChar(2, LCD_BIG_BAR3);
  lcd.createChar(3, LCD_BIG_BAR4);
  lcd.createChar(4, LCD_BIG_BAR5);
  lcd.createChar(5, LCD_BIG_BAR6);
  lcd.createChar(6, LCD_BIG_BAR7);
  lcd.createChar(7, LCD_BIG_BAR8);
}

void lcdUpdateSensorCache(float t, float h, float ec, float ph) {
  lcdCacheT = t;
  lcdCacheH = h;
  lcdCacheEc = ec;
  lcdCachePh = ph;
  lcdHasSensorCache = true;
}

void lcdTickDisplay() {
  unsigned long now = millis();
  if (lcdHasSensorCache && (now - lastLcdPageMs >= LCD_PAGE_ROTATE_MS)) {
    lastLcdPageMs = now;
    lcdBigPage = (uint8_t)((lcdBigPage + 1) % 5);
  }
  if (now - lastLcdDrawMs >= LCD_DRAW_MS) {
    lastLcdDrawMs = now;
    lcdDrawCurrentPage();
  }
}

void lcdDrawCurrentPage() {
  if (!lcdHasSensorCache) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print(F("Wait sensors    "));
    lcd.setCursor(0, 1);
    lcd.print(F("                "));
    return;
  }

  lcd.clear();

  switch (lcdBigPage) {
    case 0: {
      float t = lcdCacheT;
      if (t < 0.0f) {
        t = 0.0f;
      }
      if (t > 99.9f) {
        t = 99.9f;
      }
      int hi = (int)t;
      int tenth = (int)(t * 10.0f + 0.5f) % 10;
      int tens = hi / 10;
      int ones = hi % 10;
      lcd.setCursor(0, 0);
      lcd.print(F("T"));
      lcd.setCursor(0, 1);
      lcd.print(F(":"));
      int c = 2;
      if (tens == 0 && hi < 10) {
        lcdClearBigCell(c);
      } else {
        lcdPrintBigDigit((uint8_t)tens, c);
      }
      c += 3;
      lcdPrintBigDigit((uint8_t)ones, c);
      c += 3;
      lcd.setCursor(c, 0);
      lcd.print(F("."));
      lcd.setCursor(c, 1);
      lcd.print(F(" "));
      c++;
      lcdPrintBigDigit((uint8_t)tenth, c);
      lcd.setCursor(12, 0);
      lcd.print(F(" C"));
      break;
    }
    case 1: {
      int v = (int)(lcdCacheH + 0.5f);
      if (v < 0) {
        v = 0;
      }
      if (v > 100) {
        v = 100;
      }
      int h100 = v / 100;
      int h10 = (v / 10) % 10;
      int h1 = v % 10;
      lcd.setCursor(0, 0);
      lcd.print(F("H"));
      lcd.setCursor(0, 1);
      lcd.print(F(":"));
      int col = 2;
      if (v >= 100) {
        lcdPrintBigDigit((uint8_t)h100, col);
      } else {
        lcdClearBigCell(col);
      }
      col += 3;
      if (v >= 10) {
        lcdPrintBigDigit((uint8_t)h10, col);
      } else {
        lcdClearBigCell(col);
      }
      col += 3;
      lcdPrintBigDigit((uint8_t)h1, col);
      lcd.setCursor(14, 1);
      lcd.print(F("%"));
      break;
    }
    case 2: {
      float e = lcdCacheEc;
      if (e < 0.0f) {
        e = 0.0f;
      }
      if (e > 9.9f) {
        e = 9.9f;
      }
      int hi = (int)e;
      int tenth = (int)(e * 10.0f + 0.5f) % 10;
      lcd.setCursor(0, 0);
      lcd.print(F("EC"));
      lcd.setCursor(0, 1);
      lcd.print(F(":"));
      int c = 3;
      lcdPrintBigDigit((uint8_t)hi, c);
      c += 3;
      lcd.setCursor(c, 0);
      lcd.print(F("."));
      lcd.setCursor(c, 1);
      lcd.print(F(" "));
      c++;
      lcdPrintBigDigit((uint8_t)tenth, c);
      lcd.setCursor(11, 0);
      lcd.print(F("mS"));
      break;
    }
    case 3: {
      float p = lcdCachePh;
      if (p < 0.0f) {
        p = 0.0f;
      }
      if (p > 14.0f) {
        p = 14.0f;
      }
      int hi = (int)p;
      int tenth = (int)(p * 10.0f + 0.5f) % 10;
      lcd.setCursor(0, 0);
      lcd.print(F("pH"));
      lcd.setCursor(0, 1);
      lcd.print(F(":"));
      int c = 3;
      lcdPrintBigDigit((uint8_t)hi, c);
      c += 3;
      lcd.setCursor(c, 0);
      lcd.print(F("."));
      lcd.setCursor(c, 1);
      lcd.print(F(" "));
      c++;
      lcdPrintBigDigit((uint8_t)tenth, c);
      break;
    }
    default:
      lcd.setCursor(0, 0);
      lcd.print(F("     MQTT       "));
      lcd.setCursor(0, 1);
      if (mqttClient.connected()) {
        lcd.print(F("      OK        "));
      } else {
        lcd.print(F("    OFFLINE     "));
      }
      break;
  }
}

static void lcdBigDigit0(int col) {
  lcd.setCursor(col, 0);
  lcd.write((uint8_t)1);
  lcd.write((uint8_t)7);
  lcd.write((uint8_t)0);
  lcd.setCursor(col, 1);
  lcd.write((uint8_t)1);
  lcd.write((uint8_t)5);
  lcd.write((uint8_t)0);
}

static void lcdBigDigit1(int col) {
  lcd.setCursor(col, 0);
  lcd.print(F("  "));
  lcd.write((uint8_t)0);
  lcd.setCursor(col, 1);
  lcd.print(F("  "));
  lcd.write((uint8_t)0);
}

static void lcdBigDigit2(int col) {
  lcd.setCursor(col, 0);
  lcd.write((uint8_t)4);
  lcd.write((uint8_t)2);
  lcd.write((uint8_t)0);
  lcd.setCursor(col, 1);
  lcd.write((uint8_t)1);
  lcd.write((uint8_t)5);
  lcd.write((uint8_t)5);
}

static void lcdBigDigit3(int col) {
  lcd.setCursor(col, 0);
  lcd.write((uint8_t)4);
  lcd.write((uint8_t)2);
  lcd.write((uint8_t)0);
  lcd.setCursor(col, 1);
  lcd.write((uint8_t)6);
  lcd.write((uint8_t)5);
  lcd.write((uint8_t)0);
}

static void lcdBigDigit4(int col) {
  lcd.setCursor(col, 0);
  lcd.write((uint8_t)1);
  lcd.write((uint8_t)5);
  lcd.write((uint8_t)0);
  lcd.setCursor(col, 1);
  lcd.print(F("  "));
  lcd.write((uint8_t)0);
}

static void lcdBigDigit5(int col) {
  lcd.setCursor(col, 0);
  lcd.write((uint8_t)1);
  lcd.write((uint8_t)2);
  lcd.write((uint8_t)3);
  lcd.setCursor(col, 1);
  lcd.write((uint8_t)6);
  lcd.write((uint8_t)5);
  lcd.write((uint8_t)0);
}

static void lcdBigDigit6(int col) {
  lcd.setCursor(col, 0);
  lcd.write((uint8_t)1);
  lcd.write((uint8_t)2);
  lcd.write((uint8_t)3);
  lcd.setCursor(col, 1);
  lcd.write((uint8_t)1);
  lcd.write((uint8_t)5);
  lcd.write((uint8_t)0);
}

static void lcdBigDigit7(int col) {
  lcd.setCursor(col, 0);
  lcd.write((uint8_t)1);
  lcd.write((uint8_t)7);
  lcd.write((uint8_t)0);
  lcd.setCursor(col, 1);
  lcd.print(F("  "));
  lcd.write((uint8_t)0);
}

static void lcdBigDigit8(int col) {
  lcdBigDigit0(col);
}

static void lcdBigDigit9(int col) {
  lcd.setCursor(col, 0);
  lcd.write((uint8_t)1);
  lcd.write((uint8_t)2);
  lcd.write((uint8_t)0);
  lcd.setCursor(col, 1);
  lcd.write((uint8_t)6);
  lcd.write((uint8_t)5);
  lcd.write((uint8_t)0);
}

bool readSensorValues(float& temperature, float& humidity, float& ec, float& ph) {
  temperature = sht31.readTemperature();
  humidity = sht31.readHumidity();

  if (isnan(temperature) || isnan(humidity)) {
    return false;
  }

  // EC/pH 미연결 시 시뮬 값 (LCD가 2초마다 갱신되므로 난수는 덜 자주 바꿈)
  static float simEc = 1.0f;
  static float simPh = 6.0f;
  static unsigned long lastSimMs = 0;
  unsigned long nowMs = millis();
  if (lastSimMs == 0 || (nowMs - lastSimMs) >= 30000UL) {
    lastSimMs = nowMs;
    simEc = 0.8f + (random(0, 80) / 100.0f);
    simPh = 5.5f + (random(0, 30) / 10.0f);
  }
  ec = simEc;
  ph = simPh;
  return true;
}

/*
 * WiFi 연결 설정
 */
void setupWiFi() {
  Serial.print("WiFi 연결 중: ");
  Serial.println(ssid);

  WiFi.begin(ssid, password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.println("WiFi 연결 성공!");
    Serial.print("IP 주소: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println();
    Serial.println("WiFi 연결 실패!");
  }
}

/*
 * MQTT 연결
 */
void connectMQTT() {
  while (!mqttClient.connected()) {
    Serial.print("MQTT 연결 시도 중...");

    if (mqttClient.connect(mqtt_client_id, mqtt_username, mqtt_password)) {
      Serial.println("연결 성공!");

      // 액추에이터 제어 토픽 구독
      mqttClient.subscribe("smartfarm/actuators/led");
      mqttClient.subscribe("smartfarm/actuators/pump");
      mqttClient.subscribe("smartfarm/actuators/fan1");
      mqttClient.subscribe("smartfarm/actuators/fan2");
      mqttClient.subscribe("smartfarm/actuators/all");

      Serial.println("MQTT 토픽 구독 완료");
    } else {
      Serial.print("연결 실패, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" 5초 후 재시도...");
      delay(5000);
    }
  }
}

/*
 * MQTT 메시지 콜백 (액추에이터 제어 명령 수신)
 */
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  Serial.print("메시지 수신 [");
  Serial.print(topic);
  Serial.print("]: ");

  // JSON 파싱을 위한 버퍼
  char message[length + 1];
  memcpy(message, payload, length);
  message[length] = '\0';

  Serial.println(message);

  // JSON 파싱
  StaticJsonDocument<200> doc;
  DeserializationError error = deserializeJson(doc, message);

  if (error) {
    Serial.print("JSON 파싱 오류: ");
    Serial.println(error.c_str());
    return;
  }

  // 토픽에 따라 처리
  String topicStr = String(topic);

  if (topicStr == "smartfarm/actuators/led") {
    handleLEDControl(doc);
  } else if (topicStr == "smartfarm/actuators/pump") {
    handlePumpControl(doc);
  } else if (topicStr == "smartfarm/actuators/fan1") {
    handleFan1Control(doc);
  } else if (topicStr == "smartfarm/actuators/fan2") {
    handleFan2Control(doc);
  } else if (topicStr == "smartfarm/actuators/all") {
    handleAllActuatorsControl(doc);
  }
}

// 릴레이 물리 출력 반영
void writeRelay(uint8_t relayIndex, bool desiredOn) {
  // desiredOn: 논리적 ON(=릴레이 동작) 여부
  bool level;
  if (RELAY_ACTIVE_LOW) {
    // LOW=ON
    level = desiredOn ? LOW : HIGH;
  } else {
    // HIGH=ON
    level = desiredOn ? HIGH : LOW;
  }
  digitalWrite(relayPins[relayIndex], level);
  relayState[relayIndex] = desiredOn;
}

// 수동/ MQTT 명령으로 릴레이를 고정 제어 (auto는 해당 채널에서 무시)
void setRelayManual(uint8_t relayIndex, bool desiredOn) {
  manualEnabled[relayIndex] = true;
  manualState[relayIndex] = desiredOn;
  writeRelay(relayIndex, desiredOn);
}

// 수동 버튼 토글 처리 (버튼 누를 때마다 ON/OFF 토글)
void handleManualButtons() {
  unsigned long now = millis();

  for (uint8_t i = 0; i < 4; i++) {
    bool reading = digitalRead(btnPins[i]);

    // 버튼 값 변경 감지(디바운스 시작)
    if (reading != btnLastReading[i]) {
      btnLastChangeMs[i] = now;
      btnLastReading[i] = reading;
    }

    // 디바운스 시간 경과 후 상태 확정
    if (now - btnLastChangeMs[i] > BUTTON_DEBOUNCE_MS) {
      if (reading != btnStable[i]) {
        btnStable[i] = reading;

        // 눌렀을 때(Active-Low: LOW) => 토글
        if (btnStable[i] == LOW) {
          manualEnabled[i] = true;
          manualState[i] = !manualState[i];
          writeRelay(i, manualState[i]);
          Serial.print("Manual BTN");
          Serial.print(i + 1);
          Serial.print(": ");
          Serial.println(manualState[i] ? "ON" : "OFF");
        }
      }
    }
  }
}

// 자동제어 상태 계산 + 릴레이 출력 갱신
void updateAutomationAndRelays() {
  unsigned long now = millis();
  unsigned long elapsed = now - autoCycleStartMs;

  if (elapsed > AUTO_CYCLE_END_MS) {
    // 다음 사이클 시작
    autoCycleStartMs = now;
    elapsed = 0;
  }

  // 자동제어 목표 상태 계산
  for (uint8_t i = 0; i < 4; i++) {
    bool target;
    if (elapsed < AUTO_OFF_DELAY_FROM_START_MS) {
      // ON 시퀀스: relay1(0)부터 i*1분 시점에 ON
      target = elapsed >= ((unsigned long)i * AUTO_INTERVAL_MS);
    } else {
      // OFF 시퀀스: 5분 후 relay1(0)부터 순차 OFF
      unsigned long offElapsed = elapsed - AUTO_OFF_DELAY_FROM_START_MS;
      // relay i는 off 시퀀스 시작 시점 + i*1분에 OFF
      target = offElapsed < ((unsigned long)i * AUTO_INTERVAL_MS);
    }
    autoState[i] = target;
  }

  // 최종 출력 결정(수동 우선)
  for (uint8_t i = 0; i < 4; i++) {
    bool desired = manualEnabled[i] ? manualState[i] : autoState[i];
    if (relayState[i] != desired) {
      writeRelay(i, desired);
    }
  }
}

/*
 * LED 제어 처리
 */
void handleLEDControl(JsonDocument& doc) {
  // MQTT "led" 토픽은 RELAY4(7번핀)에 매핑
  bool on = false;
  if (doc.containsKey("state")) {
    on = doc["state"];
  } else if (doc.containsKey("enabled")) {
    on = doc["enabled"];
  } else if (doc.containsKey("brightness")) {
    // 릴레이는 밝기 대신 ON/OFF로 취급
    int b = doc["brightness"];
    on = (b > 0);
  } else if (doc.containsKey("value")) {
    float v = doc["value"];
    on = (v > 0);
  }

  setRelayManual(3, on);
  Serial.print("MQTT led -> RELAY4: ");
  Serial.println(on ? "ON" : "OFF");
}

/*
 * Pump 제어 처리
 */
void handlePumpControl(JsonDocument& doc) {
  // MQTT "pump" 토픽은 RELAY1(4번핀)에 매핑
  bool on = false;
  if (doc.containsKey("state")) {
    on = doc["state"];
  } else if (doc.containsKey("enabled")) {
    on = doc["enabled"];
  } else if (doc.containsKey("value")) {
    float v = doc["value"];
    on = (v > 0);
  }

  setRelayManual(0, on);
  Serial.print("MQTT pump -> RELAY1: ");
  Serial.println(on ? "ON" : "OFF");
}

/*
 * Fan1 제어 처리
 */
void handleFan1Control(JsonDocument& doc) {
  // MQTT "fan1" 토픽은 RELAY2(5번핀)에 매핑
  bool on = false;
  if (doc.containsKey("state")) {
    on = doc["state"];
  } else if (doc.containsKey("enabled")) {
    on = doc["enabled"];
  } else if (doc.containsKey("value")) {
    float v = doc["value"];
    on = (v > 0);
  }

  setRelayManual(1, on);
  Serial.print("MQTT fan1 -> RELAY2: ");
  Serial.println(on ? "ON" : "OFF");
}

/*
 * Fan2 제어 처리
 */
void handleFan2Control(JsonDocument& doc) {
  // MQTT "fan2" 토픽은 RELAY3(6번핀)에 매핑
  bool on = false;
  if (doc.containsKey("state")) {
    on = doc["state"];
  } else if (doc.containsKey("enabled")) {
    on = doc["enabled"];
  } else if (doc.containsKey("value")) {
    float v = doc["value"];
    on = (v > 0);
  }

  setRelayManual(2, on);
  Serial.print("MQTT fan2 -> RELAY3: ");
  Serial.println(on ? "ON" : "OFF");
}

/*
 * 모든 액추에이터 제어 처리
 */
void handleAllActuatorsControl(JsonDocument& doc) {
  // MQTT all 메시지(JSON 구조 예: { "led":{ "enabled":true }, "pump":{ "enabled":true }, ... })
  if (doc.containsKey("led")) {
    JsonObject ledObj = doc["led"];
    if (ledObj.containsKey("enabled")) {
      setRelayManual(3, ledObj["enabled"]);
    } else if (ledObj.containsKey("brightness")) {
      int b = ledObj["brightness"];
      setRelayManual(3, (b > 0));
    }
  }

  if (doc.containsKey("pump")) {
    JsonObject pumpObj = doc["pump"];
    if (pumpObj.containsKey("enabled")) {
      setRelayManual(0, pumpObj["enabled"]);
    }
  }

  if (doc.containsKey("fan1")) {
    JsonObject fan1Obj = doc["fan1"];
    if (fan1Obj.containsKey("enabled")) {
      setRelayManual(1, fan1Obj["enabled"]);
    }
  }

  if (doc.containsKey("fan2")) {
    JsonObject fan2Obj = doc["fan2"];
    if (fan2Obj.containsKey("enabled")) {
      setRelayManual(2, fan2Obj["enabled"]);
    }
  }

  Serial.println("모든 릴레이 제어 업데이트 완료");
}

/*
 * 센서 데이터 읽기 및 MQTT 발행
 */
void readAndPublishSensors() {
  float temperature;
  float humidity;
  float ec;
  float ph;

  if (!readSensorValues(temperature, humidity, ec, ph)) {
    Serial.println("SHT31 센서 읽기 실패!");
    return;
  }

  unsigned long timestamp = millis() / 600000;  // 초 단위 타임스탬프

  // 개별 센서 데이터 발행
  publishSensorData("temperature", temperature, "°C", timestamp);
  delay(100);
  publishSensorData("humidity", humidity, "%", timestamp);
  delay(100);
  publishSensorData("ec", ec, "mS/cm", timestamp);
  delay(100);
  publishSensorData("ph", ph, "pH", timestamp);

  // 모든 센서 데이터 통합 발행
  delay(100);
  publishAllSensorData(temperature, humidity, ec, ph, timestamp);

  // 시리얼 모니터 출력
  Serial.println("--- 센서 데이터 ---");
  Serial.print("온도: ");
  Serial.print(temperature);
  Serial.println(" °C");
  Serial.print("습도: ");
  Serial.print(humidity);
  Serial.println(" %");
  Serial.print("EC: ");
  Serial.print(ec);
  Serial.println(" mS/cm");
  Serial.print("pH: ");
  Serial.print(ph);
  Serial.println(" pH");
}

/*
 * 개별 센서 데이터 MQTT 발행
 */
void publishSensorData(const char* sensorType, float value, const char* unit, unsigned long timestamp) {
  StaticJsonDocument<200> doc;
  doc["sensor"] = sensorType;
  doc["value"] = value;
  doc["unit"] = unit;
  doc["timestamp"] = timestamp;

  char jsonBuffer[200];
  serializeJson(doc, jsonBuffer);

  String topic = "smartfarm/sensors/" + String(sensorType);
  mqttClient.publish(topic.c_str(), jsonBuffer);
}

/*
 * 모든 센서 데이터 통합 MQTT 발행
 */
void publishAllSensorData(float temperature, float humidity, float ec, float ph, unsigned long timestamp) {
  StaticJsonDocument<300> doc;
  doc["temperature"] = temperature;
  doc["humidity"] = humidity;
  doc["ec"] = ec;
  doc["ph"] = ph;
  doc["timestamp"] = timestamp;

  char jsonBuffer[300];
  serializeJson(doc, jsonBuffer);

  mqttClient.publish("smartfarm/sensors/all", jsonBuffer);
}

