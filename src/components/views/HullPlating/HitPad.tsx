import React from "react";
import {bearingToVector, vectorToBearing} from "./canvas/simulation";
import {MODE_RGB, PlatingMode} from "./canvas/types";

interface HitPadProps {
  // The ship's top view, drawn the same way up as on the crew's screen
  assetPath?: string | null;
  // Armor type the crew has selected (colors their reinforcement)
  mode: PlatingMode;
  // Side the crew is reinforcing, null when balanced
  focusBearing: number | null;
  // What a click sends (colors the pad's crosshair marker)
  hitType: PlatingMode;
  lastHit?: {id: string; hitType: PlatingMode; bearing: number} | null;
  // Bearing in degrees clockwise from the top of the ship image
  onHit: (bearing: number) => void;
}

const RADIUS = 44;
const point = (bearing: number, radius = RADIUS) => {
  const dir = bearingToVector(bearing);
  return {x: 50 + dir.x * radius, y: 50 + dir.y * radius};
};

// Flight Director's aiming pad: a small copy of the crew's view of the ship.
// Clicking anywhere around it sends a hit in from that direction.
const HitPad: React.FC<HitPadProps> = ({
  assetPath,
  mode,
  focusBearing,
  hitType,
  lastHit,
  onHit,
}) => {
  const [hover, setHover] = React.useState<number | null>(null);

  const bearingFromEvent = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    // Dead center has no direction
    if (Math.hypot(x, y) < Math.min(rect.width, rect.height) * 0.04) {
      return null;
    }
    return vectorToBearing(x, y);
  };

  let focusArc: string | null = null;
  if (focusBearing !== null) {
    const from = point(focusBearing - 40);
    const to = point(focusBearing + 40);
    focusArc = `M ${from.x} ${from.y} A ${RADIUS} ${RADIUS} 0 0 1 ${to.x} ${to.y}`;
  }
  const aim = hover === null ? null : point(hover);
  const last = lastHit ? point(lastHit.bearing) : null;

  return (
    <svg
      className="core-hullPlating-pad"
      viewBox="0 0 100 100"
      role="img"
      aria-label="Click around the ship to hit it from that side"
      onMouseMove={e => setHover(bearingFromEvent(e))}
      onMouseLeave={() => setHover(null)}
      onClick={e => {
        const bearing = bearingFromEvent(e);
        if (bearing !== null) onHit(bearing);
      }}
    >
      <title>
        Click around the ship to hit it from that side. This is the ship as the
        crew sees it; the glow shows where they are reinforcing.
      </title>
      <circle
        className="core-hullPlating-pad-ring"
        cx="50"
        cy="50"
        r={RADIUS}
      />
      <circle
        cx="50"
        cy="50"
        r={RADIUS}
        fill="none"
        stroke={`rgba(${MODE_RGB[mode]}, ${focusArc ? 0.12 : 0.35})`}
        strokeWidth="3"
      />
      {focusArc && (
        <path
          d={focusArc}
          fill="none"
          stroke={`rgb(${MODE_RGB[mode]})`}
          strokeWidth="4"
          strokeLinecap="round"
        />
      )}
      {assetPath ? (
        <image
          href={assetPath}
          x="22"
          y="22"
          width="56"
          height="56"
          preserveAspectRatio="xMidYMid meet"
        />
      ) : (
        <circle cx="50" cy="50" r="12" fill="rgba(255, 255, 255, 0.25)" />
      )}
      {last && lastHit && (
        <circle
          key={lastHit.id}
          className="core-hullPlating-pad-last"
          cx={last.x}
          cy={last.y}
          r="4"
          fill={`rgb(${MODE_RGB[lastHit.hitType]})`}
        />
      )}
      {aim && (
        <g stroke={`rgb(${MODE_RGB[hitType]})`} strokeWidth="1.5">
          <line x1={aim.x} y1={aim.y} x2="50" y2="50" strokeDasharray="3 3" />
          <circle cx={aim.x} cy={aim.y} r="4" fill="rgba(0, 0, 0, 0.6)" />
        </g>
      )}
    </svg>
  );
};

export default HitPad;
