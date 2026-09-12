import { WORLD, SCROLL_SPEED, RULES, SPAWN } from '../core/constants.js';
import { hashSeed, mulberry32 } from '../core/rng.js';
import { Player } from './Player.js';
import { Spawner } from './Spawner.js';
import {
  Kind,
  makeProjectile,
  makeEnemyProjectile,
  circleHit,
  circleRectHit,
  circleGateBarsHit,
  insideGap,
  resetIds,
} from './entities.js';

const DRONE_FIRE_LINE = WORLD.H - 190;

// Authoritative simulation. Owns the timer, the shared score and every
// entity. Has no DOM, canvas or audio dependency so it can run under node.
//
// States: 'countdown' -> 'playing' <-> 'paused', and 'results' when a round ends.

export class Game {
  constructor({
    mode = 'solo',              // 'practice' | 'solo' | 'coop'
    playerCount = 1,
    seed = 'DEFAULT',
    input,
    targetScore = RULES.targetScore,
    missionSeconds = RULES.missionSeconds,
    countdownSeconds = RULES.countdownSeconds,
  }) {
    this.mode = mode;
    this.playerCount = playerCount;
    this.seedText = String(seed);
    this.input = input;
    this.targetScore = targetScore;
    this.missionSeconds = missionSeconds;
    this.countdownSeconds = countdownSeconds;
    this.hasTimer = mode !== 'practice';

    // Every mode uses the full field width. In co-op both rockets share it and
    // can cross paths, so they can crash into each other.
    this.lanes = [{ x0: 0, x1: WORLD.W }];
    this.laneOf = playerCount === 1 ? [0] : [0, 0];
    this.startX = playerCount === 1 ? [WORLD.W / 2] : [WORLD.W / 3, (2 * WORLD.W) / 3];

    this.events = [];
    this.reset();
  }

  // ---- lifecycle -----------------------------------------------------------

  reset() {
    resetIds();
    const seedNum = hashSeed(this.seedText);
    this.players = Array.from({ length: this.playerCount }, (_, i) => new Player(i, this.lanes[this.laneOf[i]], this.startX[i]));
    this.spawners = this.lanes.map((lane) => new Spawner(mulberry32(seedNum), lane, this.mode === 'practice' ? 'practice' : 'mission'));
    this.entities = [];
    this.scroll = 0;
    this.elapsed = 0;
    this.timeLeft = this.hasTimer ? this.missionSeconds : Infinity;
    this.countdown = this.countdownSeconds;
    this._lastBeepSecond = null;
    this.state = 'countdown';
    this.pauseReason = null;
    this.results = null;
    this.waitingForRelease = false;
    this.events.length = 0;
    for (const p of this.players) p.disarm();
    this._emit('start');
  }

  pause(reason = 'user') {
    if (this.state !== 'playing' && this.state !== 'countdown') return false;
    this.state = 'paused';
    this.pauseReason = reason;
    for (const p of this.players) p.disarm();
    this._emit('pause', { reason });
    return true;
  }

  resume() {
    if (this.state !== 'paused') return false;
    this.state = 'countdown';
    this.countdown = this.countdownSeconds;
    this._lastBeepSecond = null;
    this.pauseReason = null;
    for (const p of this.players) p.disarm();
    this._emit('resume');
    return true;
  }

  togglePause() {
    if (this.state === 'paused') return this.resume();
    return this.pause('user');
  }

  end(reason) {
    if (this.state === 'results') return;
    this.state = 'results';
    const alive = this.players.filter((p) => p.alive).length;
    const success = this.mode === 'practice'
      ? null
      : reason === 'time' && alive > 0 && this.teamScore >= this.targetScore;
    this.results = {
      mode: this.mode,
      seed: this.seedText,
      input: this.input?.label ?? 'none',
      reason,
      success,
      teamScore: this.teamScore,
      targetScore: this.targetScore,
      elapsed: this.elapsed,
      players: this.players.map((p) => ({ index: p.index, hull: p.hull, hearts: p.hearts, alive: p.alive, ...p.stats })),
    };
    for (const p of this.players) p.disarm();
    this._emit('end', { reason, success });
  }

  // ---- queries --------------------------------------------------------------

  get teamScore() {
    let s = 0;
    for (const p of this.players) s += p.stats.score;
    return s;
  }

  drainEvents() {
    const out = this.events.slice();
    this.events.length = 0;
    return out;
  }

  _emit(type, data = {}) {
    this.events.push({ type, ...data });
  }

  // ---- simulation -----------------------------------------------------------

