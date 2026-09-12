import { RULES, PLAYER_NAMES } from './core/constants.js';
import { randomSeedText } from './core/rng.js';
import { FixedLoop } from './core/loop.js';
import { KeyboardInput } from './input/KeyboardInput.js';
import { SerialInput } from './input/SerialInput.js';
import { Game } from './sim/Game.js';
import { Renderer } from './render/Renderer.js';
import { Sfx } from './audio/Sfx.js';
import { Music } from './audio/Music.js';
import { SerialFeedback } from './feedback/FeedbackSink.js';
import { Hud } from './ui/Hud.js';

const $ = (id) => document.getElementById(id);

const canvas = $('game');
const renderer = new Renderer(canvas);
const hud = new Hud(document);
const sfx = new Sfx();
const keyboard = new KeyboardInput(window);
keyboard.enabled = false; // only while a round is on screen
const serial = new SerialInput({ onChange: () => updateControllerUi() });
const feedback = new SerialFeedback(serial);

let game = null;
let lastConfig = null;
let inputMode = 'keyboard';

// ---- options (persisted) ---------------------------------------------------

const OPTIONS_KEY = 'twinflare.options';
const options = { targetScore: RULES.targetScore, seed: '', sound: true, music: true };

function loadOptions() {
  try {
    const raw = localStorage.getItem(OPTIONS_KEY);
    if (raw) Object.assign(options, JSON.parse(raw));
  } catch { /* storage unavailable: keep defaults */ }
  options.targetScore = Math.max(10, parseInt(options.targetScore, 10) || RULES.targetScore);
  options.seed = String(options.seed || '').toUpperCase().slice(0, 16);
  options.sound = options.sound !== false;
  options.music = options.music !== false;
}

function saveOptions() {
  try { localStorage.setItem(OPTIONS_KEY, JSON.stringify(options)); } catch { /* ignore */ }
}

function applyOptions() {
  sfx.setMuted(!options.sound);
  feedback.setMuted(!options.sound);
  $('btn-sound').textContent = options.sound ? 'SOUND ON' : 'SOUND OFF';
  $('btn-sound').setAttribute('aria-pressed', String(!options.sound));
  $('opt-sound').setAttribute('aria-checked', String(options.sound));
  $('opt-music').setAttribute('aria-checked', String(options.music));
  syncMusic();
  $('opt-target').value = String(options.targetScore);
  $('opt-seed').value = options.seed;
  $('st-target').textContent = String(options.targetScore);
  $('st-seed').textContent = options.seed || 'Random';
  $('st-seed').classList.toggle('dim', !options.seed);
}

// ---- menu music ------------------------------------------------------------
// Browsers block audio until the first user gesture, so the theme starts on the
// first click or key press while the menu is showing.

let music = null;

function musicWanted() {
  return !game && options.music && options.sound && !$('menu').hidden;
}

function syncMusic() {
  if (musicWanted()) {
    if (!sfx.ctx && !userGestureSeen) return; // wait for a gesture
    const ctx = sfx.unlock();
    if (!ctx) return;
    if (!music) music = new Music(ctx, sfx.master);
    music.start();
  } else if (music) {
    music.stop();
  }
}

let userGestureSeen = false;
function onFirstGesture() {
  userGestureSeen = true;
  syncMusic();
}
document.addEventListener('pointerdown', onFirstGesture, { once: true });
document.addEventListener('keydown', onFirstGesture, { once: true });

// ---- menu panels ---------------------------------------------------------

const panels = { nav: $('nav-panel'), options: $('options-panel'), controls: $('controls-panel') };

function showPanel(name) {
  for (const [k, el] of Object.entries(panels)) el.hidden = k !== name;
  const first = panels[name].querySelector('button, input');
  if (first) first.focus({ preventScroll: true });
}

// ---- Arduino connection and calibration ----------------------------------

function serialMessage() {
  if (!serial.supported) return 'Web Serial is unavailable. Use desktop Chrome or Edge from localhost.';
  if (serial.calibration) return serial.calibration.message;
  if (serial.lastError) return serial.lastError;
  if (serial.connected && serial.lastRecord && !serial.isFresh()) return 'Arduino data is stale. Check the cable and firmware output.';
  if (serial.isReady(2)) return 'Both rockets calibrated. Solo and Co-op are ready.';
  if (serial.isReady(1)) return 'Player 1 calibrated. Solo is ready; calibrate P2 for Co-op.';
  if (serial.connected && serial.lastRecord) return 'Hold the rocket level and still, then choose Calibrate.';
  if (serial.connected) return 'Connected. Waiting for R1 data from the Arduino.';
  return 'Keyboard is ready. Connect the Arduino when its firmware is loaded.';
}

let calibrationErrorAt = 0;

