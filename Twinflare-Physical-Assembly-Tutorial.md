# Twinflare Physical Assembly Tutorial

Revision 1 | 7 September 2026 | One Arduino Uno, two GY-521 controllers

Visual companion: [complete circuit diagram](figures/Twinflare-Circuit-Diagram.svg).

This is the bench-side assembly guide for the current Twinflare design. Follow it in order. Do not connect the USB cable until the tutorial explicitly reaches the first power-up inspection.

## Stop before starting if any of these are true

- A GY-521 or level converter has loose, unsoldered header pins. Loose headers pushed through circuit-board holes do not make dependable contact. Ask the lab or seller to solder the headers once.
- The converter does not show separate high-voltage and low-voltage labels such as **HV/LV** and paired channels such as **HV1/LV1**. Do not substitute a one-direction converter.
- The GY-521 module is not confirmed as a regulated module that accepts 5V on its printed **VCC** pin. This tutorial does not apply 5V to the bare MPU6050 chip.
- The transistor's exact part number or emitter/base/collector order is unknown. Complete the sensor and button assembly first, then identify the transistor before building the buzzer section.
- Any board has damaged traces, bent pins touching each other, or a burnt smell.

If your boards do not resemble the labels in this guide, send clear photographs of the front and back before applying power.

## 1. Parts used

### Central base

- 1 Arduino Uno R3
- 1 USB data cable for the Uno
- 1 full-size solderless breadboard
- 1 four-channel bidirectional I2C logic-level converter
- 1 active 5V two-pin buzzer
- 1 NPN transistor from the 2N2222/PN2222/P2N2222 family
- 1 680 ohm resistor
- 1 10k ohm resistor
- 1 1N4007 diode
- 1 electrolytic capacitor, 100 microfarads and at least 10V

### Each handheld rocket

- 1 mini solderless breadboard
- 1 GY-521 MPU6050 module with fitted headers
- 1 normally-open tactile pushbutton
- 1 red LED
- 1 1k ohm resistor

### Wiring and structure

- Male-to-male Dupont jumpers for Uno-to-breadboard and breadboard-to-breadboard connections
- Preferably two 30cm male-to-male rainbow jumper ribbons for the rocket tethers
- Short male-to-male jumpers for connections inside each rocket
- Cardboard or foam board, double-sided tape, removable tape, labels and cable ties
- A multimeter is strongly recommended

If a module has male pins pointing upward and cannot plug into a breadboard, use a male-to-female jumper: the **female** end slides over the module pin and the **male** end enters the breadboard. Never force a female connector into a breadboard hole.

## 2. Learn the breadboard before placing parts

A normal breadboard has two kinds of connection:

    Power rail:  +  =================================
    Ground rail: -  =================================

    Terminal rows:
    row 10:  A B C D E   |gap|   F G H I J
              connected            connected

The five holes A-E in one numbered row are connected. The five holes F-J in that same row are connected. The center gap separates the two groups. Different numbered rows are not connected.

Power rails normally run along the side, but some breadboards split a rail halfway. Check with the multimeter's continuity mode. If a rail is split, bridge only the two halves that must carry the same voltage.

Important rules:

- Never place two legs of a component in holes that are already connected unless those legs are intentionally the same electrical point.
- Never join the 5V and 3.3V supplies.
- A breadboard is only a connection surface; it does not create power by itself.
- Follow the labels printed beside pins. Do not rely on the left-to-right order shown in a product photograph.

## 3. Adopt one wire-color system

The electrical connection matters more than color, but consistent colors prevent mistakes:

| Suggested color | Meaning |
|---|---|
| Red | 5V |
| Black | Ground |
| Blue | SDA data, sensor side |
| Yellow | SCL clock, sensor side |
| White | Fire button signal |
| Orange | Damage LED signal |
| Purple | 3.3V; used for converter LV and Player 2 AD0 |

Put a small **P1** or **P2** label around both ends of every tether. Do not depend on color alone.

## 4. Prepare the central cardboard base

1. Put the Uno on the left side of the cardboard base with its USB socket facing the edge.
2. Put the full-size breadboard beside it.
3. Do not permanently glue either item yet. Use removable double-sided tape so wiring mistakes can be corrected.
4. Keep enough space on the breadboard for the level converter and buzzer circuit.
5. Keep the USB cable completely disconnected.

