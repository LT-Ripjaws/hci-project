import { InputSource } from './InputSource.js';
import { R1StreamParser } from './SerialProtocol.js';

const FRESH_MS = 250;
const CALIBRATION_MS = 1800;
const MIN_CALIBRATION_SAMPLES = 50;
const MAX_CALIBRATION_SPAN = 300;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const defaultClock = () => globalThis.performance?.now() ?? Date.now();

export class SerialInput extends InputSource {
  constructor({ serialApi = globalThis.navigator?.serial ?? null, clock = defaultClock, onChange = null } = {}) {
    super();
    this.serialApi = serialApi;
    this.clock = clock;
    this.onChange = onChange;
    this.parser = new R1StreamParser();
    this.port = null;
    this.reader = null;
    this.readPromise = null;
    this.writeChain = Promise.resolve();
    this.connected = false;
    this.stopping = false;
    this.lastPacketAt = 0;
    this.lastRecord = null;
    this.badLines = 0;
    this.lastError = '';
    this.neutral = [null, null];
    this.calibration = null;

    this._onDeviceDisconnect = (event) => {
      if (event.target === this.port) this._markDisconnected('Arduino disconnected');
    };
    this.serialApi?.addEventListener?.('disconnect', this._onDeviceDisconnect);
  }

  get label() {
    return 'arduino';
  }

  get supported() {
    return !!this.serialApi;
  }

  update() {
    // Freshness is evaluated from the browser clock in getState().
  }

  async connect() {
    if (!this.supported) throw new Error('Web Serial is unavailable. Use desktop Chrome or Edge on localhost.');
    if (this.connected) return;
    this.lastError = '';
    this.stopping = false;
    this.parser.reset();
    this._invalidateCalibration();
    this.lastRecord = null;
    this.lastPacketAt = 0;

    const port = await this.serialApi.requestPort();
    try {
      await port.open({ baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' });
    } catch (error) {
      try { await port.close(); } catch { /* port never fully opened */ }
      throw error;
    }
    this.port = port;
    this.connected = true;
    this._notify();
    this.readPromise = this._readLoop(port);
  }

  async disconnect() {
    this.stopping = true;
    this.connected = false;
    const reader = this.reader;
    if (reader) {
      try { await reader.cancel(); } catch { /* already closed */ }
    }
    try { await this.readPromise; } catch { /* status is reported by the read loop */ }
    try { await this.writeChain; } catch { /* writeLine records its own error */ }
    const port = this.port;
    if (port) {
      try { await port.close(); } catch { /* unplugged or already closed */ }
    }
    this._markDisconnected('');
  }

  async _readLoop(port) {
    const decoder = new TextDecoder();
    try {
      while (this.port === port && port.readable && !this.stopping) {
        const reader = port.readable.getReader();
        this.reader = reader;
        try {
          while (!this.stopping) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) this._acceptText(decoder.decode(value, { stream: true }), this.clock());
          }
        } catch (error) {
          if (!this.stopping) this.lastError = `Serial read error: ${error.message || error}`;
        } finally {
          reader.releaseLock();
          if (this.reader === reader) this.reader = null;
        }
      }
    } finally {
      if (!this.stopping && this.port === port) {
        this._markDisconnected(this.lastError || 'Arduino disconnected');
      }
    }
  }

  _acceptText(text, now = this.clock()) {
    const result = this.parser.push(text);
    this.badLines += result.errors.length;
    for (const record of result.records) {
      if (record.reset) {
        this._invalidateCalibration();
        this.lastError = 'Arduino restarted; recalibration required';
      }
      this.lastRecord = record;
      this.lastPacketAt = now;
      this._sampleCalibration(record, now);
    }
    this._notify();
    return result;
  }

  feedForTest(text, now = this.clock()) {
    return this._acceptText(text, now);
  }

  startCalibration(requiredPlayers = 1) {
    if (!this.connected || !this.lastRecord || !this.isFresh()) return false;
    const count = clamp(requiredPlayers, 1, 2);
    for (let i = 0; i < count; i++) {
      if (this.lastRecord.players[i].health !== 1) return false;
    }
    this.neutral = [null, null];
    this.calibration = {
      requiredPlayers: count,
      startedAt: this.clock(),
      samples: [[], []],
      progress: 0,
      message: 'Hold every required rocket level and still',
    };
    this.lastError = '';
    this._notify();
    return true;
  }

