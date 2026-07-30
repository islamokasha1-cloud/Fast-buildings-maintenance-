import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { colors, shadow, FONT_UI, FONT_MONO } from "../tokens";
import { Reveal } from "../Reveal";
import { IconShield, IconBars, IconCheck } from "../icons";

const STATS = [
  { icon: IconShield, target: 42, suffix: "+", label: "عاماً من الخبرة — منذ ١٩٨٣", accent: colors.primary, tint: "#eaf0fb" },
  { icon: IconBars, target: 5, suffix: "", label: "مراحل اعتماد شفّافة لكل طلب شراء", accent: colors.warn, tint: "#fbf1e6" },
  { icon: IconCheck, target: 449, suffix: "/449", label: "فحص آلي ناجح لدقّة الأرقام المالية", accent: colors.accent, tint: "#e7f7f0" },
];

const BARS = [55, 72, 60, 88, 100];
const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو"];

const useCount = (target: number, delay: number) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame - delay, [0, 34], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic),
  });
  return Math.round(target * p);
};

const StatCard: React.FC<(typeof STATS)[number] & { delay: number }> = (s) => {
  const value = useCount(s.target, s.delay + 14);
  return (
    <Reveal delay={s.delay} style={{ flex: 1 }}>
      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderTop: `4px solid ${s.accent}`, borderRadius: 18, boxShadow: shadow, padding: "26px 22px", textAlign: "right" }}>
        <div style={{ width: 50, height: 50, borderRadius: 12, background: s.tint, color: s.accent, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
          <s.icon width={24} height={24} />
        </div>
        <div style={{ fontFamily: FONT_MONO, fontSize: 44, fontWeight: 700, color: s.accent }}>{value}{s.suffix}</div>
        <div style={{ fontSize: 17, color: colors.muted, marginTop: 6, fontWeight: 600 }}>{s.label}</div>
      </div>
    </Reveal>
  );
};

export const Scene4Dashboard: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ background: colors.bg, alignItems: "center", justifyContent: "center", fontFamily: FONT_UI, direction: "rtl", padding: 100 }}>
      <Reveal delay={2} style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 26, fontWeight: 700, color: colors.accent }}>أداء مُثبَت</div>
      </Reveal>
      <Reveal delay={8} style={{ marginBottom: 30 }}>
        <div style={{ fontSize: 46, fontWeight: 800, color: colors.primary }}>أرقام تتحدّث بدل الوعود</div>
      </Reveal>

      <div style={{ display: "flex", gap: 28, width: 1500 }}>
        {STATS.map((s, i) => (
          <StatCard key={s.label} {...s} delay={16 + i * 8} />
        ))}
      </div>

      <Reveal delay={44} y={20} style={{ width: 1500, marginTop: 26 }}>
        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 20, boxShadow: shadow, padding: "24px 32px 30px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 20 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: colors.text }}>الإنفاق الشهري الفعلي</div>
            <div style={{ fontSize: 15, color: colors.muted, fontWeight: 600 }}>آخر ٥ أشهر</div>
          </div>
          <div style={{ display: "flex", alignItems: "stretch", gap: 32, height: 130, borderBottom: `1px solid ${colors.border}`, paddingBottom: 4 }}>
            {BARS.map((h, i) => {
              const barP = interpolate(frame, [55 + i * 6, 55 + i * 6 + 24], [0, h], {
                extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1),
              });
              return (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center" }}>
                  <div style={{ width: 40, height: `${barP}%`, background: "linear-gradient(180deg,#34b88a,#0a7c59)", borderRadius: "6px 6px 0 0" }} />
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 32, marginTop: 14 }}>
            {MONTHS.map((m) => (
              <div key={m} style={{ flex: 1, textAlign: "center", fontSize: 15, color: colors.muted, fontWeight: 600 }}>{m}</div>
            ))}
          </div>
        </div>
      </Reveal>
    </AbsoluteFill>
  );
};
