// Menu theme, synthesised in Web Audio. A 16 second loop in D minor:
// Dm  -  Bbmaj7  -  Gm7  -  Asus4, four seconds per chord, 60 BPM.
// Layers: detuned saw pad through a slow low-pass, a sine sub drone, a soft
// triangle arpeggio into a feedback delay, a sparse high shimmer, and a quiet
// band-passed wind. Everything runs through a generated reverb.

const CHORDS = [
  [50, 53, 57, 62], // D3 F3 A3 D4
  [46, 50, 53, 57], // Bb2 D3 F3 A3
  [43, 46, 50, 53], // G2 Bb2 D3 F3
  [45, 50, 52, 55], // A2 D3 E3 G3
];
const CHORD_SECONDS = 4;
const LOOP_SECONDS = CHORDS.length * CHORD_SECONDS;
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

export class Music {
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(3.2, 2.2);
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.45;
    this.dry = ctx.createGain();
    this.dry.gain.value = 0.8;
    this.bus = ctx.createGain();
    this.bus.connect(this.dry).connect(this.out);
    this.bus.connect(this.reverb).connect(this.reverbGain).connect(this.out);

    // arpeggio delay
    this.delay = ctx.createDelay(1.0);
    this.delay.delayTime.value = 0.375;
    this.feedback = ctx.createGain();
    this.feedback.gain.value = 0.38;
    this.delayTone = ctx.createBiquadFilter();
    this.delayTone.type = 'lowpass';
    this.delayTone.frequency.value = 2200;
    this.delay.connect(this.delayTone).connect(this.feedback).connect(this.delay);
    this.delay.connect(this.bus);

    this.playing = false;
    this.nextLoopAt = 0;
    this.timer = null;
    this.level = 0.9;
    this.nodes = new Set();
  }

  _impulse(seconds, decay) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
    }
    return buf;
  }

  start(fade = 2.5) {
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.out.gain.value, t);
    this.out.gain.linearRampToValueAtTime(this.level, t + fade);
    if (this.playing) return;
    this.playing = true;
    this.nextLoopAt = t + 0.1;
    this._startWind(this.nextLoopAt);
    this._scheduleLoop();
    this.timer = setInterval(() => this._scheduleLoop(), 1000);
  }

  stop(fade = 1.2) {
    if (!this.playing) return;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.out.gain.value, t);
    this.out.gain.linearRampToValueAtTime(0, t + fade);
    clearInterval(this.timer);
    this.timer = null;
    this.playing = false;
    const stopAt = t + fade + 0.05;
    for (const n of this.nodes) { try { n.stop(stopAt); } catch { /* already stopped */ } }
    this.nodes.clear();
  }

  // Schedule one full loop when the previous one is within two seconds of ending.
  _scheduleLoop() {
    if (!this.playing) return;
    if (this.nextLoopAt - this.ctx.currentTime > 2) return;
    const t0 = this.nextLoopAt;
    CHORDS.forEach((chord, i) => {
      const t = t0 + i * CHORD_SECONDS;
      this._pad(chord, t, CHORD_SECONDS);
      this._sub(chord[0], t, CHORD_SECONDS);
      this._arp(chord, t, CHORD_SECONDS);
      if (i % 2 === 1) this._shimmer(chord[3] + 12, t + 1.5);
    });
    this.nextLoopAt = t0 + LOOP_SECONDS;
  }

  _track(node, until) {
    this.nodes.add(node);
    node.onended = () => this.nodes.delete(node);
    node.stop(until);
  }

  _pad(chord, t, dur) {
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(420, t);
    filter.frequency.linearRampToValueAtTime(900, t + dur * 0.6);
    filter.frequency.linearRampToValueAtTime(420, t + dur + 1.5);
    filter.Q.value = 0.7;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.055, t + 1.6);
    env.gain.setValueAtTime(0.055, t + dur - 0.2);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.8);
    filter.connect(env).connect(this.bus);
    for (const n of chord) {
      for (const cents of [-7, 6]) {
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = midi(n);
        o.detune.value = cents;
        o.connect(filter);
        o.start(t);
        this._track(o, t + dur + 2);
      }
    }
  }

  _sub(root, t, dur) {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = midi(root - 12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.8);
    g.gain.setValueAtTime(0.16, t + dur - 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.6);
    o.connect(g).connect(this.dry);
    o.start(t);
    this._track(o, t + dur + 0.7);
  }

  _arp(chord, t, dur) {
    const step = 0.5;
    const notes = [...chord.map((n) => n + 12), ...chord.slice().reverse().map((n) => n + 24)];
    for (let i = 0; i * step < dur; i++) {
      const n = notes[i % notes.length];
      const tt = t + i * step;
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = midi(n);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.exponentialRampToValueAtTime(i % 4 === 0 ? 0.05 : 0.032, tt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.7);
      o.connect(g);
      g.connect(this.delay);
      g.connect(this.bus);
      o.start(tt);
      this._track(o, tt + 0.75);
    }
  }

  _shimmer(note, t) {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = midi(note + 12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.03, t + 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
    o.connect(g).connect(this.reverb);
    o.start(t);
    this._track(o, t + 3.6);
  }

  _startWind(t) {
    const seconds = 4;
    const rate = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, rate * seconds, rate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 500;
    bp.Q.value = 0.8;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 260;
    lfo.connect(lfoGain).connect(bp.frequency);
    const g = this.ctx.createGain();
    g.gain.value = 0.018;
    src.connect(bp).connect(g).connect(this.bus);
    src.start(t);
    lfo.start(t);
    this.nodes.add(src);
    this.nodes.add(lfo);
  }
}