## 5. Create the central power connections

Use three male-to-male jumpers.

### 5.1 Create the 5V rail

1. Take a **red male-to-male jumper**.
2. Push one male end into the Uno socket printed **5V**.
3. Push the other end into the breadboard's red **+** power rail.
4. Add a tape label saying **5V** beside this rail.

### 5.2 Create the ground rail

1. Take a **black male-to-male jumper**.
2. Push one end into either Uno socket printed **GND**.
3. Push the other end into the breadboard's blue or black **-** rail.
4. Label the rail **GND**.

### 5.3 Create a small, separate 3.3V node

1. Choose one unused numbered terminal row, not a long power rail.
2. Label that row **3V3 ONLY**.
3. Take a **purple male-to-male jumper**.
4. Push one end into the Uno socket printed **3.3V** or **3V3**.
5. Push the other end into one hole of the labeled 3V3 row.

Using a small terminal row for 3.3V makes it harder to confuse with the long 5V rail.

Checkpoint: visually trace the red wire from Uno 5V to the 5V rail, black from Uno GND to the ground rail, and purple from Uno 3.3V to the isolated 3V3 row. They must be three different breadboard connections.

## 6. Install the bidirectional level converter

The converter keeps the Uno's 5V I2C side separate from the sensors' 3.3V I2C side.

1. Find the converter labels **HV**, **LV**, **GND**, and channel pairs **HV1/LV1**, **HV2/LV2**.
2. If it has downward-pointing male headers, place it across the breadboard's center gap so every pin enters a separate numbered row.
3. If its pins point upward, leave the board flat and use male-to-female jumpers, matching the printed labels.
4. Take a short **red male-to-male jumper**. Connect the converter pin **HV** to the central **5V** rail.
5. Take a short **purple jumper**. Connect converter **LV** to the isolated **3V3 ONLY** row.
6. Connect every converter pin printed **GND** to the central ground rail with black jumpers. Some boards have one GND on each side; connect both.
7. Take a male-to-male jumper. Put one end into Uno **A4** and the other into the breadboard row containing converter **HV1**.
8. Take another jumper. Put one end into Uno **A5** and the other into the row containing converter **HV2**.
9. Mark the row containing **LV1** as the sensor-side **SDA** connection.
10. Mark the row containing **LV2** as the sensor-side **SCL** connection.
11. Leave HV3/LV3 and HV4/LV4 empty.

The pairing is:

    Uno A4/SDA -> HV1  [converter]  LV1 -> both sensor SDA pins
    Uno A5/SCL -> HV2  [converter]  LV2 -> both sensor SCL pins
    Uno 5V     -> HV
    Uno 3.3V   -> LV
    All grounds connected together

Do not connect a GY-521 SDA or SCL wire directly to A4 or A5. The sensor wires go to **LV1** and **LV2**.

## 7. Build the Player 1 rocket breadboard

Keep the mini breadboard outside the cardboard rocket while assembling it.

### 7.1 Insert Player 1 GY-521

1. Put a **P1** label on the first GY-521.
2. Read its printed labels. Typical labels are VCC, GND, SCL, SDA, XDA, XCL, AD0 and INT, but their physical order can vary.
3. If its header pins point downward, insert the header along one side of the mini breadboard so each GY-521 pin enters a different numbered row.
4. Confirm that VCC and GND are not in the same connected row.
5. Leave XDA, XCL and INT with nothing attached.

When this guide says “connect to the GY-521 VCC row,” put the jumper into any empty breadboard hole electrically connected to the VCC header pin. Do not try to push another connector onto a pin already inside the breadboard.

### 7.2 Insert and identify the P1 fire button

1. Place the four-leg tactile button across the mini breadboard's center gap.
2. On most tactile buttons, the two legs on one side are permanently connected, and pressing joins that side to the other side.
3. Use continuity mode to identify the two sides. Do not connect both wires to two legs that already beep continuously.
4. Choose one leg from one side as **BUTTON SIGNAL**.
5. Choose one leg from the opposite side as **BUTTON GROUND**.

### 7.3 Insert the P1 LED and resistor

