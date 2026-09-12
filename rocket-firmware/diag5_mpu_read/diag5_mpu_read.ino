// Twinflare diagnostic 5: read and calibrate both GY-521 modules.
// P1 at 0x68 (AD0 to GND), P2 at 0x69 (AD0 to 3.3V), both on the converter's
// low side. Serial Monitor at 115200 baud.
//
// After reset, keep both rockets flat and still for two seconds while the gyro
// bias is measured (health 0). Then health becomes 1 and roll is live.
// Serial command: 'c' restarts bias measurement for both sensors.
//
// Pass gates (workflow Phase 2 and Phase 6):
// - Level and still: roll stays within about +/-1 degree.
// - Bank right (right side down): roll goes POSITIVE and grows with the angle.
//   If it goes negative, set ROLL_SIGN for that player to -1 here and in
//   twinflare_firmware. If a different motion changes roll, rotate the sensor
//   so its X axis runs along the rocket.
// - Tilting P1 changes only P1; tilting P2 changes only P2.
// - At rest, az is about +16384 (1 g) with ax and ay near 0.

#include <Wire.h>
#include "TwinflareMpu.h"

static const uint8_t SENSOR_ADDR[2] = {0x68, 0x69};
static const int8_t ROLL_SIGN[2] = {1, 1};
static const bool MOUNT_INVERTED[2] = {true, true};   // true if the GY-521 chip faces down when the rocket is level
static const bool BANK_ABOUT_Y[2] = {true, true};     // true if the GY-521's X axis runs across the rocket (long side sideways)
static const unsigned long SAMPLE_US = 10000;   // 100 Hz
static const unsigned long PRINT_MS = 100;

static twinflare::Sensor sensors[2];
static unsigned long lastSampleUs = 0;
static unsigned long lastPrintMs = 0;

static void configureAll() {
  unsigned long now = millis();
  for (uint8_t i = 0; i < 2; i++) {
    twinflare::configure(sensors[i], now);
    Serial.print(F("P"));
    Serial.print(i + 1);
    Serial.print(F(" 0x"));
    Serial.print(sensors[i].addr, HEX);
    if (sensors[i].health == twinflare::HEALTH_FAULT) {
      Serial.println(F(": not responding"));
    } else {
      Serial.print(F(": configured, WHO_AM_I=0x"));
      Serial.println(sensors[i].whoAmI, HEX);
    }
  }
  Serial.println(F("Hold both rockets flat and still for 2 s (health 0 -> 1)."));
}

static void printSensor(uint8_t i) {
  const twinflare::Sensor &s = sensors[i];
  Serial.print('P');
  Serial.print(i + 1);
  Serial.print(F(" h="));
  Serial.print(s.health);
  Serial.print(F(" roll="));
  if (s.rollCentideg >= 0) Serial.print('+');
  Serial.print(s.rollCentideg / 100.0f, 2);
  Serial.print(F(" acc="));
  Serial.print(s.ax); Serial.print(','); Serial.print(s.ay); Serial.print(','); Serial.print(s.az);
  Serial.print(F(" gyro="));
  Serial.print(s.gx); Serial.print(','); Serial.print(s.gy); Serial.print(','); Serial.print(s.gz);
  Serial.print(F(" bias="));
  Serial.print(s.gyroBias, 2);
}

void setup() {
  Serial.begin(115200);
  twinflare::recoverBus();   // a reset can interrupt a transaction; start from a clean bus
  for (uint8_t i = 0; i < 2; i++) {
    twinflare::resetState(sensors[i], SENSOR_ADDR[i], ROLL_SIGN[i], MOUNT_INVERTED[i], BANK_ABOUT_Y[i]);
  }
  Serial.println(F("Twinflare MPU read: P1=0x68, P2=0x69. Key: c = recalibrate bias."));
  configureAll();
}

void loop() {
  unsigned long nowUs = micros();
  unsigned long nowMs = millis();

  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == 'c') configureAll();
  }

  if (nowUs - lastSampleUs >= SAMPLE_US) {
    lastSampleUs = nowUs;
    for (uint8_t i = 0; i < 2; i++) {
      twinflare::retryIfFaulted(sensors[i], nowMs);
      twinflare::sample(sensors[i], nowUs);
    }
  }

  if (nowMs - lastPrintMs >= PRINT_MS) {
    lastPrintMs = nowMs;
    printSensor(0);
    Serial.print(F("  |  "));
    printSensor(1);
    Serial.println();
  }
}
