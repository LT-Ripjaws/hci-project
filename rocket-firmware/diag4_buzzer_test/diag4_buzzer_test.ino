// Twinflare diagnostic 4: buzzer driver test.
// D6 -> 680 ohm -> NPN base; base -> 10k -> GND; emitter -> GND;
// collector -> buzzer negative; buzzer positive -> 5V; 1N4007 across the buzzer
// (stripe to 5V); 100 uF across 5V/GND near the driver.
// Serial Monitor at 115200 baud.
//
// Behaviour: silent for the first 3 s, then one 100 ms pulse every 2 s.
// Serial commands: 'b' = 100 ms pulse, 'l' = 200 ms pulse, 'a' = toggle auto,
// 'x' = stop now.
//
// Pass gate (workflow Phase 7A): silence before the first pulse, pulses of the
// stated length, no Uno reset and no USB disconnect during a pulse. A buzzer
// that sounds continuously means a wrong transistor pinout, a missing 10k
// pulldown or reversed collector/emitter. Unplug USB before investigating.

static const uint8_t BUZZER_PIN = 6;
static const unsigned long SILENT_START_MS = 3000;
static const unsigned long AUTO_PERIOD_MS = 2000;
static const unsigned long SHORT_PULSE_MS = 100;
static const unsigned long LONG_PULSE_MS = 200;

static bool autoMode = true;
static bool buzzerOn = false;
static unsigned long buzzerOffAt = 0;
static unsigned long lastAutoMs = 0;
static unsigned long pulses = 0;

static void pulse(unsigned long ms) {
  unsigned long now = millis();
  digitalWrite(BUZZER_PIN, HIGH);
  buzzerOn = true;
  buzzerOffAt = now + ms;
  pulses++;
  Serial.print(F("pulse "));
  Serial.print(ms);
  Serial.print(F(" ms, count="));
  Serial.println(pulses);
}

void setup() {
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  Serial.begin(115200);
  Serial.println(F("Twinflare buzzer test: D6 drives the NPN base."));
  Serial.println(F("The buzzer must stay silent for 3 s. Keys: b = 100 ms, l = 200 ms, a = toggle auto, x = stop."));
  lastAutoMs = millis() + SILENT_START_MS - AUTO_PERIOD_MS;
}

void loop() {
  unsigned long now = millis();

  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == 'b') pulse(SHORT_PULSE_MS);
    else if (c == 'l') pulse(LONG_PULSE_MS);
    else if (c == 'a') {
      autoMode = !autoMode;
      Serial.println(autoMode ? F("auto on") : F("auto off"));
    } else if (c == 'x') {
      autoMode = false;
      buzzerOn = false;
      digitalWrite(BUZZER_PIN, LOW);
      Serial.println(F("stopped"));
    }
  }

  if (buzzerOn && (long)(now - buzzerOffAt) >= 0) {
    buzzerOn = false;
    digitalWrite(BUZZER_PIN, LOW);
  }

  if (autoMode && (long)(now - lastAutoMs) >= (long)AUTO_PERIOD_MS) {
    lastAutoMs = now;
    pulse(SHORT_PULSE_MS);
  }
}
