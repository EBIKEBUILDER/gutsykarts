// Procedural Web Audio API Synthesized Arcade Kart Racing Soundtrack & SFX
// 100% procedural synthesis — zero external audio binary files required.

const NOTE_FREQS: Record<string, number> = {
  C2: 65.41,
  D2: 73.42,
  E2: 82.41,
  F2: 87.31,
  G2: 98.0,
  A2: 110.0,
  Bb2: 116.54,
  B2: 123.47,
  C3: 130.81,
  D3: 146.83,
  E3: 164.81,
  F3: 174.61,
  G3: 196.0,
  A3: 220.0,
  Bb3: 233.08,
  B3: 246.94,
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  F4: 349.23,
  G4: 392.0,
  A4: 440.0,
  Bb4: 466.16,
  B4: 493.88,
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  F5: 698.46,
  G5: 783.99,
  A5: 880.0,
};

interface BarPattern {
  chord: string[];
  bass: Array<string | null>; // 16 sixteenth-note steps
  lead: Array<{ note: string; len: number } | null>; // 16 sixteenth-note steps
}

// 8-bar lighthearted upbeat jazz-pop kart circuit progression (Fmaj7 - G7 - Em7 - Am7 - Dm7 - G7 - Cmaj9 - C7)
const PROGRESSION: BarPattern[] = [
  // Bar 1: Fmaj7
  {
    chord: ["F3", "A3", "C4", "E4"],
    bass: ["F2", null, "F2", null, "C3", null, "D3", null, "F2", null, "C3", null, "D3", null, "E3", null],
    lead: [
      { note: "A4", len: 2 }, null,
      { note: "C5", len: 2 }, null,
      { note: "E5", len: 3 }, null, null,
      { note: "D5", len: 1 },
      { note: "C5", len: 2 }, null,
      { note: "A4", len: 2 }, null,
      { note: "G4", len: 3 }, null, null, null,
    ],
  },
  // Bar 2: G7
  {
    chord: ["G3", "B3", "D4", "F4"],
    bass: ["G2", null, "G2", null, "D3", null, "E3", null, "G2", null, "D3", null, "F3", null, "D3", null],
    lead: [
      { note: "B4", len: 2 }, null,
      { note: "D5", len: 2 }, null,
      { note: "G5", len: 3 }, null, null,
      { note: "F5", len: 1 },
      { note: "D5", len: 2 }, null,
      { note: "B4", len: 2 }, null,
      { note: "C5", len: 3 }, null, null, null,
    ],
  },
  // Bar 3: Em7
  {
    chord: ["E3", "G3", "B3", "D4"],
    bass: ["E2", null, "E2", null, "B2", null, "D3", null, "E2", null, "B2", null, "D3", null, "Eb2" in NOTE_FREQS ? "E2" : "E2", null],
    lead: [
      { note: "E5", len: 3 }, null, null,
      { note: "D5", len: 1 },
      { note: "B4", len: 2 }, null,
      { note: "G4", len: 2 }, null,
      { note: "A4", len: 2 }, null,
      { note: "B4", len: 2 }, null,
      { note: "D5", len: 3 }, null, null, null,
    ],
  },
  // Bar 4: Am7
  {
    chord: ["A3", "C4", "E4", "G4"],
    bass: ["A2", null, "A2", null, "E3", null, "G3", null, "A2", null, "G2", null, "E2", null, "G2", null],
    lead: [
      { note: "C5", len: 4 }, null, null, null,
      { note: "A4", len: 2 }, null,
      { note: "G4", len: 2 }, null,
      { note: "E4", len: 3 }, null, null,
      { note: "G4", len: 2 }, null,
      { note: "A4", len: 2 }, null, null,
    ],
  },
  // Bar 5: Dm7
  {
    chord: ["D3", "F3", "A3", "C4"],
    bass: ["D2", null, "D2", null, "A2", null, "C3", null, "D2", null, "A2", null, "C3", null, "D3", null],
    lead: [
      { note: "F4", len: 2 }, null,
      { note: "A4", len: 2 }, null,
      { note: "D5", len: 3 }, null, null,
      { note: "E5", len: 1 },
      { note: "F5", len: 2 }, null,
      { note: "D5", len: 2 }, null,
      { note: "C5", len: 3 }, null, null, null,
    ],
  },
  // Bar 6: G7
  {
    chord: ["G3", "B3", "D4", "F4"],
    bass: ["G2", null, "G2", null, "D3", null, "F3", null, "G2", null, "D3", null, "E3", null, "F3", null],
    lead: [
      { note: "B4", len: 2 }, null,
      { note: "D5", len: 2 }, null,
      { note: "G5", len: 2 }, null,
      { note: "F5", len: 2 }, null,
      { note: "E5", len: 2 }, null,
      { note: "D5", len: 2 }, null,
      { note: "B4", len: 3 }, null, null, null,
    ],
  },
  // Bar 7: Cmaj7
  {
    chord: ["C3", "E3", "G3", "B3"],
    bass: ["C3", null, "C3", null, "G2", null, "A2", null, "C3", null, "G2", null, "A2", null, "B2", null],
    lead: [
      { note: "C5", len: 3 }, null, null,
      { note: "E5", len: 1 },
      { note: "G5", len: 4 }, null, null, null,
      { note: "E5", len: 2 }, null,
      { note: "D5", len: 2 }, null,
      { note: "C5", len: 3 }, null, null, null,
    ],
  },
  // Bar 8: C7 turnaround
  {
    chord: ["C3", "E3", "G3", "Bb3"],
    bass: ["C3", null, "G2", null, "Bb2", null, "B2", null, "C3", null, "D3", null, "E3", null, "G3", null],
    lead: [
      { note: "Bb4", len: 2 }, null,
      { note: "A4", len: 2 }, null,
      { note: "G4", len: 2 }, null,
      { note: "A4", len: 2 }, null,
      { note: "Bb4", len: 2 }, null,
      { note: "C5", len: 2 }, null,
      { note: "D5", len: 3 }, null, null, null,
    ],
  },
];

