#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <SPI.h>
#include <MFRC522.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME280.h>
#include <ArduinoJson.h>

// ===== WiFi =====
const char* ssid       = "Si Mon3em";
const char* password   = "12345678x";

// ===== Server =====
const char* serverName = "http://10.176.67.220:5000/data";
const char* acUrl      = "http://10.176.67.220:5000/ac-command";

// ===== RFID pins =====
#define RST_PIN 2
#define SS_PIN  14
MFRC522 rfid(SS_PIN, RST_PIN);

// ===== PIR =====
#define PIR_PIN 16

// ===== BME280 =====
Adafruit_BME280 bme;
bool bmeOK = false;   // ← track init success

// ===== AC Relay =====
#define AC_PIN 17

// ===== Variables =====
int    people_count = 0;
String ac_status    = "UNKNOWN";

// ===================================================
void connectWiFi() {
  Serial.print("Connecting to WiFi");
  WiFi.disconnect(true);
  delay(100);
  WiFi.begin(ssid, password);

  for (int i = 0; i < 20 && WiFi.status() != WL_CONNECTED; i++) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ WiFi Connected! IP: " + WiFi.localIP().toString());
  } else {
    Serial.println("\n❌ WiFi Failed — will retry later");
  }
}

// ===================================================
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=== ESP32 SENSOR SYSTEM ===");

  pinMode(PIR_PIN, INPUT);
  pinMode(AC_PIN,  OUTPUT);
  digitalWrite(AC_PIN, LOW);

  connectWiFi();

  // BME280 — store result, never crash if missing
  Wire.begin(25, 26);
  bmeOK = bme.begin(0x76);
  Serial.println(bmeOK ? "✅ BME280 OK" : "❌ BME280 Failed");

  // RFID
  SPI.begin(12, 15, 13, SS_PIN);
  rfid.PCD_Init();
  delay(50);
  byte ver = rfid.PCD_ReadRegister(MFRC522::VersionReg);
  Serial.println((ver != 0x00 && ver != 0xFF) ? "✅ RFID OK" : "❌ RFID Failed");

  Serial.println("\n=== SYSTEM READY ===\n");
}

// ===================================================
void checkACCommand() {
  if (WiFi.status() != WL_CONNECTED) return;   // skip silently

  HTTPClient http;
  http.setTimeout(5000);                        // ← 5 s timeout, prevents hang
  if (!http.begin(acUrl)) {
    Serial.println("❌ AC http.begin() failed");
    return;
  }

  int code = http.GET();
  if (code == HTTP_CODE_OK) {
    String payload = http.getString();

    // Use stack-allocated doc — safer than heap on ESP32
    StaticJsonDocument<256> doc;
    DeserializationError err = deserializeJson(doc, payload);

    if (!err && doc.containsKey("status")) {
      const char* s = doc["status"];
      if      (strcmp(s, "ON")  == 0) ac_status = "ON";
      else if (strcmp(s, "OFF") == 0) ac_status = "OFF";
      else                            ac_status = "UNKNOWN";
    } else {
      ac_status = "PARSE_ERR";
    }
  } else {
    Serial.printf("AC GET failed: %d\n", code);
    ac_status = "ERROR";
  }

  http.end();
  digitalWrite(AC_PIN, (ac_status == "ON") ? HIGH : LOW);
}

// ===================================================
void loop() {
  // Safe sensor reads — fallback to 0 if BME missing
  float temperature = bmeOK ? bme.readTemperature() : 0.0f;
  float humidity    = bmeOK ? bme.readHumidity()    : 0.0f;

  // Guard against NaN — crash source #1
  if (isnan(temperature)) temperature = 0.0f;
  if (isnan(humidity))    humidity    = 0.0f;

  int pir_state = digitalRead(PIR_PIN);

  // RFID scan
  if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
    people_count++;
    Serial.printf("📱 RFID Detected! Count: %d\n", people_count);
    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();
    delay(500);   // debounce
  }

  // Log
  Serial.printf("\n--- READINGS ---\nTemp: %.2f°C  Hum: %.2f%%  PIR: %s  People: %d\n",
                temperature, humidity,
                pir_state == HIGH ? "YES" : "NO",
                people_count);

  // Send to server
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.setTimeout(5000);

    if (http.begin(serverName)) {
      http.addHeader("Content-Type", "application/json");

      // Use StaticJsonDocument to build payload safely
      StaticJsonDocument<256> doc;
      doc["temp"]            = serialized(String(temperature, 2));
      doc["hum"]             = serialized(String(humidity, 2));
      doc["pir"]             = pir_state;
      doc["taux_occupation"] = people_count;

      String jsonData;
      serializeJson(doc, jsonData);

      int code = http.POST(jsonData);
      Serial.println(code == HTTP_CODE_OK ? "Server: ✅ Sent" : "Server: ❌ Failed");
      http.end();
    }
  } else {
    Serial.println("Server: ❌ WiFi down — reconnecting...");
    connectWiFi();
  }

  checkACCommand();
  Serial.printf("AC: %s\n----------------\n", ac_status.c_str());

  delay(3000);
}