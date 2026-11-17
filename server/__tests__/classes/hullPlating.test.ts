import {System} from "../../classes/generic";
import HullPlating, {HULL_PLATING_CHARGE_TIME} from "../../classes/hullPlating";

describe("HullPlating", () => {
  test("should extend System", () => {
    expect(new HullPlating()).toBeInstanceOf(System);
  });

  test("loads a snapshot saved before effectiveness existed", () => {
    const h = new HullPlating({
      id: "old",
      simulatorId: "sim",
      name: "Hull Plating",
      engaged: true,
      mode: "energy",
      pulse: true,
    });
    expect(h.class).toBe("HullPlating");
    expect(h.engaged).toBe(false);
    expect(h.mode).toBe("kinetic");
    expect(h.pulse).toBe(false);
    expect(h.effectiveness).toBe(0);
    expect(h.focusBearing).toBeNull();
    expect(h.autoEffectiveness).toBe(true);
  });

  test("persists the automatic effectiveness setting", () => {
    expect(new HullPlating({autoEffectiveness: false}).autoEffectiveness).toBe(
      false,
    );
  });

  describe("effectiveness", () => {
    test("ramps to full over the charge time once engaged", () => {
      const h = new HullPlating();
      expect(h.tick(1)).toBe(false);
      h.setEngaged(true);
      expect(h.tick(1)).toBe(true);
      expect(h.effectiveness).toBeCloseTo(1 / HULL_PLATING_CHARGE_TIME);
      expect(h.pulse).toBe(false);
      for (let i = 0; i < HULL_PLATING_CHARGE_TIME; i++) h.tick(1);
      expect(h.effectiveness).toBe(1);
      expect(h.pulse).toBe(true);
      expect(h.tick(1)).toBe(false);
    });

    test("resets when the mode changes or the armor is disengaged", () => {
      const h = new HullPlating();
      h.setEngaged(true);
      h.setPulse(true);
      h.setMode("kinetic");
      expect(h.effectiveness).toBe(1);
      h.setMode("energy");
      expect(h.effectiveness).toBe(0);
      expect(h.pulse).toBe(false);
      h.setPulse(true);
      h.setEngaged(false);
      expect(h.effectiveness).toBe(0);
    });

    test("is only changed by pulse when automatic effectiveness is off", () => {
      const h = new HullPlating({autoEffectiveness: false});
      h.setEngaged(true);
      expect(h.tick(1)).toBe(false);
      expect(h.effectiveness).toBe(0);
      h.setPulse(true);
      expect(h.effectiveness).toBe(1);
      expect(h.pulse).toBe(true);
      h.setPulse(false);
      expect(h.tick(1)).toBe(false);
      expect(h.effectiveness).toBe(0);
    });

    test("drops when the armor loses power", () => {
      const h = new HullPlating();
      h.power = {power: 5, powerLevels: [5], defaultLevel: 0};
      h.setEngaged(true);
      h.setPulse(true);
      h.power.power = 0;
      expect(h.operational).toBe(false);
      expect(h.tick(1)).toBe(true);
      expect(h.effectiveness).toBe(0);
    });
  });

  describe("focus", () => {
    test("normalizes bearings and clears on null", () => {
      const h = new HullPlating();
      h.setFocus(450);
      expect(h.focusBearing).toBe(90);
      h.setFocus(-90);
      expect(h.focusBearing).toBe(270);
      h.setFocus(null);
      expect(h.focusBearing).toBeNull();
    });
  });

  describe("absorption", () => {
    const ready = () => {
      const h = new HullPlating();
      h.setEngaged(true);
      h.setPulse(true);
      return h;
    };
    test("is zero when the armor is off", () => {
      expect(new HullPlating().absorption("kinetic", 0)).toBe(0);
    });
    test("is far better for the matching armor type", () => {
      const h = ready();
      expect(h.absorption("kinetic", 0)).toBeCloseTo(0.8);
      expect(h.absorption("energy", 0)).toBeCloseTo(0.2);
    });
    test("trades the far side for the reinforced side", () => {
      const h = ready();
      h.setFocus(90);
      expect(h.absorption("kinetic", 90)).toBeCloseTo(1);
      expect(h.absorption("kinetic", 270)).toBeCloseTo(0.6);
      expect(h.absorption("kinetic", 0)).toBeCloseTo(0.8);
    });
    test("scales with effectiveness", () => {
      const h = ready();
      h.setEffectiveness(0.5);
      expect(h.absorption("kinetic", 0)).toBeCloseTo(0.4);
    });
  });

  describe("hits", () => {
    const engaged = (params: any = {}) => {
      const h = new HullPlating(params);
      h.setEngaged(true);
      h.setPulse(true);
      return h;
    };

    test("a fully absorbed hit costs nothing", () => {
      const h = engaged();
      expect(h.takeHit(1, 1)).toBe(0);
      expect(h.effectiveness).toBe(1);
    });

    test("what gets through knocks effectiveness down, scaled by intensity", () => {
      const hard = engaged();
      const soft = engaged();
      const hardLoss = hard.takeHit(0.2, 1);
      const softLoss = soft.takeHit(0.2, 0.5);
      expect(hardLoss).toBeGreaterThan(0);
      expect(softLoss).toBeCloseTo(hardLoss / 2);
      expect(hard.effectiveness).toBeCloseTo(1 - hardLoss);
      expect(hard.pulse).toBe(false);
    });

    test("a 100% hit that gets through drops the plating to zero", () => {
      const h = engaged();
      h.takeHit(h.absorption("kinetic", 0), 1);
      expect(h.effectiveness).toBe(0);
    });

    test("the default 10% hit knocks 10% off a balanced, matching hit", () => {
      const h = engaged();
      h.takeHit(h.absorption("kinetic", 0), h.hitIntensity);
      expect(h.effectiveness).toBeCloseTo(0.9);
    });

    test("a hit on the reinforced side with the right armor costs nothing", () => {
      const h = engaged();
      h.setFocus(90);
      expect(h.takeHit(h.absorption("kinetic", 90), 1)).toBe(0);
    });

    test("recovers to full over the recovery time", () => {
      const h = engaged({recoveryTime: 4});
      h.takeHit(0, 1);
      const low = h.effectiveness;
      h.tick(2);
      expect(h.effectiveness).toBeCloseTo((low + 1) / 2);
      h.tick(2);
      expect(h.effectiveness).toBeCloseTo(1);
      expect(h.pulse).toBe(true);
      expect(h.tick(1)).toBe(false);
    });

    test("with manual effectiveness it recovers to where it was", () => {
      const h = new HullPlating({autoEffectiveness: false, recoveryTime: 2});
      h.setEngaged(true);
      h.setEffectiveness(0.5);
      h.takeHit(0, 1);
      expect(h.effectiveness).toBeLessThan(0.5);
      h.tick(10);
      expect(h.effectiveness).toBeCloseTo(0.5);
    });

    test("does nothing while the plating is off", () => {
      const h = new HullPlating();
      expect(h.takeHit(0, 1)).toBe(0);
    });
  });

  describe("maximum effectiveness", () => {
    test("caps the ramp, pulse and absorption", () => {
      const h = new HullPlating({maxEffectiveness: 0.6});
      h.setEngaged(true);
      h.tick(1000);
      expect(h.effectiveness).toBeCloseTo(0.6);
      expect(h.pulse).toBe(true);
      h.setPulse(true);
      expect(h.effectiveness).toBeCloseTo(0.6);
    });

    test("lowering it pulls effectiveness down straight away", () => {
      const h = new HullPlating();
      h.setEngaged(true);
      h.setPulse(true);
      h.setMaxEffectiveness(0.4);
      expect(h.effectiveness).toBeCloseTo(0.4);
    });
  });

  test("hit settings persist and default sensibly", () => {
    const fresh = new HullPlating();
    expect(fresh.maxEffectiveness).toBe(1);
    expect(fresh.hitType).toBe("kinetic");
    expect(fresh.hitIntensity).toBe(0.1);
    expect(fresh.battleConnected).toBe(true);
    const saved = new HullPlating({
      maxEffectiveness: 0.7,
      recoveryTime: 12,
      hitType: "energy",
      hitIntensity: 0.3,
      battleConnected: false,
    });
    expect(saved.maxEffectiveness).toBe(0.7);
    expect(saved.recoveryTime).toBe(12);
    expect(saved.hitType).toBe("energy");
    expect(saved.hitIntensity).toBe(0.3);
    expect(saved.battleConnected).toBe(false);
  });
});