export class SoundtrackManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private timerId: number | null = null;
  private isPlaying = false;
  private isMuted = false;
  private tempoBpm = 128;
  private tempoMultiplier = 1.0;

  private currentStep = 0; // 0..127 (8 bars * 16 steps)
  private nextNoteTime = 0;

  private ensureContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.isMuted ? 0 : 0.22;
      this.masterGain.connect(this.ctx.destination);
      this.noiseBuffer = this.createNoiseBuffer(this.ctx);
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const bufferSize = ctx.sampleRate * 0.25;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  public start(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (this.isPlaying) return;

    this.isPlaying = true;
    this.currentStep = 0;
    this.nextNoteTime = ctx.currentTime + 0.06;

    const scheduleLoop = () => {
      if (!this.isPlaying || !this.ctx) return;
      while (this.nextNoteTime < this.ctx.currentTime + 0.14) {
        this.scheduleStep(this.currentStep, this.nextNoteTime);
        this.advanceStep();
      }
      this.timerId = window.setTimeout(scheduleLoop, 30);
    };

    scheduleLoop();
  }

  public stop(): void {
    this.isPlaying = false;
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        muted ? 0 : 0.22,
        this.ctx.currentTime,
        0.04
      );
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  public setTempoMultiplier(mult: number): void {
    this.tempoMultiplier = Math.max(0.8, Math.min(1.3, mult));
  }

  private getStepDurationSec(): number {
    const effectiveBpm = this.tempoBpm * this.tempoMultiplier;
    return 60 / effectiveBpm / 4; // 16th note
  }

  private advanceStep(): void {
    this.nextNoteTime += this.getStepDurationSec();
    this.currentStep = (this.currentStep + 1) % (PROGRESSION.length * 16);
  }

  private scheduleStep(stepIndex: number, time: number): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    const barIdx = Math.floor(stepIndex / 16) % PROGRESSION.length;
    const stepInBar = stepIndex % 16;
    const bar = PROGRESSION[barIdx];
    const stepDur = this.getStepDurationSec();

    // 1. Light Percussion Groove (Kick on 0, 6, 8; Snare on 4, 12; Crisp Hi-Hat on even/offbeats)
    if (stepInBar === 0 || stepInBar === 6 || stepInBar === 8) {
      this.triggerKick(time);
    }
    if (stepInBar === 4 || stepInBar === 12) {
      this.triggerSnare(time);
    }
    if (stepInBar % 2 === 0 || stepInBar === 15) {
      this.triggerHiHat(time, stepInBar % 4 === 2 ? 0.055 : 0.03);
    }

    // 2. Electric Piano Chord Stabs (steps 0, 3, 6, 10, 14)
    if (
      stepInBar === 0 ||
      stepInBar === 3 ||
      stepInBar === 6 ||
      stepInBar === 10 ||
      stepInBar === 14
    ) {
      const chordLen = stepInBar === 6 || stepInBar === 14 ? stepDur * 2.4 : stepDur * 1.6;
      this.triggerEPianoChord(bar.chord, time, chordLen);
    }

    // 3. Funky Synth Bassline
    const bassNote = bar.bass[stepInBar];
    if (bassNote && NOTE_FREQS[bassNote]) {
      this.triggerBass(NOTE_FREQS[bassNote], time, stepDur * 1.7);
    }

    // 4. Upbeat Arcade Lead Synth
    const leadEntry = bar.lead[stepInBar];
    if (leadEntry && NOTE_FREQS[leadEntry.note]) {
      this.triggerLead(
        NOTE_FREQS[leadEntry.note],
        time,
        leadEntry.len * stepDur * 0.92
      );
    }
  }

  private triggerEPianoChord(notes: string[], time: number, duration: number): void {
    if (!this.ctx || !this.masterGain) return;
    for (const n of notes) {
      const freq = NOTE_FREQS[n];
      if (!freq) continue;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, time);

      gain.gain.setValueAtTime(0.001, time);
      gain.gain.linearRampToValueAtTime(0.045, time + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(time);
      osc.stop(time + duration + 0.02);
    }
  }

  private triggerBass(freq: number, time: number, duration: number): void {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(freq, time);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(620, time);
    filter.frequency.exponentialRampToValueAtTime(190, time + duration);
    filter.Q.value = 3.0;

    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(0.14, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + duration + 0.02);
  }

  private triggerLead(freq: number, time: number, duration: number): void {
    if (!this.ctx || !this.masterGain) return;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc1.type = "triangle";
    osc2.type = "square";
    osc1.frequency.setValueAtTime(freq, time);
    osc2.frequency.setValueAtTime(freq * 1.003, time); // Warm chorus detune

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2100, time);

    const osc2Gain = this.ctx.createGain();
    osc2Gain.gain.value = 0.28;

    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(0.11, time + 0.018);
    gain.gain.setTargetAtTime(0.065, time + 0.04, 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc1.connect(filter);
    osc2.connect(osc2Gain);
    osc2Gain.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + duration + 0.02);
    osc2.stop(time + duration + 0.02);
  }

  private triggerKick(time: number): void {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(125, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.11);

    gain.gain.setValueAtTime(0.22, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.13);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.14);
  }

  private triggerSnare(time: number): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1400, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.09, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start(time);
    noise.stop(time + 0.11);
  }

  private triggerHiHat(time: number, peakGain: number): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.setValueAtTime(6500, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(peakGain, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.045);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start(time);
    noise.stop(time + 0.05);
  }

  public playBoostChime(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || this.isMuted) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(f, now + idx * 0.045);
      gain.gain.setValueAtTime(0.08, now + idx * 0.045);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.045 + 0.16);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now + idx * 0.045);
      osc.stop(now + idx * 0.045 + 0.18);
    });
  }

  public dispose(): void {
    this.stop();
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
