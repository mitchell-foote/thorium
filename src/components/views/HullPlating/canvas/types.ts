export type PlatingMode = "kinetic" | "energy" | "radiation";

// One hexagonal armor plate, positioned in normalized ship space: the origin
// is the sprite's center and 1.0 is half of the sprite's larger dimension.
export interface Plate {
  x: number;
  y: number;
  // 0 (center of the ship) .. 1 (outermost) — where the plate sits in the
  // engage sweep
  order: number;
  // Bearing from the ship's center, degrees clockwise from the top of the
  // image
  bearing: number;
  // Distance from the ship's center, normalized
  dist: number;
  // Stable 0..1 random value for per-plate variation
  seed: number;
}

// Number of angular buckets in the hull extent table (one every 5 degrees)
export const EXTENT_BUCKETS = 72;

export interface PlateField {
  plates: Plate[];
  // Hexagon radius in normalized ship space
  size: number;
  // How far the hull reaches from center at each bearing bucket
  extents: number[];
}

// What the server says the plating is doing right now.
export interface PlatingState {
  engaged: boolean;
  // Engaged, powered and undamaged
  operational: boolean;
  mode: PlatingMode;
  effectiveness: number;
  focusBearing: number | null;
}

// The eased values the draw loop actually renders, stepped toward
// PlatingState every frame so nothing snaps.
export interface PlatingSim {
  // 0 (retracted) .. 1 (fully formed) position of the center-outward sweep
  deploy: number;
  // Mode currently drawn; lags `mode` while the old plates retract
  shownMode: PlatingMode;
  effectiveness: number;
  focusBearing: number;
  // 0 (balanced) .. 1 (fully reinforced toward focusBearing)
  focusStrength: number;
  // Phase of the ripples on the reinforcement glow. Advances while the glow
  // gathers toward the focus and runs backwards while it spreads back out.
  focusFlow: number;
  // 0..1 how fast the glow is currently moving
  focusMotion: number;
}

// An impact triggered by the Flight Director.
export interface HitEvent {
  hitType: PlatingMode;
  bearing: number;
  // 0..1 fraction of the hit the plating stopped
  absorbed: number;
  // 0..1 how hard the hit lands (defaults to 1)
  intensity?: number;
}

export interface ActiveHit extends HitEvent {
  // performance.now() when the hit was received
  start: number;
}

export interface HullPlatingCanvasHandle {
  addHit: (hit: HitEvent) => void;
}

// Canvas geometry recomputed each frame from the measured element size.
export interface Geometry {
  cx: number;
  cy: number;
  // Pixels per normalized ship unit
  shipRadius: number;
  width: number;
  height: number;
}

// Seconds an incoming hit takes to reach the hull
export const HIT_APPROACH = 0.45;
// Total seconds a hit stays on screen (approach + impact effects)
export const HIT_DURATION = 2.6;

// "r, g, b" triples for each mode, matching the card's mode buttons
export const MODE_RGB: {[key in PlatingMode]: string} = {
  kinetic: "255, 176, 64",
  energy: "90, 180, 255",
  radiation: "110, 255, 150",
};
export const BREACH_RGB = "255, 70, 45";
