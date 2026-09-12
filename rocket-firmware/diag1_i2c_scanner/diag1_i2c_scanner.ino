// Twinflare diagnostic 1: I2C address scanner.
// Board: Arduino Uno R3. Serial Monitor at 115200 baud, newline line ending.
//
// Expected with both rockets wired: exactly two devices, 0x68 (P1, AD0 to GND)
// and 0x69 (P2, AD0 to 3.3V). Rescans every two seconds so wiring can be
// checked, but change wiring only with USB unplugged.

#include <Wire.h>

static const uint8_t MPU_REG_WHO_AM_I = 0x75;

// Returns WHO_AM_I or -1 if the device did not answer.
static int readWhoAmI(uint8_t addr) {
  Wire.beginTransmission(addr);
  Wire.write(MPU_REG_WHO_AM_I);
  if (Wire.endTransmission(false) != 0) return -1;
  if (Wire.requestFrom(addr, (uint8_t)1) != 1) return -1;
  return Wire.read();
}

static void printHex8(uint8_t value) {
  if (value < 0x10) Serial.print('0');
  Serial.print(value, HEX);
}

void setup() {
  Serial.begin(115200);
  Wire.begin();
  Wire.setClock(100000);
  Wire.setWireTimeout(25000, true);   // needs AVR core 1.8.3 or newer
  Serial.println(F("Twinflare I2C scanner"));
  Serial.println(F("Expect 0x68 = P1 (AD0->GND) and 0x69 = P2 (AD0->3.3V)."));
  Serial.println(F("WHO_AM_I is 0x68 on a genuine MPU6050; clones may report 0x70, 0x72 or 0x98 and still work."));
}

void loop() {
  uint8_t found = 0;
  bool p1 = false;
  bool p2 = false;
  bool timedOut = false;

  for (uint8_t addr = 8; addr < 120; addr++) {
    Wire.beginTransmission(addr);
    uint8_t err = Wire.endTransmission();
    if (Wire.getWireTimeoutFlag()) {
      timedOut = true;
      Wire.clearWireTimeoutFlag();
      continue;
    }
    if (err != 0) continue;

    found++;
    Serial.print(F("Device at 0x"));
    printHex8(addr);
    if (addr == 0x68 || addr == 0x69) {
      int who = readWhoAmI(addr);
      Serial.print(F("  WHO_AM_I="));
      if (who < 0) {
        Serial.print(F("read failed"));
      } else {
        Serial.print(F("0x"));
        printHex8((uint8_t)who);
      }
      Serial.print(addr == 0x68 ? F("  <- P1") : F("  <- P2"));
      if (addr == 0x68) p1 = true; else p2 = true;
    }
    Serial.println();
  }

  Serial.print(F("RESULT: P1 0x68 "));
  Serial.print(p1 ? F("found") : F("MISSING"));
  Serial.print(F(" | P2 0x69 "));
  Serial.print(p2 ? F("found") : F("MISSING"));
  Serial.print(F(" | devices total: "));
  Serial.println(found);

  if (timedOut) {
    Serial.println(F("I2C timeout during scan: check SDA/SCL, converter HV/LV, A4->HV1, A5->HV2 and grounds."));
  } else if (found == 0) {
    Serial.println(F("No devices: A4/A5 may be swapped, converter HV/LV or SDA/SCL reversed, or sensors unpowered."));
  } else if (p1 && !p2) {
    Serial.println(F("Only 0x68: P2 AD0 is not reaching 3.3V, or the P2 tether is open."));
  } else if (!p1 && p2) {
    Serial.println(F("Only 0x69: P1 AD0 is not grounded, or the P1 tether is open."));
  }
  Serial.println();
  delay(2000);
}
