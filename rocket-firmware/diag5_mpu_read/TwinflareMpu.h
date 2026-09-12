// TwinflareMpu.h - minimal MPU6050 (GY-521) driver for two addressed modules.
// Shared by diag5_mpu_read and twinflare_firmware. Keep both copies identical.
//
// Uses raw Wire register access instead of the Adafruit library so that each
// address has its own state, every bus error is visible, and no dynamic memory
// is used. Bank is the rotation about the rocket's long axis. With the module's
// X axis along the rocket that is atan2(ay, az) corrected by the X gyro; with
// the module's X axis across the rocket (long axis = sensor Y) it is
// atan2(-ax, az) corrected by the Y gyro. A chip-down mount flips the lateral
// and vertical accelerometer axes. Both are per-sensor options.

#pragma once
#include <Arduino.h>
#include <Wire.h>

namespace twinflare {

enum Health : uint8_t { HEALTH_INIT = 0, HEALTH_OK = 1, HEALTH_FAULT = 2 };

static const uint8_t REG_SMPLRT_DIV   = 0x19;
static const uint8_t REG_CONFIG       = 0x1A;
static const uint8_t REG_GYRO_CONFIG  = 0x1B;
static const uint8_t REG_ACCEL_CONFIG = 0x1C;
static const uint8_t REG_ACCEL_XOUT_H = 0x3B;
static const uint8_t REG_PWR_MGMT_1   = 0x6B;
static const uint8_t REG_WHO_AM_I     = 0x75;

static const float GYRO_LSB_PER_DPS = 131.0f;      // +/-250 deg/s full scale
static const float FILTER_ALPHA = 0.96f;           // gyro weight per 100 Hz step
static const uint16_t BIAS_SAMPLES = 200;          // 2 s still at 100 Hz
static const unsigned long RETRY_MS = 1000;        // reinit interval after a fault
static const long ROLL_LIMIT_CENTIDEG = 18000;

struct Sensor {
  uint8_t addr;
  int8_t sign;               // +1 or -1 so that a right bank is positive
  bool inverted;             // true when the module is mounted component side down
  bool bankAboutY;           // true when the module's X axis runs across the rocket
  uint8_t health;            // Health enum
  float roll;                // filtered roll, degrees, before sign
  float gyroBias;            // deg/s about X, measured while still
  float biasSum;
  uint16_t biasCount;
  unsigned long lastSampleUs;
  unsigned long lastInitMs;
  int16_t ax, ay, az, gx, gy, gz;
  int16_t rollCentideg;      // signed, clamped to +/-18000
  uint8_t whoAmI;
};

inline bool writeReg(uint8_t addr, uint8_t reg, uint8_t value) {
  Wire.beginTransmission(addr);
  Wire.write(reg);
  Wire.write(value);
  return Wire.endTransmission() == 0;
}

inline bool readRegs(uint8_t addr, uint8_t reg, uint8_t *buf, uint8_t count) {
  Wire.beginTransmission(addr);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(addr, count) != count) return false;
  for (uint8_t i = 0; i < count; i++) buf[i] = (uint8_t)Wire.read();
  return true;
}

// AVR core 1.8.3 or newer is required: it provides setWireTimeout(). Core 1.8.8
// ships with Arduino IDE 2.x. The WIRE_HAS_TIMEOUT macro is not defined there,
// so the calls are made unconditionally instead of being guarded by it.
inline void clearBusTimeout() {
  if (Wire.getWireTimeoutFlag()) Wire.clearWireTimeoutFlag();
}

inline void beginBus() {
  Wire.begin();
  Wire.setClock(100000);
  // 25 ms per transaction, then reset the TWI hardware so a stuck bus cannot hang the loop.
  Wire.setWireTimeout(25000, true);
}

// Recovers a bus left in a bad state by a glitch: a slave holding SDA low
// mid-byte, or the TWI peripheral stuck after a bus error. Clocks SCL until
// SDA releases, issues a STOP, then restarts Wire. Takes well under 1 ms.
inline void recoverBus() {
  Wire.end();
  pinMode(SDA, INPUT_PULLUP);
  pinMode(SCL, INPUT_PULLUP);
  delayMicroseconds(10);
  for (uint8_t i = 0; i < 9 && digitalRead(SDA) == LOW; i++) {
    digitalWrite(SCL, LOW);
    pinMode(SCL, OUTPUT);
    delayMicroseconds(10);
    pinMode(SCL, INPUT_PULLUP);
    delayMicroseconds(10);
  }
  digitalWrite(SDA, LOW);
  pinMode(SDA, OUTPUT);
  delayMicroseconds(10);
  pinMode(SDA, INPUT_PULLUP);     // SDA low to high while SCL is high: STOP
  delayMicroseconds(10);
  beginBus();
}

inline void resetState(Sensor &s, uint8_t addr, int8_t sign, bool inverted, bool bankAboutY) {
  s.addr = addr;
  s.sign = (sign < 0) ? -1 : 1;
  s.inverted = inverted;
  s.bankAboutY = bankAboutY;
  s.health = HEALTH_FAULT;
  s.roll = 0.0f;
  s.gyroBias = 0.0f;
  s.biasSum = 0.0f;
  s.biasCount = 0;
  s.lastSampleUs = 0;
  s.lastInitMs = 0;
  s.ax = s.ay = s.az = s.gx = s.gy = s.gz = 0;
  s.rollCentideg = 0;
  s.whoAmI = 0;
}

