// Twinflare diagnostic 2: fire-button test.
// P1 button between D2 and GND, P2 button between D3 and GND, INPUT_PULLUP.
// Serial Monitor at 115200 baud.
//
// Pass gate (workflow Phase 1): 20 presses produce 20 debounced press counts,
// and an untouched button reads RELEASED. If a button reads PRESSED while
// untouched, both wires are on the same permanently-connected side of the
// four-leg button.

static const uint8_t BUTTON_PIN[2] = {2, 3};
static const unsigned long DEBOUNCE_MS = 20;
static const unsigned long STATUS_MS = 5000;

struct Button {
  bool stablePressed;
  bool lastRaw;
  unsigned long lastChangeMs;
  unsigned long presses;
};

static Button buttons[2];
static unsigned long lastStatusMs = 0;

static bool readPressed(uint8_t pin) {
  return digitalRead(pin) == LOW;  // pull-up: pressed connects the pin to GND
}

void setup() {
  Serial.begin(115200);
  for (uint8_t i = 0; i < 2; i++) {
    pinMode(BUTTON_PIN[i], INPUT_PULLUP);
    bool pressed = readPressed(BUTTON_PIN[i]);
    buttons[i].stablePressed = pressed;
    buttons[i].lastRaw = pressed;
    buttons[i].lastChangeMs = 0;
    buttons[i].presses = 0;
  }
  Serial.println(F("Twinflare button test: P1 = D2, P2 = D3, 20 ms debounce."));
  Serial.println(F("Press each button 20 times; the count must reach 20 with no extra transitions."));
}

void loop() {
  unsigned long now = millis();

  for (uint8_t i = 0; i < 2; i++) {
    Button &b = buttons[i];
    bool raw = readPressed(BUTTON_PIN[i]);
    if (raw != b.lastRaw) {
      b.lastRaw = raw;
      b.lastChangeMs = now;
    } else if (raw != b.stablePressed && (now - b.lastChangeMs) >= DEBOUNCE_MS) {
      b.stablePressed = raw;
      Serial.print('P');
      Serial.print(i + 1);
      if (b.stablePressed) {
        b.presses++;
        Serial.print(F(" PRESSED   count="));
        Serial.println(b.presses);
      } else {
        Serial.println(F(" released"));
      }
    }
  }

  if (now - lastStatusMs >= STATUS_MS) {
    lastStatusMs = now;
    Serial.print(F("status: P1 "));
    Serial.print(buttons[0].stablePressed ? F("PRESSED") : F("released"));
    Serial.print(F(" (count "));
    Serial.print(buttons[0].presses);
    Serial.print(F("), P2 "));
    Serial.print(buttons[1].stablePressed ? F("PRESSED") : F("released"));
    Serial.print(F(" (count "));
    Serial.print(buttons[1].presses);
    Serial.println(')');
  }
}