1. Identify the LED **anode**: normally the longer leg.
2. Identify the LED **cathode**: normally the shorter leg beside the flat edge of the plastic body.
3. Put the two LED legs into different numbered rows.
4. Insert one leg of a **1k ohm resistor** into the LED anode row.
5. Put the resistor's other leg into a new empty row. This new row is the **P1 LED SIGNAL** row.
6. Connect the LED cathode row to the GY-521 GND row using a short black male-to-male jumper.

A common four-band 1k resistor is brown-black-red-gold. Verify it with a multimeter if the bands differ.

### 7.4 Prepare the six-wire P1 tether

Use six long male-to-male jumpers or six conductors from a 30cm rainbow ribbon.

1. **Red 5V wire:** central 5V rail -> P1 GY-521 **VCC row**.
2. **Black ground wire:** central GND rail -> P1 GY-521 **GND row**.
3. **Blue SDA wire:** converter **LV1 row** -> P1 GY-521 **SDA row**.
4. **Yellow SCL wire:** converter **LV2 row** -> P1 GY-521 **SCL row**.
5. **White fire wire:** Uno **D2** -> P1 button **signal-side row**.
6. **Orange LED wire:** Uno **D4** -> the free end row of P1's **1k resistor**.

If it is easier mechanically, connect D2 and D4 to two labeled rows on the central breadboard first, then connect the long tether wires to those rows.

### 7.5 Finish local P1 connections

1. Connect the P1 button ground-side row to the P1 GY-521 GND row with a short black jumper.
2. Connect P1 GY-521 **AD0** to its GND row using a short jumper.
3. Check that AD0 is not connected to VCC.

Player 1 is now:

    VCC -> 5V
    GND -> common GND
    SDA -> converter LV1
    SCL -> converter LV2
    AD0 -> GND, selecting address 0x68
    Button -> D2 and GND
    LED -> D4 through 1k resistor, then LED to GND

## 8. Build the Player 2 rocket breadboard

Repeat the physical placement steps with the second mini breadboard and label everything **P2**.

### 8.1 Install parts

1. Insert the second GY-521 with each pin in a separate row.
2. Leave XDA, XCL and INT unused.
3. Place the P2 button across the center gap and identify its two switch sides.
4. Insert the P2 LED with anode and cathode in separate rows.
5. Put the second 1k resistor between the LED anode row and a new P2 LED signal row.
6. Connect the LED cathode to the P2 GY-521 GND row.
7. Connect one button side to the P2 GY-521 GND row.

### 8.2 Prepare the seven-wire P2 tether

1. **Red 5V wire:** central 5V rail -> P2 GY-521 **VCC row**.
2. **Black ground wire:** central GND rail -> P2 GY-521 **GND row**.
3. **Blue SDA wire:** converter **LV1 row** -> P2 GY-521 **SDA row**.
4. **Yellow SCL wire:** converter **LV2 row** -> P2 GY-521 **SCL row**.
5. **White fire wire:** Uno **D3** -> P2 button signal-side row.
6. **Orange LED wire:** Uno **D5** -> the free end row of P2's 1k resistor.
7. **Purple address wire:** central **3V3 ONLY** row -> P2 GY-521 **AD0 row**.

Player 2 is now:

    VCC -> 5V
    GND -> common GND
    SDA -> the same converter LV1 used by P1
    SCL -> the same converter LV2 used by P1
    AD0 -> 3.3V, selecting address 0x69
    Button -> D3 and GND
    LED -> D5 through 1k resistor, then LED to GND

Never connect P2 AD0 to the 5V rail. Do not connect the P1 and P2 AD0 rows to each other.

## 9. Understand the shared sensor wires

Both sensors intentionally share SDA and SCL:

    converter LV1 -> P1 SDA
                  -> P2 SDA

    converter LV2 -> P1 SCL
                  -> P2 SCL

They remain distinguishable because P1 uses address 0x68 and P2 uses 0x69. The fire and LED signals do not share pins:

    P1 fire D2     P2 fire D3
    P1 LED  D4     P2 LED  D5

## 10. Build the central buzzer circuit last

You must identify the transistor's **emitter (E), base (B), and collector (C)** from the exact marking and manufacturer/seller diagram. Do not copy the lead order from another transistor that merely has a similar name. For example, metal-can 2N2222A and plastic P2N2222A parts can have different package drawings.

### 10.1 Place the transistor

1. Keep USB disconnected.
2. Find E, B and C for your exact part.
3. Insert the transistor so its three leads enter three separate numbered rows.
4. Label those rows E, B and C on a small paper strip.

