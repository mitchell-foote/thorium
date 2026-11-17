import React from "react";

// An arrow pointing toward a side of the ship image, as it appears on the
// crew's screen (0 = top of the image, clockwise). The ship's top view can be
// uploaded in any orientation, so sides are always shown, never named.
const DirectionArrow: React.FC<{bearing: number}> = ({bearing}) => (
  <span
    className="hull-plating-arrow"
    style={{transform: `rotate(${bearing}deg)`}}
    aria-label={`${Math.round(
      bearing,
    )} degrees clockwise from the top of the ship image`}
  >
    ↑
  </span>
);

export default DirectionArrow;
