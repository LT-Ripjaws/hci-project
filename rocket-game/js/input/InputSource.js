// Every input source (keyboard now, Web Serial later) implements this shape.
// The game samples getState() exactly once per simulation step.
//
//   { bank: number,     // degrees relative to neutral, positive = right bank
//     fire: boolean,    // trigger currently held after debounce
//     healthy: boolean } // false means this player's input cannot be trusted

export class InputSource {
  get label() {
    return 'none';
  }

  // Called once per simulation step before sampling.
  update(_dt) {}

  getState(_playerIndex) {
    return { bank: 0, fire: false, healthy: false };
  }
}

export const EMPTY_STATE = Object.freeze({ bank: 0, fire: false, healthy: false });