// Wakes and configures the sensor. On success health becomes HEALTH_INIT and
// the next BIAS_SAMPLES samples estimate the gyro bias; keep the rocket still.
inline bool configure(Sensor &s, unsigned long nowMs) {
  s.lastInitMs = nowMs;
  s.biasSum = 0.0f;
  s.biasCount = 0;
  s.gyroBias = 0.0f;
  s.lastSampleUs = 0;
  s.rollCentideg = 0;

  uint8_t who = 0;
  uint8_t pwr = 0xFF;
  bool ok = readRegs(s.addr, REG_WHO_AM_I, &who, 1)
         && writeReg(s.addr, REG_PWR_MGMT_1, 0x01)     // wake, clock = PLL with X gyro
         && writeReg(s.addr, REG_SMPLRT_DIV, 9)        // 1 kHz / (1 + 9) = 100 Hz
         && writeReg(s.addr, REG_CONFIG, 0x03)         // DLPF: 44 Hz accel, 42 Hz gyro
         && writeReg(s.addr, REG_GYRO_CONFIG, 0x00)    // +/-250 deg/s
         && writeReg(s.addr, REG_ACCEL_CONFIG, 0x00)   // +/-2 g
         && readRegs(s.addr, REG_PWR_MGMT_1, &pwr, 1)
         && pwr == 0x01;
  clearBusTimeout();
  s.whoAmI = who;
  s.health = ok ? HEALTH_INIT : HEALTH_FAULT;
  return ok;
}

// One 100 Hz sample. A failed read marks the sensor faulted; stale values are
// never reused as fresh.
inline void sample(Sensor &s, unsigned long nowUs) {
  if (s.health == HEALTH_FAULT) return;

  uint8_t raw[14];
  if (!readRegs(s.addr, REG_ACCEL_XOUT_H, raw, 14)) {
    clearBusTimeout();
    s.health = HEALTH_FAULT;
    s.rollCentideg = 0;
    return;
  }
  s.ax = (int16_t)(((uint16_t)raw[0] << 8) | raw[1]);
  s.ay = (int16_t)(((uint16_t)raw[2] << 8) | raw[3]);
  s.az = (int16_t)(((uint16_t)raw[4] << 8) | raw[5]);
  // raw[6], raw[7]: temperature, unused
  s.gx = (int16_t)(((uint16_t)raw[8] << 8) | raw[9]);
  s.gy = (int16_t)(((uint16_t)raw[10] << 8) | raw[11]);
  s.gz = (int16_t)(((uint16_t)raw[12] << 8) | raw[13]);

  // Rotation about X by t gives ay = g sin t, az = g cos t, gx = dt/dt.
  // Rotation about Y by t gives ax = -g sin t, az = g cos t, gy = dt/dt.
  float lateral = s.bankAboutY ? -(float)s.ax : (float)s.ay;
  float vertical = (float)s.az;
  float gyroRate = (s.bankAboutY ? (float)s.gy : (float)s.gx) / GYRO_LSB_PER_DPS;
  if (s.inverted) {            // 180 degrees about the long axis: lateral and vertical flip
    lateral = -lateral;
    vertical = -vertical;
  }
  float accRoll = atan2(lateral, vertical) * (180.0f / PI);

  if (s.health == HEALTH_INIT) {
    s.biasSum += gyroRate;
    s.biasCount++;
    s.roll = accRoll;
    if (s.biasCount >= BIAS_SAMPLES) {
      s.gyroBias = s.biasSum / (float)s.biasCount;
      s.health = HEALTH_OK;
    }
  } else {
    float dt = (s.lastSampleUs == 0) ? 0.01f : (float)(nowUs - s.lastSampleUs) * 1.0e-6f;
    if (dt > 0.05f) dt = 0.05f;
    float predicted = s.roll + (gyroRate - s.gyroBias) * dt;
    s.roll = FILTER_ALPHA * predicted + (1.0f - FILTER_ALPHA) * accRoll;
  }
  s.lastSampleUs = nowUs;

  float scaled = s.roll * (float)s.sign * 100.0f;
  long centi = (long)(scaled + (scaled >= 0.0f ? 0.5f : -0.5f));
  if (centi > ROLL_LIMIT_CENTIDEG) centi = ROLL_LIMIT_CENTIDEG;
  if (centi < -ROLL_LIMIT_CENTIDEG) centi = -ROLL_LIMIT_CENTIDEG;
  s.rollCentideg = (int16_t)centi;
}

// Recovers the bus and reconfigures a faulted sensor at most once per RETRY_MS.
// Health returns to HEALTH_INIT, so the browser sees the sensor as not yet valid.
inline void retryIfFaulted(Sensor &s, unsigned long nowMs) {
  if (s.health != HEALTH_FAULT) return;
  if (nowMs - s.lastInitMs < RETRY_MS) return;
  recoverBus();
  configure(s, nowMs);
}

}  // namespace twinflare
