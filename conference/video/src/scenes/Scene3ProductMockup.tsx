import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { colors, shadow, shadowLg, FONT_UI, FONT_MONO } from "../tokens";
import { Reveal } from "../Reveal";
import {
  IconTickets, IconCalendar, IconArchive, IconCart, IconWarehouse, IconBars, IconKpi, IconTv, IconChat,
} from "../icons";

const NAV_ITEMS = [
  { icon: IconTickets, label: "البلاغات والصيانة" },
  { icon: IconCalendar, label: "الصيانة الوقائية PPM" },
  { icon: IconArchive, label: "سجل الأصول" },
  { icon: IconCart, label: "المشتريات وسلسلة الاعتماد" },
  { icon: IconWarehouse, label: "المخزون والمستودعات" },
  { icon: IconBars, label: "تحليل الأسعار" },
  { icon: IconKpi, label: "مؤشرات الأداء KPI" },
  { icon: IconTv, label: "لوحة عرض تنفيذية مباشرة" },
  { icon: IconChat, label: "إشعارات واتساب فورية" },
];

const ROW_H = 52;
const ROW_GAP = 10;
const PAD_TOP = 18;
const CURSOR = 15;
const INTERVAL = 17;
const SHIMMER_PERIOD = 55;

const topOf = (i: number) => PAD_TOP + i * (ROW_H + ROW_GAP) + ROW_H / 2 - CURSOR / 2;

const SkeletonLine: React.FC<{ width: string; phase: number }> = ({ width, phase }) => {
  const frame = useCurrentFrame();
  const loop = (frame + phase) % SHIMMER_PERIOD;
  const x = interpolate(loop, [0, SHIMMER_PERIOD], [-60, 160]);
  return (
    <div style={{ height: 16, width, background: colors.surface2, borderRadius: 6, overflow: "hidden", position: "relative" }}>
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          width: "40%",
          left: `${x}%`,
          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.9), transparent)",
        }}
      />
    </div>
  );
};

export const Scene3ProductMockup: React.FC = () => {
  const frame = useCurrentFrame();
  const localFrame = frame - 20;
  const rawIndex = Math.max(0, Math.floor(localFrame / INTERVAL));
  const activeIndex = Math.min(rawIndex, NAV_ITEMS.length - 1);
  const prevIndex = Math.max(activeIndex - 1, 0);
  const within = Math.max(0, localFrame % INTERVAL);

  const t = interpolate(within, [0, 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const cursorTop = topOf(prevIndex) + (topOf(activeIndex) - topOf(prevIndex)) * t;

  return (
    <AbsoluteFill style={{ background: colors.bg, alignItems: "center", justifyContent: "center", fontFamily: FONT_UI, direction: "rtl", padding: "60px 100px" }}>
      <Reveal delay={2} style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 26, fontWeight: 700, color: colors.accent }}>منظومة متكاملة</div>
      </Reveal>
      <Reveal delay={8} style={{ marginBottom: 30 }}>
        <div style={{ fontSize: 50, fontWeight: 800, color: colors.primary }}>كل ما تحتاجه إدارة المرافق</div>
      </Reveal>

      <Reveal delay={16} y={26} style={{ width: 1560 }}>
        <div style={{ background: colors.surface, borderRadius: 22, boxShadow: shadowLg, border: `1px solid ${colors.border}`, overflow: "hidden" }}>
          <div style={{ height: 50, background: colors.surface2, borderBottom: `1px solid ${colors.border}`, display: "flex", alignItems: "center", gap: 12, padding: "0 22px" }}>
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#f2867d" }} />
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#f4c563" }} />
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#7dd0a6" }} />
            <div style={{ margin: "0 auto", fontFamily: FONT_MONO, fontSize: 14, color: colors.muted, background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 999, padding: "4px 26px", direction: "ltr" }}>
              app.fastbuildings.sa
            </div>
          </div>

          <div style={{ display: "flex", height: 440 }}>
            <div style={{ width: 300, background: "#f7f9fc", borderLeft: `1px solid ${colors.border}`, padding: `${PAD_TOP}px 16px`, position: "relative" }}>
              <div
                style={{
                  position: "absolute",
                  width: CURSOR,
                  height: CURSOR,
                  borderRadius: "50%",
                  background: colors.primary,
                  border: "2px solid #fff",
                  boxShadow: "0 0 0 4px rgba(27,58,107,0.16)",
                  right: -3,
                  top: cursorTop,
                }}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: ROW_GAP }}>
                {NAV_ITEMS.map((item, i) => {
                  const active = i === activeIndex;
                  return (
                    <div
                      key={item.label}
                      style={{
                        height: ROW_H,
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "0 14px",
                        borderRadius: 10,
                        fontSize: 17,
                        fontWeight: 700,
                        color: active ? colors.primary : "#5b6b82",
                        background: active ? "#fff" : "transparent",
                        boxShadow: active ? shadow : "none",
                      }}
                    >
                      <item.icon width={19} height={19} />
                      {item.label}
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ flex: 1, padding: "30px 34px", display: "flex", flexDirection: "column", gap: 20, textAlign: "right" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: colors.text }}>اللوحة التنفيذية</div>
              <div style={{ display: "flex", gap: 18 }}>
                {[
                  { n: "١٢٤", l: "بلاغات هذا الشهر" },
                  { n: "٩٨٪", l: "التزام SLA" },
                  { n: "٤٦", l: "طلبات شراء نشطة" },
                ].map((s) => (
                  <div key={s.l} style={{ flex: 1, background: colors.surface2, border: `1px solid ${colors.border}`, borderRadius: 12, padding: "18px 20px" }}>
                    <div style={{ fontFamily: FONT_MONO, fontSize: 30, fontWeight: 700, color: colors.primary }}>{s.n}</div>
                    <div style={{ fontSize: 14, color: colors.muted, marginTop: 4, fontWeight: 600 }}>{s.l}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
                <SkeletonLine width="100%" phase={0} />
                <SkeletonLine width="82%" phase={12} />
                <SkeletonLine width="60%" phase={24} />
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </AbsoluteFill>
  );
};
