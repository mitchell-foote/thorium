import React from "react";
import useMeasure from "helpers/hooks/useMeasure";
import {throttle} from "helpers/debounce";
import {beginPointerDrag, getEventCoords} from "helpers/hooks/usePointerDrag";
import {createSim, stepSim, vectorToBearing} from "./canvas/simulation";
import {
  buildFallbackSprite,
  buildGlowSprites,
  buildPlateField,
  Sprite,
} from "./canvas/sprite";
import {
  drawAbsorptionMotes,
  drawBackdrop,
  drawFocusGlow,
  drawGlow,
  drawHits,
  drawPlateLayer,
  drawShip,
} from "./canvas/render";
import {
  ActiveHit,
  Geometry,
  HIT_DURATION,
  HullPlatingCanvasHandle,
  MODE_RGB,
  PlateField,
  PlatingMode,
  PlatingState,
} from "./canvas/types";

export type {HullPlatingCanvasHandle, HitEvent} from "./canvas/types";

interface HullPlatingCanvasProps {
  engaged: boolean;
  operational: boolean;
  mode: PlatingMode;
  effectiveness: number;
  focusBearing: number | null;
  // URL of the simulator's top-view sprite. A generic hull is drawn when it
  // is missing or fails to load.
  assetPath?: string | null;
  // Provide to let the crew drag around the ship to reinforce a side
  // (null = balanced). Omit for a display-only canvas.
  onFocusChange?: (bearing: number | null) => void;
}

interface SpriteData {
  sprite: Sprite;
  field: PlateField;
  glow: {[key in PlatingMode]?: HTMLCanvasElement};
}

function prepareSprite(sprite: Sprite): SpriteData | null {
  const field = buildPlateField(sprite);
  if (!field) {
    return null;
  }
  return {sprite, field, glow: buildGlowSprites(sprite)};
}

// Top-down view of the ship with its hull plating drawn over the real sprite.
// The component owns the sprite-derived data, the eased simulation values and
// the active hits; the draw loop reads live props from a ref so it never
// restarts. All the heavy lifting lives in ./canvas/*.
const HullPlatingCanvas = React.forwardRef<
  HullPlatingCanvasHandle,
  HullPlatingCanvasProps
