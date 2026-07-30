import React from "react";
import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { theme } from "./theme";
import { headingFont, bodyFont } from "./fonts";
import { AccentBar, BlueprintBackground, RevealText } from "./components";
import { FontLoader } from "./FontLoader";

export type AnnouncementProps = {
  companyName: string;
  tagline: string;
  phone: string;
  website: string;
};

const Stage: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill
    style={{
      direction: "rtl",
      fontFamily: bodyFont,
      color: theme.white,
      alignItems: "center",
      justifyContent: "center",
      padding: 80,
    }}
  >
    {children}
  </AbsoluteFill>
);

// المشهد 1 — ظهور الشعار واسم الشركة
const SceneIntro: React.FC<{ companyName: string }> = ({ companyName }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logoSpring = spring({ frame, fps, config: { damping: 12, mass: 0.9 } });
  const logoScale = interpolate(logoSpring, [0, 1], [0.3, 1]);
  const ring = interpolate(frame, [0, 40], [0, 1], { extrapolateRight: "clamp" });
  return (
    <Stage>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 34 }}>
        <div style={{ position: "relative", width: 260, height: 260, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              border: `3px solid ${theme.gold}`,
              opacity: 0.5 * ring,
              transform: `scale(${1 + (1 - ring) * 0.4})`,
            }}
          />
          <div
            style={{
              width: 220,
              height: 220,
              borderRadius: "50%",
              background: theme.white,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transform: `scale(${logoScale})`,
              boxShadow: `0 30px 80px rgba(0,0,0,0.45)`,
            }}
          >
            <Img src={staticFile("logo.png")} style={{ width: 150, height: "auto" }} />
          </div>
        </div>
        <RevealText delay={22}>
          <div style={{ fontFamily: headingFont, fontWeight: 900, fontSize: 82, textAlign: "center", lineHeight: 1.2 }}>
            {companyName}
          </div>
        </RevealText>
        <RevealText delay={34}>
          <AccentBar width={340} delay={34} />
        </RevealText>
      </div>
    </Stage>
  );
};

// المشهد 2 — من نحن
const SceneAbout: React.FC<{ tagline: string }> = ({ tagline }) => {
  return (
    <Stage>
      <div style={{ maxWidth: 1300, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 30 }}>
        <RevealText delay={2}>
          <div style={{ fontFamily: headingFont, fontWeight: 800, fontSize: 40, color: theme.gold, letterSpacing: 2 }}>
            من نحن
          </div>
        </RevealText>
        <RevealText delay={10}>
          <div style={{ fontFamily: headingFont, fontWeight: 900, fontSize: 66, lineHeight: 1.35 }}>
            {tagline}
          </div>
        </RevealText>
        <RevealText delay={20}>
          <div style={{ fontSize: 36, color: theme.cloud, lineHeight: 1.7, maxWidth: 1100 }}>
            شركة مقاولات متخصصة في تشغيل وصيانة المباني والمرافق الحكومية،
            نقدّم حلولاً متكاملة بأعلى معايير الجودة والالتزام.
          </div>
        </RevealText>
      </div>
    </Stage>
  );
};

const services: { icon: string; title: string; desc: string }[] = [
  { icon: "🏗️", title: "تشغيل وصيانة المرافق", desc: "صيانة وقائية وعلاجية شاملة" },
  { icon: "🔧", title: "الصيانة الفنية", desc: "كهرباء • سباكة • تكييف" },
  { icon: "📦", title: "إدارة المشتريات", desc: "دورة شراء ذكية ومنظمة" },
  { icon: "📊", title: "إدارة المشاريع", desc: "متابعة دقيقة وتقارير لحظية" },
  { icon: "🏢", title: "خدمات المباني", desc: "نظافة وتشغيل وأمن" },
  { icon: "✅", title: "الالتزام بالجودة", desc: "معايير عالية ومواعيد مضمونة" },
];

const ServiceCard: React.FC<{ index: number; icon: string; title: string; desc: string }> = ({
  index,
  icon,
  title,
  desc,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const delay = 8 + index * 7;
  const s = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  const y = interpolate(s, [0, 1], [50, 0]);
  return (
    <div
      style={{
        opacity: s,
        transform: `translateY(${y}px)`,
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.14)",
        borderRadius: 24,
        padding: "34px 30px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        backdropFilter: "blur(4px)",
        boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
      }}
    >
      <div style={{ fontSize: 60 }}>{icon}</div>
      <div style={{ fontFamily: headingFont, fontWeight: 800, fontSize: 38 }}>{title}</div>
      <div style={{ fontSize: 27, color: theme.cloud }}>{desc}</div>
    </div>
  );
};

