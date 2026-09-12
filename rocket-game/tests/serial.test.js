import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseR1Line, isNewerSequence, R1StreamParser } from '../js/input/SerialProtocol.js';
import { SerialInput } from '../js/input/SerialInput.js';

const line = (seq, uptime, r1 = 0, f1 = 0, h1 = 1, r2 = 0, f2 = 0, h2 = 1) =>
  `R1,${seq},${uptime},${r1},${f1},${h1},${r2},${f2},${h2}\n`;

test('R1 line parser accepts valid input and rejects bad values', () => {
  const valid = parseR1Line('R1,1234,24680,-750,0,1,430,1,1');
  assert.equal(valid.record.seq, 1234);
  assert.deepEqual(valid.record.players[0], { rollCentideg: -750, fire: false, health: 1 });
  assert.deepEqual(valid.record.players[1], { rollCentideg: 430, fire: true, health: 1 });

  assert.equal(parseR1Line('R2,1,2,0,0,1,0,0,1').error, 'version');
  assert.equal(parseR1Line('R1,1,2,0,2,1,0,0,1').error, 'value');
  assert.equal(parseR1Line('R1,1,2,99999,0,1,0,0,1').error, 'value');
  assert.equal(parseR1Line('R1,1,2,0,0,1').error, 'field-count');
});

test('stream parser handles fragmented and multiple records', () => {
  const parser = new R1StreamParser();
  assert.equal(parser.push('R1,1,100,20,0').records.length, 0);
  const result = parser.push(',1,-30,1,1\r\nR1,2,120,21,0,1,-29,0,1\n');
  assert.equal(result.errors.length, 0);
  assert.equal(result.records.length, 2);
  assert.equal(result.records[0].players[1].fire, true);
  assert.equal(result.records[1].seq, 2);
});

test('stream parser rejects duplicates, old data and overlong lines', () => {
  const parser = new R1StreamParser();
  assert.equal(parser.push(line(8, 1000)).records.length, 1);
  assert.deepEqual(parser.push(line(8, 1020)).errors, ['duplicate']);
  assert.deepEqual(parser.push(line(7, 1040)).errors, ['out-of-order']);
  const overflow = parser.push(`R1,${'9'.repeat(100)}\n${line(9, 1060)}`);
  assert.ok(overflow.errors.includes('overflow'));
  assert.equal(overflow.records.at(-1).seq, 9);
});

test('sequence comparison accepts uint32 wrap', () => {
  assert.equal(isNewerSequence(0, 0xffffffff), true);
  assert.equal(isNewerSequence(0xffffffff, 0), false);
  assert.equal(isNewerSequence(12, 12), false);
});

test('Arduino reset is accepted as a new session marker', () => {
  const parser = new R1StreamParser();
  parser.push(line(500, 90000));
  const result = parser.push(line(0, 20));
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].reset, true);
});

test('serial input calibrates both players, maps relative bank and goes stale safely', () => {
  let now = 1000;
  const input = new SerialInput({ clock: () => now });
  input.connected = true;
  input.feedForTest(line(1, 1000, 500, 0, 1, -300, 0, 1), now);
  assert.equal(input.startCalibration(2), true);

  for (let i = 2; i <= 62; i++) {
    now += 32;
    input.feedForTest(line(i, 1000 + i * 32, 500 + (i % 3), 0, 1, -300 - (i % 2), 0, 1), now);
  }
  assert.equal(input.calibration, null);
  assert.equal(input.isReady(2), true);

  now += 20;
  input.feedForTest(line(63, 3100, 1500, 1, 1, -800, 0, 1), now);
  const p1 = input.getState(0);
  const p2 = input.getState(1);
  assert.ok(p1.bank > 9.9 && p1.bank < 10.1);
  assert.equal(p1.fire, true);
  assert.ok(p2.bank < -4.9 && p2.bank > -5.1);

  now += 251;
  assert.deepEqual(input.getState(0), { bank: 0, fire: false, healthy: false });
  assert.equal(input.isReady(1), false);
});

test('calibration rejects held fire and board reset clears calibration', () => {
  let now = 1000;
  const input = new SerialInput({ clock: () => now });
  input.connected = true;
  input.feedForTest(line(1, 1000, 100, 0, 1, 100, 0, 1), now);
  input.startCalibration(1);
  now += 100;
  input.feedForTest(line(2, 1100, 100, 1, 1, 100, 0, 1), now);
  assert.equal(input.calibration.progress, 0);
  assert.match(input.calibration.message, /Release/);

  input.neutral[0] = 100;
  now += 50;
  input.feedForTest(line(0, 10, 100, 0, 1, 100, 0, 1), now);
  assert.equal(input.neutral[0], null);
  assert.match(input.lastError, /restarted/);
});
