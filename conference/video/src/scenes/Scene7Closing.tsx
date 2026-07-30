import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from "remotion";
import { colors, heroGradient, shadowLg, FONT_UI } from "../tokens";
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
        position: "absolute", width: size, height: size, top, bottom, left, right,
        borderRadius: "50%", background: color, filter: "blur(70px)", opacity: 0.55,
        translate: `${dx}px ${dy}px`,
      }}
    />
  );
};

export const Scene7Closing: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: heroGradient, fontFamily: FONT_UI, direction: "rtl" }}>
      <Glow size={560} color="#3f8c86" bottom={-140} right={-100} />
      <Glow size={440} color="#7aa6ff" top={-100} left={-70} phase={90} />

      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 100 }}>
        <Reveal delay={2} y={14} style={{ marginBottom: 24 }}>
          <div style={{ background: "#fff", borderRadius: 26, padding: "22px 34px", boxShadow: shadowLg }}>
            <Img src={staticFile("logo.png")} style={{ height: 84 }} />
          </div>
        </Reveal>

        <Reveal delay={16}>
          <div style={{ fontSize: 46, fontWeight: 800, color: "#fff", textAlign: "center" }}>
            نبني الثقة منذ <span style={{ color: "#8fd8d1" }}>١٩٨٣</span>
          </div>
        </Reveal>

        <Reveal delay={30} y={14} style={{ marginTop: 18 }}>
          <div style={{ fontSize: 26, color: "rgba(255,255,255,0.85)", fontWeight: 500 }}>
            تفضّلوا بزيارة جناحنا لمشاهدة المنصّة مباشرة
          </div>
        </Reveal>

        <Reveal delay={48} style={{ marginTop: 34 }}>
          <div style={{ background: "#fff", color: colors.primary, fontSize: 24, fontWeight: 800, padding: "20px 56px", borderRadius: 12, boxShadow: shadowLg }}>
            تعرّف أكثر على منصّة Fast Buildings
          </div>
        </Reveal>

        <Reveal delay={62} style={{ marginTop: 22 }}>
          <div style={{ fontSize: 18, color: "rgba(255,255,255,0.6)", fontWeight: 600 }}>
            جناح المعرض · Fast Buildings
          </div>
        </Reveal>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
