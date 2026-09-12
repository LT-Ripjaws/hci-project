// All sounds are synthesised with Web Audio; no audio files are shipped.
// The AudioContext is created on the first user click (Start).

export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  _tone({ freq = 440, end = freq, dur = 0.1, type = 'square', gain = 0.3, delay = 0 }) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, end), t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  _noise(dur = 0.2, gain = 0.4) {
    if (!this.ctx || this.muted) return;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    src.connect(lp).connect(g).connect(this.master);
    src.start();
  }

  shot() { this._tone({ freq: 900, end: 300, dur: 0.08, type: 'square', gain: 0.15 }); }
  target() { this._tone({ freq: 500, end: 1100, dur: 0.12, type: 'triangle', gain: 0.25 }); }
  drone() {
    this._noise(0.12, 0.22);
    this._tone({ freq: 280, end: 1250, dur: 0.18, type: 'sawtooth', gain: 0.22 });
  }
  enemyShot() { this._tone({ freq: 190, end: 95, dur: 0.13, type: 'sawtooth', gain: 0.12 }); }
  intercept() { this._tone({ freq: 1200, end: 480, dur: 0.09, type: 'triangle', gain: 0.18 }); }
  gate() {
    this._tone({ freq: 660, end: 660, dur: 0.07, type: 'sine', gain: 0.25 });
    this._tone({ freq: 990, end: 990, dur: 0.1, type: 'sine', gain: 0.25, delay: 0.07 });
  }
  hit() {
    this._noise(0.25, 0.5);
    this._tone({ freq: 160, end: 50, dur: 0.3, type: 'sawtooth', gain: 0.3 });
  }
  crash() {
    this._noise(0.12, 0.35);
    this._tone({ freq: 420, end: 140, dur: 0.18, type: 'square', gain: 0.25 });
  }
  absorbed() { this._tone({ freq: 220, end: 180, dur: 0.05, type: 'square', gain: 0.08 }); }
  countdown() { this._tone({ freq: 660, end: 660, dur: 0.05, type: 'square', gain: 0.2 }); }
  go() { this._tone({ freq: 990, end: 990, dur: 0.2, type: 'square', gain: 0.25 }); }
  eliminated() { this._tone({ freq: 300, end: 60, dur: 0.6, type: 'sawtooth', gain: 0.3 }); }
  end(success) {
    if (success) {
      this._tone({ freq: 523, end: 523, dur: 0.12, type: 'triangle', gain: 0.3 });
      this._tone({ freq: 659, end: 659, dur: 0.12, type: 'triangle', gain: 0.3, delay: 0.12 });
      this._tone({ freq: 784, end: 784, dur: 0.25, type: 'triangle', gain: 0.3, delay: 0.24 });
    } else {
      this._tone({ freq: 440, end: 440, dur: 0.2, type: 'square', gain: 0.25 });
      this._tone({ freq: 330, end: 330, dur: 0.3, type: 'square', gain: 0.25, delay: 0.2 });
    }
  }
}
