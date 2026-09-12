# Twinflare Arduino firmware

Revision 1 | 11 September 2026 | One Uno, two GY-521 rockets

Firmware for the hardware described in [Twinflare-Physical-Assembly-Tutorial.md](../Twinflare-Physical-Assembly-Tutorial.md) and the serial contract summarised in the top-level README. Five diagnostic sketches follow the order in tutorial section 15, then one combined sketch talks to the browser game in [rocket-game](../rocket-game/README.md).

Status, 11 September 2026: all six sketches compile for Arduino Uno with arduino-cli 1.5.1 and AVR core 1.8.8, and all six have run on the assembled bench prototype (a CH340 clone Uno on COM3). Results are in the bench log at the end of this file. Browser connection and gameplay with the hardware are the next untested step.

## Arduino IDE setup

1. Install Arduino IDE 2.x from arduino.cc. It bundles the AVR core, whose Wire library has the I2C timeout these sketches use.
2. Open a sketch with File > Open and pick the `.ino` inside its folder. The folder name must match the file name, so keep the folders as they are.
3. Tools > Board > Arduino AVR Boards > Arduino Uno.
4. Tools > Port: the COM port that appears when the Uno is plugged in. A clone with a CH340 chip needs the CH340 driver first; the port does not appear until then.
5. Tools > Serial Monitor: 115200 baud, line ending "New Line".
6. No extra libraries are needed. Everything uses the built-in Wire library.

Close the Serial Monitor before the browser game opens the port. Only one program can own the port.

## Upload order and pass gates

Change wiring only with USB unplugged. Each sketch prints its own expected result at startup.

| Order | Sketch | Hardware needed | Expected result | Workflow gate |
|---|---|---|---|---|
| 1 | `diag1_i2c_scanner` | Both sensors, converter | `RESULT: P1 0x68 found | P2 0x69 found | devices total: 2` | Phase 1, Phase 6 |
| 2 | `diag2_button_test` | Both buttons | Untouched buttons read released; 20 presses give count 20 | Phase 1 |
| 3 | `diag3_led_test` | Both LEDs with 1k resistors | P1 LED lights only on "P1 on", P2 only on "P2 on" | Phase 7A |
| 4 | `diag4_buzzer_test` | Buzzer driver | Silent for 3 s, then a 100 ms pulse every 2 s, no Uno reset | Phase 7A |
| 5 | `diag5_mpu_read` | Both sensors | Health 0 for 2 s then 1; right bank gives positive roll on the correct player only | Phase 2, Phase 6 |
| 6 | `twinflare_firmware` | Everything | Browser Systems panel shows healthy P1 and P2; calibration succeeds | Phase 3 to 7A |

For the early P1-only build (workflow Phase 1 and 2), run the same sketches; P2 will report missing or health 2, which is the correct result at that stage.

### Mounting and roll sign (diag5)

Three per-player settings at the top of `diag5_mpu_read.ino` and `twinflare_firmware.ino` describe how each GY-521 sits in its rocket. Keep the two files identical.

| Setting | Meaning | Current bench value |
|---|---|---|
| `MOUNT_INVERTED` | true when the chip faces down with the rocket level (rest az reads negative) | true, true |
| `BANK_ABOUT_Y` | true when the module's X axis runs across the rocket, so banking moves ax instead of ay | true, true |
| `ROLL_SIGN` | +1 or -1 so that right side down reads positive | 1, 1 |

Check: hold the rocket level, pointing at the screen. Roll should read within a few degrees of 0. Bank it right (right side down): roll must go positive and only that player's number should change. Wrong sign: flip `ROLL_SIGN`. Roll near ±180 at rest: flip `MOUNT_INVERTED`. Banking barely moves roll but pitching does: flip `BANK_ABOUT_Y`. If the sensors are remounted, redo this check.

## Combined firmware behaviour

