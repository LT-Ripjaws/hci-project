// Twinflare diagnostic 3: damage LED test.
// P1 LED: D4 -> 1k resistor -> LED anode, cathode -> GND.
// P2 LED: D5 -> 1k resistor -> LED anode, cathode -> GND.
// Serial Monitor at 115200 baud.
//
// Automatic pattern: P1 on, P2 on, both on, both off (500 ms each step).
// Serial commands: '1' flashes P1 for 200 ms, '2' flashes P2 for 200 ms,
// 'x' turns both off, 'a' toggles the automatic pattern.
//
// Pass gate (workflow Phase 7A): each LED lights only on its own step. An LED
// that never lights has reversed polarity, a missing resistor path or the
// wrong pin. An LED that is always on has its signal row connected to 5V.

static const uint8_t LED_PIN[2] = {4, 5};
static const unsigned long STEP_MS = 500;
static const unsigned long FLASH_MS = 200;

static bool autoPattern = true;
static uint8_t step = 0;
static unsigned long lastStepMs = 0;
static unsigned long flashOffAt[2] = {0, 0};
static bool flashing[2] = {false, false};

static void setLeds(bool p1, bool p2) {
  digitalWrite(LED_PIN[0], p1 ? HIGH : LOW);
  digitalWrite(LED_PIN[1], p2 ? HIGH : LOW);
}

void setup() {
  Serial.begin(115200);
  for (uint8_t i = 0; i < 2; i++) {
    pinMode(LED_PIN[i], OUTPUT);
    digitalWrite(LED_PIN[i], LOW);
  }
  Serial.println(F("Twinflare LED test: P1 = D4, P2 = D5."));
  Serial.println(F("Auto pattern running. Keys: 1 = flash P1, 2 = flash P2, x = off, a = toggle auto."));
}

void loop() {
  unsigned long now = millis();

  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '1' || c == '2') {
      uint8_t i = (c == '1') ? 0 : 1;
      autoPattern = false;
      setLeds(false, false);
      digitalWrite(LED_PIN[i], HIGH);
      flashing[i] = true;
      flashOffAt[i] = now + FLASH_MS;
      Serial.print(F("flash P"));
      Serial.println(i + 1);
    } else if (c == 'x') {
      autoPattern = false;
      flashing[0] = flashing[1] = false;
      setLeds(false, false);
      Serial.println(F("both off"));
    } else if (c == 'a') {
      autoPattern = !autoPattern;
      flashing[0] = flashing[1] = false;
      setLeds(false, false);
      Serial.println(autoPattern ? F("auto pattern on") : F("auto pattern off"));
    }
  }

  for (uint8_t i = 0; i < 2; i++) {
    if (flashing[i] && (long)(now - flashOffAt[i]) >= 0) {
      flashing[i] = false;
      digitalWrite(LED_PIN[i], LOW);
    }
  }

  if (autoPattern && now - lastStepMs >= STEP_MS) {
    lastStepMs = now;
    step = (step + 1) & 0x03;
    switch (step) {
      case 0: setLeds(true, false);  Serial.println(F("P1 on")); break;
      case 1: setLeds(false, true);  Serial.println(F("P2 on")); break;
      case 2: setLeds(true, true);   Serial.println(F("both on")); break;
      default: setLeds(false, false); Serial.println(F("both off")); break;
    }
  }
}
