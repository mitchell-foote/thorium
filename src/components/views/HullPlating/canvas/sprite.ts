// Everything derived from the ship's top-view sprite: the plate layout and
// the soft colored glow drawn around the hull. All of it is built once per
// sprite, never per frame.
import {layoutPlates} from "./simulation";
import {MODE_RGB, PlateField, PlatingMode} from "./types";

export type Sprite = HTMLImageElement | HTMLCanvasElement;

export function spriteSize(sprite: Sprite) {
  if (sprite instanceof HTMLImageElement) {
    return {width: sprite.naturalWidth, height: sprite.naturalHeight};
  }
  return {width: sprite.width, height: sprite.height};
}

// Generic hull used when the simulator has no top-view image (or it fails to
// load), so the card always has something to plate.
export function buildFallbackSprite(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 220;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }
  const w = canvas.width;
  const h = canvas.height;
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, "#2c3640");
  gradient.addColorStop(0.5, "#5f6e7c");
  gradient.addColorStop(1, "#2c3640");
  ctx.fillStyle = gradient;
  // Main hull
  ctx.beginPath();
  ctx.moveTo(w - 6, h / 2);
  ctx.bezierCurveTo(w * 0.86, h * 0.86, w * 0.48, h * 0.8, w * 0.2, h * 0.68);
  ctx.lineTo(8, h * 0.6);
  ctx.lineTo(8, h * 0.4);
  ctx.lineTo(w * 0.2, h * 0.32);
  ctx.bezierCurveTo(w * 0.48, h * 0.2, w * 0.86, h * 0.14, w - 6, h / 2);
  ctx.fill();
  // Engine pods
  ctx.fillRect(w * 0.07, h * 0.04, w * 0.38, h * 0.14);
  ctx.fillRect(w * 0.07, h * 0.82, w * 0.38, h * 0.14);
  ctx.fillRect(w * 0.27, h * 0.14, w * 0.07, h * 0.72);
  return canvas;
}

// Reads the sprite's alpha channel and tiles its silhouette with plates.
// Returns null if the sprite can't be read (not loaded, or cross-origin).
export function buildPlateField(sprite: Sprite): PlateField | null {
  try {
    const {width, height} = spriteSize(sprite);
    const maxDim = Math.max(width, height);
    if (!maxDim) {
      return null;
    }
    // 200px is plenty of resolution to place plates
    const scale = Math.min(1, 200 / maxDim);
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const offscreen = document.createElement("canvas");
    offscreen.width = w;
    offscreen.height = h;
    const ctx = offscreen.getContext("2d");
    if (!ctx) {
      return null;
    }
    ctx.drawImage(sprite, 0, 0, w, h);
    const {data} = ctx.getImageData(0, 0, w, h);
    const isSolid = (u: number, v: number) => {
      const x = Math.min(w - 1, Math.floor(u * w));
      const y = Math.min(h - 1, Math.floor(v * h));
      return data[(y * w + x) * 4 + 3] >= 64;
    };
    return layoutPlates(isSolid, width, height);
  } catch {
    return null;
  }
}

// Fraction of the glow canvas that is padding on each side, so the blur has
// room to spread past the silhouette
export const GLOW_PADDING = 0.15;

// A blurred, solid-color copy of the silhouette for each mode. Drawn behind
// the ship so engaged plating gives the hull a colored halo.
export function buildGlowSprites(sprite: Sprite): {
  [key in PlatingMode]?: HTMLCanvasElement;
} {
  const result: {[key in PlatingMode]?: HTMLCanvasElement} = {};
  const {width, height} = spriteSize(sprite);
  const maxDim = Math.max(width, height);
  if (!maxDim) {
    return result;
  }
  const scale = Math.min(1, 256 / maxDim);
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const padX = Math.round(w * GLOW_PADDING);
  const padY = Math.round(h * GLOW_PADDING);
  (Object.keys(MODE_RGB) as PlatingMode[]).forEach(mode => {
    const canvas = document.createElement("canvas");
    canvas.width = w + padX * 2;
    canvas.height = h + padY * 2;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.filter = `blur(${Math.max(2, Math.round(Math.max(w, h) * 0.035))}px)`;
    ctx.drawImage(sprite, padX, padY, w, h);
    ctx.filter = "none";
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = `rgb(${MODE_RGB[mode]})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    result[mode] = canvas;
  });
  return result;
}