function updateControllerUi() {
  // A calibration refusal is transient: drop it once the sensors are healthy again or after 5 s.
  if (calibrationErrorAt && serial.lastError && (performance.now() - calibrationErrorAt > 5000 || !calibrationBlocker(serial.suggestedCalibrationCount()))) {
    serial.lastError = '';
    calibrationErrorAt = 0;
  }
  const summary = serial.summary();
  $('st-serial').textContent = summary;
  $('st-serial').classList.toggle('dim', !serial.connected);
  $('st-input').textContent = inputMode === 'serial' ? 'Arduino' : 'Keyboard';

  $('btn-connect').textContent = serial.connected ? 'DISCONNECT' : 'CONNECT ARDUINO';
  $('btn-connect').disabled = !serial.supported;
  $('btn-calibrate').disabled = !serial.connected || !serial.lastRecord || !!serial.calibration;
  $('btn-input-source').textContent = inputMode === 'serial' ? 'USE KEYBOARD' : 'USE ARDUINO';
  $('btn-input-source').disabled = inputMode === 'keyboard' && !serial.isReady(1);

  const message = serialMessage();
  const messageEl = $('serial-message');
  messageEl.textContent = message;
  messageEl.classList.toggle('bad', !!serial.lastError || (serial.connected && serial.lastRecord && !serial.isFresh()));
  messageEl.classList.toggle('ok', serial.isReady(inputMode === 'serial' ? 1 : 2));

  const serialGame = game?.input === serial;
  $('serial-recovery').hidden = !serialGame;
  if (serialGame) {
    $('pause-serial-status').textContent = message;
    $('btn-pause-connect').textContent = serial.connected ? 'DISCONNECT' : 'RECONNECT';
    $('btn-pause-calibrate').disabled = !serial.connected || !serial.lastRecord || !!serial.calibration;
    $('btn-resume').disabled = !serial.isReady(game.playerCount);
  } else {
    $('btn-resume').disabled = false;
  }
}

async function toggleSerialConnection() {
  try {
    if (serial.connected) {
      await serial.disconnect();
    } else {
      await serial.connect();
      inputMode = 'serial';
      keyboard.releaseAll();
      await serial.writeLine('X\n');
      await serial.writeLine(`M,${options.sound ? 0 : 1}\n`);
    }
  } catch (error) {
    serial.lastError = error?.name === 'NotFoundError'
      ? 'No serial port was selected.'
      : `Could not open Arduino: ${error.message || error}`;
  }
  updateControllerUi();
}

function calibrationBlocker(required) {
  if (!serial.connected || !serial.lastRecord) return 'Connect the Arduino and wait for R1 data before calibrating.';
  if (!serial.isFresh()) return 'Arduino data is stale. Check the cable and firmware output.';
  const names = { 0: 'still starting', 2: 'reporting a fault' };
  for (let i = 0; i < required; i++) {
    const health = serial.lastRecord.players[i].health;
    if (health !== 1) return `Player ${i + 1} sensor is ${names[health] ?? 'not healthy'}. Keep the rockets still and try again in a few seconds.`;
  }
  return '';
}

function calibrateControllers() {
  const required = game?.input === serial ? game.playerCount : serial.suggestedCalibrationCount();
  if (!serial.startCalibration(required)) {
    serial.lastError = calibrationBlocker(required) || 'Calibration could not start. Try again.';
    calibrationErrorAt = performance.now();
  }
  updateControllerUi();
}

$('btn-connect').addEventListener('click', toggleSerialConnection);
$('btn-pause-connect').addEventListener('click', toggleSerialConnection);
$('btn-calibrate').addEventListener('click', calibrateControllers);
$('btn-pause-calibrate').addEventListener('click', calibrateControllers);
$('btn-input-source').addEventListener('click', () => {
  inputMode = inputMode === 'serial' ? 'keyboard' : 'serial';
  keyboard.releaseAll();
  serial.lastError = '';
  updateControllerUi();
});

function showScreen(name) {
  const menu = $('menu');
  const gameScreen = $('game-screen');
  if (name === 'menu') {
    gameScreen.classList.remove('live');
    gameScreen.hidden = true;
    menu.hidden = false;
    menu.classList.remove('leaving');
    showPanel('nav');
  } else {
    menu.classList.add('leaving');
    gameScreen.hidden = false;
    requestAnimationFrame(() => gameScreen.classList.add('live'));
    setTimeout(() => { if (game) menu.hidden = true; }, 500);
  }
}

$('nav-panel').addEventListener('click', (e) => {
  const item = e.target.closest('.nav-item');
  if (!item) return;
  const action = item.dataset.action;
  if (action === 'options' || action === 'controls') { sfx.unlock(); showPanel(action); return; }
  startGame(buildConfig(action));
});

