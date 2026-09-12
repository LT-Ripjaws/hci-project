import { FIRE } from '../core/constants.js';

export const Kind = Object.freeze({
  ROCK: 'rock',          // destructible target, 10 points
  BLOCK: 'block',        // indestructible obstacle
  GATE: 'gate',          // bars with a gap; passing the gap scores 5 once
  PROJECTILE: 'projectile',
  DRONE: 'drone',        // hostile moving target, 20 points
  ENEMY_PROJECTILE: 'enemy-projectile',
});

let nextId = 1;
export function resetIds() {
  nextId = 1;
}

export function makeRock(x, y, variant, r = 26) {
  return { id: nextId++, kind: Kind.ROCK, x, y, r, variant, alive: true };
}

// x, y are the block centre.
export function makeBlock(x, y, w, h) {
  return { id: nextId++, kind: Kind.BLOCK, x, y, w, h, alive: true };
}

// gaps: sorted [{ x, w }] openings; everything else across the lane is a bar.
export function makeGate(laneX0, laneX1, y, gaps) {
  return {
    id: nextId++,
    kind: Kind.GATE,
    y,
    laneX0,
    laneX1,
    gaps,
    h: 18,
    passed: new Set(), // player indices that already scored this gate
    alive: true,
  };
}

// Solid bar intervals of a gate as [x0, x1] pairs.
export function gateBars(gate) {
  const bars = [];
  let x = gate.laneX0;
  for (const g of gate.gaps) {
    if (g.x > x) bars.push([x, g.x]);
    x = g.x + g.w;
  }
  if (gate.laneX1 > x) bars.push([x, gate.laneX1]);
  return bars;
}

export function insideGap(gate, cx, cr) {
  return gate.gaps.some((g) => cx - cr >= g.x && cx + cr <= g.x + g.w);
}

export function makeProjectile(owner, x, y) {
  return { id: nextId++, kind: Kind.PROJECTILE, owner, x, y, r: FIRE.r, vy: -FIRE.speed, alive: true };
}

export function makeDrone(x, y, variant, laneX0, laneX1, r = 27) {
  return {
    id: nextId++,
    kind: Kind.DRONE,
    x,
    baseX: x,
    y,
    r,
    variant,
    laneX0,
    laneX1,
    age: 0,
    phase: variant * Math.PI * 2,
    sway: 45 + variant * 70,
    swaySpeed: 1.25 + variant * 0.75,
    fireIn: 1 + variant * 1.1,
    firePeriod: 1.7 + variant * 0.8,
    alive: true,
  };
}

export function makeEnemyProjectile(x, y, vx, vy) {
  return { id: nextId++, kind: Kind.ENEMY_PROJECTILE, x, y, r: 7, vx, vy, alive: true };
}

export function circleHit(ax, ay, ar, bx, by, br) {
  const dx = ax - bx;
  const dy = ay - by;
  const rr = ar + br;
  return dx * dx + dy * dy <= rr * rr;
}

// rect given by centre (rx, ry) and size (rw, rh)
export function circleRectHit(cx, cy, cr, rx, ry, rw, rh) {
  const hx = rw / 2;
  const hy = rh / 2;
  const nx = Math.max(rx - hx, Math.min(cx, rx + hx));
  const ny = Math.max(ry - hy, Math.min(cy, ry + hy));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy <= cr * cr;
}

export function circleGateBarsHit(cx, cy, cr, gate) {
  for (const [x0, x1] of gateBars(gate)) {
    if (circleRectHit(cx, cy, cr, (x0 + x1) / 2, gate.y, x1 - x0, gate.h)) return true;
  }
  return false;
}
