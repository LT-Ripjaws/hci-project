import { STEP, RULES } from './constants.js';

// Fixed-step simulation driven by requestAnimationFrame. Physics always
// advances in STEP increments regardless of render rate. A long gap between
// frames (hidden tab, debugger, heavy stall) is reported instead of being
// simulated as many catch-up steps.
export class FixedLoop {
  constructor({ update, render, onStall, step = STEP }) {
    this.update = update;
    this.render = render;
    this.onStall = onStall;
    this.step = step;
    this.accumulator = 0;
    this.last = 0;
    this.running = false;
    this._frame = this._frame.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.accumulator = 0;
    requestAnimationFrame(this._frame);
  }

  stop() {
    this.running = false;
  }

  _frame(now) {
    if (!this.running) return;
    let dt = (now - this.last) / 1000;
    this.last = now;

    if (dt > RULES.stallSeconds) {
      this.accumulator = 0;
      if (this.onStall) this.onStall(dt);
      dt = 0;
    }

    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= this.step && steps < 8) {
      this.update(this.step);
      this.accumulator -= this.step;
      steps++;
    }
    this.render(this.accumulator / this.step, dt);
    requestAnimationFrame(this._frame);
  }
}
