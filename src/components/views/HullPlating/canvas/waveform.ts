// Pure maths for the effectiveness waveform. The trace tells a small story:
// it grows busier and more turbulent while the armor calibrates (peaking
// around 70% effective), then settles into a clean, steady sine wave once the
// armor is fully effective. A hit the armor can't fully stop knocks it down
// and scrambles it for a moment.
import {clamp01} from "./simulation";

// Effectiveness at which the waveform is at its most turbulent
export const WAVE_PEAK = 0.7;
// Seconds for a hit's disturbance to fade out
export const WAVE_RECOVERY = 3;

const smooth = (v: number) => {
  const x = clamp01(v);
  return x * x * (3 - 2 * x);
};

export interface WaveShape {
  // 0..1 height of the wave
  amplitude: number;
  // 0..1 how turbulent the wave is (extra harmonics, faster motion)
  chaos: number;
  // 0..1 how settled the wave is (1 = a pure sine)
  stable: number;
}

export function waveShape(level: number, disturbance = 0): WaveShape {
  const l = clamp01(level);
  const d = clamp01(disturbance);
  const rising = smooth(l / WAVE_PEAK);
  const settling = smooth((l - WAVE_PEAK) / (1 - WAVE_PEAK));
  const chaos = Math.max(rising * (1 - settling), d);
  return {
    // A hit that gets through drops the wave as well as scrambling it
    amplitude: l * (1 - 0.7 * d),
    chaos,
    stable: settling * (1 - d),
  };
}

// How fast the wave travels, in radians per second
export function waveSpeed(shape: WaveShape) {
  return 2 + shape.chaos * 7;
}

// Height of the trace (-1..1) at horizontal position u (0..1).
export function waveSample(u: number, phase: number, shape: WaveShape) {
  const {amplitude, chaos, stable} = shape;
  const clean = Math.sin(u * 14 - phase);
  const rough =
    0.55 * Math.sin(u * 31 + phase * 1.7) +
    0.4 * Math.sin(u * 53 - phase * 2.9) +
    0.3 * Math.sin(u * 89 + phase * 4.3);
  // While unsettled the trace is pinned at both ends; a stable wave runs
  // edge to edge at a constant height
  const taper = Math.sin(clamp01(u) * Math.PI);
  const envelope = taper + (1 - taper) * stable;
  const mixed = clean * (1 - 0.4 * chaos) + rough * chaos * 0.75;
  return Math.max(-1, Math.min(1, amplitude * envelope * mixed));
}

// How badly a hit got through the plating, 0..1 — mirrors hitLeak on the
// server, where a hit stopped no better than balanced plating (80%) counts
// fully and a fully stopped hit counts for nothing.
export function hitLeak(absorbed: number) {
  return clamp01((1 - clamp01(absorbed)) / 0.2);
}
