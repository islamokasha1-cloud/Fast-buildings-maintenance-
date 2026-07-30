import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";

export const Reveal: React.FC<{
  delay?: number;
  y?: number;
  duration?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ delay = 0, y = 24, duration = 24, style, children }) => {
  const frame = useCurrentFrame();
  const local = frame - delay;
  const p = interpolate(local, [0, duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  return (
    <div
      style={{
        opacity: p,
        translate: `0px ${(1 - p) * y}px`,
        filter: `blur(${(1 - p) * 4}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};
