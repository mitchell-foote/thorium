import App from "../app";
import {pubsub} from "../helpers/subscriptionManager";
import {System} from "./generic";

export type HullPlatingMode = "kinetic" | "energy" | "radiation";

// Seconds for freshly engaged (or reconfigured) plating to become fully
// effective when automatic effectiveness is on
export const HULL_PLATING_CHARGE_TIME = 20;
// How much of a hit plating in the wrong mode still stops
const MISMATCH_FACTOR = 0.25;
// Absorption with evenly balanced plating. Reinforcing a side trades this
// for up to 100% on that side and BALANCED - REINFORCE_SWING on the far side.
const BALANCED_ABSORPTION = 0.8;
const REINFORCE_SWING = 0.2;
// Hit intensity used until the Flight Director picks another
export const HULL_PLATING_HIT_INTENSITY = 0.1;
// Defaults for the Flight Director's hit settings
export const HULL_PLATING_RECOVERY_TIME = 8;
const MIN_RECOVERY_TIME = 0.5;
const MODES: HullPlatingMode[] = ["kinetic", "energy", "radiation"];

const clamp01 = (value: any, fallback = 0) => {
  const n = Number(value);
  return Math.min(1, Math.max(0, isNaN(n) ? fallback : n));
};

export function normalizeBearing(bearing: number) {
  return ((bearing % 360) + 360) % 360;
}

// How badly a hit got through, 0..1. A hit the plating stops completely
// (right armor, reinforced side, fully effective) is 0; anything stopped no
// better than balanced plating at full effectiveness counts fully. A hit's
// intensity is then the share of effectiveness it knocks off, so a 100% hit
// that gets through drops the plating to zero.
export function hitLeak(absorbed: number) {
  return clamp01((1 - clamp01(absorbed)) / (1 - BALANCED_ABSORPTION));
}

export default class HullPlating extends System {
  engaged: boolean;
  mode: HullPlatingMode;
  // Legacy "armor is effective" flag. Kept in sync with `effectiveness` so
  // existing macros, timelines and external clients keep working.
  pulse?: boolean;
  // 0..1 — how well the plating is currently working
  effectiveness: number;
  // When true the server ramps effectiveness up on its own; when false it
  // only changes when the Flight Director sets it (the pre-revamp behavior)
  autoEffectiveness: boolean;
  // Bearing the crew is reinforcing, in degrees clockwise from the top of the
  // ship's top-view image as shown on screen (the image can be uploaded in
  // any orientation, so this is not relative to the bow). Null = balanced.
  focusBearing: number | null;
  // 0..1 — the most effective the plating is allowed to get
  maxEffectiveness: number;
  // Seconds the plating takes to climb back after a hit knocks it down
  recoveryTime: number;
  // What the Flight Director's next hit is made of, and how hard it lands.
  // Stored here (not on the core) so battle core hits can use them too.
  hitType: HullPlatingMode;
  hitIntensity: number;
  // When true, projectiles fired from the battle core that reach the ship
  // also land on the plating
  battleConnected: boolean;
  // Hit recovery in progress: climb at `recoverRate` per second up to
  // `recoverTo`. Null when no hit is being recovered from.
  recoverTo: number | null;
  recoverRate: number;
  constructor(params: any = {}) {
    super(params);
    this.class = "HullPlating";
    this.type = "HullPlating";
    this.wing = params.wing || "left";
    this.name = params.name || "Hull Plating";
    this.displayName = params.displayName || "Hull Plating";
    // Runtime state intentionally starts fresh (as it always has) so a
    // snapshot from any version loads the same way.
    this.engaged = false;
    this.mode = "kinetic";
    this.pulse = false;
    this.effectiveness = 0;
    this.focusBearing = null;
    this.recoverTo = null;
    this.recoverRate = 0;
    this.autoEffectiveness = params.autoEffectiveness ?? true;
    this.maxEffectiveness = clamp01(params.maxEffectiveness ?? 1, 1);
    this.recoveryTime = Math.max(
      MIN_RECOVERY_TIME,
      Number(params.recoveryTime) || HULL_PLATING_RECOVERY_TIME,
    );
    this.hitType = MODES.includes(params.hitType) ? params.hitType : "kinetic";
    this.hitIntensity = clamp01(
      params.hitIntensity ?? HULL_PLATING_HIT_INTENSITY,
      HULL_PLATING_HIT_INTENSITY,
    );
    this.battleConnected = params.battleConnected ?? true;
  }
  get stealthFactor() {
    return 0;
  }

  get hasPower() {
    const levels = this.power?.powerLevels || [];
    return levels.length === 0 || this.power.power >= levels[0];
  }

  // Engaged, powered and undamaged — the plating is actually doing something
  get operational() {
    return Boolean(this.engaged && !this.damage?.damaged && this.hasPower);
  }

  handleUpdate() {
    pubsub.publish(
      "hullPlatingUpdate",
      App.systems.filter(s => s.type === "HullPlating"),
    );
  }

  // Sets effectiveness directly (capped at the maximum). This is a fresh
  // start, so any hit recovery in progress is abandoned.
  setEffectiveness(effectiveness: number) {
    this.recoverTo = null;
    this.recoverRate = 0;
    this.applyEffectiveness(effectiveness);
  }

