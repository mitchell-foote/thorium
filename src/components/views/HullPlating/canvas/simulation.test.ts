import {
  bearingDiff,
  bearingToVector,
  createSim,
  focusWeight,
  glowWeight,
  hitPhase,
  layoutPlates,
  plateForm,
  sampleExtent,
  stepSim,
  vectorToBearing,
} from "./simulation";
import {HIT_APPROACH, HIT_DURATION, PlatingState} from "./types";

const state = (overrides: Partial<PlatingState> = {}): PlatingState => ({
  engaged: true,
  operational: true,
  mode: "kinetic",
  effectiveness: 1,
  focusBearing: null,
  ...overrides,
});

describe("bearings", () => {
  test("0 is the top of the image and 90 is its right", () => {
    expect(bearingToVector(0).y).toBeCloseTo(-1);
    expect(bearingToVector(90).x).toBeCloseTo(1);
    expect(vectorToBearing(0, -1)).toBeCloseTo(0);
    expect(vectorToBearing(1, 0)).toBeCloseTo(90);
    expect(vectorToBearing(-1, 0)).toBeCloseTo(270);
  });
  test("diff takes the short way round", () => {
    expect(bearingDiff(350, 10)).toBe(20);
    expect(bearingDiff(10, 350)).toBe(-20);
  });
});

describe("stepSim", () => {
  test("starts formed when already engaged", () => {
    expect(createSim(state()).deploy).toBe(1);
    expect(createSim(state({operational: false})).deploy).toBe(0);
  });
  test("forms and retracts over time", () => {
    const sim = createSim(state({operational: false}));
    for (let i = 0; i < 100; i++) stepSim(sim, state(), 0.05);
    expect(sim.deploy).toBe(1);
    for (let i = 0; i < 100; i++)
      stepSim(sim, state({operational: false}), 0.05);
    expect(sim.deploy).toBe(0);
    expect(sim.effectiveness).toBeLessThan(0.01);
  });
  test("retracts the old armor before showing the new mode", () => {
    const sim = createSim(state());
    stepSim(sim, state({mode: "energy"}), 0.05);
    expect(sim.shownMode).toBe("kinetic");
    expect(sim.deploy).toBeLessThan(1);
    for (let i = 0; i < 100; i++) stepSim(sim, state({mode: "energy"}), 0.05);
    expect(sim.shownMode).toBe("energy");
    expect(sim.deploy).toBe(1);
  });
  test("eases reinforcement toward the crew's bearing", () => {
    const sim = createSim(state());
    for (let i = 0; i < 100; i++)
      stepSim(sim, state({focusBearing: 350}), 0.05);
    expect(sim.focusStrength).toBeCloseTo(1, 2);
    expect(bearingDiff(sim.focusBearing, 350)).toBeCloseTo(0, 1);
    for (let i = 0; i < 100; i++) stepSim(sim, state(), 0.05);
    expect(sim.focusStrength).toBeCloseTo(0, 2);
  });
});

describe("plates", () => {
  test("form from the center of the ship outward", () => {
    expect(plateForm(0, 0)).toBe(0);
    expect(plateForm(1, 1)).toBe(1);
    expect(plateForm(0.4, 0)).toBe(1);
    expect(plateForm(0.4, 1)).toBe(0);
  });
  test("are thicker toward the reinforced side", () => {
    expect(focusWeight(90, 90, 1)).toBeCloseTo(1.5);
    expect(focusWeight(270, 90, 1)).toBeCloseTo(0.5);
    expect(focusWeight(270, 90, 0)).toBe(1);
  });
  test("tile only the solid part of the sprite", () => {
    // A long, narrow hull across the middle of the sprite
    const field = layoutPlates((u, v) => Math.abs(v - 0.5) < 0.2, 200, 100);
    expect(field).not.toBeNull();
    expect(field!.plates.length).toBeGreaterThan(50);
    expect(Math.max(...field!.plates.map(p => Math.abs(p.y)))).toBeLessThan(
      0.25,
    );
    // The hull reaches much further along its length than across it
    expect(sampleExtent(field!.extents, 90)).toBeGreaterThan(0.8);
    expect(sampleExtent(field!.extents, 0)).toBeLessThan(0.6);
  });
  test("lay out identically for a sprite uploaded in another orientation", () => {
    const wide = layoutPlates((u, v) => Math.abs(v - 0.5) < 0.2, 200, 100)!;
    const tall = layoutPlates((u, v) => Math.abs(u - 0.5) < 0.2, 100, 200)!;
    // Plates form center-outward either way, never "bow first"
    const innermost = (f: typeof wide) =>
      f.plates.reduce((a, b) => (b.order < a.order ? b : a));
    expect(innermost(wide).dist).toBeLessThan(0.05);
    expect(innermost(tall).dist).toBeLessThan(0.05);
    expect(sampleExtent(tall.extents, 0)).toBeGreaterThan(0.8);
    expect(sampleExtent(tall.extents, 90)).toBeLessThan(0.6);
  });
  test("return null for an empty sprite", () => {
    expect(layoutPlates(() => false, 100, 100)).toBeNull();
    expect(layoutPlates(() => true, 0, 0)).toBeNull();
  });
});

describe("hitPhase", () => {
  test("approaches, then impacts", () => {
    expect(hitPhase(0)).toEqual({approach: 0, impact: -1});
    expect(hitPhase(HIT_APPROACH).impact).toBe(0);
    expect(hitPhase(HIT_DURATION)).toEqual({approach: 1, impact: 1});
  });
});

describe("glowWeight", () => {
  test("balanced plating glows evenly all the way round", () => {
    const top = glowWeight(0, 90, 0);
    expect(top).toBeGreaterThan(0);
    expect(glowWeight(180, 90, 0)).toBeCloseTo(top);
    expect(glowWeight(270, 90, 0)).toBeCloseTo(top);
  });
  test("reinforcing pools the glow at the focus and drains the far side", () => {
    const balanced = glowWeight(90, 90, 0);
    expect(glowWeight(90, 90, 1)).toBeGreaterThan(balanced);
    expect(glowWeight(270, 90, 1)).toBeLessThan(0.01);
    expect(glowWeight(90, 90, 0.5)).toBeGreaterThan(glowWeight(180, 90, 0.5));
  });
});