  step(dt) {
    if (this.input) this.input.update(dt);
    if (this.state === 'paused' || this.state === 'results') return;

    // Sample every player's input exactly once per step.
    const inputs = this.players.map((p) => this._sanitise(this.input ? this.input.getState(p.index) : null, p));

    if (this.state === 'countdown') {
      this._stepCountdown(dt, inputs);
      return;
    }
    this._stepPlaying(dt, inputs);
  }

  _sanitise(raw, player) {
    if (!raw || !raw.healthy || !Number.isFinite(raw.bank)) {
      player.disarm();
      return { bank: 0, fire: false, healthy: false };
    }
    return { bank: raw.bank, fire: !!raw.fire, healthy: true };
  }

  _stepCountdown(dt, inputs) {
    // Show the live bank during the countdown but do not move.
    this.players.forEach((p, i) => { p.bank = Math.max(-30, Math.min(30, inputs[i].bank)); });

    const held = inputs.some((s) => s.fire);
    const unhealthy = inputs.some((s) => !s.healthy);
    this.waitingForRelease = held || unhealthy;
    if (this.waitingForRelease) return; // countdown does not run until every trigger is released

    const before = Math.ceil(this.countdown);
    this.countdown -= dt;
    const after = Math.ceil(this.countdown);
    if (after < before && after > 0 && this._lastBeepSecond !== after) {
      this._lastBeepSecond = after;
      this._emit('countdownBeep', { remaining: after });
    }
    if (this.countdown <= 0) {
      // The countdown only ran with every trigger released on healthy input,
      // so that release arms the players.
      for (const p of this.players) if (p.alive) p.armed = true;
      this.state = 'playing';
      this._emit('go');
    }
  }

