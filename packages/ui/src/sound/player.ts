/**
 * Plays the engine's sound recipes with Web Audio (PRD §10). One ringing sound at a time, looping, its volume
 * rising over 30 s (PRD §9.2).
 */
import { rampVolume, soundFor, type Sound } from '@alarmony/core';
import { every } from '../schedule.ts';

/** How often the loop schedules its next cycle and updates the ramp. */
const TICK_MS = 250;
/** Notes are scheduled this far ahead so a busy page doesn't make them stutter. */
const LOOKAHEAD_S = 0.5;
const ATTACK_S = 0.01;

export class SoundPlayer {
  #ctx: AudioContext | null = null;
  #stop: (() => void) | null = null;

  #context(): AudioContext | null {
    if (typeof AudioContext === 'undefined') return null;
    this.#ctx ??= new AudioContext();
    return this.#ctx;
  }

  /** False until the page may play sound (a browser needs a click first, PRD §9.4). */
  get allowed(): boolean {
    return this.#ctx?.state === 'running';
  }

  /** A context that won't resume stays silent; `allowed` stays false, so the ringing sheet says to click. */
  #resume(ctx: AudioContext | null): void {
    ctx?.resume().catch((e: unknown) => console.warn('Sound could not start:', e));
  }

  /** Call from a click: lets a browser play sound from then on. */
  unlock(): void {
    this.#resume(this.#context());
  }

  #cycle(ctx: AudioContext, out: AudioNode, sound: Sound, start: number): void {
    for (const note of sound.notes) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = note.wave;
      osc.frequency.value = note.freq;
      const t = start + note.at;
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(note.gain, t + ATTACK_S);
      env.gain.exponentialRampToValueAtTime(0.0001, t + note.length);
      osc.connect(env).connect(out);
      osc.start(t);
      osc.stop(t + note.length + 0.05);
    }
  }

  /** Plays one cycle at `volume`: the preview when a sound is picked (PRD §10). */
  preview(id: string, volume: number): void {
    const ctx = this.#context();
    if (!ctx) return;
    const out = ctx.createGain();
    out.gain.value = volume;
    out.connect(ctx.destination);
    this.#cycle(ctx, out, soundFor(id), ctx.currentTime + 0.05);
  }

  /** Starts ringing `id`, replacing any sound already ringing. */
  ring(id: string, volume: number): void {
    this.stop();
    const ctx = this.#context();
    if (!ctx) return;
    this.#resume(ctx);
    const sound = soundFor(id);
    const out = ctx.createGain();
    out.connect(ctx.destination);
    const begun = ctx.currentTime;
    let next = begun + 0.05;
    const tick = () => {
      out.gain.setTargetAtTime(rampVolume(volume, (ctx.currentTime - begun) * 1000), ctx.currentTime, 0.1);
      while (next < ctx.currentTime + LOOKAHEAD_S) {
        this.#cycle(ctx, out, sound, next);
        next += sound.cycle;
      }
    };
    out.gain.value = rampVolume(volume, 0);
    tick();
    const cancel = every(TICK_MS, tick);
    this.#stop = () => {
      cancel();
      out.gain.cancelScheduledValues(ctx.currentTime);
      out.gain.setValueAtTime(0, ctx.currentTime);
      out.disconnect();
    };
  }

  stop(): void {
    this.#stop?.();
    this.#stop = null;
  }

  get ringing(): boolean {
    return this.#stop !== null;
  }
}
