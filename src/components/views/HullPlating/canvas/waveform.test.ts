import {waveSample, waveShape, waveSpeed, WAVE_PEAK} from "./waveform";

describe("waveShape", () => {
  test("is flat when the armor is off", () => {
    const shape = waveShape(0);
    expect(shape.amplitude).toBe(0);
    expect(waveSample(0.3, 1, shape)).toBeCloseTo(0);
  });
  test("is most turbulent around the peak, then settles", () => {
    expect(waveShape(WAVE_PEAK).chaos).toBeCloseTo(1);
    expect(waveShape(0.35).chaos).toBeLessThan(waveShape(WAVE_PEAK).chaos);
    expect(waveShape(0.85).chaos).toBeLessThan(waveShape(WAVE_PEAK).chaos);
    expect(waveSpeed(waveShape(WAVE_PEAK))).toBeGreaterThan(
      waveSpeed(waveShape(1)),
    );
  });
  test("is a pure, full-height sine wave when fully effective", () => {
    const shape = waveShape(1);
    expect(shape).toEqual({amplitude: 1, chaos: 0, stable: 1});
    for (const u of [0, 0.13, 0.5, 0.87, 1]) {
      expect(waveSample(u, 2, shape)).toBeCloseTo(Math.sin(u * 14 - 2));
    }
  });
  test("drops and scrambles when a hit gets through", () => {
    const calm = waveShape(1);
    const hit = waveShape(1, 0.8);
    expect(hit.amplitude).toBeLessThan(calm.amplitude * 0.5);
    expect(hit.chaos).toBeCloseTo(0.8);
    expect(hit.stable).toBeLessThan(0.25);
    // A fully absorbed hit changes nothing
    expect(waveShape(1, 0)).toEqual(calm);
  });
});
