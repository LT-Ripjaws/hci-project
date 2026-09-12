// Tuning defaults from Rocket-Game-System-Design.md. Numbers are starting
// points, not validated difficulty levels.

// Widescreen playfield. The canvas is letterboxed to 16:9 and the rockets can
// use the full width in every mode.
export const WORLD = { W: 1600, H: 900 };
export const STEP = 1 / 60;

export const STEER = {
  deadZoneDeg: 2.5,   // no sideways motion inside this band
  fullDeg: 20,        // full sideways speed at this bank
  maxBankDeg: 30,     // clamp for the displayed bank
  maxSpeed: 760,      // px/s at full bank (about 2 s to cross the field)
};

export const ROCKET = { hitR: 20, y: WORLD.H - 120, w: 40, h: 70 };

export const SCROLL_SPEED = 260; // px/s, downward scenery motion

export const FIRE = { cooldown: 0.25, speed: 800, r: 4 };

export const RULES = {
  hull: 3,             // hearts shown on screen
  hullHalves: 6,       // health is tracked in half hearts
  hazardDamage: 2,     // a rock/block/gate bar costs one full heart
  crashDamage: 1,      // a rocket-to-rocket crash costs each rocket half a heart
  crashCooldown: 0.75, // seconds before the same rocket can take crash damage again
  invulnSeconds: 1.0,
  missionSeconds: 90,
  targetScore: 100,
  pointsTarget: 10,
  pointsDrone: 20,
  pointsGate: 5,
  countdownSeconds: 3,
  stallSeconds: 0.25, // a frame gap longer than this pauses the game
};

export const SPAWN = {
  interval: 250,
  spawnY: -80,
  rockR: 26,
  droneR: 27,
  droneShotSpeed: 430,
};

export const PLAYER_COLORS = ['#4da3ff', '#ff9440'];
export const PLAYER_NAMES = ['P1', 'P2'];
