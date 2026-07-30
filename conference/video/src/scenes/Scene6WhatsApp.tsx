import React from "react";
import { AbsoluteFill } from "remotion";
import { colors, shadowLg, FONT_UI } from "../tokens";
import { Reveal } from "../Reveal";

export const Scene6WhatsApp: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: colors.bg, alignItems: "center", justifyContent: "center", fontFamily: FONT_UI, direction: "rtl", padding: 100 }}>
      <Reveal delay={2} style={{ marginBottom: 30 }}>
        <div style={{ fontSize: 26, fontWeight: 700, color: colors.accent }}>استجابة فورية</div>
      </Reveal>

      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", inset: -110, background: "radial-gradient(circle, rgba(10,124,89,0.14), transparent 70%)", zIndex: -1 }} />
        <div style={{ width: 340, height: 690, border: "10px solid #14202b", borderRadius: 40, background: "#0b141a", position: "relative", overflow: "hidden", boxShadow: shadowLg }}>
          <div style={{ height: 62, background: "#1a2b31", display: "flex", alignItems: "center", gap: 12, padding: "0 20px" }}>
            <span style={{ width: 36, height: 36, borderRadius: "50%", background: colors.primary, color: "#fff", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>FB</span>
            <span style={{ fontSize: 19, color: "#e9f2f1", fontWeight: 700 }}>الدعم الفني</span>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#4fd67a", marginRight: "auto" }} />
          </div>

          <Reveal delay={24} y={30} style={{ position: "absolute", bottom: 44, right: 24, left: 24 }}>
            <div style={{ background: "#005c4b", color: "#fff", borderRadius: 22, padding: "22px 24px", fontSize: 22, textAlign: "right", lineHeight: 1.6 }}>
              🔧 مرحباً أحمد، تم إسناد بلاغ صيانة إليك.
              <br />
              المبنى: البرج الرئيسي — الأولوية: عاجلة
              <div style={{ display: "block", marginTop: 12, fontSize: 17, color: "rgba(255,255,255,0.65)", direction: "ltr", textAlign: "left" }}>
                10:42 ✓✓
              </div>
            </div>
          </Reveal>
        </div>
      </div>

      <Reveal delay={42} style={{ marginTop: 40 }}>
        <div style={{ fontSize: 32, fontWeight: 800, color: colors.primary }}>
          الفني يستلم البلاغ على واتساب <span style={{ color: colors.accent }}>لحظة إسناده</span>
        </div>
      </Reveal>
    </AbsoluteFill>
  );
};
