// Pure maths for the hull plating canvas — no DOM access, so it can be unit
// tested and reused by any screen that draws the plating.
import {
  EXTENT_BUCKETS,
  HIT_APPROACH,
  HIT_DURATION,
  Plate,
  PlateField,
  PlatingSim,
  PlatingState,
} from "./types";

// Seconds for plates to sweep fully on / off
const DEPLOY_TIME = 1.6;
const RETRACT_TIME = 0.9;
// Faster retract/reform used when only the mode changed
const RECONFIGURE_TIME = 0.55;
// Fraction of the hull that is mid-transition at once during a sweep
const SWEEP_BAND = 0.28;
// How quickly (per second) the reinforcement glow gathers or spreads out
const FOCUS_FLOW_RATE = 2.2;
// Hexagon radius in normalized ship space
const PLATE_SIZE = 0.045;

// Brightness of the reinforcement glow when balanced, and how tightly it
// gathers when fully reinforced
const GLOW_BALANCED = 0.28;
const GLOW_TIGHTNESS = 4.5;

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// Stable pseudo-random 0..1 value from two numbers
export function seeded(a: number, b: number) {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function normalizeBearing(bearing: number) {
  return ((bearing % 360) + 360) % 360;
}

// Bearings are relative to the ship image as it appears on screen, not to
// the ship: 0 is toward the top of the image, 90 toward its right, and so on
// clockwise. Simulators upload their top view in any orientation, so nothing
// here may assume which way the bow points.
export function bearingToVector(bearing: number) {
  const rad = (bearing * Math.PI) / 180;
  return {x: Math.sin(rad), y: -Math.cos(rad)};
}

export function vectorToBearing(x: number, y: number) {
  return normalizeBearing((Math.atan2(x, -y) * 180) / Math.PI);
}

// Signed shortest rotation from `from` to `to`, in degrees (-180..180)
export function bearingDiff(from: number, to: number) {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

export function createSim(state: PlatingState): PlatingSim {
  return {
    deploy: state.operational ? 1 : 0,
    shownMode: state.mode,
    effectiveness: state.operational ? clamp01(state.effectiveness) : 0,
    focusBearing: state.focusBearing ?? 0,
    focusStrength: state.focusBearing === null ? 0 : 1,
    focusFlow: 0,
    focusMotion: 0,
  };
}

// Advance the eased values toward the server state. Mutates and returns sim.
export function stepSim(sim: PlatingSim, state: PlatingState, dt: number) {
  // A mode change retracts the old plates before the new ones form
  const reconfiguring = state.operational && sim.shownMode !== state.mode;
  if (sim.deploy <= 0) {
    sim.shownMode = state.mode;
  }
  const target = state.operational && !reconfiguring ? 1 : 0;
  if (sim.deploy < target) {
    sim.deploy = Math.min(target, sim.deploy + dt / DEPLOY_TIME);
  } else if (sim.deploy > target) {
    const time = reconfiguring ? RECONFIGURE_TIME : RETRACT_TIME;
    sim.deploy = Math.max(target, sim.deploy - dt / time);
    if (sim.deploy <= 0) {
      sim.shownMode = state.mode;
    }
  }

  // The server ticks effectiveness once a second; ease so it reads as a ramp
  const ease = 1 - Math.exp(-dt * 2.5);
  const effectiveness = state.operational ? clamp01(state.effectiveness) : 0;
  sim.effectiveness += (effectiveness - sim.effectiveness) * ease;

  // The bearing tracks a dragging finger closely; the strength moves slowly
  // enough that the glow can be seen flowing around the ring.
  const focusEase = 1 - Math.exp(-dt * 6);
  const strengthEase = 1 - Math.exp(-dt * FOCUS_FLOW_RATE);
  const strengthBefore = sim.focusStrength;
  if (state.focusBearing === null) {
    sim.focusStrength += (0 - sim.focusStrength) * strengthEase;
    if (sim.focusStrength < 0.001) sim.focusStrength = 0;
  } else {
    if (sim.focusStrength < 0.02) {
      // Nothing visible to rotate from — start at the new bearing
      sim.focusBearing = state.focusBearing;
    } else {
      sim.focusBearing = normalizeBearing(
        sim.focusBearing +
          bearingDiff(sim.focusBearing, state.focusBearing) * focusEase,
      );
    }
    sim.focusStrength += (1 - sim.focusStrength) * strengthEase;
    if (sim.focusStrength > 0.999) sim.focusStrength = 1;
  }
  const velocity = dt > 0 ? (sim.focusStrength - strengthBefore) / dt : 0;
  sim.focusFlow += dt * (0.4 + velocity * 9);
  sim.focusMotion +=
    (clamp01(Math.abs(velocity) * 0.9) - sim.focusMotion) * focusEase;
  return sim;
}

// How formed (0..1) a plate is for a given sweep position. Plates near the
// center of the ship (order 0) form first and retract last.
export function plateForm(deploy: number, order: number) {
  return clamp01((deploy * (1 + SWEEP_BAND) - order) / SWEEP_BAND);
}

// Brightness (0..1) of the reinforcement glow at a point on the bearing ring.
// Balanced, the glow is an even, light band right around the ship; as the
// crew reinforces a side it drains from the far side and pools at the focus.
export function glowWeight(
  bearing: number,
  focusBearing: number,
  focusStrength: number,
) {
  const s = clamp01(focusStrength);
  const diff = (bearingDiff(focusBearing, bearing) * Math.PI) / 180;
  return (
    (GLOW_BALANCED + (1 - GLOW_BALANCED) * s) *
    Math.exp(GLOW_TIGHTNESS * s * (Math.cos(diff) - 1))
  );
}

// Plate thickness multiplier from reinforcement: 1.5 facing the focus,
// 0.5 on the far side, 1 everywhere when balanced.
export function focusWeight(
  plateBearing: number,
  focusBearing: number,
  focusStrength: number,
) {
  const diff = (bearingDiff(focusBearing, plateBearing) * Math.PI) / 180;
  return 1 + 0.5 * focusStrength * Math.cos(diff);
}

// Splits a hit's age into its approach (0..1) and impact (0..1) progress.
// impact is -1 until the hit reaches the hull.
export function hitPhase(ageSeconds: number) {
  if (ageSeconds < HIT_APPROACH) {
    return {approach: clamp01(ageSeconds / HIT_APPROACH), impact: -1};
  }
  return {
    approach: 1,
    impact: clamp01(
      (ageSeconds - HIT_APPROACH) / (HIT_DURATION - HIT_APPROACH),
    ),
  };
}

// Linearly interpolated hull extent at a bearing
export function sampleExtent(extents: number[], bearing: number) {
  const t = (normalizeBearing(bearing) / 360) * EXTENT_BUCKETS;
  const i0 = Math.floor(t) % EXTENT_BUCKETS;
  const i1 = (i0 + 1) % EXTENT_BUCKETS;
  const frac = t - Math.floor(t);
  return extents[i0] * (1 - frac) + extents[i1] * frac;
}

// Tiles the ship's silhouette with hexagonal plates. `isSolid(u, v)` reports
// whether the sprite is opaque at image coordinates u, v (each 0..1);
// width/height are the sprite's pixel dimensions (only the ratio matters).
export function layoutPlates(
  isSolid: (u: number, v: number) => boolean,
  width: number,
  height: number,
  size: number = PLATE_SIZE,
): PlateField | null {
  const maxDim = Math.max(width, height);
  if (!maxDim) {
    return null;
  }
  const halfW = width / maxDim;
  const halfH = height / maxDim;
  const solidAt = (x: number, y: number) => {
    const u = (x + halfW) / (2 * halfW);
    const v = (y + halfH) / (2 * halfH);
    return u >= 0 && u <= 1 && v >= 0 && v <= 1 && isSolid(u, v);
  };

  const dx = Math.sqrt(3) * size;
  const dy = 1.5 * size;
  const rows = Math.ceil(halfH / dy);
  const cols = Math.ceil(halfW / dx) + 1;
  const plates: Plate[] = [];
  for (let row = -rows; row <= rows; row++) {
    const offset = row % 2 === 0 ? 0 : dx / 2;
    for (let col = -cols; col <= cols; col++) {
      const x = col * dx + offset;
      const y = row * dy;
      // Thin features (nacelles, pylons) can slip between plate centers, so
      // a plate also counts when enough of its rim is over the hull. The
      // finished layer is clipped to the silhouette, so overhang is harmless.
      let solid = solidAt(x, y);
      if (!solid) {
        let rim = 0;
        for (let k = 0; k < 6; k++) {
          const a = (Math.PI / 3) * k;
          if (
            solidAt(x + Math.cos(a) * size * 0.6, y + Math.sin(a) * size * 0.6)
          ) {
            rim++;
          }
        }
        solid = rim >= 2;
      }
      if (!solid) {
        continue;
      }
      plates.push({
        x,
        y,
        order: 0,
        bearing: vectorToBearing(x, y),
        dist: Math.hypot(x, y),
        seed: seeded(row, col),
      });
    }
  }
  if (plates.length === 0) {
    return null;
  }
  // Plating spreads outward from the middle of the ship, which reads the same
  // whichever way the sprite is oriented
  const span = Math.max(1e-6, ...plates.map(p => p.dist));
  plates.forEach(p => {
    p.order = p.dist / span;
  });

  // Farthest plate per bearing bucket = where the hull's edge is
  const raw: number[] = new Array(EXTENT_BUCKETS).fill(0);
  plates.forEach(p => {
    const bucket =
      Math.round((p.bearing / 360) * EXTENT_BUCKETS) % EXTENT_BUCKETS;
    raw[bucket] = Math.max(raw[bucket], p.dist + size);
  });
  const filled = raw.filter(v => v > 0);
  const mean = filled.reduce((a, b) => a + b, 0) / filled.length;
  let extents = raw.map(v => (v > 0 ? v : mean));
  for (let pass = 0; pass < 2; pass++) {
    const src = extents;
    extents = src.map((_, i) => {
      let sum = 0;
      for (let k = -1; k <= 1; k++) {
        sum += src[(i + k + EXTENT_BUCKETS) % EXTENT_BUCKETS];
      }
      return sum / 3;
    });
  }
  return {plates, size, extents};
}
