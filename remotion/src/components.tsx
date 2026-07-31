import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { theme } from "./theme";
import { headingFont } from "./fonts";

// خلفية المنصة — رمادية فاتحة مع نقاط خفيفة (بلا اتجاه صارخ)
export const PlatformCanvas: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: theme.bg }}>
      <AbsoluteFill
        style={{
          backgroundImage: `radial-gradient(${theme.border} 1.4px, transparent 1.4px)`,
          backgroundSize: "34px 34px",
          opacity: 0.55,
        }}
      />
      {/* توهجات ناعمة جداً بلون الهوية */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 82% 8%, ${theme.primary}0d 0%, transparent 34%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 8% 96%, ${theme.accent}0d 0%, transparent 34%)`,
        }}
      />
    </AbsoluteFill>
  );
};

// شريحة أيقونة ملوّنة مثل أيقونات التطبيق
export const IconChip: React.FC<{
  color: string;
  size?: number;
  children: React.ReactNode;
}> = ({ color, size = 84, children }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: size * 0.28,
      background: `${color}14`,
      border: `1px solid ${color}2e`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    }}
  >
    {children}
  </div>
);

// كارت أبيض مطابق لـ .card في المنصة، بشريط علوي ملوّن اختياري
export const Card: React.FC<{
  children: React.ReactNode;
  accent?: string;
  style?: React.CSSProperties;
  padding?: number;
}> = ({ children, accent, style, padding = 34 }) => (
  <div
    style={{
      background: theme.surface,
      border: `1px solid ${theme.border}`,
      borderTop: accent ? `4px solid ${accent}` : `1px solid ${theme.border}`,
      borderRadius: 16,
      boxShadow: theme.cardShadowLg,
      padding,
      boxSizing: "border-box",
      ...style,
    }}
  >
    {children}
  </div>
);

// بانر الـ hero — الرأس الأزرق المتكرر في كل شاشات المنصة
export const HeroBanner: React.FC<{
  title: string;
  subtitle?: string;
  delay?: number;
  compact?: boolean;
}> = ({ title, subtitle, delay = 0, compact }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  const y = interpolate(s, [0, 1], [30, 0]);
  return (
    <div
      style={{
        opacity: s,
        transform: `translateY(${y}px)`,
        background: theme.heroGradient,
        borderRadius: 20,
        padding: compact ? "26px 34px" : "30px 40px",
        display: "flex",
        alignItems: "center",
        gap: 22,
        boxShadow: theme.cardShadowLg,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* لمعة زخرفية */}
      <div
        style={{
          position: "absolute",
          insetInlineStart: -80,
          top: -120,
          width: 320,
          height: 320,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.06)",
        }}
      />
      <LogoChip size={compact ? 64 : 74} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontFamily: headingFont, fontWeight: 900, fontSize: compact ? 40 : 48, color: "#fff", lineHeight: 1.2 }}>
          {title}
        </div>
        {subtitle ? (
          <div style={{ fontSize: 24, color: "rgba(255,255,255,0.82)", fontWeight: 600 }}>{subtitle}</div>
        ) : null}
      </div>
    </div>
  );
};

// شريحة الشعار البيضاء (مربع دائري)
export const LogoChip: React.FC<{ size?: number }> = ({ size = 74 }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: size * 0.26,
      background: "#fff",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      boxShadow: "0 6px 18px rgba(0,0,0,0.18)",
    }}
  >
    <Img src={staticFile("logo.png")} style={{ width: size * 0.66, height: "auto" }} />
  </div>
);

// ظهور نصي متحرك للأعلى مع تلاشي
export const RevealText: React.FC<{
  children: React.ReactNode;
  delay?: number;
  style?: React.CSSProperties;
}> = ({ children, delay = 0, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  const y = interpolate(s, [0, 1], [26, 0]);
  return (
    <div style={{ opacity: s, transform: `translateY(${y}px)`, ...style }}>
      {children}
    </div>
  );
};

// شريط تقدّم KPI يتعبّى — من kpi-li-bar في المنصة
export const KpiBar: React.FC<{ to: number; color: string; delay: number }> = ({ to, color, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 60, stiffness: 90 } });
  const w = interpolate(s, [0, 1], [0, to], { extrapolateRight: "clamp" });
  return (
    <div style={{ height: 10, background: theme.surface2, borderRadius: 6, overflow: "hidden", width: "100%" }}>
      <div
        style={{
          height: "100%",
          width: `${w}%`,
          borderRadius: 6,
          background: `linear-gradient(90deg, ${color}, ${color}bb)`,
        }}
      />
    </div>
  );
};
