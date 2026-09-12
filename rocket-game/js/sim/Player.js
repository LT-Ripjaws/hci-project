import { STEER, ROCKET, RULES, FIRE } from '../core/constants.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class Player {
  constructor(index, lane, startX) {
    this.index = index;
    this.reset(lane, startX);
  }

  reset(lane, startX) {
    this.lane = lane; // { x0, x1 }
    this.x = startX ?? (lane.x0 + lane.x1) / 2;
    this.y = ROCKET.y;
    this.r = ROCKET.hitR;
    this.bank = 0;
    this.vx = 0;
    this.hull = RULES.hullHalves; // half hearts
    this.invuln = 0;
    this.crashCooldown = 0;
    this.cooldown = 0;
    this.armed = false; // a trigger release is required before firing
    this.fireHeld = false;
    this.alive = true;
    this.stats = { score: 0, collisions: 0, crashes: 0, gates: 0, shots: 0, hits: 0 };
  }

  get hearts() {
    return this.hull / 2;
  }

  disarm() {
    this.armed = false;
  }

  // Sideways speed from a relative bank angle: zero inside the dead zone,
  // then linear up to full speed at STEER.fullDeg, clamped beyond that.
  static steerFactor(bankDeg) {
    const mag = Math.abs(bankDeg);
    if (mag <= STEER.deadZoneDeg) return 0;
    const f = Math.min(1, (mag - STEER.deadZoneDeg) / (STEER.fullDeg - STEER.deadZoneDeg));
    return Math.sign(bankDeg) * f;
  }

  clampToLane() {
    this.x = clamp(this.x, this.lane.x0 + this.r, this.lane.x1 - this.r);
  }

  // input: { bank, fire, healthy } already sanitised by the game.
  step(dt, input, spawnProjectile) {
    this.bank = clamp(input.bank, -STEER.maxBankDeg, STEER.maxBankDeg);
    this.fireHeld = input.fire;
    this.invuln = Math.max(0, this.invuln - dt);
    this.crashCooldown = Math.max(0, this.crashCooldown - dt);
    this.cooldown = Math.max(0, this.cooldown - dt);

    if (!this.alive) {
      this.vx = 0;
      return;
    }

    this.vx = Player.steerFactor(this.bank) * STEER.maxSpeed;
    this.x += this.vx * dt;
    this.clampToLane();

    if (!input.fire) {
      // Only a release seen on healthy input arms the trigger. A forced
      // fire=false from unhealthy input must not count as a release.
      if (input.healthy !== false) this.armed = true;
    } else if (this.armed && this.cooldown <= 0) {
      spawnProjectile(this);
      this.cooldown = FIRE.cooldown;
      this.stats.shots++;
    }
  }

  _applyDamage(halves) {
    this.hull -= halves;
    if (this.hull <= 0) {
      this.hull = 0;
      this.alive = false;
      this.armed = false;
    }
  }

  // Hazard collision. Returns true when accepted (not invulnerable, alive).
  takeHit({ loseHull = true } = {}) {
    if (!this.alive || this.invuln > 0) return false;
    this.stats.collisions++;
    this.invuln = RULES.invulnSeconds;
    if (loseHull) this._applyDamage(RULES.hazardDamage);
    return true;
  }

  // Rocket-to-rocket crash. Independent of hazard invulnerability; rate
  // limited by its own cooldown so a sustained push is not damage every frame.
  takeCrash({ loseHull = true } = {}) {
    if (!this.alive || this.crashCooldown > 0) return false;
    this.stats.crashes++;
    this.crashCooldown = RULES.crashCooldown;
    if (loseHull) this._applyDamage(RULES.crashDamage);
    return true;
  }
}
