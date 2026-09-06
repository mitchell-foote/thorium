import {CSSProperties} from "react";

// Shared placement logic for the draggable advanced-training popovers
// (AdvancedTrainingMediaViewer, AdvancedTrainingTacticalMapViewer). Both sit
// inside the full-viewport `.advanced-training-isolation` container and are
// anchored to a 3x3 grid until the user drags them, after which pixel-based
// transform coordinates take over.

export const SIZE_WIDTHS = {small: 0.25, medium: 0.4, large: 0.6};
export const STRIP_HEIGHT = 64;
export const MARGIN = 16;

// Return CSS properties that anchor the viewer to `position` (e.g. "top-right")
// using browser layout rather than guessing the element's height in JS.
//
// Every offset is explicitly reset to "auto" first: the viewer's base SCSS
// hard-codes `top: 0; left: 0`, so anchoring to the right/bottom without
// clearing those leaves the box over-constrained — the browser keeps `left`/
// `top` and drops `right`/`bottom`, pinning every anchor to the top-left corner.
export function getPositionStyle(
  position: string,
  stripPosition: "top" | "bottom" = "bottom",
): CSSProperties {
  const [vert, horiz] = position.split("-");

  const style: CSSProperties = {
    top: "auto",
    right: "auto",
    bottom: "auto",
    left: "auto",
  };

  if (horiz === "left") {
    style.left = MARGIN;
  } else if (horiz === "right") {
    style.right = MARGIN;
  } else {
    style.left = "50%";
  } // center

  if (vert === "top") {
    style.top = stripPosition === "top" ? STRIP_HEIGHT + MARGIN : MARGIN;
  } else if (vert === "bottom") {
    style.bottom = stripPosition === "bottom" ? STRIP_HEIGHT + MARGIN : MARGIN;
  } else {
    style.top = "50%";
  } // middle

  const tx = horiz === "center" ? "-50%" : "0px";
  const ty = vert === "middle" ? "-50%" : "0px";
  if (tx !== "0px" || ty !== "0px") {
    style.transform = `translate(${tx}, ${ty})`;
  }

  return style;
}