  _sampleCalibration(record, now) {
    if (!this.calibration) return;
    const c = this.calibration;
    for (let i = 0; i < c.requiredPlayers; i++) {
      const p = record.players[i];
      if (p.health !== 1 || p.fire) {
        c.startedAt = now;
        c.samples = [[], []];
        c.progress = 0;
        c.message = p.fire ? 'Release both fire buttons' : `Player ${i + 1} sensor is not healthy`;
        return;
      }
      c.samples[i].push(p.rollCentideg);
      if (c.samples[i].length > 140) c.samples[i].shift();
    }
    const elapsed = now - c.startedAt;
    const sampleProgress = Math.min(1, c.samples[0].length / MIN_CALIBRATION_SAMPLES);
    c.progress = Math.min(1, elapsed / CALIBRATION_MS, sampleProgress);
    if (elapsed < CALIBRATION_MS || c.samples[0].length < MIN_CALIBRATION_SAMPLES) return;

    for (let i = 0; i < c.requiredPlayers; i++) {
      const values = c.samples[i];
      const span = Math.max(...values) - Math.min(...values);
      if (span > MAX_CALIBRATION_SPAN) {
        c.startedAt = now;
        c.samples = [[], []];
        c.progress = 0;
        c.message = `Player ${i + 1} moved; hold still and try again`;
        return;
      }
    }
    for (let i = 0; i < c.requiredPlayers; i++) {
      const values = c.samples[i];
      this.neutral[i] = values.reduce((sum, v) => sum + v, 0) / values.length;
    }
    this.calibration = null;
    this.lastError = '';
  }

  _invalidateCalibration() {
    this.neutral = [null, null];
    this.calibration = null;
  }

  isFresh(now = this.clock()) {
    return this.connected && this.lastPacketAt > 0 && now - this.lastPacketAt <= FRESH_MS;
  }

  getState(playerIndex) {
    const p = this.lastRecord?.players[playerIndex];
    const zero = this.neutral[playerIndex];
    if (!p || !this.isFresh() || p.health !== 1 || zero === null) {
      return { bank: 0, fire: false, healthy: false };
    }
    return {
      bank: clamp((p.rollCentideg - zero) / 100, -30, 30),
      fire: p.fire,
      healthy: true,
    };
  }

  isReady(playerCount = 1) {
    for (let i = 0; i < playerCount; i++) if (!this.getState(i).healthy) return false;
    return true;
  }

  calibratedCount() {
    return this.neutral.filter((v) => v !== null).length;
  }

  suggestedCalibrationCount() {
    return this.lastRecord?.players[1]?.health === 1 ? 2 : 1;
  }

  summary() {
    if (!this.supported) return 'Unsupported browser';
    if (!this.connected) return this.lastError || 'Not linked';
    if (!this.lastRecord) return 'Connected; waiting for R1 data';
    if (!this.isFresh()) return 'Data stale';
    if (this.calibration) return `Calibrating ${Math.round(this.calibration.progress * 100)}%`;
    const faults = this.lastRecord.players
      .map((p, i) => p.health === 1 ? null : `P${i + 1} ${p.health === 0 ? 'starting' : 'fault'}`)
      .filter(Boolean);
    if (faults.length) return faults.join(', ');
    const count = this.calibratedCount();
    return count ? `Ready: ${count} controller${count === 1 ? '' : 's'}` : 'Healthy; calibration required';
  }

  async writeLine(line) {
    if (!this.connected || !this.port?.writable || !/^[ -~]{1,15}\n$/.test(line)) return false;
    const bytes = new TextEncoder().encode(line);
    this.writeChain = this.writeChain.then(async () => {
      const writer = this.port.writable.getWriter();
      try { await writer.write(bytes); } finally { writer.releaseLock(); }
    }).catch((error) => {
      this.lastError = `Serial write error: ${error.message || error}`;
      this._notify();
    });
    await this.writeChain;
    return !this.lastError;
  }

  _markDisconnected(message) {
    this.connected = false;
    this.port = null;
    this.reader = null;
    this.readPromise = null;
    this.lastRecord = null;
    this.lastPacketAt = 0;
    this._invalidateCalibration();
    if (message) this.lastError = message;
    this._notify();
  }

  _notify() {
    this.onChange?.(this);
  }
}