### 10.2 Connect the transistor control

1. Take a jumper from Uno **D6** to a new empty breadboard row.
2. Insert one end of the **680 ohm resistor** into that D6 row.
3. Insert the other end of the resistor into the transistor **B** row.
4. Insert one end of the **10k ohm resistor** into the same transistor B row.
5. Insert the other end of the 10k resistor into the central GND rail.
6. Connect the transistor **E** row to the central GND rail with a black jumper.

Common four-band colors are blue-gray-brown-gold for 680 ohms and brown-black-orange-gold for 10k. Measure if uncertain.

### 10.3 Connect the buzzer

1. Find the buzzer's printed **+** and **-** markings.
2. Insert it with its two pins in different rows. If the spacing does not fit, use short jumpers.
3. Connect buzzer **+** to the central 5V rail.
4. Connect buzzer **-** to the transistor **C** row.
5. Do not connect either buzzer pin directly to D6.

### 10.4 Add the flyback diode

1. Find the silver/gray stripe on the 1N4007. The striped end is the **cathode**.
2. Connect the **striped end** to the buzzer **+ / 5V** row.
3. Connect the **unstriped end** to the buzzer **- / transistor C** row.

The diode sits across the buzzer but is reversed during normal operation. Reversing it would effectively short the supply when the transistor turns on.

### 10.5 Add the capacitor

1. Find the capacitor side marked with a repeated **-** stripe. That leg is negative.
2. The longer unmarked leg is normally positive.
3. Connect capacitor **positive** to the 5V rail near the buzzer.
4. Connect capacitor **negative** to the GND rail.
5. Confirm the printed voltage rating is at least 10V.

The complete buzzer path is:

    5V -> buzzer +
    buzzer - -> transistor Collector
    transistor Emitter -> GND
    Uno D6 -> 680 ohm -> transistor Base
    transistor Base -> 10k ohm -> GND
    1N4007 stripe -> 5V; unstriped end -> Collector
    100uF capacitor + -> 5V; capacitor - -> GND

## 11. Final pin map

| Uno pin | Connection |
|---|---|
| 5V | Central 5V rail; converter HV; both verified GY-521 VCC pins; buzzer positive |
| 3.3V | Isolated 3V3 node; converter LV; P2 AD0 |
| GND | Common ground rail for converter, both rockets, transistor emitter and capacitor |
| A4 | Converter HV1 only |
| A5 | Converter HV2 only |
| D2 | P1 fire button signal |
| D3 | P2 fire button signal |
| D4 | P1 1k resistor then LED anode |
| D5 | P2 1k resistor then LED anode |
| D6 | 680 ohm resistor then transistor base |
| D0/D1 | Leave empty; USB serial uses them internally |

| Converter pin | Connection |
|---|---|
| HV | 5V |
| LV | 3.3V |
| GND | Common GND |
| HV1 | Uno A4 |
| LV1 | Both GY-521 SDA pins |
| HV2 | Uno A5 |
| LV2 | Both GY-521 SCL pins |
| Channels 3 and 4 | Leave empty |

## 12. Unpowered inspection

Complete every check before inserting USB:

- [ ] P1 AD0 goes to GND.
- [ ] P2 AD0 goes to 3.3V, never 5V.
- [ ] Both sensor SDA wires go to converter LV1.
- [ ] Both sensor SCL wires go to converter LV2.
- [ ] Uno A4 goes to converter HV1 and A5 to HV2.
- [ ] Converter HV is 5V and LV is 3.3V.
- [ ] Every GND point joins the common GND rail.
- [ ] Each LED has its own 1k resistor and correct polarity.
- [ ] Each button uses opposite switch sides.
- [ ] D2, D3, D4, D5 and D6 are not accidentally joined.
- [ ] Transistor E, B and C were checked for the exact delivered part.
- [ ] Diode stripe faces the 5V/buzzer-positive side.
- [ ] Capacitor negative stripe faces GND.
- [ ] No loose metal lead touches a neighboring row.
- [ ] D0, D1, VIN and the barrel jack are unused.

With the circuit unpowered, check continuity along intended connections. There must not be a steady near-zero-ohm short between the 5V and GND rails. The capacitor may cause a very brief meter response while charging from the meter; a continuing beep or near-zero reading means stop and inspect.

