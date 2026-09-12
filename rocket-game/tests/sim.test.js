import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/sim/Game.js';
import { InputSource } from '../js/input/InputSource.js';
import { makeBlock, makeRock, makeDrone, makeEnemyProjectile, Kind } from '../js/sim/entities.js';
import { STEP, RULES, FIRE } from '../js/core/constants.js';

// Scripted input: tests set state per player directly.
class ScriptedInput extends InputSource {
  constructor(n = 1) {
    super();
    this.states = Array.from({ length: n }, () => ({ bank: 0, fire: false, healthy: true }));
  }
  get label() { return 'scripted'; }
  set(i, patch) { Object.assign(this.states[i], patch); }
  getState(i) { return { ...this.states[i] }; }
}

function makeGame(opts = {}) {
  const input = new ScriptedInput(opts.playerCount ?? 1);
  const game = new Game({ mode: 'solo', seed: 'TEST', countdownSeconds: 0, input, ...opts });
  return { game, input };
}

function steps(game, n) {
  for (let i = 0; i < n; i++) game.step(STEP);
}

function toPlaying(game) {
  // countdown 0: one step with fire released moves into 'playing'
  game.step(STEP);
  assert.equal(game.state, 'playing');
}

function snapshot(game) {
  return JSON.stringify({
    score: game.teamScore,
    players: game.players.map((p) => [Math.round(p.x * 1000), p.hull, p.stats]),
    entities: game.entities.map((e) => [e.kind, Math.round(e.x ?? e.gaps[0].x), Math.round(e.y)]),
  });
}

test('same seed and same inputs produce an identical simulation', () => {
  const a = makeGame();
  const b = makeGame();
  toPlaying(a.game);
  toPlaying(b.game);
  for (let i = 0; i < 900; i++) {
    const bank = Math.sin(i / 40) * 20;
    const fire = i % 90 < 45;
    a.input.set(0, { bank, fire });
    b.input.set(0, { bank, fire });
    a.game.step(STEP);
    b.game.step(STEP);
  }
  assert.equal(snapshot(a.game), snapshot(b.game));
  assert.ok(a.game.entities.length > 0, 'course spawned entities');
});

test('dead zone: small bank does not move, larger bank does', () => {
  const { game, input } = makeGame();
  toPlaying(game);
  const p = game.players[0];
  const x0 = p.x;
  input.set(0, { bank: 2.0 });
  steps(game, 30);
  assert.equal(p.x, x0);
  input.set(0, { bank: 10 });
  steps(game, 30);
  assert.ok(p.x > x0);
  input.set(0, { bank: -10 });
  steps(game, 60);
  assert.ok(p.x < x0);
});

test('rocket cannot leave its lane', () => {
  const { game, input } = makeGame();
  toPlaying(game);
  const p = game.players[0];
  input.set(0, { bank: 30 });
  steps(game, 600);
  assert.ok(p.x <= p.lane.x1 - p.r + 1e-9);
  input.set(0, { bank: -30 });
  steps(game, 600);
  assert.ok(p.x >= p.lane.x0 + p.r - 1e-9);
});

test('overlapping a hazard for many frames costs exactly one hull point', () => {
  const { game } = makeGame();
  toPlaying(game);
  const p = game.players[0];
  // Freeze spawning by making the course far away, then place a block on the rocket.
  game.spawners.forEach((s) => { s.nextAt = Infinity; });
  game.entities.push(makeBlock(p.x, p.y, 300, 300));
  steps(game, 30);
  assert.equal(p.hull, RULES.hullHalves - RULES.hazardDamage);
  assert.equal(p.stats.collisions, 1);
  assert.equal(game.entities.filter((e) => e.kind === Kind.BLOCK).length, 0, 'hazard destroyed by the hit');
  // A second hazard placed during invulnerability does no damage.
  game.entities.push(makeBlock(p.x, p.y, 300, 300));
  steps(game, 10);
  assert.equal(p.hull, RULES.hullHalves - RULES.hazardDamage);
  // After invulnerability expires it does.
  steps(game, Math.ceil(RULES.invulnSeconds / STEP) + 2);
  assert.equal(p.hull, RULES.hullHalves - 2 * RULES.hazardDamage);
});

test('held fire respects the cooldown and needs a release after start', () => {
  const { game, input } = makeGame();
  const p = game.players[0];
  input.set(0, { fire: true });
  steps(game, 10);
  assert.equal(game.state, 'countdown', 'countdown holds while fire is held');
  assert.ok(game.waitingForRelease);
  input.set(0, { fire: false });
  toPlaying(game);
  input.set(0, { fire: true });
  const n = Math.round(1.0 / STEP); // one second held
  steps(game, n);
  const expected = Math.floor(1.0 / FIRE.cooldown);
  assert.ok(p.stats.shots === expected || p.stats.shots === expected + 1, `shots=${p.stats.shots}`);
  assert.ok(p.stats.shots <= 5);
});

