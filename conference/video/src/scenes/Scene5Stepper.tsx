import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { colors, FONT_UI } from "../tokens";
import { Reveal } from "../Reveal";
import { pulse } from "../pulse";

const STEPS = ["المكتب الفني", "مدير المشروع", "مدير المشاريع", "المالية", "المدير التنفيذي"];
const START = 20;
const STEP_GAP = 22;

export const Scene5Stepper: React.FC = () => {
  const frame = useCurrentFrame();

  const railProgress = interpolate(
    frame,
    [START, START + (STEPS.length - 1) * STEP_GAP],
    [0, 100],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.linear },
  );

  return (
    <AbsoluteFill style={{ background: colors.bg, alignItems: "center", justifyContent: "center", fontFamily: FONT_UI, direction: "rtl", padding: 100 }}>
      <Reveal delay={2} style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 26, fontWeight: 700, color: colors.accent }}>شفافية كاملة</div>
      </Reveal>
      <Reveal delay={8} style={{ marginBottom: 50 }}>
        <div style={{ fontSize: 46, fontWeight: 800, color: colors.primary }}>من طلب الشراء حتى السداد</div>
      </Reveal>

      <div style={{ width: 1500, position: "relative" }}>
        <div style={{ position: "relative", height: 3, background: colors.border, borderRadius: 3, margin: "0 30px" }}>
          <div style={{ position: "absolute", top: 0, right: 0, height: 3, borderRadius: 3, width: `${railProgress}%`, background: colors.accent }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: -14 }}>
          {STEPS.map((label, i) => {
            const litAt = START + i * STEP_GAP;
            const lit = frame >= litAt;
            const settleAt = litAt + 8;
            const pop = interpolate(frame, [litAt, settleAt], [1, 1.2], {
              extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1),
            });
            const knobScale = frame > settleAt ? pulse(frame + i * 15, 65, 0.05) : pop;
            return (
              <div key={label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "0 8px" }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: lit ? colors.accent : "#fff",
                    border: `3px solid ${lit ? colors.accent : colors.border}`,
                    boxShadow: lit ? "0 0 0 8px rgba(10,124,89,0.13)" : "none",
                    marginBottom: 16,
                    scale: lit ? knobScale : 1,
                  }}
                />
                <div style={{ fontSize: 22, fontWeight: 800, color: lit ? colors.primary : "#94a3b8" }}>{label}</div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
