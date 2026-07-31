import React from "react";
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { theme } from "./theme";
import { headingFont, bodyFont } from "./fonts";
import {
  Card,
  HeroBanner,
  IconChip,
  KpiBar,
  LogoChip,
  PlatformCanvas,
  RevealText,
} from "./components";
import { FontLoader } from "./FontLoader";
import {
  IconArrow,
  IconBuildings,
  IconCart,
  IconCheckCircle,
  IconClock,
  IconFacility,
  IconGlobe,
  IconPhone,
  IconProjects,
  IconShieldCheck,
  IconTarget,
  IconWrench,
} from "./Icons";

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
      color: theme.ink,
      alignItems: "center",
      justifyContent: "center",
      padding: "70px 90px",
    }}
  >
    {children}
  </AbsoluteFill>
);

const SectionTitle: React.FC<{ label: string; delay?: number }> = ({ label, delay = 0 }) => (
  <RevealText delay={delay}>
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ width: 8, height: 34, borderRadius: 4, background: theme.primary }} />
      <div style={{ fontFamily: headingFont, fontWeight: 900, fontSize: 52, color: theme.primary }}>{label}</div>
    </div>
  </RevealText>
);

// المشهد 1 — الافتتاح: بانر المنصة يظهر كأن التطبيق يُفتح
const SceneIntro: React.FC<{ companyName: string; tagline: string }> = ({ companyName, tagline }) => {
  return (
    <Stage>
      <div style={{ width: "100%", maxWidth: 1320, display: "flex", flexDirection: "column", gap: 26 }}>
        <HeroBanner title={companyName} subtitle="نظام إدارة المرافق والمشتريات" delay={2} />
        <RevealText delay={18}>
          <Card padding={30} style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ width: 8, height: 46, borderRadius: 4, background: theme.accent }} />
            <div style={{ fontSize: 34, fontWeight: 700, color: theme.ink, lineHeight: 1.5 }}>{tagline}</div>
          </Card>
        </RevealText>
      </div>
    </Stage>
  );
};

// المشهد 2 — من نحن
const SceneAbout: React.FC = () => {
  const points = [
    { Icon: IconFacility, color: theme.primary, text: "تشغيل وصيانة المباني الحكومية" },
    { Icon: IconShieldCheck, color: theme.accent, text: "أعلى معايير الجودة والالتزام" },
    { Icon: IconProjects, color: theme.warn, text: "إدارة وتقارير رقمية دقيقة" },
  ];
  return (
    <Stage>
      <div style={{ width: "100%", maxWidth: 1360, display: "flex", flexDirection: "column", gap: 30 }}>
        <SectionTitle label="من نحن" delay={2} />
        <RevealText delay={10}>
          <Card accent={theme.primary} padding={40}>
            <div style={{ fontSize: 36, lineHeight: 1.75, color: theme.ink, fontWeight: 600 }}>
              شركة مقاولات متخصصة في تشغيل وصيانة المباني والمرافق الحكومية،
              نقدّم حلولاً متكاملة تجمع بين الخبرة الميدانية والإدارة الرقمية،
              بأعلى معايير الجودة والالتزام بالمواعيد.
            </div>
          </Card>
        </RevealText>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 22 }}>
          {points.map((p, i) => (
            <RevealText key={p.text} delay={20 + i * 6}>
              <Card padding={26} style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <IconChip color={p.color} size={64}>
                  <p.Icon size={34} color={p.color} />
                </IconChip>
                <div style={{ fontSize: 26, fontWeight: 700, color: theme.ink, lineHeight: 1.4 }}>{p.text}</div>
              </Card>
            </RevealText>
          ))}
        </div>
      </div>
    </Stage>
  );
};

const services = [
  { Icon: IconFacility, color: "#1b3a6b", title: "تشغيل وصيانة المرافق", desc: "صيانة وقائية وعلاجية شاملة" },
  { Icon: IconWrench, color: "#0a7c59", title: "الصيانة الفنية", desc: "كهرباء • سباكة • تكييف" },
  { Icon: IconCart, color: "#a06010", title: "إدارة المشتريات", desc: "دورة شراء ذكية ومنظمة" },
  { Icon: IconProjects, color: "#1b3a6b", title: "إدارة المشاريع", desc: "متابعة دقيقة وتقارير لحظية" },
  { Icon: IconBuildings, color: "#0a7c59", title: "خدمات المباني", desc: "نظافة وتشغيل وأمن" },
  { Icon: IconShieldCheck, color: "#a06010", title: "الالتزام بالجودة", desc: "معايير عالية ومواعيد مضمونة" },
];