- Samples each sensor at 100 Hz, sends one R1 frame every 20 ms (50 Hz) at 115200 baud.
- Frame: `R1,<seq>,<uptime ms>,<P1 roll>,<P1 fire>,<P1 health>,<P2 roll>,<P2 fire>,<P2 health>`. Roll is in hundredths of a degree, clamped to plus or minus 18000, and is sent as 0 unless that player's health is 1.
- Health: 0 while the gyro bias is being measured (first 2 s after reset or reconfigure), 1 valid, 2 fault. A failed I2C read sets 2 immediately; the sensor is reconfigured once per second until it answers again, passing through 0 first.
- Opening the port from the browser resets the Uno, so keep both rockets still for 2 s after Connect Arduino and wait for health 1 before Calibrate.
- Buttons: D2 and D3 with internal pull-ups, 20 ms debounce, current state streamed as 0/1.
- Commands from the browser, newline terminated, at most 16 bytes: `H,1` and `H,2` flash that LED for 200 ms and beep 100 ms; `B,1` beeps 50 ms; `B,2` beeps 200 ms; `X` clears all outputs; `M,1` mutes and stops a running beep; `M,0` unmutes. Overlapping beeps merge into one pulse of at most 250 ms. Unknown or overlong lines are dropped.
- Never prints text on the stream. If nothing arrives in the browser, check the board and port; nothing in the firmware waits for input.

## Bus robustness

A failed I2C read marks that sensor faulted (health 2). Once per second the firmware then runs a bus recovery (clocks SCL until SDA releases, sends STOP, restarts Wire with a 25 ms transaction timeout) and reconfigures the sensor, which passes through health 0 for two seconds of bias measurement before returning to 1. On the bench this turned a permanent P1 dropout into a one-second self-healing gap. The timeout call needs AVR core 1.8.3 or newer and is not guarded by a macro, because core 1.8.8 does not define `WIRE_HAS_TIMEOUT`.

## Known limits

- The complementary filter gain (0.96), dead-zone and steering gains are tuning defaults, not measured values.
- Gyro bias is measured at startup only. If a rocket is moving during those 2 s, the browser's neutral calibration still removes a constant offset, but slow drift may remain until the next reset.
- A shorted or floating I2C bus makes each transaction wait up to 25 ms before timing out. Frames keep flowing, but with both sensors faulted the reconfigure attempts can add roughly 200 ms stalls once per second. The browser treats that as stale input and pauses, which is the intended outcome.
- WHO_AM_I is reported but not enforced; clone modules return values other than 0x68 and still work.

## Bench log, 11 September 2026

Board: Uno clone with CH340 (needed the WCH driver on Windows 11), COM3, data cable required (a charge-only cable powered the board without enumerating).

| Sketch | Result |
|---|---|
| diag1_i2c_scanner | Pass. 0x68 and 0x69 found, both WHO_AM_I 0x68, no timeouts. |
| diag2_button_test | Pass. P1 5 of 5, P2 5 of 5, single transitions, released at rest. |
| diag3_led_test | Pass. Both LEDs follow the pattern. An old sketch on the used Uno had been holding D4 and D6 high at plug-in. |
| diag4_buzzer_test | Pass after fixing the transistor. The PN2222A had been inserted E-C-B; the TO-92 PN2222A is E-B-C with the flat face toward you. Wrong order put the base in the buzzer row and the buzzer sounded continuously. |
| diag5_mpu_read | Pass with `MOUNT_INVERTED` and `BANK_ABOUT_Y` both true. Rest angles +2.1° (P1) and +1.4° (P2), jitter about ±0.05°, right bank +46° and +31°, no cross-talk. P1 accelerometer reads about 0.8 g total instead of 1 g; harmless for the angle. |
| twinflare_firmware | R1 stream valid at 50 Hz, longest line 27 bytes, zero malformed frames. Nine H/B/M/X commands sent 1.5 s apart caused no sequence gaps. |

Open hardware item: P1 drops off the bus for about one second when its tether is moved or at power-up. The firmware recovers, but the P1 tether or its mini-breadboard contacts need reseating and strain relief before the tether-length test in workflow Phase 6.

## Optional command-line compile check

With arduino-cli installed:

```bash
arduino-cli core install arduino:avr
```

```bash
arduino-cli compile --fqbn arduino:avr:uno rocket-firmware/twinflare_firmware
```
