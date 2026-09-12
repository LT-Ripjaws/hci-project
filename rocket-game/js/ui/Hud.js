import { RULES, STEER, PLAYER_NAMES } from '../core/constants.js';

// DOM instrument panels around the playfield. Updated once per render frame;
// text nodes only change when the value changes.

const MODE_LABEL = { practice: 'PRACTICE', solo: 'SOLO MISSION', coop: 'CO-OP MISSION' };

export class Hud {
  constructor(root) {
    const $ = (sel) => root.querySelector(sel);
    this.el = {
      mode: $('#tb-mode'),
      score: $('#tb-score'),
      target: $('#tb-target'),
      timer: $('#tb-timer'),
      mission: $('#panel-mission'),
      mMode: $('#m-mode'),
      mTarget: $('#m-target'),
      mTime: $('#m-time'),
      mSeed: $('#m-seed'),
      mInput: $('#m-input'),
      mNote: $('#m-note'),
    };
    this.panels = [0, 1].map((i) => {
      const p = $(`#panel-p${i + 1}`);
      return {
        root: p,
        state: p.querySelector('.pp-state'),
        hearts: [...p.querySelectorAll('.heart')],
        bankVal: p.querySelector('.bank-val'),
        gauge: p.querySelector('.gauge'),
        needle: p.querySelector('.needle'),
        score: p.querySelector('.s-score'),
        hits: p.querySelector('.s-hits'),
        gates: p.querySelector('.s-gates'),
        shots: p.querySelector('.s-shots'),
        width: 0,
      };
    });
    this.cache = new Map();

    const dz = (STEER.deadZoneDeg / STEER.maxBankDeg) * 50;
    for (const p of this.panels) p.gauge.style.setProperty('--dz', `${dz}%`);

    this.ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const p = this.panels.find((x) => x.gauge === e.target);
        if (p) p.width = e.contentRect.width;
      }
    });
    for (const p of this.panels) this.ro.observe(p.gauge);
  }

  _set(el, key, value) {
    if (this.cache.get(key) === value) return;
    this.cache.set(key, value);
    el.textContent = value;
  }

  bind(game) {
    this.cache.clear();
    const twoPlayers = game.players.length === 2;
    this.panels[1].root.hidden = !twoPlayers;
    this.el.mission.hidden = twoPlayers;
    for (const p of this.panels) { p.root.classList.remove('dead', 'firing'); }

    this._set(this.el.mode, 'mode', MODE_LABEL[game.mode] ?? game.mode.toUpperCase());
    this.el.target.hidden = !game.hasTimer;
    this._set(this.el.target, 'target', `/ ${game.targetScore}`);
    this.el.timer.hidden = !game.hasTimer;

    if (!twoPlayers) {
      this._set(this.el.mMode, 'mMode', game.mode === 'practice' ? 'Practice' : 'Solo');
      this._set(this.el.mTarget, 'mTarget', game.hasTimer ? String(game.targetScore) : 'None');
      this._set(this.el.mTime, 'mTime', game.hasTimer ? `${game.missionSeconds} s` : 'None');
      this._set(this.el.mSeed, 'mSeed', game.seedText);
      this._set(this.el.mInput, 'mInput', game.input?.label === 'keyboard' ? 'Keyboard' : (game.input?.label ?? 'None'));
      this._set(this.el.mNote, 'mNote', game.mode === 'practice'
        ? 'Asteroids score 10 and moving drones score 20. Collisions are counted but cost no hull here.'
        : `Reach ${game.targetScore} points before time expires. Gates score 5, asteroids 10 and drones 20. Red plasma and solid hazards cost one heart.`);
    }
  }

  update(game) {
    this._set(this.el.score, 'score', String(game.teamScore));
    if (game.hasTimer) {
      const t = Math.max(0, game.timeLeft);
      const mm = Math.floor(t / 60);
      const ss = Math.floor(t % 60).toString().padStart(2, '0');
      this._set(this.el.timer, 'timer', `${mm}:${ss}`);
      this.el.timer.classList.toggle('low', t <= 10);
    }

    game.players.forEach((pl, i) => {
      const p = this.panels[i];
      if (!p || p.root.hidden) return;

      for (let h = 0; h < RULES.hull; h++) {
        const halves = Math.max(0, Math.min(2, pl.hull - 2 * h));
        const fill = halves / 2;
        const key = `h${i}${h}`;
        if (this.cache.get(key) !== fill) {
          this.cache.set(key, fill);
          p.hearts[h].style.setProperty('--fill', String(fill));
        }
      }

      const bank = Math.max(-STEER.maxBankDeg, Math.min(STEER.maxBankDeg, pl.bank));
      const nx = (bank / STEER.maxBankDeg) * (p.width / 2);
      p.needle.style.setProperty('--nx', `${nx.toFixed(1)}px`);
      this._set(p.bankVal, `bank${i}`, `${bank >= 0 ? '+' : ''}${bank.toFixed(1)}°`);

      p.root.classList.toggle('firing', pl.fireHeld && game.state === 'playing' && pl.alive);
      p.root.classList.toggle('dead', !pl.alive);
      const state = !pl.alive ? 'ELIMINATED'
        : game.state === 'countdown' ? (game.waitingForRelease ? 'RELEASE FIRE' : 'STAND BY')
        : game.state === 'paused' ? 'HOLD'
        : pl.invuln > 0 ? 'SHIELDED' : 'ACTIVE';
      this._set(p.state, `state${i}`, state);

      this._set(p.score, `sc${i}`, String(pl.stats.score));
      this._set(p.hits, `hi${i}`, String(pl.stats.hits));
      this._set(p.gates, `ga${i}`, String(pl.stats.gates));
      this._set(p.shots, `sh${i}`, String(pl.stats.shots));
    });
  }
}

export { PLAYER_NAMES };
