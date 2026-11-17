import {
  bearingDiff,
  bearingToVector,
  clamp01,
  focusWeight,
  glowWeight,
  hitPhase,
  plateForm,
  sampleExtent,
  seeded,
} from "./simulation";
import {GLOW_PADDING, Sprite, spriteSize} from "./sprite";
import {
  ActiveHit,
  BREACH_RGB,
  Geometry,
  MODE_RGB,
  PlateField,
  PlatingMode,
  PlatingSim,
} from "./types";

// Radius of the bearing ring, in normalized ship units
const RING_RADIUS = 1.22;

// Where the sprite lands on the canvas for the current geometry
export function shipRect(sprite: Sprite, geometry: Geometry) {
  const {width, height} = spriteSize(sprite);
  const fit = (geometry.shipRadius * 2) / Math.max(width, height, 1);
  const w = width * fit;
  const h = height * fit;
  return {left: geometry.cx - w / 2, top: geometry.cy - h / 2, w, h};
}

// Bearing ring with tick marks. Deliberately unlabeled: the ship image can be
// uploaded in any orientation, so the card never names a side of the ship.
export function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  geometry: Geometry,
) {
  const {cx, cy, shipRadius} = geometry;
  const radius = shipRadius * RING_RADIUS;
  ctx.strokeStyle = "rgba(140, 190, 230, 0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  for (let bearing = 0; bearing < 360; bearing += 15) {
    const dir = bearingToVector(bearing);
    const inner = radius - (bearing % 45 === 0 ? 10 : 5);
    ctx.moveTo(cx + dir.x * inner, cy + dir.y * inner);
    ctx.lineTo(cx + dir.x * radius, cy + dir.y * radius);
  }
  ctx.stroke();
}

// Colored halo behind the hull, brighter as the plating becomes effective.
export function drawGlow(
  ctx: CanvasRenderingContext2D,
  glow: HTMLCanvasElement | undefined,
  sprite: Sprite,
  geometry: Geometry,
  sim: PlatingSim,
  t: number,
) {
  if (!glow || sim.deploy <= 0.01) {
    return;
  }
  const rect = shipRect(sprite, geometry);
  const padX = rect.w * GLOW_PADDING;
  const padY = rect.h * GLOW_PADDING;
  const breathe = 0.85 + 0.15 * Math.sin(t * 1.6);
  ctx.globalAlpha = sim.deploy * (0.25 + 0.6 * sim.effectiveness) * breathe;
  ctx.drawImage(
    glow,
    rect.left - padX,
    rect.top - padY,
    rect.w + padX * 2,
    rect.h + padY * 2,
  );
  ctx.globalAlpha = 1;
}

export function drawShip(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  geometry: Geometry,
) {
  const rect = shipRect(sprite, geometry);
  ctx.drawImage(sprite, rect.left, rect.top, rect.w, rect.h);
}

// Unit hexagon (pointy top) corner offsets
const HEX = Array.from({length: 6}, (_, k) => {
  const a = (Math.PI / 3) * k + Math.PI / 6;
  return {x: Math.cos(a), y: Math.sin(a)};
});

function hexPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + HEX[0].x * radius, y + HEX[0].y * radius);
  for (let k = 1; k < 6; k++) {
    ctx.lineTo(x + HEX[k].x * radius, y + HEX[k].y * radius);
  }
  ctx.closePath();
}

// How each mode's plating looks: base opacity, how much of its cell a plate
// fills, and the moving brightness pattern that gives the mode its character.
const MODE_STYLE: {
  [key in PlatingMode]: {
    alpha: number;
    fill: number;
    pattern: (
      plate: {x: number; y: number; order: number; dist: number},
      t: number,
    ) => number;
  };
} = {
  // Heavy interlocking slabs with a slow sheen rolling across the hull
  kinetic: {
    alpha: 0.48,
    fill: 0.93,
    pattern: (plate, t) =>
      0.78 +
      0.22 *
        Math.pow(Math.max(0, Math.sin((plate.x + plate.y) * 3.5 - t * 0.9)), 6),
  },
  // Thin shimmering field lines sweeping along the hull
  energy: {
    alpha: 0.5,
    fill: 0.8,
    pattern: (plate, t) =>
      0.4 + 0.6 * (0.5 + 0.5 * Math.sin(plate.x * 16 + t * 3.2)),
  },
  // Rings of glow collapsing inward as the hull soaks energy up
  radiation: {
    alpha: 0.5,
    fill: 0.86,
    pattern: (plate, t) =>
      0.45 + 0.55 * (0.5 + 0.5 * Math.sin(plate.dist * 11 + t * 2.2)),
  },
};