## 13. First power-up without firmware testing

The following only checks for obvious electrical problems. It does not prove that the sensors communicate.

1. Put both rockets flat and do not hold them.
2. Keep a hand on the USB plug so it can be removed immediately.
3. Connect the USB cable to the Uno and laptop.
4. The Uno power LED should illuminate. GY-521 power LEDs may illuminate depending on the module.
5. The red damage LEDs should remain off.
6. The buzzer should remain silent because the 10k resistor holds the transistor base low.
7. Wait ten seconds. Carefully check from a distance first, then lightly touch only plastic package surfaces. Nothing should become hot.
8. If there is heat, smoke, repeated USB disconnecting, an always-on buzzer or a very bright unexpected LED, unplug USB immediately.
9. If the basic power check passes, unplug USB again.

Do not move wires while USB is connected.

## 14. Mount everything onto cardboard

Only do this after the unpowered inspection and basic power check.

1. Place the central breadboard and Uno between the two players.
2. Route the P1 tether toward the left rocket and P2 toward the right rocket.
3. Make a loose service loop near each rocket so wrist movement does not pull a jumper out.
4. Tape the tether to the cardboard about 3-5cm before it reaches the breadboard. This is strain relief.
5. Keep the sensor firmly attached to the rocket, but use removable tape at first.
6. Hold the rocket pointing toward the screen. Start with the GY-521 board flat, its component side upward and its long axis aligned with the rocket.
7. Do not seal the rocket until the Arduino diagnostic confirms which measured roll direction corresponds to banking right. If the sign is reversed, software can invert it; if the wrong physical axis responds, rotate the sensor mounting.
8. Keep the fire button under the thumb without requiring the player to twist the rocket.
9. Put the red damage LED where the player can see it but where it does not shine directly into their eyes.
10. Keep every bare component lead away from cardboard foil, metal fasteners and the player's fingers.

## 15. What happens after assembly

The next session will use Arduino IDE in short diagnostic stages. The sketches for every stage are in [rocket-firmware](rocket-firmware/README.md):

1. Upload an I2C scanner and confirm exactly two addresses: 0x68 and 0x69.
2. Test P1 and P2 buttons separately.
3. Test each damage LED.
4. Test the buzzer driver with a short nonblocking pulse.
5. Read and calibrate both GY-521 modules.
6. Upload the combined Twinflare firmware.
7. Close Serial Monitor, open the browser game, connect the Arduino and calibrate from the game's Systems panel.

Do not seal the cardboard models before these checks pass.

## Troubleshooting by symptom

| Symptom | First things to inspect |
|---|---|
| Neither sensor powers | Uno 5V/GND rails, split breadboard rail, USB cable |
| Only one sensor appears later | That rocket's VCC/GND/SDA/SCL tether; duplicated 0x68 address |
| Only address 0x68 appears | P2 AD0 is not reaching 3.3V |
| No address appears | A4/A5 may be swapped; converter HV/LV or SDA/SCL may be reversed |
| Button always appears pressed | Wires may use two permanently connected legs on one side of the button |
| LED never lights | LED polarity, 1k resistor placement, D4/D5 mapping |
| LED always lights | Signal row may be connected to 5V rather than D4/D5 |
| Buzzer always sounds | Transistor pinout wrong, missing 10k base pulldown, collector/emitter reversed |
| Uno repeatedly disconnects | Supply short, reversed diode/capacitor, buzzer-driver error |
| Sensor works until rocket moves | Loose Dupont connector or no tether strain relief |
| Tilt direction feels wrong | Sensor mounting axis/sign; correct this during firmware calibration |

## Sources used for the electrical map

- [Official Arduino Uno R3 datasheet and pin functions](https://docs.arduino.cc/resources/datasheets/A000066-datasheet.pdf)
- [SparkFun bidirectional logic-level converter pin explanation](https://learn.sparkfun.com/tutorials/bi-directional-logic-level-converter-hookup-guide/board-overview)
- [TDK MPU-6050 datasheet](https://invensense.tdk.com/wp-content/uploads/2015/02/MPU-6000-Datasheet.pdf)
- [onsemi 2N2222A datasheet example](https://www.onsemi.com/download/data-sheet/pdf/2n2222a-d.pdf)

The transistor source is an example of why the exact package matters; use the datasheet matching the part physically delivered to you.