test('pause freezes timer, entities and fire; resume needs a release', () => {
  const { game, input } = makeGame();
  toPlaying(game);
  steps(game, 120);
  const t = game.timeLeft;
  const snap = snapshot(game);
  game.pause('user');
  input.set(0, { fire: true, bank: 20 });
  steps(game, 120);
  assert.equal(game.timeLeft, t);
  assert.equal(snapshot(game), snap);
  game.resume();
  steps(game, 10);
  assert.equal(game.state, 'countdown');
  assert.ok(game.waitingForRelease);
  input.set(0, { fire: false });
  steps(game, 1);
  assert.equal(game.state, 'playing');
  const shotsBefore = game.players[0].stats.shots;
  input.set(0, { fire: true });
  steps(game, 1);
  assert.equal(game.players[0].stats.shots, shotsBefore + 1);
});

test('a projectile destroys one rock, scores once and is consumed', () => {
  const { game, input } = makeGame();
  toPlaying(game);
  const p = game.players[0];
  game.spawners.forEach((s) => { s.nextAt = Infinity; });
  game.entities.length = 0;
  game.entities.push(makeRock(p.x, p.y - 200, 0.5));
  game.entities.push(makeRock(p.x, p.y - 260, 0.5)); // directly behind the first
  input.set(0, { fire: true });
  game.step(STEP);
  input.set(0, { fire: false });
  steps(game, 40);
  assert.equal(p.stats.score, RULES.pointsTarget);
  assert.equal(p.stats.hits, 1);
  assert.equal(game.entities.filter((e) => e.kind === Kind.ROCK).length, 1, 'second rock survives');
  assert.equal(game.entities.filter((e) => e.kind === Kind.PROJECTILE).length, 0, 'projectile consumed');
});

test('a projectile destroys one enemy drone for 20 points', () => {
  const { game, input } = makeGame();
  toPlaying(game);
  const p = game.players[0];
  game.spawners.forEach((s) => { s.nextAt = Infinity; });
  game.entities.length = 0;
  const drone = makeDrone(p.x, p.y - 200, 0.25, 0, 1600);
  drone.sway = 0;
  drone.fireIn = Infinity;
  game.entities.push(drone);
  input.set(0, { fire: true });
  game.step(STEP);
  input.set(0, { fire: false });
  steps(game, 40);
  assert.equal(p.stats.score, RULES.pointsDrone);
  assert.equal(p.stats.hits, 1);
  assert.equal(game.entities.some((e) => e.kind === Kind.DRONE), false);
  assert.ok(game.drainEvents().some((e) => e.type === 'droneDestroyed'));
});

test('enemy plasma damages once and is removed', () => {
  const { game } = makeGame();
  toPlaying(game);
  const p = game.players[0];
  game.spawners.forEach((s) => { s.nextAt = Infinity; });
  game.entities.push(makeEnemyProjectile(p.x, p.y, 0, 0));
  game.step(STEP);
  assert.equal(p.hull, RULES.hullHalves - RULES.hazardDamage);
  assert.equal(game.entities.some((e) => e.kind === Kind.ENEMY_PROJECTILE), false);
  steps(game, 10);
  assert.equal(p.hull, RULES.hullHalves - RULES.hazardDamage);
});

test('mission ends when time runs out and reports results', () => {
  const { game } = makeGame({ missionSeconds: 2 });
  toPlaying(game);
  game.spawners.forEach((s) => { s.nextAt = Infinity; });
  steps(game, Math.ceil(2 / STEP) + 5);
  assert.equal(game.state, 'results');
  assert.equal(game.results.reason, 'time');
  assert.equal(game.results.success, false);
  assert.equal(game.results.players.length, 1);
});

test('unhealthy input clears steering and disarms fire', () => {
  const { game, input } = makeGame();
  toPlaying(game);
  const p = game.players[0];
  input.set(0, { bank: 20, fire: false });
  steps(game, 10);
  const x = p.x;
  input.set(0, { bank: 20, fire: true, healthy: false });
  steps(game, 10);
  assert.equal(p.x, x);
  assert.equal(p.stats.shots, 0);
  input.set(0, { healthy: true, fire: true });
  steps(game, 5);
  assert.equal(p.stats.shots, 0, 'still disarmed until a release is seen');
});

// ---- co-op ---------------------------------------------------------------

function makeCoop(opts = {}) {
  return makeGame({ mode: 'coop', playerCount: 2, ...opts });
}

