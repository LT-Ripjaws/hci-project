import { InputSource } from './InputSource.js';

// Keyboard emulates a bank angle rather than a velocity. Holding a steer key
// ramps the bank toward +-maxBank; releasing ramps it back to neutral. The
// game then applies the same dead zone and gain it will use for the sensor,
// so swapping in Web Serial later changes only this module.

export const DEFAULT_BINDINGS = [
  { left: ['KeyA'], right: ['KeyD'], fire: ['Space'] },
  { left: ['ArrowLeft'], right: ['ArrowRight'], fire: ['Enter', 'NumpadEnter'] },
];

export class KeyboardInput extends InputSource {
  constructor(target = window, bindings = DEFAULT_BINDINGS, opts = {}) {
    super();
    this.bindings = bindings;
    this.down = new Set();
    this.banks = bindings.map(() => 0);
    this.rampDegPerSec = opts.rampDegPerSec ?? 140; // ~20 deg in 150 ms
    this.maxBank = opts.maxBank ?? 20;
    this.boundCodes = new Set(bindings.flatMap((b) => [...b.left, ...b.right, ...b.fire]));
    this.enabled = true; // when false, keys are ignored and never preventDefault-ed (menus use them)

    if (target && target.addEventListener) {
      target.addEventListener('keydown', (e) => {
        if (!this.enabled || !this.boundCodes.has(e.code)) return;
        this.down.add(e.code);
        e.preventDefault();
      });
      target.addEventListener('keyup', (e) => {
        if (!this.enabled || !this.boundCodes.has(e.code)) return;
        this.down.delete(e.code);
        e.preventDefault();
      });
      target.addEventListener('blur', () => this.down.clear());
    }
  }

  get label() {
    return 'keyboard';
  }

  _any(codes) {
    for (const c of codes) if (this.down.has(c)) return true;
    return false;
  }

  update(dt) {
    for (let i = 0; i < this.bindings.length; i++) {
      const b = this.bindings[i];
      const dir = (this._any(b.right) ? 1 : 0) - (this._any(b.left) ? 1 : 0);
      const target = dir * this.maxBank;
      const cur = this.banks[i];
      const maxDelta = this.rampDegPerSec * dt;
      const delta = target - cur;
      this.banks[i] = Math.abs(delta) <= maxDelta ? target : cur + Math.sign(delta) * maxDelta;
    }
  }

  getState(playerIndex) {
    const b = this.bindings[playerIndex];
    if (!b) return { bank: 0, fire: false, healthy: false };
    return { bank: this.banks[playerIndex], fire: this._any(b.fire), healthy: true };
  }

  releaseAll() {
    this.down.clear();
  }
}
