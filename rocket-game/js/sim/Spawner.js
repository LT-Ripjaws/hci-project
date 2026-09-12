import { SPAWN } from '../core/constants.js';
import { makeRock, makeBlock, makeGate, makeDrone } from './entities.js';

// One spawner per lane. Every lane built from the same seed produces the same
// course, so co-op lanes are fair and keyboard/sensor trials can be matched.
export class Spawner {
  constructor(rng, lane, mode) {
    this.rng = rng;
    this.lane = lane;
    this.mode = mode; // 'practice' | 'mission'
    this.nextAt = SPAWN.interval * 0.5;
    this.lastWasGate = false;
  }

  update(scrollDistance, add) {
    while (scrollDistance >= this.nextAt) {
      this._spawnRow(add);
      this.nextAt += SPAWN.interval * (0.85 + this.rng() * 0.3);
    }
  }

  _rockX(r) {
    const { x0, x1 } = this.lane;
    return x0 + r + this.rng() * (x1 - x0 - 2 * r);
  }

  _spawnRow(add) {
    const y = SPAWN.spawnY;
    const { x0, x1 } = this.lane;
    const width = x1 - x0;
    // Roughly one hazard slot per 400 px of width (4 slots on the 1600 px field).
    const slots = Math.max(1, Math.round(width / 400));

    if (this.mode === 'practice') {
      const count = Math.max(1, slots - 2) + (this.rng() < 0.5 ? 1 : 0);
      if (this.rng() < 0.35) this._drones(Math.max(1, count - 1), y, add);
      else this._rocks(count, y, add);
      return;
    }

    let roll = this.rng();
    // Two gates in a row read as a repeated wall; fold that case into rocks.
    if (this.lastWasGate && roll >= 0.7) roll *= 0.7;
    this.lastWasGate = roll >= 0.7;

    if (roll < 0.36) {
      const count = Math.max(1, slots - 1) + (this.rng() < 0.5 ? 1 : 0);
      this._rocks(count, y, add);
    } else if (roll < 0.58) {
      const count = Math.max(1, slots - 2);
      const slot = width / count;
      for (let i = 0; i < count; i++) {
        const w = 90 + this.rng() * 60;
        const h = 40;
        const sx0 = x0 + i * slot;
        const x = sx0 + w / 2 + 20 + this.rng() * (slot - w - 40);
        add(makeBlock(x, y, w, h));
      }
    } else if (roll < 0.78) {
      this._drones(Math.max(1, slots - 2), y, add);
    } else {
      // One opening per ~800 px so a wide field never becomes a single wall.
      const gapCount = Math.max(1, Math.round(width / 800));
      const gapW = 200;
      const region = width / gapCount;
      const gaps = [];
      for (let i = 0; i < gapCount; i++) {
        const rx0 = x0 + i * region + 24;
        const gx = rx0 + this.rng() * (region - gapW - 48);
        gaps.push({ x: gx, w: gapW });
      }
      add(makeGate(x0, x1, y, gaps));
    }
  }

  _rocks(count, y, add) {
    const R = SPAWN.rockR;
    const xs = [];
    for (let i = 0; i < count; i++) {
      let x = this._rockX(R);
      for (let tries = 0; tries < 6 && xs.some((o) => Math.abs(x - o) < 2.5 * R + 10); tries++) x = this._rockX(R);
      xs.push(x);
      add(makeRock(x, y, this.rng(), R));
    }
  }

  _drones(count, y, add) {
    const R = SPAWN.droneR;
    const xs = [];
    for (let i = 0; i < count; i++) {
      let x = this._rockX(R + 60);
      for (let tries = 0; tries < 6 && xs.some((o) => Math.abs(x - o) < 4 * R); tries++) {
        x = this._rockX(R + 60);
      }
      xs.push(x);
      add(makeDrone(x, y, this.rng(), this.lane.x0, this.lane.x1, R));
    }
  }
}