$('options-panel').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.dataset.step) {
    const v = Math.max(10, (parseInt($('opt-target').value, 10) || RULES.targetScore) + Number(btn.dataset.step));
    $('opt-target').value = String(v);
  } else if (btn.id === 'opt-sound') {
    options.sound = btn.getAttribute('aria-checked') !== 'true';
    applyOptions();
  } else if (btn.id === 'opt-music') {
    options.music = btn.getAttribute('aria-checked') !== 'true';
    saveOptions();
    applyOptions();
  } else if (btn.dataset.action === 'save') {
    options.targetScore = Math.max(10, parseInt($('opt-target').value, 10) || RULES.targetScore);
    options.seed = $('opt-seed').value.trim().toUpperCase().slice(0, 16);
    saveOptions();
    applyOptions();
    showPanel('nav');
  } else if (btn.dataset.action === 'back') {
    applyOptions(); // discard unsaved edits
    showPanel('nav');
  }
});

$('controls-panel').addEventListener('click', (e) => {
  if (e.target.closest('[data-action="back"]')) showPanel('nav');
});

$('btn-sound').addEventListener('click', () => {
  options.sound = !options.sound;
  saveOptions();
  applyOptions();
  sfx.unlock();
});

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
}
$('btn-fullscreen').addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', () => {
  $('btn-fullscreen').textContent = document.fullscreenElement ? 'EXIT FULLSCREEN' : 'FULLSCREEN';
});

// Arrow keys move through the mission list like a console menu.
document.addEventListener('keydown', (e) => {
  if (game) return;
  if (e.code === 'KeyF') { toggleFullscreen(); return; }
  if (e.code === 'Escape' && panels.nav.hidden) { applyOptions(); showPanel('nav'); return; }
  if (!panels.nav.hidden && (e.code === 'ArrowDown' || e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'KeyS')) {
    const items = [...panels.nav.querySelectorAll('.nav-item')];
    const cur = items.indexOf(document.activeElement);
    const dir = (e.code === 'ArrowDown' || e.code === 'KeyS') ? 1 : -1;
    const next = cur < 0 ? (dir > 0 ? 0 : items.length - 1) : (cur + dir + items.length) % items.length;
    items[next].focus();
    e.preventDefault();
  }
});

// ---- game lifecycle --------------------------------------------------------

function buildConfig(mode) {
  return {
    mode,
    playerCount: mode === 'coop' ? 2 : 1,
    seed: options.seed || randomSeedText(),
    targetScore: options.targetScore,
  };
}

function startGame(config) {
  const activeInput = inputMode === 'serial' ? serial : keyboard;
  if (activeInput === serial && !serial.isReady(config.playerCount)) {
    serial.lastError = config.playerCount === 2
      ? 'Co-op needs two healthy calibrated controllers.'
      : 'This mode needs Player 1 connected and calibrated.';
    updateControllerUi();
    return;
  }
  lastConfig = config;
  sfx.unlock();
  keyboard.releaseAll();
  keyboard.enabled = activeInput === keyboard;
  // A blank seed option means a fresh random course on every restart too.
  const seed = options.seed || randomSeedText();
  game = new Game({ ...config, seed, input: activeInput });
  feedback.clear();
  feedback.setMuted(!options.sound);
  hud.bind(game);
  hideDialogs();
  showScreen('game');
  syncMusic();
  renderer.draw(game, 0);
  hud.update(game);
}

function quitToMenu() {
  game = null;
  keyboard.enabled = false;
  keyboard.releaseAll();
  feedback.clear();
  hideDialogs();
  showScreen('menu');
  syncMusic();
}

function hideDialogs() {
  $('pause').hidden = true;
  $('results').hidden = true;
}

function togglePause(reason = 'user') {
  if (!game) return;
  if (game.state === 'paused') {
    if (game.input === serial && !serial.isReady(game.playerCount)) {
      $('pause-reason').textContent = reasonText('controller');
      updateControllerUi();
      return;
    }
    game.resume();
    $('pause').hidden = true;
  } else if (game.pause(reason)) {
    feedback.clear();
    $('pause-reason').textContent = reasonText(reason);
    $('pause').hidden = false;
    $('btn-resume').focus({ preventScroll: true });
  }
}

function reasonText(reason) {
  switch (reason) {
    case 'hidden': return 'The tab was hidden. Release all controls, then resume.';
    case 'stall': return 'The browser stalled. Release all controls, then resume.';
    case 'controller': return 'Controller input is not ready. Reconnect if needed, calibrate while holding level, then resume.';
    default: return 'Release all controls, then resume. A short countdown follows.';
  }
}

