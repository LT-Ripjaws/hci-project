// Hardware feedback interface. Phase 7A implements this over Web Serial with
// the H/B/X/M command set. Until then the game talks to the no-op sink.

export class FeedbackSink {
  hit(_playerIndex) {}      // H,<n>
  countdownBeep() {}        // B,1
  endBeep() {}              // B,2
  clear() {}                // X
  setMuted(_muted) {}       // M,1 / M,0
}

export class NoopFeedback extends FeedbackSink {}

export class SerialFeedback extends FeedbackSink {
  constructor(serialInput) {
    super();
    this.serial = serialInput;
  }

  hit(playerIndex) { this.serial.writeLine(`H,${playerIndex + 1}\n`); }
  countdownBeep() { this.serial.writeLine('B,1\n'); }
  endBeep() { this.serial.writeLine('B,2\n'); }
  clear() { this.serial.writeLine('X\n'); }
  setMuted(muted) { this.serial.writeLine(`M,${muted ? 1 : 0}\n`); }
}
