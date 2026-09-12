import { WORLD, ROCKET, RULES, PLAYER_COLORS } from '../core/constants.js';
import { Kind, gateBars } from '../sim/entities.js';
import { mulberry32 } from '../core/rng.js';

// Everything is drawn as vector shapes on Canvas 2D. No image assets.

const DEG = Math.PI / 180;
const FONT = "'Chakra Petch', 'Bahnschrift', 'Segoe UI', system-ui, sans-serif";

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    canvas.width = WORLD.W;
    canvas.height = WORLD.H;
    this.stars = this._makeStars();
    this.particles = [];
    this.flashes = [];
    this.rockShapes = new Map();
    this.time = 0;
    this.shake = 0;
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }

  _makeStars() {
    const rng = mulberry32(12345);
    const layers = [
      { n: 70, speed: 0.25, size: 1.0, alpha: 0.45 },
      { n: 40, speed: 0.5, size: 1.6, alpha: 0.7 },
      { n: 18, speed: 0.9, size: 2.4, alpha: 1.0 },
    ];
    return layers.map((l) => ({
      ...l,
      pts: Array.from({ length: l.n }, () => ({ x: rng() * WORLD.W, y: rng() * WORLD.H })),
    }));
  }

  // Cosmetic effects triggered from simulation events.
  handleEvent(ev, game) {
    switch (ev.type) {
      case 'shot': {
        const p = game.players[ev.player];
        this._burst(p.x, p.y - 34, 3, PLAYER_COLORS[ev.player], 60, 0.15);
        break;
      }
      case 'targetDestroyed':
        this._burst(ev.x, ev.y, 18, '#e8c07a', 220, 0.5);
        this.flashes.push({ x: ev.x, y: ev.y, r: 26, life: 0.25, color: '#fff2c0', text: `+${RULES.pointsTarget}` });
        break;
      case 'droneDestroyed':
        this._burst(ev.x, ev.y, 30, '#ff5a67', 300, 0.65);
        this._burst(ev.x, ev.y, 12, '#78e7ff', 190, 0.45);
        this.flashes.push({ x: ev.x, y: ev.y, r: 34, life: 0.5, color: '#ffffff', text: `+${RULES.pointsDrone}` });
        this.shake = Math.max(this.shake, 3);
        break;
      case 'enemyShot':
        this._burst(ev.x, ev.y + 20, 4, '#ff536d', 80, 0.18);
        break;
      case 'intercept':
        this._burst(ev.x, ev.y, 10, '#c8f7ff', 170, 0.3);
        this.flashes.push({ x: ev.x, y: ev.y, r: 16, life: 0.25, color: '#78e7ff', text: 'BLOCK' });
        break;
      case 'gate':
        this.flashes.push({ x: game.players[ev.player].x, y: game.players[ev.player].y - 60, r: 0, life: 0.6, color: '#8ef0b0', text: `+${RULES.pointsGate}` });
        break;
      case 'hit':
        this._burst(ev.x, ev.y, 26, '#ff6a4a', 260, 0.6);
        this.flashes.push({ x: ev.x, y: ev.y, r: 40, life: 0.3, color: '#ff8060', text: '' });
        this.shake = Math.max(this.shake, 7);
        break;
      case 'crash':
        this._burst(ev.x, ev.y, 16, '#ffd27a', 200, 0.4);
        this.flashes.push({ x: ev.x, y: ev.y - 40, r: 30, life: 0.5, color: '#ffd27a', text: 'CRASH -½' });
        this.shake = Math.max(this.shake, 5);
        break;
      case 'shotAbsorbed':
        this._burst(ev.x, ev.y, 5, '#9aa4b8', 90, 0.2);
        break;
      default:
        break;
    }
  }

  _burst(x, y, n, color, speed, life) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, maxLife: life, color, size: 2 + Math.random() * 2 });
    }
  }

  _updateEffects(dt, game) {
    for (const p of game.players) {
      if (!p.alive || game.state !== 'playing') continue;
      // exhaust
      for (let i = 0; i < 2; i++) {
        this.particles.push({
          x: p.x + (Math.random() - 0.5) * 8,
          y: p.y + ROCKET.h / 2 - 4,
          vx: (Math.random() - 0.5) * 30 - p.vx * 0.15,
          vy: 220 + Math.random() * 120,
          life: 0.35,
          maxLife: 0.35,
          color: Math.random() < 0.5 ? '#ffb347' : '#ff6a2a',
          size: 3 + Math.random() * 3,
        });
      }
    }
    for (const q of this.particles) {
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.life -= dt;
    }
    this.particles = this.particles.filter((q) => q.life > 0);
    for (const f of this.flashes) f.life -= dt;
    this.flashes = this.flashes.filter((f) => f.life > 0);
    this.shake = Math.max(0, this.shake - dt * 32);
  }

  draw(game, dt) {
    // Cosmetic effects freeze only while paused; they may finish on the results screen.
    const animating = game.state !== 'paused';
    if (animating) this.time += dt;
    this._updateEffects(animating ? dt : 0, game);

    const c = this.ctx;
    c.save();
    this._drawBackground(c, game);
    if (this.shake > 0 && !this.reducedMotion) {
      c.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }
    this._drawLanes(c, game);
    for (const e of game.entities) this._drawEntity(c, e);
    this._drawParticles(c);
    for (const p of game.players) this._drawRocket(c, p, game);
    this._drawFlashes(c);
    if (game.state === 'countdown') this._drawCountdown(c, game);
    c.restore();
    this._drawVignette(c);
  }

  _drawBackground(c, game) {
    const g = c.createLinearGradient(0, 0, 0, WORLD.H);
    g.addColorStop(0, '#060a1a');
    g.addColorStop(1, '#0d1636');
    c.fillStyle = g;
    c.fillRect(0, 0, WORLD.W, WORLD.H);

    const blueNebula = c.createRadialGradient(WORLD.W * 0.18, WORLD.H * 0.22, 20, WORLD.W * 0.18, WORLD.H * 0.22, 620);
    blueNebula.addColorStop(0, 'rgba(28, 104, 170, 0.18)');
    blueNebula.addColorStop(0.45, 'rgba(17, 55, 120, 0.08)');
    blueNebula.addColorStop(1, 'rgba(0, 0, 0, 0)');
    c.fillStyle = blueNebula;
    c.fillRect(0, 0, WORLD.W, WORLD.H);

    const emberNebula = c.createRadialGradient(WORLD.W * 0.9, WORLD.H * 0.65, 10, WORLD.W * 0.9, WORLD.H * 0.65, 520);
    emberNebula.addColorStop(0, 'rgba(155, 67, 31, 0.12)');
    emberNebula.addColorStop(1, 'rgba(0, 0, 0, 0)');
    c.fillStyle = emberNebula;
    c.fillRect(0, 0, WORLD.W, WORLD.H);

    for (const layer of this.stars) {
      c.fillStyle = `rgba(220,230,255,${layer.alpha})`;
      const off = (game.scroll * layer.speed) % WORLD.H;
      for (const s of layer.pts) {
        const y = (s.y + off) % WORLD.H;
        if (game.state === 'playing' && layer.speed > 0.8 && !this.reducedMotion) {
          c.fillRect(s.x, y, layer.size, 7);
        } else {
          c.fillRect(s.x, y, layer.size, layer.size);
        }
      }
    }
  }

  _drawVignette(c) {
    const v = c.createRadialGradient(WORLD.W / 2, WORLD.H / 2, WORLD.H * 0.25, WORLD.W / 2, WORLD.H / 2, WORLD.W * 0.62);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.5)');
    c.fillStyle = v;
    c.fillRect(0, 0, WORLD.W, WORLD.H);
  }

  _drawLanes(c, game) {
    const full = game.lanes.length === 1 && game.lanes[0].x0 <= 0 && game.lanes[0].x1 >= WORLD.W;
    if (full) return; // full-width field: no gutters or lane lines
    c.fillStyle = 'rgba(0,0,0,0.45)';
    const first = game.lanes[0];
    const last = game.lanes[game.lanes.length - 1];
    if (first.x0 > 0) c.fillRect(0, 0, first.x0, WORLD.H);
    if (last.x1 < WORLD.W) c.fillRect(last.x1, 0, WORLD.W - last.x1, WORLD.H);
    c.strokeStyle = 'rgba(140,170,255,0.25)';
    c.lineWidth = 2;
    c.setLineDash([8, 10]);
    for (const lane of game.lanes) {
      c.beginPath();
      c.moveTo(lane.x0, 0);
      c.lineTo(lane.x0, WORLD.H);
      c.moveTo(lane.x1, 0);
      c.lineTo(lane.x1, WORLD.H);
      c.stroke();
    }
    c.setLineDash([]);
  }

  _rockShape(e) {
    let s = this.rockShapes.get(e.id);
    if (!s) {
      const rng = mulberry32(Math.floor(e.variant * 1e9));
      const n = 8;
      s = Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        const rr = e.r * (0.75 + rng() * 0.35);
        return [Math.cos(a) * rr, Math.sin(a) * rr];
      });
      this.rockShapes.set(e.id, s);
    }
    return s;
  }

  _drawEntity(c, e) {
    switch (e.kind) {
      case Kind.ROCK: {
        const s = this._rockShape(e);
        c.save();
        c.translate(e.x, e.y);
        c.fillStyle = '#8a7a6a';
        c.strokeStyle = '#d8c8b0';
        c.lineWidth = 2;
        c.beginPath();
        s.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
        c.closePath();
        c.fill();
        c.stroke();
        c.fillStyle = 'rgba(0,0,0,0.25)';
        c.beginPath();
        c.arc(-e.r * 0.25, e.r * 0.2, e.r * 0.28, 0, Math.PI * 2);
        c.fill();
        c.restore();
        break;
      }
      case Kind.BLOCK: {
        c.save();
        c.translate(e.x, e.y);
        c.fillStyle = '#3a4560';
        c.fillRect(-e.w / 2, -e.h / 2, e.w, e.h);
        c.strokeStyle = '#ffcc33';
        c.lineWidth = 3;
        c.strokeRect(-e.w / 2, -e.h / 2, e.w, e.h);
        c.beginPath();
        for (let x = -e.w / 2 + 8; x < e.w / 2; x += 16) {
          c.moveTo(x, -e.h / 2);
          c.lineTo(x - 10, e.h / 2);
        }
        c.lineWidth = 3;
        c.strokeStyle = 'rgba(255,204,51,0.6)';
        c.stroke();
        c.restore();
        break;
      }
      case Kind.GATE: {
        c.fillStyle = '#20406a';
        c.strokeStyle = '#7fd4ff';
        c.lineWidth = 2;
        for (const [x0, x1] of gateBars(e)) {
          c.fillRect(x0, e.y - e.h / 2, x1 - x0, e.h);
          c.strokeRect(x0, e.y - e.h / 2, x1 - x0, e.h);
        }
        c.fillStyle = e.passed.size ? 'rgba(140,240,176,0.5)' : '#8ef0b0';
        for (const g of e.gaps) {
          c.fillRect(g.x, e.y - 3, 6, 6);
          c.fillRect(g.x + g.w - 6, e.y - 3, 6, 6);
        }
        break;
      }
      case Kind.PROJECTILE: {
        c.save();
        c.shadowColor = PLAYER_COLORS[e.owner];
        c.shadowBlur = 10;
        c.fillStyle = '#ffffff';
        c.fillRect(e.x - 2, e.y - 10, 4, 20);
        c.fillStyle = PLAYER_COLORS[e.owner];
        c.fillRect(e.x - 1, e.y - 8, 2, 16);
        c.restore();
        break;
      }
      case Kind.DRONE:
        this._drawDrone(c, e);
        break;
      case Kind.ENEMY_PROJECTILE: {
        c.save();
        c.translate(e.x, e.y);
        c.rotate(Math.atan2(e.vy, e.vx) - Math.PI / 2);
        c.shadowColor = '#ff375f';
        c.shadowBlur = 18;
        const g = c.createLinearGradient(0, -14, 0, 12);
        g.addColorStop(0, 'rgba(255,55,95,0)');
        g.addColorStop(0.55, '#ff375f');
        g.addColorStop(1, '#ffffff');
        c.fillStyle = g;
        c.fillRect(-3, -14, 6, 26);
        c.restore();
        break;
      }
      default:
        break;
    }
  }

  // Hostile interceptor. Nose points down, toward the players it hunts. The
  // variant (0..1) shifts the hull hue from crimson to ember and the wing span.
  _drawDrone(c, e) {
    const r = e.r;
    const hue = 345 + e.variant * 40;
    const span = 1.25 + e.variant * 0.35;
    const t = this.time;
    const pulse = 0.75 + 0.25 * Math.sin(t * 7 + e.phase);
    const dark = `hsl(${hue}, 55%, 14%)`;
    const mid = `hsl(${hue}, 60%, 30%)`;
    const edge = `hsl(${hue}, 85%, 55%)`;
    const glow = `hsl(${hue}, 100%, 62%)`;

    c.save();
    c.translate(e.x, e.y);
    c.rotate(Math.sin(e.phase + e.age * e.swaySpeed) * 0.13);

    // engines at the rear (top), flickering toward the direction of travel's opposite
    for (const sx of [-1, 1]) {
      const flick = 0.8 + 0.2 * Math.sin(t * 31 + sx * 1.7 + e.phase);
      c.shadowColor = glow;
      c.shadowBlur = 16;
      c.fillStyle = glow;
      c.beginPath();
      c.moveTo(sx * r * 0.36, -r * 0.55);
      c.lineTo(sx * r * 0.52, -r * 0.55);
      c.lineTo(sx * r * 0.44, -r * (0.95 + 0.35 * flick));
      c.closePath();
      c.fill();
      c.shadowBlur = 0;
      c.fillStyle = '#fff6f0';
      c.beginPath();
      c.arc(sx * r * 0.44, -r * 0.55, 3, 0, Math.PI * 2);
      c.fill();
    }

    // wings: forward-swept claws, drawn behind the hull
    for (const sx of [-1, 1]) {
      c.fillStyle = mid;
      c.beginPath();
      c.moveTo(sx * r * 0.28, -r * 0.35);
      c.lineTo(sx * r * span, -r * 0.05);
      c.lineTo(sx * r * (span - 0.08), r * 0.72);
      c.lineTo(sx * r * 0.62, r * 0.3);
      c.lineTo(sx * r * 0.3, r * 0.15);
      c.closePath();
      c.fill();
      // lit leading edge
      c.strokeStyle = edge;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(sx * r * span, -r * 0.05);
      c.lineTo(sx * r * (span - 0.08), r * 0.72);
      c.stroke();
      // inner blade
      c.fillStyle = dark;
      c.beginPath();
      c.moveTo(sx * r * 0.34, -r * 0.2);
      c.lineTo(sx * r * (span - 0.35), r * 0.05);
      c.lineTo(sx * r * 0.55, r * 0.22);
      c.closePath();
      c.fill();
    }

    // hull: long, pointed toward the player
    const hull = c.createLinearGradient(0, -r * 0.8, 0, r * 1.15);
    hull.addColorStop(0, dark);
    hull.addColorStop(0.55, mid);
    hull.addColorStop(1, dark);
    c.fillStyle = hull;
    c.beginPath();
    c.moveTo(0, r * 1.15);
    c.quadraticCurveTo(r * 0.42, r * 0.35, r * 0.34, -r * 0.3);
    c.lineTo(r * 0.16, -r * 0.8);
    c.lineTo(-r * 0.16, -r * 0.8);
    c.lineTo(-r * 0.34, -r * 0.3);
    c.quadraticCurveTo(-r * 0.42, r * 0.35, 0, r * 1.15);
    c.closePath();
    c.fill();
    c.strokeStyle = edge;
    c.lineWidth = 1.2;
    c.stroke();

    // armour seams
    c.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(-r * 0.24, r * 0.45);
    c.lineTo(0, r * 0.62);
    c.lineTo(r * 0.24, r * 0.45);
    c.moveTo(-r * 0.3, -r * 0.05);
    c.lineTo(r * 0.3, -r * 0.05);
    c.stroke();

    // eye: pulsing cockpit
    c.shadowColor = glow;
    c.shadowBlur = 14 * pulse;
    c.fillStyle = glow;
    c.beginPath();
    c.ellipse(0, r * 0.12, r * 0.16, r * 0.3 * pulse, 0, 0, Math.PI * 2);
    c.fill();
    c.shadowBlur = 0;
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.ellipse(0, r * 0.1, r * 0.06, r * 0.14 * pulse, 0, 0, Math.PI * 2);
    c.fill();

    c.restore();
  }

  _drawParticles(c) {
    for (const q of this.particles) {
      c.globalAlpha = Math.max(0, q.life / q.maxLife);
      c.fillStyle = q.color;
      c.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
    }
    c.globalAlpha = 1;
  }

  _drawRocket(c, p, game) {
    const color = PLAYER_COLORS[p.index];
    const blink = p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0;
    c.save();
    c.translate(p.x, p.y);
    c.globalAlpha = p.alive ? (blink ? 0.35 : 1) : 0.4;
    // bank: rotate plus a slight horizontal squash to suggest roll
    c.rotate(p.bank * DEG * 0.8);
    c.scale(1 - 0.25 * Math.abs(Math.sin(p.bank * DEG)), 1);

    const w = ROCKET.w;
    const h = ROCKET.h;
    // fins
    c.fillStyle = p.alive ? color : '#667';
    c.beginPath();
    c.moveTo(-w / 2, h * 0.05);
    c.lineTo(-w * 0.95, h / 2);
    c.lineTo(-w / 2, h / 2 - 6);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(w / 2, h * 0.05);
    c.lineTo(w * 0.95, h / 2);
    c.lineTo(w / 2, h / 2 - 6);
    c.closePath();
    c.fill();
    // body
    c.fillStyle = p.alive ? '#e9eef7' : '#889';
    c.beginPath();
    c.moveTo(0, -h / 2);
    c.quadraticCurveTo(w / 2, -h / 2 + 20, w / 2, -h / 6);
    c.lineTo(w / 2, h / 2 - 8);
    c.lineTo(-w / 2, h / 2 - 8);
    c.lineTo(-w / 2, -h / 6);
    c.quadraticCurveTo(-w / 2, -h / 2 + 20, 0, -h / 2);
    c.closePath();
    c.fill();
    // nose cap and stripe
    c.fillStyle = p.alive ? color : '#667';
    c.beginPath();
    c.moveTo(0, -h / 2);
    c.quadraticCurveTo(w / 2, -h / 2 + 20, w / 2, -h / 6);
    c.lineTo(w / 2, -h / 6 + 6);
    c.lineTo(-w / 2, -h / 6 + 6);
    c.lineTo(-w / 2, -h / 6);
    c.quadraticCurveTo(-w / 2, -h / 2 + 20, 0, -h / 2);
    c.closePath();
    c.fill();
    // window
    c.fillStyle = '#1b2a4a';
    c.beginPath();
    c.arc(0, 2, 6, 0, Math.PI * 2);
    c.fill();
    // nozzle
    c.fillStyle = '#3a4050';
    c.fillRect(-w / 4, h / 2 - 8, w / 2, 8);
    if (p.alive && game.state === 'playing') {
      c.shadowColor = color;
      c.shadowBlur = 18;
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.moveTo(-5, h / 2);
      c.lineTo(0, h / 2 + 13 + Math.sin(this.time * 24 + p.index) * 3);
      c.lineTo(5, h / 2);
      c.closePath();
      c.fill();
      c.shadowBlur = 0;
    }
    // player number
    c.fillStyle = '#1b2a4a';
    c.font = `700 12px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(String(p.index + 1), 0, 18);
    c.restore();

    if (!p.alive) {
      c.save();
      c.fillStyle = '#ffb0a0';
      c.font = `700 14px ${FONT}`;
      c.textAlign = 'center';
      c.fillText('ELIMINATED', p.x, p.y + h / 2 + 18);
      c.restore();
    }
  }

  _drawFlashes(c) {
    for (const f of this.flashes) {
      const a = f.life;
      if (f.r > 0) {
        c.strokeStyle = f.color;
        c.globalAlpha = Math.min(1, a * 3);
        c.lineWidth = 3;
        c.beginPath();
        c.arc(f.x, f.y, f.r * (1.6 - a), 0, Math.PI * 2);
        c.stroke();
      }
      if (f.text) {
        c.globalAlpha = Math.min(1, a * 2);
        c.fillStyle = f.color;
        c.font = `700 20px ${FONT}`;
        c.textAlign = 'center';
        c.fillText(f.text, f.x, f.y - (0.6 - a) * 60);
      }
    }
    c.globalAlpha = 1;
  }

  _drawCountdown(c, game) {
    c.save();
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.fillRect(0, WORLD.H / 2 - 90, WORLD.W, 180);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    if (game.waitingForRelease) {
      c.fillStyle = '#ffd27a';
      c.font = `700 30px ${FONT}`;
      c.fillText('RELEASE FIRE TO CONTINUE', WORLD.W / 2, WORLD.H / 2);
    } else {
      c.fillStyle = '#ffffff';
      c.font = `700 110px ${FONT}`;
      c.fillText(String(Math.max(1, Math.ceil(game.countdown))), WORLD.W / 2, WORLD.H / 2);
    }
    c.restore();
  }
}