  _stepPlaying(dt, inputs) {
    this.elapsed += dt;
    if (this.hasTimer) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.end('time');
        return;
      }
    }

    // Scenery and spawning.
    const dy = SCROLL_SPEED * dt;
    this.scroll += dy;
    const add = (e) => this.entities.push(e);
    for (const sp of this.spawners) sp.update(this.scroll, add);

    // Players.
    this.players.forEach((p, i) => p.step(dt, inputs[i], (owner) => this._spawnProjectile(owner)));

    // Move entities. Drones strafe and fire aimed, deterministic plasma bolts.
    const enemyShots = [];
    for (const e of this.entities) {
      if (e.kind === Kind.PROJECTILE) {
        e.y += e.vy * dt;
        if (e.y < -20) e.alive = false;
      } else if (e.kind === Kind.ENEMY_PROJECTILE) {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        if (e.y > WORLD.H + 30 || e.x < -30 || e.x > WORLD.W + 30) e.alive = false;
      } else if (e.kind === Kind.DRONE) {
        e.prevY = e.y;
        e.age += dt;
        e.y += dy * 0.72;
        e.x = Math.max(
          e.laneX0 + e.r,
          Math.min(e.laneX1 - e.r, e.baseX + Math.sin(e.phase + e.age * e.swaySpeed) * e.sway),
        );
        e.fireIn -= dt;
        if (e.fireIn <= 0 && e.y > 70 && e.y < DRONE_FIRE_LINE && this.mode !== 'practice') {
          const targets = this.players.filter((p) => p.alive);
          if (targets.length) {
            const target = targets.reduce((best, p) => (
              Math.abs(p.x - e.x) < Math.abs(best.x - e.x) ? p : best
            ));
            const dx = target.x - e.x;
            const targetDy = Math.max(160, target.y - e.y);
            const len = Math.hypot(dx, targetDy);
            enemyShots.push(makeEnemyProjectile(
              e.x,
              e.y + e.r,
              (dx / len) * SPAWN.droneShotSpeed,
              (targetDy / len) * SPAWN.droneShotSpeed,
            ));
            this._emit('enemyShot', { x: e.x, y: e.y });
          }
          e.fireIn += e.firePeriod;
        }
        if (e.y > WORLD.H + 80) e.alive = false;
      } else {
        e.prevY = e.y;
        e.y += dy;
        if (e.y > WORLD.H + 80) e.alive = false;
      }
    }
    this.entities.push(...enemyShots);

    this._resolveProjectiles();
    this._resolvePlayers();
    this._resolveCrash();

    this.entities = this.entities.filter((e) => e.alive);

    if (this.players.every((p) => !p.alive)) this.end('eliminated');
  }

  _spawnProjectile(owner) {
    this.entities.push(makeProjectile(owner.index, owner.x, owner.y - 30));
    this._emit('shot', { player: owner.index });
  }

  _resolveProjectiles() {
    for (const pr of this.entities) {
      if (pr.kind !== Kind.PROJECTILE || !pr.alive) continue;
      for (const e of this.entities) {
        if (!e.alive || e.kind === Kind.PROJECTILE) continue;
        if ((e.kind === Kind.ROCK || e.kind === Kind.DRONE)
          && circleHit(pr.x, pr.y, pr.r, e.x, e.y, e.r)) {
          e.alive = false;
          pr.alive = false;
          const owner = this.players[pr.owner];
          const points = e.kind === Kind.DRONE ? RULES.pointsDrone : RULES.pointsTarget;
          owner.stats.score += points;
          owner.stats.hits++;
          this._emit(e.kind === Kind.DRONE ? 'droneDestroyed' : 'targetDestroyed', {
            player: pr.owner,
            x: e.x,
            y: e.y,
            points,
          });
          break;
        }
        if (e.kind === Kind.ENEMY_PROJECTILE
          && circleHit(pr.x, pr.y, pr.r, e.x, e.y, e.r)) {
          e.alive = false;
          pr.alive = false;
          this._emit('intercept', { player: pr.owner, x: e.x, y: e.y });
          break;
        }
        if (e.kind === Kind.BLOCK && circleRectHit(pr.x, pr.y, pr.r, e.x, e.y, e.w, e.h)) {
          pr.alive = false; // indestructible: shot is absorbed, no score
          this._emit('shotAbsorbed', { x: pr.x, y: pr.y });
          break;
        }
        if (e.kind === Kind.GATE && circleGateBarsHit(pr.x, pr.y, pr.r, e)) {
          pr.alive = false;
          this._emit('shotAbsorbed', { x: pr.x, y: pr.y });
          break;
        }
      }
    }
  }

  _resolvePlayers() {
    const loseHull = this.mode !== 'practice';
    for (const p of this.players) {
      if (!p.alive) continue;
      for (const e of this.entities) {
        if (!e.alive || e.kind === Kind.PROJECTILE) continue;

        // Only entities inside this player's lane can interact with them.
        if (e.kind === Kind.GATE) {
          if (e.laneX0 !== p.lane.x0) continue;
          // Gate pass: the gate's y crosses the rocket's y this step with the rocket inside the gap.
          if (e.prevY < p.y && e.y >= p.y && !e.passed.has(p.index) && insideGap(e, p.x, p.r)) {
            e.passed.add(p.index);
            p.stats.gates++;
            p.stats.score += RULES.pointsGate;
            this._emit('gate', { player: p.index });
            continue;
          }
          if (circleGateBarsHit(p.x, p.y, p.r, e)) this._hit(p, e, loseHull);
          continue;
        }

        if (e.x < p.lane.x0 || e.x > p.lane.x1) continue;
        if ((e.kind === Kind.ROCK || e.kind === Kind.DRONE || e.kind === Kind.ENEMY_PROJECTILE)
          && circleHit(p.x, p.y, p.r, e.x, e.y, e.r)) this._hit(p, e, loseHull);
        else if (e.kind === Kind.BLOCK && circleRectHit(p.x, p.y, p.r, e.x, e.y, e.w, e.h)) this._hit(p, e, loseHull);
      }
    }
  }

  // Two living rockets overlapping: push them apart and charge each half a heart.
  _resolveCrash() {
    if (this.players.length < 2) return;
    const [a, b] = this.players;
    if (!a.alive || !b.alive) return;
    if (!circleHit(a.x, a.y, a.r, b.x, b.y, b.r)) return;

    const left = a.x <= b.x ? a : b;
    const right = left === a ? b : a;
    const overlap = a.r + b.r - (right.x - left.x);
    left.x -= overlap / 2;
    right.x += overlap / 2;
    left.clampToLane();
    right.clampToLane();
    // If a wall stopped one rocket, move the other the remaining distance.
    const still = a.r + b.r - (right.x - left.x);
    if (still > 0) {
      if (left.x <= left.lane.x0 + left.r) right.x += still; else left.x -= still;
      left.clampToLane();
      right.clampToLane();
    }

    const loseHull = this.mode !== 'practice';
    const damaged = [];
    if (a.takeCrash({ loseHull })) damaged.push(a.index);
    if (b.takeCrash({ loseHull })) damaged.push(b.index);
    if (damaged.length) {
      this._emit('crash', { players: damaged, x: (a.x + b.x) / 2, y: a.y });
      for (const p of [a, b]) if (!p.alive) this._emit('eliminated', { player: p.index });
    }
  }

  _hit(player, hazard, loseHull) {
    if (!player.takeHit({ loseHull })) return; // invulnerable: no damage, hazard stays
    hazard.alive = false;                       // accepted collision destroys that hazard
    this._emit('hit', { player: player.index, x: hazard.x ?? player.x, y: hazard.y });
    if (!player.alive) this._emit('eliminated', { player: player.index });
  }
}
