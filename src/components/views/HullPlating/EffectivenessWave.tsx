import React from "react";
import useMeasure from "helpers/hooks/useMeasure";
import {BREACH_RGB, MODE_RGB, PlatingMode} from "./canvas/types";
import {
  waveSample,
  waveShape,
  waveSpeed,
  WAVE_RECOVERY,
} from "./canvas/waveform";

interface EffectivenessWaveProps {
  mode: PlatingMode;
  // 0..1, already zero when the plating is off
  effectiveness: number;
}

export interface EffectivenessWaveHandle {
  // Knock the wave down and scramble it. `amount` is 0..1 (the share of a
  // hit that got through); `delayMs` lines it up with the impact on screen.
  disturb: (amount: number, delayMs?: number) => void;
}

// Live replacement for the old effectiveness videos. Flat when the armor is
// off, increasingly turbulent while it calibrates, and a clean steady sine
// once it is fully effective. See ./canvas/waveform for the shape.
const EffectivenessWave = React.forwardRef<
  EffectivenessWaveHandle,
  EffectivenessWaveProps
>(({mode, effectiveness}, ref) => {
  const [dimRef, dimensions, canvas] = useMeasure<HTMLCanvasElement>();
  const target = React.useRef({mode, effectiveness});
  target.current = {mode, effectiveness};
  const disturbance = React.useRef(0);
  const pending = React.useRef<{at: number; amount: number}[]>([]);

  React.useImperativeHandle(ref, () => ({
    disturb: (amount, delayMs = 0) => {
      if (amount > 0.01) {
        pending.current.push({at: performance.now() + delayMs, amount});
      }
    },
  }));

  React.useEffect(() => {
    let animation: number;
    let lastTime = performance.now();
    let level = target.current.effectiveness;
    let phase = 0;
    const context = canvas?.getContext("2d");

    const draw = (now: number) => {
      animation = requestAnimationFrame(draw);
      if (!canvas || !context) {
        return;
      }
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;
      const {width, height} = dimensions;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      context.clearRect(0, 0, width, height);
      if (width === 0 || height === 0) {
        return;
      }

      // Hits that have landed since the last frame
      pending.current = pending.current.filter(hit => {
        if (hit.at > now) {
          return true;
        }
        disturbance.current = Math.min(1, disturbance.current + hit.amount);
        return false;
      });
      disturbance.current *= Math.exp(-dt * (3 / WAVE_RECOVERY));
      if (disturbance.current < 0.005) {
        disturbance.current = 0;
      }
      const disturbed = disturbance.current;

      level +=
        (target.current.effectiveness - level) * (1 - Math.exp(-dt * 2.5));
      const shape = waveShape(level, disturbed);
      phase += dt * waveSpeed(shape);
      const rgb = MODE_RGB[target.current.mode];
      // The whole trace sags a little while it is disturbed
      const mid = height / 2 + disturbed * height * 0.1;
      const reach = height / 2 - 6;

      context.strokeStyle = "rgba(255, 255, 255, 0.12)";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(0, height / 2);
      context.lineTo(width, height / 2);
      context.stroke();

      const trace = (style: string, lineWidth: number) => {
        context.strokeStyle = style;
        context.lineWidth = lineWidth;
        context.beginPath();
        for (let x = 0; x <= width; x += 3) {
          const u = x / Math.max(1, width);
          // Jagged static on top of the wave while it is disturbed
          const tear =
            disturbed > 0 && level > 0.01
              ? (Math.random() - 0.5) * disturbed * 0.5 * level
              : 0;
          const y = mid + reach * (waveSample(u, phase, shape) + tear);
          if (x === 0) {
            context.moveTo(x, y);
          } else {
            context.lineTo(x, y);
          }
        }
        context.stroke();
      };
      trace(`rgba(${rgb}, 0.25)`, 6);
      trace(`rgba(${rgb}, ${0.3 + 0.7 * Math.max(0.25, level)})`, 2);
      if (disturbed > 0.02 && level > 0.01) {
        trace(`rgba(${BREACH_RGB}, ${Math.min(0.85, disturbed)})`, 2);
      }
    };
    animation = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animation);
  }, [canvas, dimensions]);

  return <canvas ref={dimRef} className="hull-plating-wave" />;
});

EffectivenessWave.displayName = "EffectivenessWave";

export default EffectivenessWave;
