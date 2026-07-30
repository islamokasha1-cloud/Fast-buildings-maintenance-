import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { heroGradient, shadowLg, FONT_UI, FONT_MONO } from "../tokens";
import { Reveal } from "../Reveal";

const Glow: React.FC<{ size: number; color: string; top?: number; bottom?: number; left?: number; right?: number; phase?: number }> = ({
  size, color, top, bottom, left, right, phase = 0,
}) => {
  const frame = useCurrentFrame();
  const dx = Math.sin((frame + phase) / 90) * 40;
  const dy = Math.cos((frame + phase) / 110) * 26;
  return (
    <div
      style={{
        position: "absolute",
        width: size,
        height: size,
        top, bottom, left, right,
        borderRadius: "50%",
        background: color,
        filter: "blur(70px)",
        opacity: 0.55,
        translate: `${dx}px ${dy}px`,
      }}
    />
  );
};

export const Scene1Hero: React.FC = () => {
  const frame = useCurrentFrame();

  const markScale = interpolate(frame, [0, 22], [0.9, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  return (
    <AbsoluteFill style={{ background: heroGradient, fontFamily: FONT_UI, direction: "rtl" }}>
      <Glow size={640} color="#3f8c86" top={-140} right={-120} />
      <Glow size={500} color="#7aa6ff" bottom={-120} left={-80} phase={140} />

      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 100 }}>
        <Reveal delay={4} y={16} style={{ marginBottom: 28 }}>
          <div
            style={{
              background: "#fff",
              borderRadius: 28,
              padding: "26px 42px",
              boxShadow: shadowLg,
              scale: markScale,
            }}
          >
            <Img src={staticFile("logo.png")} style={{ height: 104 }} />
          </div>
        </Reveal>

        <Reveal delay={14}>
          <div style={{ fontSize: 72, fontWeight: 800, color: "#fff", direction: "ltr" }}>
            Fast Buildings
          </div>
        </Reveal>

        <Reveal delay={22} y={18} style={{ marginTop: 6, marginBottom: 22 }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: "#8fd8d1" }}>
            شركة المباني السريعة
          </div>
        </Reveal>

        <Reveal delay={30} y={16} style={{ maxWidth: 980 }}>
          <div style={{ fontSize: 27, fontWeight: 500, color: "rgba(255,255,255,0.85)", textAlign: "center", lineHeight: 1.7 }}>
            منصّة ذكية متكاملة لإدارة المرافق والصيانة والمشتريات والمستودعات — في نظام واحد
          </div>
        </Reveal>

        <Reveal delay={58} style={{ marginTop: 40, display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 52, height: 1, background: "rgba(255,255,255,0.35)" }} />
          <div style={{ fontFamily: FONT_MONO, fontSize: 17, letterSpacing: "0.22em", color: "rgba(255,255,255,0.75)", fontWeight: 600 }}>
            EST. 1983 — منذ عام ١٩٨٣
          </div>
          <div style={{ width: 52, height: 1, background: "rgba(255,255,255,0.35)" }} />
        </Reveal>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
