import React from "react";
import {
  AbsoluteFill,
  Audio,
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
import {
  BrandMark,
  Card,
  HeroBanner,
  IconChip,
  KpiBar,
  LogoChip,
  PlatformCanvas,
  RevealText,
  ScreenFrame,
} from "./components";
import { FontLoader } from "./FontLoader";
import {
  IconArrow,
  IconAnvil,
  IconAward,
  IconBuildings,
  IconCart,
  IconCheckCircle,
  IconClock,
  IconFacility,
  IconGlobe,
  IconGov,
  IconPhone,
  IconProjects,
  IconShieldCheck,
  IconTarget,
  IconTick,
  IconWrench,
} from "./Icons";
import { clients } from "./clients";
import { divisions } from "./divisions";
import { certifications, classification } from "./certifications";
import { experienceYears } from "./company";
import { regions } from "./regions";
import { SaudiMap } from "./SaudiMap";

export type AnnouncementProps = {
  companyName: string;
  tagline: string;
  phone: string;
  website: string;
  /** مستوى موسيقى الخلفية من 0 (صامت) إلى 1 */
  musicVolume?: number;
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
        <HeroBanner title={companyName} subtitle="شركة سعودية منذ عام ١٩٨٣" delay={2} />
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
    { Icon: IconBuildings, color: theme.primary, text: "الدرجة الأولى في التشييد والبناء" },
    { Icon: IconFacility, color: theme.accent, text: "الدرجة الأولى في التشغيل والصيانة" },
    { Icon: IconAnvil, color: theme.warn, text: "ورش تصنيع معادن مستقلة" },
  ];
  return (
    <Stage>
      <div style={{ width: "100%", maxWidth: 1360, display: "flex", flexDirection: "column", gap: 30 }}>
        <SectionTitle label="من نحن" delay={2} />
        <RevealText delay={10}>
          <Card accent={theme.primary} padding={40}>
            <div style={{ fontSize: 36, lineHeight: 1.75, color: theme.ink, fontWeight: 600 }}>
              شركة سعودية تعمل منذ عام ١٩٨٣ في ثلاثة قطاعات متكاملة:
              المقاولات، وإدارة المرافق، وتصنيع المعادن — نجمع بين الخبرة
              الميدانية والإدارة الرقمية بأعلى معايير الجودة والالتزام.
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

const DIVISION_STYLE = {
  contracting: { color: "#1b3a6b", Icon: IconBuildings },
  facilities: { color: "#0a7c59", Icon: IconFacility },
  metals: { color: "#a06010", Icon: IconAnvil },
} as const;

// المشهد 3 — قطاعات الأعمال الثلاثة
const SceneDivisions: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <Stage>
      <div style={{ width: "100%", maxWidth: 1580, display: "flex", flexDirection: "column", gap: 30 }}>
        <SectionTitle label="قطاعات أعمالنا" delay={0} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 26 }}>
          {divisions.map((d, i) => {
            const st = DIVISION_STYLE[d.key];
            const delay = 10 + i * 8;
            const sp = spring({ frame: frame - delay, fps, config: { damping: 200 } });
            const y = interpolate(sp, [0, 1], [44, 0]);
            return (
              <div key={d.key} style={{ opacity: sp, transform: `translateY(${y}px)` }}>
                <Card accent={st.color} padding={30} style={{ height: "100%" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      <IconChip color={st.color} size={72}>
                        <st.Icon size={40} color={st.color} />
                      </IconChip>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        <div style={{ fontFamily: headingFont, fontWeight: 900, fontSize: 40, color: st.color }}>
                          {d.name}
                        </div>
                        <div style={{ fontSize: 21, color: theme.muted, fontWeight: 700 }}>{d.tagline}</div>
                      </div>
                    </div>
                    <div style={{ height: 1, background: theme.border }} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {d.services.map((sv, j) => {
                        const sd = delay + 8 + j * 4;
                        const o = spring({ frame: frame - sd, fps, config: { damping: 200 } });
                        return (
                          <div
                            key={sv}
                            style={{ display: "flex", alignItems: "center", gap: 11, opacity: o }}
                          >
                            <IconTick size={22} color={st.color} />
                            <div style={{ fontSize: 25, fontWeight: 700, color: theme.ink }}>{sv}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </Card>
              </div>
            );
          })}
        </div>
      </div>
    </Stage>
  );
};

// المشهد 4 — عملاؤنا (لوجو + اسم العميل)
// التخطيط يتكيّف مع عدد العملاء: بطاقة كبيرة للواحد أو الاثنين، وشبكة لما زاد.
const SceneClients: React.FC = () => {
  const count = clients.length;
  const columns = count <= 2 ? count : count <= 6 ? 3 : 4;
  const featured = count <= 2;
  // وضع مكثّف عند كثرة العملاء حتى تتسع الشبكة دون ازدحام
  const dense = count >= 7;

  const GAP = dense ? 18 : 26;
  const sz = {
    logoH: featured ? 170 : dense ? 92 : 132,
    logoW: featured ? 320 : dense ? 180 : 250,
    pad: featured ? 44 : dense ? 20 : 30,
    name: featured ? 42 : dense ? 21 : 30,
    sector: featured ? 26 : dense ? 16 : 22,
    stack: featured ? 20 : dense ? 12 : 20,
  };

  return (
    <Stage>
      <div
        style={{
          width: "100%",
          maxWidth: dense ? 1660 : 1500,
          display: "flex",
          flexDirection: "column",
          gap: dense ? 24 : 34,
        }}
      >
        <SectionTitle label="عملاؤنا" delay={0} />
        <RevealText delay={6}>
          <div style={{ fontSize: 30, color: theme.muted, fontWeight: 600, marginTop: -12 }}>
            نفخر بثقة الجهات التي نعمل معها
          </div>
        </RevealText>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: GAP,
            justifyContent: "center",
            maxWidth: featured ? 760 * count : "100%",
            marginInline: featured ? "auto" : undefined,
            width: featured ? "100%" : undefined,
          }}
        >
          {clients.map((c, i) => (
            <RevealText
              key={c.name}
              delay={14 + i * (dense ? 4 : 7)}
              style={{ width: `calc((100% - ${(columns - 1) * GAP}px) / ${columns})` }}
            >
              <Card accent={theme.primary} padding={sz.pad} style={{ height: "100%" }}>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: sz.stack,
                    height: "100%",
                  }}
                >
                  <div
                    style={{
                      height: sz.logoH,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {c.logo ? (
                      <Img
                        src={staticFile(c.logo)}
                        style={{ maxHeight: "100%", maxWidth: sz.logoW, objectFit: "contain" }}
                      />
                    ) : (
                      <IconChip color={theme.primary} size={featured ? 130 : dense ? 74 : 96}>
                        <IconGov size={featured ? 74 : dense ? 42 : 54} color={theme.primary} />
                      </IconChip>
                    )}
                  </div>
                  <div
                    style={{
                      textAlign: "center",
                      display: "flex",
                      flexDirection: "column",
                      gap: dense ? 5 : 8,
                      marginTop: "auto",
                    }}
                  >
                    <div
                      style={{
                        fontFamily: headingFont,
                        fontWeight: 800,
                        fontSize: sz.name,
                        color: theme.primary,
                        lineHeight: 1.3,
                      }}
                    >
                      {c.name}
                    </div>
                    {c.sector ? (
                      <div style={{ fontSize: sz.sector, color: theme.muted, fontWeight: 600 }}>
                        {c.sector}
                      </div>
                    ) : null}
                  </div>
                </div>
              </Card>
            </RevealText>
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

// المشهد 5 — نطاق الأعمال الجغرافي
const SceneReach: React.FC = () => {
  const hq = regions.find((r) => r.hq);
  return (
    <Stage>
      <div style={{ width: "100%", maxWidth: 1580, display: "flex", alignItems: "center", gap: 60 }}>
        <div style={{ width: 520, display: "flex", flexDirection: "column", gap: 24 }}>
          <SectionTitle label="نطاق أعمالنا" delay={0} />
          <RevealText delay={8}>
            <div style={{ fontSize: 30, color: theme.ink, fontWeight: 600, lineHeight: 1.65 }}>
              ننطلق من {hq ? hq.name : "مقرنا"} إلى مواقع عملائنا في
              المقاولات وإدارة المرافق وتصنيع المعادن، بفرق ميدانية جاهزة
              وإدارة مركزية تتابع كل موقع.
            </div>
          </RevealText>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 4 }}>
            {regions.map((r, i) => (
              <RevealText key={r.name} delay={50 + i * 8}>
                <Card padding={20} style={{ display: "flex", alignItems: "center", gap: 15 }}>
                  <div
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      background: r.hq ? theme.accent : theme.primary,
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ fontFamily: headingFont, fontWeight: 800, fontSize: 30, color: theme.primary }}>
                    {r.name}
                  </div>
                  {r.note ? (
                    <div style={{ fontSize: 23, color: theme.muted, fontWeight: 600 }}>{r.note}</div>
                  ) : null}
                </Card>
              </RevealText>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center" }}>
          <SaudiMap width={920} />
        </div>
      </div>
    </Stage>
  );
};

// المشهد 6 — المنصة الرقمية (لقطات حقيقية من نظام الشركة)
const ScenePlatform: React.FC = () => {
  const features = [
    { Icon: IconProjects, text: "متابعة العقود والمشاريع لحظياً" },
    { Icon: IconFacility, text: "خريطة تشغيلية لكل موقع ومبنى" },
    { Icon: IconCart, text: "دورة مشتريات وتوريد موثّقة" },
    { Icon: IconCheckCircle, text: "مؤشرات أداء بأهداف محددة" },
  ];
  return (
    <Stage>
      <div style={{ width: "100%", maxWidth: 1620, display: "flex", alignItems: "center", gap: 54 }}>
        {/* النص على اليمين لأن التخطيط RTL */}
        <div style={{ width: 520, display: "flex", flexDirection: "column", gap: 22 }}>
          <SectionTitle label="منصتنا الرقمية" delay={0} />
          <RevealText delay={8}>
            <div style={{ fontSize: 29, color: theme.ink, fontWeight: 600, lineHeight: 1.65 }}>
              لا نكتفي بالتنفيذ — ندير قطاعاتنا الثلاثة عبر نظام رقمي خاص
              يمنح عملاءنا شفافية كاملة على كل أمر عمل وكل ريال.
            </div>
          </RevealText>
          <div style={{ display: "flex", flexDirection: "column", gap: 13, marginTop: 4 }}>
            {features.map((f, i) => (
              <RevealText key={f.text} delay={16 + i * 5}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <IconChip color={theme.accent} size={50}>
                    <f.Icon size={28} color={theme.accent} />
                  </IconChip>
                  <div style={{ fontSize: 25, fontWeight: 700, color: theme.ink }}>{f.text}</div>
                </div>
              </RevealText>
            ))}
          </div>
        </div>

        {/* اللقطات على اليسار، متراكبة لإيحاء العمق */}
        <div style={{ flex: 1, position: "relative", height: 660 }}>
          <RevealText delay={6} style={{ position: "absolute", top: 0, right: 0 }}>
            <ScreenFrame src="platform/dashboard.png" width={760} />
          </RevealText>
          <RevealText delay={14} style={{ position: "absolute", top: 196, left: 24 }}>
            <ScreenFrame src="platform/buildings.png" width={620} />
          </RevealText>
          <RevealText delay={22} style={{ position: "absolute", top: 392, right: 96 }}>
            <ScreenFrame src="platform/kpi.png" width={520} />
          </RevealText>
        </div>
      </div>
    </Stage>
  );
};

// المشهد 6 — الشهادات والاعتمادات
const SceneCertifications: React.FC = () => {
  return (
    <Stage>
      <div style={{ width: "100%", maxWidth: 1560, display: "flex", flexDirection: "column", gap: 26 }}>
        <SectionTitle label="شهاداتنا واعتماداتنا" delay={0} />

        {/* التصنيف الرسمي — الاعتماد الأقوى، لذا يأخذ بطاقة مستقلة */}
        <RevealText delay={8}>
          <Card accent={theme.accent} padding={32}>
            <div style={{ display: "flex", alignItems: "center", gap: 30 }}>
              <IconChip color={theme.accent} size={92}>
                <IconAward size={52} color={theme.accent} />
              </IconChip>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontFamily: headingFont, fontWeight: 800, fontSize: 36, color: theme.primary }}>
                  {classification.name}
                </div>
                <div style={{ fontSize: 24, color: theme.muted, fontWeight: 600 }}>
                  {classification.issuer}
                </div>
                <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                  {classification.fields.map((f) => (
                    <div
                      key={f}
                      style={{
                        background: theme.surface2,
                        border: `1px solid ${theme.border}`,
                        borderRadius: 999,
                        padding: "9px 20px",
                        fontSize: 23,
                        fontWeight: 700,
                        color: theme.ink,
                      }}
                    >
                      {f}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ textAlign: "center", paddingInline: 14 }}>
                <div style={{ fontFamily: headingFont, fontWeight: 900, fontSize: 54, color: theme.accent, lineHeight: 1.1 }}>
                  {classification.grade}
                </div>
              </div>
            </div>
          </Card>
        </RevealText>

        {/* المواصفات الدولية */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 22 }}>
          {certifications.map((c, i) => (
            <RevealText key={c.code} delay={20 + i * 6}>
              <Card accent={theme.primary} padding={26} style={{ height: "100%" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
                  <IconChip color={theme.primary} size={68}>
                    <IconAward size={38} color={theme.primary} />
                  </IconChip>
                  <div
                    style={{
                      fontFamily: headingFont,
                      fontWeight: 900,
                      fontSize: 34,
                      color: theme.primary,
                      direction: "ltr",
                      unicodeBidi: "isolate",
                    }}
                  >
                    {c.code}
                  </div>
                  <div style={{ fontSize: 24, color: theme.muted, fontWeight: 700, textAlign: "center" }}>
                    {c.title}
                  </div>
                </div>
              </Card>
            </RevealText>
          ))}
        </div>
      </div>
    </Stage>
  );
};

// المشهد 6 — الأرقام (بأسلوب بطاقات KPI في المنصة)
// كل رقم مشتقّ من بيانات حقيقية: قائمة العملاء وسنة التأسيس.
const SceneStats: React.FC = () => {
  const sectorCount = new Set(
    clients.map((c) => c.sector).filter(Boolean)
  ).size;

  const stats = [
    {
      Icon: IconShieldCheck,
      color: theme.accent,
      to: clients.length,
      suffix: "",
      label: "جهة تثق بنا",
      bar: 100,
    },
    {
      Icon: IconTarget,
      color: theme.primary,
      to: sectorCount,
      suffix: "",
      label: "قطاعات نخدمها",
      bar: 100,
    },
    {
      Icon: IconClock,
      color: theme.warn,
      to: experienceYears(),
      suffix: "",
      label: "عاماً من الخبرة",
      bar: 100,
    },
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
                  {/* الاتجاه من اليسار حتى يظهر الرقم الدولي بترتيبه الصحيح */}
                  <span
                    style={{
                      fontSize: 28,
                      fontWeight: 700,
                      color: theme.ink,
                      direction: "ltr",
                      unicodeBidi: "isolate",
                    }}
                  >
                    {phone}
                  </span>
                </div>
              ) : null}
              {website ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 14, padding: "14px 22px", boxShadow: theme.cardShadow }}>
                  <IconGlobe size={28} color={theme.primary} />
                  <span
                    style={{
                      fontSize: 28,
                      fontWeight: 700,
                      color: theme.ink,
                      direction: "ltr",
                      unicodeBidi: "isolate",
                    }}
                  >
                    {website}
                  </span>
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
  musicVolume = 0.7,
}) => {
  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      <FontLoader />
      {musicVolume > 0 ? (
        <Audio src={staticFile("audio/background.mp3")} volume={musicVolume} />
      ) : null}
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
          <SceneDivisions />
        </Fade>
      </Sequence>
      <Sequence from={510} durationInFrames={210}>
        <Fade durationInFrames={210}>
          <SceneClients />
        </Fade>
      </Sequence>
      <Sequence from={720} durationInFrames={150}>
        <Fade durationInFrames={150}>
          <SceneReach />
        </Fade>
      </Sequence>
      <Sequence from={870} durationInFrames={180}>
        <Fade durationInFrames={180}>
          <ScenePlatform />
        </Fade>
      </Sequence>
      <Sequence from={1050} durationInFrames={180}>
        <Fade durationInFrames={180}>
          <SceneCertifications />
        </Fade>
      </Sequence>
      <Sequence from={1230} durationInFrames={150}>
        <Fade durationInFrames={150}>
          <SceneStats />
        </Fade>
      </Sequence>
      <Sequence from={1380} durationInFrames={240}>
        <Fade durationInFrames={240}>
          <SceneOutro companyName={companyName} phone={phone} website={website} />
        </Fade>
      </Sequence>
      {/* علامة الشركة فوق كل المشاهد */}
      <BrandMark />
    </AbsoluteFill>
  );
};