$('btn-pause').addEventListener('click', () => togglePause('user'));
$('btn-resume').addEventListener('click', () => togglePause());
$('btn-restart').addEventListener('click', () => startGame(lastConfig));
$('btn-quit').addEventListener('click', quitToMenu);
$('btn-again').addEventListener('click', () => startGame(lastConfig));
$('btn-menu').addEventListener('click', quitToMenu);

window.addEventListener('keydown', (e) => {
  if (!game) return;
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (game.state !== 'results') { e.preventDefault(); togglePause('user'); }
  } else if (e.code === 'KeyF') {
    toggleFullscreen();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game) togglePause('hidden');
});

// ---- results ------------------------------------------------------------

function formatHearts(halves) {
  const whole = Math.floor(halves / 2);
  return halves % 2 ? `${whole}½` : String(whole);
}

function showResults(r) {
  const title = r.mode === 'practice'
    ? 'Practice ended'
    : r.success ? 'Mission complete' : (r.reason === 'eliminated' ? 'All rockets lost' : 'Target not reached');
  $('results-title').textContent = title;
  $('results-title').className = r.success === null ? '' : (r.success ? 'ok' : 'bad');
  const team = r.mode === 'practice' ? `Score ${r.teamScore}` : `Team score ${r.teamScore} of ${r.targetScore}`;
  $('results-sub').textContent = `${team}. ${Math.round(r.elapsed)} seconds. Course ${r.seed}. Input ${r.input}.`;

  const table = $('results-table');
  table.replaceChildren();
  const head = table.insertRow();
  for (const h of ['Player', 'Score', 'Hearts', 'Hits taken', 'Crashes', 'Gates', 'Shots', 'Kills']) {
    const th = document.createElement('th');
    th.textContent = h;
    head.appendChild(th);
  }
  for (const p of r.players) {
    const row = table.insertRow();
    const cells = [
      `${PLAYER_NAMES[p.index]}${p.alive ? '' : '  LOST'}`,
      p.score, formatHearts(p.hull), p.collisions, p.crashes, p.gates, p.shots, p.hits,
    ];
    cells.forEach((v, i) => {
      const td = row.insertCell();
      td.textContent = String(v);
      if (i === 0) td.className = `p${p.index + 1}`;
    });
  }
  $('results').hidden = false;
  $('btn-again').focus({ preventScroll: true });
}

// ---- event routing ------------------------------------------------------

function handleEvents() {
  for (const ev of game.drainEvents()) {
    renderer.handleEvent(ev, game);
    switch (ev.type) {
      case 'shot': sfx.shot(); break;
      case 'targetDestroyed': sfx.target(); break;
      case 'droneDestroyed': sfx.drone(); break;
      case 'enemyShot': sfx.enemyShot(); break;
      case 'intercept': sfx.intercept(); break;
      case 'gate': sfx.gate(); break;
      case 'shotAbsorbed': sfx.absorbed(); break;
      case 'hit': sfx.hit(); feedback.hit(ev.player); break;
      case 'crash': sfx.crash(); for (const i of ev.players) feedback.hit(i); break;
      case 'eliminated': sfx.eliminated(); break;
      case 'countdownBeep': sfx.countdown(); feedback.countdownBeep(); break;
      case 'go': sfx.go(); break;
      case 'end':
        feedback.clear();
        sfx.end(ev.success);
        if (ev.success !== null) feedback.endBeep();
        showResults(game.results);
        break;
      default: break;
    }
  }
}

// ---- loop ---------------------------------------------------------------

const loop = new FixedLoop({
  update(dt) {
    if (!game) return;
    if (game.input === serial
      && (game.state === 'playing' || game.state === 'countdown')
      && !serial.isReady(game.playerCount)) {
      togglePause('controller');
      return;
    }
    game.step(dt);
    handleEvents();
  },
  render(_alpha, dt) {
    if (!game) return;
    renderer.draw(game, dt);
    hud.update(game);
  },
  onStall() {
    if (window.rocketDebug?.noStall) return;
    if (game && game.state === 'playing') togglePause('stall');
  },
});

loadOptions();
applyOptions();
updateControllerUi();
setInterval(updateControllerUi, 100);
showScreen('menu');
loop.start();

// Debug hook for manual testing from the console (no effect on gameplay).
window.rocketDebug = {
  noStall: false, // set true when stepping manually from the console
  get game() { return game; },
  get keyboard() { return keyboard; },
  get serial() { return serial; },
  get music() { return music; },
  get audioState() { return sfx.ctx ? sfx.ctx.state : 'no-context'; },
  step(n = 1) {
    for (let i = 0; i < n && game; i++) {
      game.step(1 / 60);
      handleEvents();
    }
    if (game) { renderer.draw(game, 1 / 60); hud.update(game); }
  },
};
