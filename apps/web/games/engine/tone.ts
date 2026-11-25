export function playTone(audio: AudioContext | null, frequency: number, duration: number, muted: boolean): AudioContext | null {
  if (muted || typeof window === 'undefined') return audio;
  try {
    const Context = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return audio;
    const ctx = audio ?? new Context();
    if (ctx.state === 'suspended') void ctx.resume();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.035, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + duration);
    return ctx;
  } catch {
    return audio;
  }
}
