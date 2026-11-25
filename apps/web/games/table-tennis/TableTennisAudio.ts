import { gameAudio } from '@/lib/gameBridge';

export type TableSound = 'bounce' | 'hit' | 'swish' | 'net' | 'serve' | 'point' | 'lose' | 'matchWin' | 'matchLose' | 'ui';

let current: TableTennisAudio | null = null;

export function getTableAudio(): TableTennisAudio {
  current ??= new TableTennisAudio();
  return current;
}

export function disposeTableAudio(): void {
  current?.dispose();
  current = null;
}

export class TableTennisAudio {
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;

  play(kind: TableSound, power = 0.7): void {
    if (gameAudio.muted || typeof window === 'undefined') return;
    const ctx = this.ensure();
    if (!ctx || !this.noise) return;
    const now = ctx.currentTime;
    if (kind === 'bounce') this.noiseHit(ctx, now, 700 + Math.random() * 500, 0.045, 0.05);
    if (kind === 'hit') {
      this.noiseHit(ctx, now, 1400 + power * 900, 0.04, 0.045 + power * 0.02);
      this.tone(ctx, now, 180 + power * 90, 0.05, 'triangle', 0.03);
    }
    if (kind === 'swish') this.noiseHit(ctx, now, 900, 0.07, 0.02);
    if (kind === 'net') this.noiseHit(ctx, now, 320, 0.09, 0.04);
    if (kind === 'serve') this.tone(ctx, now, 420, 0.06, 'sine', 0.03);
    if (kind === 'point') {
      this.tone(ctx, now, 523, 0.09, 'sine', 0.04);
      this.tone(ctx, now + 0.08, 659, 0.12, 'sine', 0.04);
    }
    if (kind === 'lose') this.tone(ctx, now, 196, 0.14, 'sine', 0.04);
    if (kind === 'matchWin') [523, 659, 784].forEach((freq, index) => this.tone(ctx, now + index * 0.11, freq, 0.16, 'sine', 0.045));
    if (kind === 'matchLose') [311, 247, 196].forEach((freq, index) => this.tone(ctx, now + index * 0.12, freq, 0.18, 'sine', 0.04));
    if (kind === 'ui') this.tone(ctx, now, 740, 0.04, 'sine', 0.02);
  }

  dispose(): void {
    const ctx = this.ctx;
    this.ctx = null;
    this.noise = null;
    if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => undefined);
  }

  private ensure(): AudioContext | null {
    try {
      const Context = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) return null;
      this.ctx ??= new Context();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      if (!this.noise) {
        this.noise = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * 0.25), this.ctx.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  private noiseHit(ctx: AudioContext, when: number, frequency: number, duration: number, level: number): void {
    if (!this.noise) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start(when);
    source.stop(when + duration);
  }

  private tone(ctx: AudioContext, when: number, frequency: number, duration: number, type: OscillatorType, level: number): void {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(level, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(when);
    oscillator.stop(when + duration);
  }
}
