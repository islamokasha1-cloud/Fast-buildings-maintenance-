import React from "react";
import { AbsoluteFill } from "remotion";
import { colors, shadow, FONT_UI } from "../tokens";
import { Reveal } from "../Reveal";
import { IconPhone, IconCalendar, IconBox, IconCircleX, IconCheck } from "../icons";

const painItems = [
  { icon: IconPhone, text: "بلاغات صيانة تضيع بين الاتصالات" },
  { icon: IconCalendar, text: "جداول صيانة وقائية على ورق" },
  { icon: IconBox, text: "مخزون بلا رقابة حقيقية" },
  { icon: IconCircleX, text: "موافقات شراء بلا تتبّع" },
];

export const Scene2Ledger: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: colors.bg, alignItems: "center", justifyContent: "center", fontFamily: FONT_UI, direction: "rtl", padding: 100 }}>
      <Reveal delay={2} style={{ marginBottom: 26 }}>
        <div style={{ fontSize: 26, fontWeight: 700, color: colors.accent }}>واقع إدارة المرافق تقليدياً</div>
      </Reveal>

      <div style={{ display: "flex", gap: 40, width: 1500, alignItems: "stretch" }}>
        <div style={{ flex: 1, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 22, boxShadow: shadow, padding: "38px 44px", textAlign: "right" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: colors.muted, marginBottom: 26 }}>الطريقة التقليدية</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            {painItems.map((item, i) => (
              <Reveal key={item.text} delay={16 + i * 12} y={16}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 16, fontSize: 24, color: "#94a3b8" }}>
                  <span style={{ textDecoration: "line-through", textDecorationColor: colors.danger, textDecorationThickness: 2 }}>
                    {item.text}
                  </span>
                  <span style={{ flexShrink: 0, width: 40, height: 40, borderRadius: "50%", background: "#fdf1f0", color: colors.danger, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <item.icon width={20} height={20} />
                  </span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 22, boxShadow: shadow, borderRight: `5px solid ${colors.accent}`, padding: "38px 44px", display: "flex", flexDirection: "column", justifyContent: "center", textAlign: "right" }}>
          <Reveal delay={10}>
            <div style={{ fontSize: 20, fontWeight: 800, color: colors.muted, marginBottom: 22 }}>Fast Buildings</div>
          </Reveal>
          <Reveal delay={70} y={16}>
            <div style={{ fontSize: 38, fontWeight: 800, lineHeight: 1.45, color: colors.primary }}>
              كل شيء في منصّة واحدة، <span style={{ color: colors.accent }}>لحظة بلحظة</span>
            </div>
          </Reveal>
          <Reveal delay={100} y={12}>
            <div style={{ marginTop: 24, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, fontSize: 21, color: colors.accent, fontWeight: 700 }}>
              <span>متزامن الآن</span>
              <span style={{ width: 34, height: 34, borderRadius: "50%", background: "#eafbf3", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <IconCheck width={18} height={18} />
              </span>
            </div>
          </Reveal>
        </div>
      </div>
    </AbsoluteFill>
  );
};