// المشهد 3 — الخدمات
const SceneServices: React.FC = () => {
  return (
    <Stage>
      <div style={{ width: "100%", maxWidth: 1560, display: "flex", flexDirection: "column", gap: 44 }}>
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
          <RevealText delay={0}>
            <div style={{ fontFamily: headingFont, fontWeight: 900, fontSize: 62 }}>خدماتنا</div>
          </RevealText>
          <RevealText delay={4}>
            <AccentBar width={220} delay={4} />
          </RevealText>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 30,
          }}
        >
          {services.map((sv, i) => (
            <ServiceCard key={sv.title} index={i} {...sv} />
          ))}
        </div>
      </div>
    </Stage>
  );
};

const AnimatedNumber: React.FC<{ to: number; suffix?: string; delay: number }> = ({
  to,
  suffix = "",
  delay,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  const value = Math.round(interpolate(s, [0, 1], [0, to]));
  return (
    <span style={{ fontFamily: headingFont, fontWeight: 900, fontSize: 96, color: theme.gold }}>
      {value.toLocaleString("ar-EG")}
      {suffix}
    </span>
  );
};

// المشهد 4 — الأرقام والقيمة
const SceneStats: React.FC = () => {
  const stats = [
    { to: 100, suffix: "٪", label: "التزام بالمواعيد" },
    { to: 24, suffix: "/٧", label: "دعم وصيانة" },
    { to: 360, suffix: "°", label: "حلول متكاملة" },
  ];
  return (
    <Stage>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 60, width: "100%" }}>
        <RevealText delay={0}>
          <div style={{ fontFamily: headingFont, fontWeight: 900, fontSize: 60, textAlign: "center" }}>
            لماذا المباني السريعة؟
          </div>
        </RevealText>
        <div style={{ display: "flex", gap: 90, justifyContent: "center", flexWrap: "wrap" }}>
          {stats.map((st, i) => (
            <div key={st.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
              <AnimatedNumber to={st.to} suffix={st.suffix} delay={10 + i * 8} />
              <RevealText delay={14 + i * 8}>
                <div style={{ fontSize: 34, color: theme.cloud }}>{st.label}</div>
              </RevealText>
            </div>
          ))}
        </div>
      </div>
    </Stage>
  );
};

// المشهد 5 — الختام والدعوة للتواصل
const SceneOutro: React.FC<{ companyName: string; phone: string; website: string }> = ({
  companyName,
  phone,
  website,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logoSpring = spring({ frame, fps, config: { damping: 14 } });
  const scale = interpolate(logoSpring, [0, 1], [0.6, 1]);
  return (
    <Stage>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 30 }}>
        <div
          style={{
            width: 180,
            height: 180,
            borderRadius: "50%",
            background: theme.white,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: `scale(${scale})`,
            boxShadow: `0 24px 60px rgba(0,0,0,0.45)`,
          }}
        >
          <Img src={staticFile("logo.png")} style={{ width: 118, height: "auto" }} />
        </div>
        <RevealText delay={12}>
          <div style={{ fontFamily: headingFont, fontWeight: 900, fontSize: 70, textAlign: "center" }}>
            {companyName}
          </div>
        </RevealText>
        <RevealText delay={20}>
          <AccentBar width={300} delay={20} />
        </RevealText>
        <RevealText delay={26}>
          <div style={{ fontSize: 40, color: theme.gold, fontWeight: 700 }}>
            نبني الثقة… ونصون التميّز
          </div>
        </RevealText>
        {(phone || website) && (
          <RevealText delay={34}>
            <div style={{ display: "flex", gap: 40, fontSize: 32, color: theme.cloud, marginTop: 8 }}>
              {phone ? <span>📞 {phone}</span> : null}
              {website ? <span>🌐 {website}</span> : null}
            </div>
          </RevealText>
        )}
      </div>
    </Stage>
  );
};

// انتقال بالتلاشي بين المشاهد
const Fade: React.FC<{ children: React.ReactNode; durationInFrames: number }> = ({
  children,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 12, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp" }
  );
  return <AbsoluteFill style={{ opacity: Math.min(fadeIn, fadeOut) }}>{children}</AbsoluteFill>;
};

export const CompanyAnnouncement: React.FC<AnnouncementProps> = ({
  companyName,
  tagline,
  phone,
  website,
}) => {
  return (
    <AbsoluteFill style={{ backgroundColor: theme.navyDark }}>
      <FontLoader />
      <BlueprintBackground />
      <Sequence durationInFrames={120}>
        <Fade durationInFrames={120}>
          <SceneIntro companyName={companyName} />
        </Fade>
      </Sequence>
      <Sequence from={120} durationInFrames={150}>
        <Fade durationInFrames={150}>
          <SceneAbout tagline={tagline} />
        </Fade>
      </Sequence>
      <Sequence from={270} durationInFrames={240}>
        <Fade durationInFrames={240}>
          <SceneServices />
        </Fade>
      </Sequence>
      <Sequence from={510} durationInFrames={150}>
        <Fade durationInFrames={150}>
          <SceneStats />
        </Fade>
      </Sequence>
      <Sequence from={660} durationInFrames={240}>
        <Fade durationInFrames={240}>
          <SceneOutro companyName={companyName} phone={phone} website={website} />
        </Fade>
      </Sequence>
    </AbsoluteFill>
  );
};