interface PlateLayerArgs {
  layer: HTMLCanvasElement;
  sprite: Sprite;
  field: PlateField;
  sim: PlatingSim;
  // False while engaged plating is losing power, so the plates stutter out
  stable: boolean;
  hits: ActiveHit[];
  geometry: Geometry;
  now: number;
  t: number;
}

// Draws every plate into an offscreen layer the size of the ship, clips the
// layer to the sprite's silhouette, and returns where to composite it.
export function drawPlateLayer(args: PlateLayerArgs) {
  const {layer, sprite, field, sim, stable, hits, geometry, now, t} = args;
  const rect = shipRect(sprite, geometry);
  const w = Math.max(1, Math.round(rect.w));
  const h = Math.max(1, Math.round(rect.h));
  if (layer.width !== w || layer.height !== h) {
    layer.width = w;
    layer.height = h;
  }
  const ctx = layer.getContext("2d");
  if (!ctx) {
    return rect;
  }
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, w, h);

  // Resolve each landed hit to its impact point once, not once per plate
  const impacts = hits
    .map(hit => {
      const {impact} = hitPhase((now - hit.start) / 1000);
      if (impact < 0) {
        return null;
      }
      const dir = bearingToVector(hit.bearing);
      const extent = sampleExtent(field.extents, hit.bearing) * 0.85;
      return {
        x: dir.x * extent,
        y: dir.y * extent,
        progress: impact,
        fade: 1 - impact,
        absorbed: hit.absorbed,
      };
    })
    .filter(Boolean) as {
    x: number;
    y: number;
    progress: number;
    fade: number;
    absorbed: number;
  }[];

  if (sim.deploy <= 0 && impacts.length === 0) {
    return rect;
  }

  const style = MODE_STYLE[sim.shownMode];
  const rgb = MODE_RGB[sim.shownMode];
  const scale = geometry.shipRadius;
  const ox = w / 2;
  const oy = h / 2;
  const eff = sim.effectiveness;
  const flickerStep = Math.floor(t * 9);
  const stutterStep = Math.floor(t * 16);

  for (let i = 0; i < field.plates.length; i++) {
    const plate = field.plates[i];
    const form = plateForm(sim.deploy, plate.order);

    // Hits: absorbed energy ripples outward as white heat, unabsorbed energy
    // knocks nearby plates out and leaves the hull glowing red.
    let heat = 0;
    let breach = 0;
    for (let j = 0; j < impacts.length; j++) {
      const hit = impacts[j];
      const d = Math.hypot(plate.x - hit.x, plate.y - hit.y);
      const near = Math.exp(-((d / 0.32) * (d / 0.32)));
      if (hit.absorbed > 0) {
        const ringOffset = (d - hit.progress * 1.8) / 0.14;
        const ring = Math.exp(-(ringOffset * ringOffset));
        heat += hit.absorbed * hit.fade * (ring * 0.8 + near * hit.fade);
      }
      if (hit.absorbed < 1) {
        breach += (1 - hit.absorbed) * near * Math.sqrt(hit.fade);
      }
    }
    heat = Math.min(1, heat);
    breach = Math.min(1, breach);

    if (form <= 0 && breach <= 0.02) {
      continue;
    }
    const px = ox + plate.x * scale;
    const py = oy + plate.y * scale;
    const weight = focusWeight(
      plate.bearing,
      sim.focusBearing,
      sim.focusStrength,
    );

    if (form > 0) {
      // Plating that isn't effective yet shimmers unevenly while it settles
      const flicker =
        1 - (1 - eff) * 0.55 * seeded(plate.seed * 97, flickerStep);
      const stutter =
        stable || seeded(plate.seed * 53, stutterStep) > 0.45 ? 1 : 0.15;
      // Breached plates near the impact drop out, the unluckiest first
      const knocked = breach > plate.seed * 0.9 ? 1 - breach : 1;
      const alpha =
        form *
        style.alpha *
        style.pattern(plate, t) *
        (0.4 + 0.6 * eff) *
        flicker *
        stutter *
        knocked *
        Math.min(1.35, 0.35 + 0.65 * weight);
      const radius =
        field.size *
        scale *
        style.fill *
        (0.5 + 0.5 * form) *
        (0.8 + 0.2 * weight);
      if (alpha > 0.01) {
        hexPath(ctx, px, py, radius);
        ctx.fillStyle = `rgba(${rgb}, ${Math.min(1, alpha)})`;
        ctx.fill();
        if (heat > 0.02) {
          ctx.fillStyle = `rgba(255, 255, 255, ${heat * form * 0.9})`;
          ctx.fill();
        }
      }
    }
    if (breach > 0.02) {
      hexPath(ctx, px, py, field.size * scale * 0.95);
      ctx.fillStyle = `rgba(${BREACH_RGB}, ${breach * 0.7})`;
      ctx.fill();
    }
  }

  // Keep only what overlaps the ship, so plates follow the real silhouette
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(sprite, 0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";
  return rect;
}