  private applyEffectiveness(effectiveness: number) {
    const value = Math.min(this.maxEffectiveness, clamp01(effectiveness));
    this.effectiveness = value;
    this.pulse = value > 0 && value >= this.maxEffectiveness - 1e-6;
  }

  setMaxEffectiveness(max: number) {
    this.maxEffectiveness = clamp01(max, 1);
    if (this.recoverTo !== null) {
      this.recoverTo = Math.min(this.recoverTo, this.maxEffectiveness);
    }
    this.applyEffectiveness(this.effectiveness);
  }

  setRecoveryTime(seconds: number) {
    this.recoveryTime = Math.max(
      MIN_RECOVERY_TIME,
      Number(seconds) || HULL_PLATING_RECOVERY_TIME,
    );
  }

  setHitType(type: HullPlatingMode) {
    if (MODES.includes(type)) {
      this.hitType = type;
    }
  }

  setHitIntensity(intensity: number) {
    this.hitIntensity = clamp01(intensity, HULL_PLATING_HIT_INTENSITY);
  }

  setBattleConnected(connected: boolean) {
    this.battleConnected = Boolean(connected);
  }

  setEngaged(engaged: boolean) {
    if (!engaged) {
      this.setEffectiveness(0);
    }
    this.engaged = engaged;
  }

  setMode(mode: HullPlatingMode) {
    if (this.mode !== mode) {
      // Reconfigured plating has to settle before it is effective again
      this.setEffectiveness(0);
    }
    this.mode = mode;
  }

  // Legacy mutation: pulse on = as effective as allowed, pulse off =
  // ineffective
  setPulse(pulse: boolean) {
    this.setEffectiveness(pulse ? this.maxEffectiveness : 0);
  }

  setAutoEffectiveness(auto: boolean) {
    this.autoEffectiveness = Boolean(auto);
  }

  setFocus(bearing: number | null | undefined) {
    if (bearing === null || bearing === undefined || isNaN(Number(bearing))) {
      this.focusBearing = null;
      return;
    }
    this.focusBearing = normalizeBearing(Number(bearing));
  }

  // Advance the automatic ramp by `seconds`. Returns true if anything changed.
  tick(seconds: number) {
    const previous = this.effectiveness;
    if (!this.operational) {
      if (previous !== 0) {
        this.setEffectiveness(0);
      }
    } else if (this.recoverTo !== null) {
      // Climbing back after a hit
      const next = Math.min(
        this.recoverTo,
        previous + this.recoverRate * seconds,
      );
      const done = next >= this.recoverTo - 1e-6;
      if (done) {
        this.recoverTo = null;
        this.recoverRate = 0;
      }
      this.applyEffectiveness(next);
    } else if (this.autoEffectiveness && previous < this.maxEffectiveness) {
      this.applyEffectiveness(previous + seconds / HULL_PLATING_CHARGE_TIME);
    }
    return this.effectiveness !== previous;
  }

  // Effectiveness a hit knocks off: whatever share of it the plating failed
  // to stop, scaled by how hard it landed.
  hitLoss(absorbed: number, intensity: number) {
    return clamp01(intensity) * hitLeak(absorbed);
  }

  // Knock the plating down after a hit and start it recovering. Returns the
  // effectiveness lost. With automatic effectiveness the plating recovers to
  // its maximum; otherwise it returns to where it was before the hit.
  takeHit(absorbed: number, intensity: number) {
    if (!this.operational) {
      return 0;
    }
    const before = this.effectiveness;
    const after = Math.max(0, before - this.hitLoss(absorbed, intensity));
    if (after >= before) {
      return 0;
    }
    const target = this.autoEffectiveness
      ? this.maxEffectiveness
      : Math.max(before, this.recoverTo ?? 0);
    this.recoverTo = Math.min(this.maxEffectiveness, target);
    this.recoverRate = Math.max(0, this.recoverTo - after) / this.recoveryTime;
    this.applyEffectiveness(after);
    return before - after;
  }

  // Fraction (0..1) of a hit of the given type and bearing the plating stops.
  // Purely advisory: it drives the crew's visuals and the core readout, the
  // Flight Director still decides what damage the ship takes.
  absorption(type: HullPlatingMode, bearing: number) {
    if (!this.operational) {
      return 0;
    }
    const match = type === this.mode ? 1 : MISMATCH_FACTOR;
    let coverage = BALANCED_ABSORPTION;
    if (this.focusBearing !== null) {
      const diff = ((bearing - this.focusBearing) * Math.PI) / 180;
      coverage = BALANCED_ABSORPTION + REINFORCE_SWING * Math.cos(diff);
    }
    return Math.min(1, Math.max(0, this.effectiveness * match * coverage));
  }

  break(report, destroyed, which) {
    this.mode = "kinetic";
    this.engaged = false;
    this.setEffectiveness(0);
    super.break(report, destroyed, which);
    this.handleUpdate();
  }
  repair() {
    super.repair();
    this.handleUpdate();
  }
  setPower(power) {
    super.setPower(power);
    this.handleUpdate();
  }
}