>((props, ref) => {
  const {assetPath, onFocusChange} = props;
  const [dimRef, dimensions, canvas] = useMeasure<HTMLCanvasElement>();
  const spriteData = React.useRef<SpriteData | null>(null);
  const hits = React.useRef<ActiveHit[]>([]);
  const plateLayer = React.useRef<HTMLCanvasElement | null>(null);
  // Bearing being dragged, shown immediately instead of waiting on the server
  const dragFocus = React.useRef<{bearing: number | null} | null>(null);

  const state: PlatingState = {
    engaged: props.engaged,
    operational: props.operational,
    mode: props.mode,
    effectiveness: props.effectiveness,
    focusBearing: props.focusBearing,
  };
  const stateRef = React.useRef(state);
  stateRef.current = state;
  const sim = React.useRef(createSim(state));

  React.useImperativeHandle(ref, () => ({
    addHit: hit => {
      hits.current.push({...hit, start: performance.now()});
    },
  }));

  // Load the sprite and derive its plate layout + glow once.
  React.useEffect(() => {
    let cancelled = false;
    const loadFallback = () => {
      if (!cancelled) {
        spriteData.current = prepareSprite(buildFallbackSprite());
      }
    };
    if (!assetPath) {
      loadFallback();
      return;
    }
    const image = new Image();
    image.onload = () => {
      if (cancelled) {
        return;
      }
      const prepared = prepareSprite(image);
      if (prepared) {
        spriteData.current = prepared;
      } else {
        loadFallback();
      }
    };
    image.onerror = loadFallback;
    image.src = assetPath;
    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [assetPath]);

  React.useEffect(() => {
    let animation: number;
    let lastTime = performance.now();
    const context = canvas?.getContext("2d");

    const draw = (now: number) => {
      animation = requestAnimationFrame(draw);
      if (!canvas || !context) {
        return;
      }
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;
      const t = now / 1000;

      const {width, height} = dimensions;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      context.clearRect(0, 0, width, height);
      if (width === 0 || height === 0) {
        return;
      }
      const geometry: Geometry = {
        cx: width / 2,
        cy: height / 2,
        shipRadius: Math.min(width, height) * 0.36,
        width,
        height,
      };

      const live = stateRef.current;
      const current: PlatingState = dragFocus.current
        ? {...live, focusBearing: dragFocus.current.bearing}
        : live;
      stepSim(sim.current, current, dt);
      hits.current = hits.current.filter(
        hit => (now - hit.start) / 1000 < HIT_DURATION,
      );

      drawBackdrop(context, geometry);
      const data = spriteData.current;
      if (!data) {
        return;
      }
      if (!plateLayer.current) {
        plateLayer.current = document.createElement("canvas");
      }
      const rgb = MODE_RGB[sim.current.shownMode];
      drawGlow(
        context,
        data.glow[sim.current.shownMode],
        data.sprite,
        geometry,
        sim.current,
        t,
      );
      drawShip(context, data.sprite, geometry);
      const rect = drawPlateLayer({
        layer: plateLayer.current,
        sprite: data.sprite,
        field: data.field,
        sim: sim.current,
        stable: live.operational || !live.engaged,
        hits: hits.current,
        geometry,
        now,
        t,
      });
      context.drawImage(
        plateLayer.current,
        rect.left,
        rect.top,
        rect.w,
        rect.h,
      );
      drawAbsorptionMotes(context, data.field, sim.current, geometry, t);
      drawFocusGlow(context, sim.current, geometry, rgb);
      drawHits(context, hits.current, data.field, geometry, now);
    };
    animation = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animation);
    };
  }, [canvas, dimensions]);

  // Dragging around the ship aims the reinforcement; a touch on the middle of
  // the ship balances the plating again.
  const onFocusChangeRef = React.useRef(onFocusChange);
  onFocusChangeRef.current = onFocusChange;
  const throttledFocus = React.useRef(
    throttle(
      (bearing: number | null) => onFocusChangeRef.current?.(bearing),
      120,
    ),
  );
  const cancelDrag = React.useRef<(() => void) | null>(null);
  React.useEffect(
    () => () => {
      if (cancelDrag.current) cancelDrag.current();
      cancelDrag.current = null;
    },
    [],
  );

  const bearingFromEvent = (e: any, target: HTMLCanvasElement) => {
    const coords = getEventCoords(e);
    if (!coords) {
      return undefined;
    }
    const rect = target.getBoundingClientRect();
    const x = coords.clientX - rect.left - rect.width / 2;
    const y = coords.clientY - rect.top - rect.height / 2;
    const shipRadius = Math.min(rect.width, rect.height) * 0.36;
    if (Math.hypot(x, y) < shipRadius * 0.28) {
      return null;
    }
    // Snap to 5 degrees so the readout is steady under a finger
    return (Math.round(vectorToBearing(x, y) / 5) * 5) % 360;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!onFocusChange || e.button !== 0) return;
    const target = e.currentTarget;
    const update = (event: any) => {
      const bearing = bearingFromEvent(event, target);
      if (bearing === undefined) return undefined;
      dragFocus.current = {bearing};
      return bearing;
    };
    if (cancelDrag.current) cancelDrag.current();
    const first = update(e);
    if (first !== undefined) throttledFocus.current(first);
    cancelDrag.current = beginPointerDrag(e, {
      onMove: drag => {
        const bearing = update(drag.event);
        if (bearing !== undefined) throttledFocus.current(bearing);
      },
      onEnd: drag => {
        cancelDrag.current = null;
        const bearing = update(drag.event);
        const final =
          bearing !== undefined ? bearing : dragFocus.current?.bearing;
        if (final !== undefined) onFocusChangeRef.current?.(final);
        // Hold the dragged value briefly so the arc doesn't jump back to the
        // old bearing before the server confirms the new one
        setTimeout(() => {
          if (!cancelDrag.current) dragFocus.current = null;
        }, 400);
      },
    });
  };

  return (
    <canvas
      ref={dimRef}
      className={`hull-plating-canvas-element ${
        onFocusChange ? "is-interactive" : ""
      }`}
      onPointerDown={handlePointerDown}
    />
  );
});

HullPlatingCanvas.displayName = "HullPlatingCanvas";

export default HullPlatingCanvas;