// Absorption Armor: motes of energy drifting in from space and soaking into
// the hull.
export function drawAbsorptionMotes(
  ctx: CanvasRenderingContext2D,
  field: PlateField,
  sim: PlatingSim,
  geometry: Geometry,
  t: number,
) {
  if (sim.shownMode !== "radiation" || sim.deploy <= 0.05) {
    return;
  }
  const {cx, cy, shipRadius} = geometry;
  const strength = sim.deploy * (0.3 + 0.7 * sim.effectiveness);
  ctx.fillStyle = `rgb(${MODE_RGB.radiation})`;
  for (let i = 0; i < 46; i++) {
    const bearing = seeded(i, 3) * 360 + Math.sin(t * 0.2 + i) * 6;
    const speed = 0.12 + seeded(i, 5) * 0.16;
    const life = (t * speed + seeded(i, 7)) % 1;
    const hull = sampleExtent(field.extents, bearing) * 0.8;
    const dist = hull + (1 - life) * (RING_RADIUS + 0.25 - hull);
    const dir = bearingToVector(bearing);
    // Fade in far out, vanish as the mote reaches the plating
    ctx.globalAlpha = strength * Math.sin(life * Math.PI) * 0.8;
    const size = Math.max(1, shipRadius * 0.008) * (1.6 - life);
    ctx.beginPath();
    ctx.arc(
      cx + dir.x * dist * shipRadius,
      cy + dir.y * dist * shipRadius,
      size,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Number of slices the reinforcement glow is drawn in
const GLOW_SEGMENTS = 120;

// The reinforcement glow on the bearing ring. Balanced plating is a light,
// even glow all the way round; reinforcing a side makes the glow flow round
// the ring and pool there, and balancing lets it flow back out.
export function drawFocusGlow(
  ctx: CanvasRenderingContext2D,
  sim: PlatingSim,
  geometry: Geometry,
  rgb: string,
) {
  const {cx, cy, shipRadius} = geometry;
  const radius = shipRadius * RING_RADIUS;
  // Dim while the armor is off, so a side can still be chosen in advance
  const power = 0.4 + 0.6 * sim.deploy;
  const ripple = 0.08 + 0.5 * sim.focusMotion;
  const step = (Math.PI * 2) / GLOW_SEGMENTS;
  const wide = Math.max(10, shipRadius * 0.07);
  const thin = Math.max(3, shipRadius * 0.02);
  const slices: {start: number; weight: number}[] = [];
  for (let i = 0; i < GLOW_SEGMENTS; i++) {
    const bearing = (i + 0.5) * (360 / GLOW_SEGMENTS);
    const away =
      (Math.abs(bearingDiff(sim.focusBearing, bearing)) * Math.PI) / 180;
    const weight =
      glowWeight(bearing, sim.focusBearing, sim.focusStrength) *
      (1 + ripple * Math.sin(away * 7 + sim.focusFlow));
    if (weight > 0.01) {
      // Bearing 0 is the top of the image; canvas angle 0 is the right
      slices.push({start: i * step - Math.PI / 2, weight});
    }
  }
  // Soft halo first, then the bright core on top. Slices overlap by a hair
  // so no seams show between them.
  slices.forEach(({start, weight}) => {
    ctx.strokeStyle = `rgba(${rgb}, ${Math.min(1, power * weight * 0.3)})`;
    ctx.lineWidth = wide * (0.7 + 0.5 * Math.min(1, weight));
    ctx.beginPath();
    ctx.arc(cx, cy, radius, start, start + step + 0.003);
    ctx.stroke();
  });
  slices.forEach(({start, weight}) => {
    ctx.strokeStyle = `rgba(${rgb}, ${Math.min(1, power * weight * 0.95)})`;
    ctx.lineWidth = thin;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, start, start + step + 0.003);
    ctx.stroke();
  });
}

// Incoming fire and the flash where it lands. Kinetic hits arrive as a slug,
// energy hits as a beam, radiation as a wavefront.
export function drawHits(
  ctx: CanvasRenderingContext2D,
  hits: ActiveHit[],
  field: PlateField,
  geometry: Geometry,
  now: number,
) {
  const {cx, cy, shipRadius, width, height} = geometry;
  const far = Math.hypot(width, height) / 2 / Math.max(1, shipRadius) + 0.1;
  hits.forEach((hit, index) => {
    const {approach, impact} = hitPhase((now - hit.start) / 1000);
    const dir = bearingToVector(hit.bearing);
    const hull = sampleExtent(field.extents, hit.bearing) * 0.92;
    const at = (dist: number) => ({
      x: cx + dir.x * dist * shipRadius,
      y: cy + dir.y * dist * shipRadius,
    });
    const rgb = MODE_RGB[hit.hitType];
    const head = at(far + (hull - far) * approach);
    const trailFade = impact < 0 ? 1 : Math.max(0, 1 - impact * 5);

    if (trailFade > 0) {
      if (hit.hitType === "kinetic") {
        const tail = at(far + (hull - far) * Math.max(0, approach - 0.22));
        ctx.strokeStyle = `rgba(${rgb}, ${0.8 * trailFade})`;
        ctx.lineWidth = Math.max(2, shipRadius * 0.014);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(tail.x, tail.y);
        ctx.lineTo(head.x, head.y);
        ctx.stroke();
        ctx.lineCap = "butt";
        ctx.fillStyle = `rgba(255, 245, 225, ${trailFade})`;
        ctx.beginPath();
        ctx.arc(head.x, head.y, Math.max(3, shipRadius * 0.02), 0, Math.PI * 2);
        ctx.fill();
      } else if (hit.hitType === "energy") {
        const origin = at(far);
        ctx.strokeStyle = `rgba(${rgb}, ${0.35 * trailFade})`;
        ctx.lineWidth = Math.max(8, shipRadius * 0.05);
        ctx.beginPath();
        ctx.moveTo(origin.x, origin.y);
        ctx.lineTo(head.x, head.y);
        ctx.stroke();
        ctx.strokeStyle = `rgba(235, 248, 255, ${0.9 * trailFade})`;
        ctx.lineWidth = Math.max(2, shipRadius * 0.012);
        ctx.beginPath();
        ctx.moveTo(origin.x, origin.y);
        ctx.lineTo(head.x, head.y);
        ctx.stroke();
      } else {
        const facing = Math.atan2(-dir.y, -dir.x);
        ctx.lineWidth = Math.max(2, shipRadius * 0.012);
        for (let k = 0; k < 3; k++) {
          const lag = Math.max(0, approach - k * 0.12);
          const dist = far + (hull - far) * lag;
          ctx.strokeStyle = `rgba(${rgb}, ${(0.75 - k * 0.2) * trailFade})`;
          ctx.beginPath();
          // Arc centered on the origin of the wave, bulging toward the ship
          const origin = at(far + 0.6);
          ctx.arc(
            origin.x,
            origin.y,
            (far + 0.6 - dist) * shipRadius,
            facing - 0.32,
            facing + 0.32,
          );
          ctx.stroke();
        }
      }
    }

    if (impact < 0) {
      return;
    }
    const point = at(hull);
    const fade = 1 - impact;
    const stopped = hit.absorbed >= 0.5;
    const flashRgb = stopped ? rgb : BREACH_RGB;
    // Harder hits make a bigger splash
    const punch = 0.55 + 0.45 * clamp01(hit.intensity ?? 1);

    // Flash and expanding shock ring at the impact point
    const flash = Math.max(0, 1 - impact * 4);
    if (flash > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${flash * 0.9})`;
      ctx.beginPath();
      ctx.arc(
        point.x,
        point.y,
        shipRadius * (0.05 + impact * 0.5) * punch,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.strokeStyle = `rgba(${flashRgb}, ${fade * 0.8})`;
    ctx.lineWidth = Math.max(2, shipRadius * 0.015) * fade + 1;
    ctx.beginPath();
    ctx.arc(
      point.x,
      point.y,
      shipRadius * (0.06 + impact * 0.45) * punch,
      0,
      Math.PI * 2,
    );
    ctx.stroke();

    // Sparks: deflected back out to space when stopped, driven on into the
    // hull when the plating fails
    const sparkLife = clamp01(impact * 2.2);
    if (sparkLife < 1) {
      ctx.strokeStyle = `rgba(${flashRgb}, ${(1 - sparkLife) * 0.9})`;
      ctx.lineWidth = Math.max(1.5, shipRadius * 0.008);
      const base = Math.atan2(dir.y, dir.x) + (stopped ? 0 : Math.PI);
      ctx.beginPath();
      for (let k = 0; k < 9; k++) {
        const angle = base + (seeded(index + k, 11) - 0.5) * 2.2;
        const reach = shipRadius * (0.12 + seeded(k, 13) * 0.28) * punch;
        const from = reach * sparkLife * 0.7;
        const to = reach * sparkLife;
        ctx.moveTo(
          point.x + Math.cos(angle) * from,
          point.y + Math.sin(angle) * from,
        );
        ctx.lineTo(
          point.x + Math.cos(angle) * to,
          point.y + Math.sin(angle) * to,
        );
      }
      ctx.stroke();
    }
  });
}
