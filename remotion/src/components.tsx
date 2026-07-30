import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { theme } from "./theme";

// خلفية متدرجة مع نمط مخطط هندسي (blueprint) يناسب شركة مقاولات
export const BlueprintBackground: React.FC = () => {
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, 900], [0, 120]);
  const gridSize = 64;
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 30% 20%, ${theme.navy} 0%, ${theme.navyDeep} 45%, ${theme.navyDark} 100%)`,
      }}
    >
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)`,
          backgroundSize: `${gridSize}px ${gridSize}px`,
          transform: `translate(${-drift}px, ${-drift * 0.6}px)`,
          opacity: 0.5,
        }}
      />
      {/* توهج ذهبي علوي */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 78% 12%, ${theme.gold}22 0%, transparent 38%)`,
        }}
      />
      {/* توهج أخضر سفلي */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 15% 92%, ${theme.green}22 0%, transparent 40%)`,
        }}
      />
    </AbsoluteFill>
  );
};

// شريط ذهبي زخرفي
export const AccentBar: React.FC<{ width: number; delay?: number }> = ({
  width,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const grow = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  return (
    <div
      style={{
        width: width * grow,
        height: 6,
        borderRadius: 6,
        background: `linear-gradient(90deg, ${theme.gold}, ${theme.amber})`,
        boxShadow: `0 0 24px ${theme.gold}66`,
      }}
    />
  );
};

// ظهور نصي متحرك للأعلى مع تلاشي
export const RevealText: React.FC<{
  children: React.ReactNode;
  delay?: number;
  style?: React.CSSProperties;
}> = ({ children, delay = 0, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  const y = interpolate(s, [0, 1], [40, 0]);
  return (
    <div style={{ opacity: s, transform: `translateY(${y}px)`, ...style }}>
      {children}
    </div>
  );
};