test('co-op: two players share one arena, one score and one timer', () => {
  const { game, input } = makeCoop();
  toPlaying(game);
  assert.equal(game.players.length, 2);
  assert.equal(game.lanes.length, 1);
  assert.equal(game.players[0].lane, game.players[1].lane);
  game.spawners.forEach((s) => { s.nextAt = Infinity; });
  game.entities.length = 0;
  const [a, b] = game.players;
  game.entities.push(makeRock(a.x, a.y - 200, 0.5));
  game.entities.push(makeRock(b.x, b.y - 200, 0.5));
  input.set(0, { fire: true });
  input.set(1, { fire: true });
  game.step(STEP);
  input.set(0, { fire: false });
  input.set(1, { fire: false });
  steps(game, 40);
  assert.equal(a.stats.score, RULES.pointsTarget);
  assert.equal(b.stats.score, RULES.pointsTarget);
  assert.equal(game.teamScore, 2 * RULES.pointsTarget, 'team score is the sum, counted once');
  assert.equal(game.results, null);
});

test('co-op: rockets crashing into each other each lose half a heart and are pushed apart', () => {
  const { game, input } = makeCoop();
  toPlaying(game);
  game.spawners.forEach((s) => { s.nextAt = Infinity; });
  const [a, b] = game.players;
  // Steer toward each other until they meet.
  input.set(0, { bank: 20 });
  input.set(1, { bank: -20 });
  steps(game, 30); // they meet after roughly 15 steps
  assert.equal(a.hull, RULES.hullHalves - RULES.crashDamage);
  assert.equal(b.hull, RULES.hullHalves - RULES.crashDamage);
  assert.equal(a.stats.crashes, 1);
  assert.ok(b.x - a.x >= a.r + b.r - 1e-6, 'rockets do not stay overlapped');
  // Keep pushing: damage repeats only after the crash cooldown, not every frame.
  steps(game, Math.round(RULES.crashCooldown / STEP) + 3);
  assert.equal(a.stats.crashes, 2);
  assert.equal(a.hull, RULES.hullHalves - 2 * RULES.crashDamage);
  assert.equal(a.stats.collisions, 0, 'a crash is not a hazard collision');
});

test('co-op: a crash never damages a third party or scores', () => {
  const { game, input } = makeCoop();
  toPlaying(game);
  game.spawners.forEach((s) => { s.nextAt = Infinity; });
  input.set(0, { bank: 20 });
  input.set(1, { bank: -20 });
  steps(game, 120);
  assert.equal(game.teamScore, 0);
});

test('co-op: one eliminated player stops; the partner continues; both eliminated ends the round', () => {
  const { game, input } = makeCoop();
  toPlaying(game);
  game.spawners.forEach((s) => { s.nextAt = Infinity; });
  const [a, b] = game.players;
  // Kill P1 with repeated hazards.
  for (let i = 0; i < RULES.hullHalves / RULES.hazardDamage; i++) {
    game.entities.push(makeBlock(a.x, a.y, 60, 60));
    steps(game, Math.ceil(RULES.invulnSeconds / STEP) + 2);
  }
  assert.equal(a.alive, false);
  assert.equal(game.state, 'playing', 'partner keeps playing');
  // Dead P1 cannot move or fire; live P2 can.
  const ax = a.x;
  input.set(0, { bank: 20, fire: true });
  input.set(1, { bank: 0, fire: true });
  steps(game, 10);
  assert.equal(a.x, ax);
  assert.equal(a.stats.shots, 0);
  assert.ok(b.stats.shots > 0);
  // A dead rocket cannot be crashed into.
  input.set(1, { bank: -20, fire: false });
  steps(game, 120);
  assert.equal(b.stats.crashes, 0);
  // Kill P2 too.
  for (let i = 0; i < RULES.hullHalves / RULES.hazardDamage; i++) {
    game.entities.push(makeBlock(b.x, b.y, 60, 60));
    steps(game, Math.ceil(RULES.invulnSeconds / STEP) + 2);
  }
  assert.equal(game.state, 'results');
  assert.equal(game.results.reason, 'eliminated');
  assert.equal(game.results.success, false);
  assert.equal(game.results.players.length, 2);
});

test('co-op: mission succeeds on time-out with a survivor and the target reached', () => {
  const { game } = makeCoop({ missionSeconds: 1, targetScore: 20 });
  toPlaying(game);
  game.spawners.forEach((s) => { s.nextAt = Infinity; });
  game.players[0].stats.score = 10;
  game.players[1].stats.score = 10;
  steps(game, Math.ceil(1 / STEP) + 5);
  assert.equal(game.state, 'results');
  assert.equal(game.results.success, true);
  assert.equal(game.results.teamScore, 20);
});

test('co-op: the same seed builds the same arena course', () => {
  const a = makeCoop();
  const b = makeCoop();
  toPlaying(a.game);
  toPlaying(b.game);
  steps(a.game, 600);
  steps(b.game, 600);
  assert.equal(snapshot(a.game), snapshot(b.game));
  assert.ok(a.game.entities.some((e) => (
    e.kind === Kind.GATE || e.kind === Kind.BLOCK || e.kind === Kind.ROCK || e.kind === Kind.DRONE
  )), 'the deterministic course contains hazards or targets');
});