const ServiceCard: React.FC<{ index: number } & (typeof services)[number]> = ({
  index,
  Icon,
  color,
  title,
  desc,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const delay = 12 + index * 6;
  const s = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  const y = interpolate(s, [0, 1], [42, 0]);
  return (
    <div style={{ opacity: s, transform: `translateY(${y}px)` }}>
      <Card accent={color} padding={30} style={{ height: "100%" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <IconChip color={color} size={76}>
              <Icon size={42} color={color} />
            </IconChip>
            <IconArrow size={26} color={theme.muted} />
          </div>
          <div style={{ fontFamily: headingFont, fontWeight: 800, fontSize: 34, color: theme.primary }}>{title}</div>
          <div style={{ fontSize: 25, color: theme.muted, fontWeight: 600 }}>{desc}</div>
        </div>
      </Card>
    </div>
  );
};

// المشهد 3 — الخدمات
const SceneServices: React.FC = () => {
  return (
    <Stage>
      <div style={{ width: "100%", maxWidth: 1560, display: "flex", flexDirection: "column", gap: 34 }}>
        <SectionTitle label="خدماتنا" delay={0} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 26 }}>
          {services.map((sv, i) => (
            <ServiceCard key={sv.title} index={i} {...sv} />
          ))}
        </div>
      </div>
    </Stage>
  );
};

const AnimatedNumber: React.FC<{ to: number; suffix?: string; color: string; delay: number }> = ({
  to,
  suffix = "",
  color,
  delay,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 60, stiffness: 90 } });
  const value = Math.round(interpolate(s, [0, 1], [0, to], { extrapolateRight: "clamp" }));
  return (
    <span
      style={{
        fontFamily: headingFont,
        fontWeight: 900,
        fontSize: 88,
        color,
        lineHeight: 1,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {value.toLocaleString("ar-EG")}
      {suffix}
    </span>
  );
};

// المشهد 4 — الأرقام (بأسلوب بطاقات KPI في المنصة)
const SceneStats: React.FC = () => {
  const stats = [
    { Icon: IconCheckCircle, color: theme.accent, to: 100, suffix: "٪", label: "التزام بالمواعيد", bar: 100 },
    { Icon: IconClock, color: theme.primary, to: 24, suffix: "/٧", label: "دعم وصيانة مستمر", bar: 92 },
    { Icon: IconTarget, color: theme.warn, to: 360, suffix: "°", label: "حلول متكاملة", bar: 100 },
  ];
  return (
    <Stage>
      <div style={{ width: "100%", maxWidth: 1500, display: "flex", flexDirection: "column", gap: 34 }}>
        <SectionTitle label="لماذا المباني السريعة؟" delay={0} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 26 }}>
          {stats.map((st, i) => {
            const delay = 12 + i * 8;
            return (
              <RevealText key={st.label} delay={delay}>
                <Card accent={st.color} padding={34}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <IconChip color={st.color} size={64}>
                        <st.Icon size={36} color={st.color} />
                      </IconChip>
                    </div>
                    <AnimatedNumber to={st.to} suffix={st.suffix} color={st.color} delay={delay + 2} />
                    <div style={{ fontSize: 28, color: theme.ink, fontWeight: 700 }}>{st.label}</div>
                    <KpiBar to={st.bar} color={st.color} delay={delay + 4} />
                  </div>
                </Card>
              </RevealText>
            );
          })}
        </div>
      </div>
    </Stage>
  );
};

// المشهد 5 — الختام والتواصل
const SceneOutro: React.FC<{ companyName: string; phone: string; website: string }> = ({
  companyName,
  phone,
  website,
}) => {
  return (
    <Stage>
      <div style={{ width: "100%", maxWidth: 1200, display: "flex", flexDirection: "column", alignItems: "center", gap: 30 }}>
        <RevealText delay={2} style={{ display: "flex", justifyContent: "center" }}>
          <LogoChip size={130} />
        </RevealText>
        <RevealText delay={10}>
          <div style={{ fontFamily: headingFont, fontWeight: 900, fontSize: 60, color: theme.primary, textAlign: "center" }}>
            {companyName}
          </div>
        </RevealText>
        <RevealText delay={16}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 60, height: 4, borderRadius: 4, background: theme.accent }} />
            <div style={{ fontSize: 34, color: theme.accent, fontWeight: 800 }}>نبني الثقة… ونصون التميّز</div>
            <div style={{ width: 60, height: 4, borderRadius: 4, background: theme.accent }} />
          </div>
        </RevealText>
        {(phone || website) && (
          <RevealText delay={24}>
            <div style={{ display: "flex", gap: 18, marginTop: 6 }}>
              {phone ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 14, padding: "14px 22px", boxShadow: theme.cardShadow }}>
                  <IconPhone size={28} color={theme.primary} />
                  <span style={{ fontSize: 28, fontWeight: 700, color: theme.ink }}>{phone}</span>
                </div>
              ) : null}
              {website ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 14, padding: "14px 22px", boxShadow: theme.cardShadow }}>
                  <IconGlobe size={28} color={theme.primary} />
                  <span style={{ fontSize: 28, fontWeight: 700, color: theme.ink }}>{website}</span>
                </div>
              ) : null}
            </div>
          </RevealText>
        )}
      </div>
    </Stage>
  );
};

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
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      <FontLoader />
      <PlatformCanvas />
      <Sequence durationInFrames={120}>
        <Fade durationInFrames={120}>
          <SceneIntro companyName={companyName} tagline={tagline} />
        </Fade>
      </Sequence>
      <Sequence from={120} durationInFrames={150}>
        <Fade durationInFrames={150}>
          <SceneAbout />
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
