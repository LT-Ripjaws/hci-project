export const SERIAL_PROTOCOL = Object.freeze({
  version: 'R1',
  fields: 9,
  maxLine: 80,
  maxBuffer: 2048,
  minRoll: -18000,
  maxRoll: 18000,
});

const UINT32_MAX = 0xffffffff;
const INTEGER = /^-?\d+$/;

function parseInteger(text, min, max) {
  if (!INTEGER.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) && value >= min && value <= max ? value : null;
}

export function isNewerSequence(next, previous) {
  const delta = (next - previous) >>> 0;
  return delta > 0 && delta < 0x80000000;
}

function isUptimeReset(next, previous) {
  if (next >= previous) return false;
  const looksLikeWrap = previous > 0xf0000000 && next < 0x0fffffff;
  return !looksLikeWrap && previous - next > 500;
}

export function parseR1Line(line) {
  if (line.length > SERIAL_PROTOCOL.maxLine) return { error: 'line-too-long' };
  const fields = line.trim().split(',');
  if (fields.length !== SERIAL_PROTOCOL.fields) return { error: 'field-count' };
  if (fields[0] !== SERIAL_PROTOCOL.version) return { error: 'version' };

  const seq = parseInteger(fields[1], 0, UINT32_MAX);
  const uptime = parseInteger(fields[2], 0, UINT32_MAX);
  const roll1 = parseInteger(fields[3], SERIAL_PROTOCOL.minRoll, SERIAL_PROTOCOL.maxRoll);
  const fire1 = parseInteger(fields[4], 0, 1);
  const health1 = parseInteger(fields[5], 0, 2);
  const roll2 = parseInteger(fields[6], SERIAL_PROTOCOL.minRoll, SERIAL_PROTOCOL.maxRoll);
  const fire2 = parseInteger(fields[7], 0, 1);
  const health2 = parseInteger(fields[8], 0, 2);
  if ([seq, uptime, roll1, fire1, health1, roll2, fire2, health2].some((v) => v === null)) {
    return { error: 'value' };
  }

  return {
    record: {
      seq,
      uptime,
      players: [
        { rollCentideg: roll1, fire: fire1 === 1, health: health1 },
        { rollCentideg: roll2, fire: fire2 === 1, health: health2 },
      ],
    },
  };
}

export class R1StreamParser {
  constructor() {
    this.reset();
  }

  reset() {
    this.buffer = '';
    this.discarding = false;
    this.lastSeq = null;
    this.lastUptime = null;
  }

  push(text) {
    const records = [];
    const errors = [];
    for (const char of String(text)) {
      if (this.discarding) {
        if (char === '\n') this.discarding = false;
        continue;
      }
      if (char === '\n') {
        const line = this.buffer.endsWith('\r') ? this.buffer.slice(0, -1) : this.buffer;
        this.buffer = '';
        if (!line) continue;
        const parsed = parseR1Line(line);
        if (parsed.error) {
          errors.push(parsed.error);
          continue;
        }
        const { record } = parsed;
        const reset = this.lastUptime !== null && isUptimeReset(record.uptime, this.lastUptime);
        if (!reset && this.lastSeq !== null && !isNewerSequence(record.seq, this.lastSeq)) {
          errors.push(record.seq === this.lastSeq ? 'duplicate' : 'out-of-order');
          continue;
        }
        this.lastSeq = record.seq;
        this.lastUptime = record.uptime;
        records.push({ ...record, reset });
        continue;
      }
      this.buffer += char;
      if (this.buffer.length > SERIAL_PROTOCOL.maxBuffer || this.buffer.length > SERIAL_PROTOCOL.maxLine) {
        this.buffer = '';
        this.discarding = true;
        errors.push('overflow');
      }
    }
    return { records, errors };
  }
}
