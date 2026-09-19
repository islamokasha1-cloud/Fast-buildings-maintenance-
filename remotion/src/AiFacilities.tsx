import React from "react";
import {
  AbsoluteFill,
  Sequence,
  Video,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { theme } from "./theme";
import { headingFont, bodyFont } from "./fonts";
import { BrandMark, Card, IconChip, KpiBar, PlatformCanvas, RevealText } from "./components";
import { FontLoader } from "./FontLoader";
import { PlatformIntro } from "./PlatformIntro";
import {
  IconBolt,
  IconBulb,
  IconCamera,
  IconDatabase,
  IconDocument,
  IconDrone,
  IconImage,
  IconLedger,
  IconLock,
  IconPulse,
  IconRepeat,
  IconRobot,
  IconSensor,
  IconSparkles,
  IconTable,
  IconThermometer,
  IconTick,
  IconTicket,
  IconUserCheck,
  IconWrench,
} from "./Icons";

/**
 * فيديو «الذكاء الاصطناعي في إدارة المرافق» — الجزءُ العامّ (خارج المنصة).
 *
 * المشكلة: الإعلانُ يعرّف بالشركة، وجولةُ `promo-video.mjs` تعرض شاشاتِ المنصة —
 * ولا مكانَ بينهما لموضوعٍ مستقلّ (حسّاسات · كاميرات · روبوتات · صيانة تنبّؤية)
 * يمهّد لما تفعله المنصة بالذكاء الاصطناعي. الكتابةُ في مشاهد الإعلان تُفسده
 * (فيعد بما لا يعرضه)، والنسخُ يضاعف الصيانة.
 *
 * المبدأ: تركيبةٌ مستقلّةٌ باللغة البصرية نفسِها (التوكنات · الكروت · الأيقونات
 * الخطية · Cairo)، نصوصُها كلُّها في `defaultProps` (src/Root.tsx) لا هنا، وبلا
 * رقمٍ أو ادّعاءٍ لا مصدرَ له: الرقمُ الوحيد (عددُ أدوات المنصة) مشتقٌّ من طول
 * القائمة. مشاهدُ الحلول تُصاغ «حلولاً نقدّمها» لا «نطبّق» — فالجولةُ لا تعرضها.
 *
 * القرار: كلُّ مشهدٍ رسمٌ متجهيٌّ قائمٌ بذاته، ويقبل اختيارياً لقطةً مولَّدةً
 * (`clips`، من `higgsfield-shots.mjs`) تحلّ محلَّ الرسم داخل الإطار نفسِه — فالفيديو
 * يخرج مكتملاً بلا لقطات، ويتحسّن بها دون تعديل. `Video` بـ`loop` لا
 * `OffthreadVideo`: اللقطةُ قد تقصر عن المشهد، والتكرارُ أهونُ من قطعٍ إلى سواد.
 *
 * لا موسيقى هنا: `promo-assemble.mjs` يفرشها على الفيلم كلِّه دفعةً واحدة.
 */

export type AiClipKey = "problem" | "building" | "camera" | "robots" | "predictive";

export type AiFacilitiesProps = {
  companyName: string;
  /** عنوانُ الموضوع في الافتتاحية */
  title: string;
  subtitle: string;
  /** لقطاتٌ مولَّدة خلفيةً للمشاهد — مساراتٌ تحت public/ (مثل ai/building.mp4). الغيابُ = رسمٌ متجهيّ. */
  clips: Partial<Record<AiClipKey, string>>;
  texts: {
    problem: { title: string; lead: string; columns: string[]; items: string[] };
    building: { title: string; lead: string; gauges: { light: string; hvac: string; energy: string }; floorNote: string };
    camera: { title: string; lead: string; camLabel: string; detection: string; ticket: string; ticketSub: string };
    robots: { title: string; lead: string; cards: { title: string; sub: string }[] };
    predictive: { title: string; lead: string; chartLabel: string; alert: string; ticket: string; steps: string[] };
    principles: { title: string; items: { title: string; sub: string }[] };
    platform: { title: string; leadBefore: string; leadAfter: string; tools: string[] };
  };
};

/* ─── الخطُّ الزمنيّ: مدّةُ كلِّ مشهدٍ بالإطارات (٣٠ إطاراً/ث) ─── */
export const AI_SCENES = [
  { key: "intro", frames: 150 },
  { key: "problem", frames: 300 },
  { key: "building", frames: 360 },
  { key: "camera", frames: 330 },
  { key: "robots", frames: 330 },
  { key: "predictive", frames: 330 },
  { key: "principles", frames: 270 },
  { key: "platform", frames: 240 },
] as const;
export const AI_TOTAL_FRAMES = AI_SCENES.reduce((s, x) => s + x.frames, 0);
const startOf = (key: (typeof AI_SCENES)[number]["key"]) => {
  let f = 0;
  for (const s of AI_SCENES) { if (s.key === key) return f; f += s.frames; }
  return f;
};
const framesOf = (key: (typeof AI_SCENES)[number]["key"]) => AI_SCENES.find((s) => s.key === key)!.frames;

/* ─── مكوّناتٌ مشتركةٌ بين المشاهد ─── */
const Stage: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill
    style={{ direction: "rtl", fontFamily: bodyFont, color: theme.ink, alignItems: "center", justifyContent: "center", padding: "70px 90px" }}
  >
    {children}
  </AbsoluteFill>
);

const SectionTitle: React.FC<{ label: string; delay?: number; size?: number }> = ({ label, delay = 0, size = 52 }) => (
  <RevealText delay={delay}>
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      {/* الشريطُ يمتدّ على ارتفاع العنوان كلِّه — فلا يبدو حرفاً شارداً حين ينكسر العنوانُ سطرين */}
      <div style={{ width: 8, alignSelf: "stretch", minHeight: size * 0.66, borderRadius: 4, background: theme.primary, flexShrink: 0 }} />
      <div style={{ fontFamily: headingFont, fontWeight: 900, fontSize: size, color: theme.primary, lineHeight: 1.25 }}>{label}</div>
    </div>
  </RevealText>
);

const Lead: React.FC<{ text: string; delay?: number; accent?: string }> = ({ text, delay = 8, accent = theme.accent }) => (
  <RevealText delay={delay}>
    <Card padding={26} style={{ display: "flex", alignItems: "center", gap: 18 }}>
      <div style={{ width: 8, height: 60, borderRadius: 4, background: accent, flexShrink: 0 }} />
      <div style={{ fontSize: 29, fontWeight: 600, color: theme.ink, lineHeight: 1.6 }}>{text}</div>
    </Card>
  </RevealText>
);

// إطارُ اللقطة: رسمٌ متجهيٌّ أو فيديو مولَّد في المكان نفسِه بالمقاس نفسِه.
const Visual: React.FC<{ clip?: string; width: number; height: number; dark?: boolean; delay?: number; children?: React.ReactNode }> = ({
  clip, width, height, dark, delay = 6, children,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  return (
    <div
      style={{
        width, height, borderRadius: 22, overflow: "hidden", position: "relative", flexShrink: 0,
        background: dark ? "#0d1f3c" : theme.surface2,
        border: `1px solid ${theme.border}`,
        boxShadow: "0 26px 60px rgba(20,48,92,0.22)",
        opacity: s, transform: `translateY(${interpolate(s, [0, 1], [30, 0])}px)`,
      }}
    >
      {clip ? (
        <Video src={staticFile(clip)} muted loop style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : (
        children
      )}
    </div>
  );
};

// شريحةٌ صغيرةٌ ملوّنةٌ للتسميات داخل الرسوم
const Tag: React.FC<{ color: string; children: React.ReactNode; style?: React.CSSProperties; dark?: boolean }> = ({ color, children, style, dark }) => (
  <div
    style={{
      display: "inline-flex", alignItems: "center", gap: 10, padding: "8px 16px", borderRadius: 999,
      background: dark ? `${color}` : `${color}14`, color: dark ? "#fff" : color,
      border: `1px solid ${color}${dark ? "" : "3a"}`, fontSize: 22, fontWeight: 800, fontFamily: headingFont, whiteSpace: "nowrap",
      ...style,
    }}
  >
    {children}
  </div>
);

const pulse = (frame: number, period = 40) => 0.5 + 0.5 * Math.sin((frame / period) * Math.PI * 2);

/* ═══════════ المشهد ٢ — المشكلة: بياناتٌ تتراكم ═══════════ */
const SceneProblem: React.FC<{ t: AiFacilitiesProps["texts"]["problem"]; clip?: string }> = ({ t, clip }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cols = [
    { Icon: IconTicket, color: theme.primary },
    { Icon: IconImage, color: theme.accent },
    { Icon: IconTable, color: theme.warn },
    { Icon: IconDocument, color: theme.danger },
  ];
  const STACK = 6;
  return (
    <Stage>
      <div style={{ width: "100%", maxWidth: 1660, display: "flex", alignItems: "center", gap: 50 }}>
        <div style={{ width: 640, display: "flex", flexDirection: "column", gap: 22 }}>
          <SectionTitle label={t.title} delay={0} size={48} />
          <Lead text={t.lead} />
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 4 }}>
            {t.items.map((it, i) => (
              <RevealText key={it} delay={40 + i * 8}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <IconTick size={24} color={cols[i % cols.length].color} />
                  <div style={{ fontSize: 26, fontWeight: 700, color: theme.ink }}>{it}</div>
                </div>
              </RevealText>
            ))}
          </div>
        </div>
        <Visual clip={clip} width={920} height={620}>
          {/* أربعةُ أعمدةٍ من الشرائح تتراكم واحدةً فوق الأخرى — الحجمُ يتضح بلا رقم */}
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", justifyContent: "space-around", padding: "40px 40px 30px" }}>
            {cols.map((c, ci) => (
              <div key={ci} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                <div style={{ display: "flex", flexDirection: "column-reverse", gap: 10, height: 460, justifyContent: "flex-start" }}>
                  {Array.from({ length: STACK }).map((_, k) => {
                    const d = 10 + ci * 6 + k * 14;
                    const s = spring({ frame: frame - d, fps, config: { damping: 14, stiffness: 120 } });
                    return (
                      <div key={k} style={{ opacity: s, transform: `translateY(${interpolate(s, [0, 1], [-60, 0])}px)` }}>
                        <IconChip color={c.color} size={64}>
                          <c.Icon size={34} color={c.color} />
                        </IconChip>
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontFamily: headingFont, fontWeight: 800, fontSize: 24, color: c.color }}>{t.columns[ci] || ""}</div>
              </div>
            ))}
          </div>
        </Visual>
      </div>
    </Stage>
  );
};

/* ═══════════ المشهد ٣ — المبنى الذكيّ: حسّاساتٌ وتحكّمٌ عن بُعد ═══════════ */
const SceneBuilding: React.FC<{ t: AiFacilitiesProps["texts"]["building"]; clip?: string }> = ({ t, clip }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const FLOORS = 4, WIN = 5;
  const EMPTY = 2;                                   // الدورُ الفارغ (من الأسفل) تُطفأ إنارتُه
  const off = interpolate(frame, [95, 125], [1, 0.12], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const temp = Math.round(interpolate(spring({ frame: frame - 70, fps, config: { damping: 60, stiffness: 50 } }), [0, 1], [24, 22]));
  const energy = interpolate(spring({ frame: frame - 130, fps, config: { damping: 60, stiffness: 50 } }), [0, 1], [92, 58]);
  const gauges = [
    { Icon: IconBulb, color: theme.warn, label: t.gauges.light, value: <Tag color={theme.warn}>{frame > 110 ? "دورٌ فارغ — أُطفئت" : "تعمل بالإشغال"}</Tag> },
    { Icon: IconThermometer, color: theme.primary, label: t.gauges.hvac, value: <span style={{ fontFamily: headingFont, fontWeight: 900, fontSize: 44, color: theme.primary, direction: "ltr", unicodeBidi: "isolate" }}>{temp}°</span> },
    { Icon: IconBolt, color: theme.accent, label: t.gauges.energy, value: <div style={{ width: 220 }}><KpiBar to={energy} color={theme.accent} delay={0} /></div> },
  ];
  return (
    <Stage>
      <div style={{ width: "100%", maxWidth: 1680, display: "flex", alignItems: "center", gap: 46 }}>
        <div style={{ width: 620, display: "flex", flexDirection: "column", gap: 20 }}>
          <SectionTitle label={t.title} delay={0} size={48} />
          <Lead text={t.lead} />
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {gauges.map((g, i) => (
              <RevealText key={g.label} delay={30 + i * 8}>
                <Card padding={18} style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <IconChip color={g.color} size={58}><g.Icon size={32} color={g.color} /></IconChip>
                  <div style={{ fontSize: 25, fontWeight: 700, color: theme.ink, flex: 1 }}>{g.label}</div>
                  {g.value}
                </Card>
              </RevealText>
            ))}
          </div>
        </div>
        <Visual clip={clip} width={960} height={640}>
          <svg viewBox="0 0 960 640" width={960} height={640} style={{ display: "block" }}>
            {/* الأرض والمبنى */}
            <rect x="0" y="590" width="960" height="50" fill={theme.border} />
            <rect x="200" y="70" width="560" height="520" rx="10" fill={theme.surface} stroke={theme.border} strokeWidth="2" />
            {Array.from({ length: FLOORS }).map((_, f) => {
              const y = 590 - (f + 1) * 125;
              const lit = f === EMPTY ? off : 1;
              return (
                <g key={f}>
                  <line x1="200" y1={y + 125} x2="760" y2={y + 125} stroke={theme.border} strokeWidth="2" />
                  {Array.from({ length: WIN }).map((_, w) => (
                    <rect key={w} x={240 + w * 100} y={y + 28} width="60" height="66" rx="6"
                      fill={`rgba(160,96,16,${0.55 * lit})`} stroke={theme.border} />
                  ))}
                  {/* الحسّاس: نقطةٌ تنبض على يمين كلّ دور */}
                  <circle cx="740" cy={y + 18} r={5 + 3 * pulse(frame + f * 9)} fill={theme.accent} opacity={0.5 + 0.5 * pulse(frame + f * 9)} />
                  <circle cx="740" cy={y + 18} r={12 + 12 * pulse(frame + f * 9)} fill="none" stroke={theme.accent} strokeWidth="2" opacity={0.6 - 0.6 * pulse(frame + f * 9)} />
                </g>
              );
            })}
            {/* وحدةُ التكييف على السطح */}
            <rect x="620" y="36" width="90" height="36" rx="6" fill={theme.surface2} stroke={theme.border} strokeWidth="2" />
            <circle cx="665" cy="54" r="11" fill="none" stroke={theme.primary} strokeWidth="2.5" transform={`rotate(${frame * 6} 665 54)`} strokeDasharray="8 6" />
          </svg>
          {/* هاتفُ المشرف: التحكّم عن بُعد */}
          <RevealText delay={60} style={{ position: "absolute", left: 30, bottom: 30 }}>
            <Card padding={16} style={{ width: 150, borderRadius: 26 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
                <IconSensor size={34} color={theme.accent} />
                {[theme.warn, theme.primary, theme.accent].map((c, i) => (
                  <div key={i} style={{ width: 110, height: 16, borderRadius: 8, background: `${c}22`, border: `1px solid ${c}55`, overflow: "hidden" }}>
                    <div style={{ width: `${i === 0 ? off * 100 : i === 1 ? 62 : energy}%`, height: "100%", background: c }} />
                  </div>
                ))}
              </div>
            </Card>
          </RevealText>
          <RevealText delay={118} style={{ position: "absolute", right: 30, top: 30 }}>
            <Tag color={theme.warn} dark>{t.floorNote}</Tag>
          </RevealText>
        </Visual>
      </div>
    </Stage>
  );
};

/* ═══════════ المشهد ٤ — الكاميرات تكتشف مشكلةَ النظافة ═══════════ */
const SceneCamera: React.FC<{ t: AiFacilitiesProps["texts"]["camera"]; clip?: string }> = ({ t, clip }) => {
  const frame = useCurrentFrame();
  const box = spring({ frame: frame - 70, fps: 30, config: { damping: 200 } });
  const dash = (frame * 2) % 24;
  return (
    <Stage>
      <div style={{ width: "100%", maxWidth: 1680, display: "flex", alignItems: "center", gap: 46 }}>
        <div style={{ width: 620, display: "flex", flexDirection: "column", gap: 20 }}>
          <SectionTitle label={t.title} delay={0} size={48} />
          <Lead text={t.lead} accent={theme.primary} />
          <RevealText delay={150}>
            <Card accent={theme.accent} padding={22} style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <IconChip color={theme.accent} size={62}><IconTicket size={34} color={theme.accent} /></IconChip>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontFamily: headingFont, fontWeight: 900, fontSize: 28, color: theme.accent }}>{t.ticket}</div>
                <div style={{ fontSize: 22, color: theme.muted, fontWeight: 600 }}>{t.ticketSub}</div>
              </div>
            </Card>
          </RevealText>
        </div>
        <Visual clip={clip} width={960} height={640} dark>
          <svg viewBox="0 0 960 640" width={960} height={640} style={{ display: "block" }}>
            <defs>
              <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#1b3a6b" /><stop offset="1" stopColor="#0d1f3c" />
              </linearGradient>
            </defs>
            {/* ممرٌّ بمنظور: جدرانٌ وأرضٌ وخطوطُ هروب */}
            <polygon points="0,640 960,640 640,300 320,300" fill="url(#floor)" />
            <polygon points="0,0 320,300 320,300 0,640" fill="#12294f" />
            <polygon points="960,0 640,300 640,300 960,640" fill="#12294f" />
            <rect x="320" y="120" width="320" height="180" fill="#0a1a33" />
            {[0, 1, 2, 3].map((i) => (
              <line key={i} x1="320" y1={300 + i * 0} x2={60 + i * 230} y2="640" stroke="rgba(255,255,255,0.08)" />
            ))}
            {[0, 1, 2, 3].map((i) => (
              <line key={"r" + i} x1={0} y1={640 - i * 90} x2={960} y2={640 - i * 90} stroke="rgba(255,255,255,0.05)" />
            ))}
            {/* البقعة على الأرض */}
            <ellipse cx="560" cy="520" rx="70" ry="24" fill="rgba(143,214,189,0.35)" />
            <ellipse cx="575" cy="512" rx="35" ry="12" fill="rgba(143,214,189,0.5)" />
            {/* صندوقُ الاكتشاف */}
            <rect x="470" y="470" width="180" height="90" rx="8" fill="none" stroke={theme.accentL} strokeWidth="4"
              strokeDasharray="14 10" strokeDashoffset={-dash} opacity={box} />
            {[[470, 470], [650, 470], [470, 560], [650, 560]].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r="6" fill={theme.accentL} opacity={box} />
            ))}
            {/* شبكةُ الكاميرا وعلامةُ التسجيل */}
            <circle cx="900" cy="46" r="9" fill="#e5484d" opacity={0.4 + 0.6 * pulse(frame, 30)} />
            <text x="880" y="54" textAnchor="end" fill="#cfe0f7" fontSize="22" fontFamily="Cairo" fontWeight="800">REC</text>
          </svg>
          <div style={{ position: "absolute", left: 26, top: 22 }}>
            <Tag color="#0a7c59" dark style={{ background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.3)" }}>
              <IconCamera size={24} color="#fff" />{t.camLabel}
            </Tag>
          </div>
          <div style={{ position: "absolute", right: 300, top: 400, opacity: box, transform: `translateY(${interpolate(box, [0, 1], [16, 0])}px)` }}>
            <Tag color={theme.accent} dark>{t.detection}</Tag>
          </div>
        </Visual>
      </div>
    </Stage>
  );
};

/* ═══════════ المشهد ٥ — الروبوتات في الميدان ═══════════ */
const SceneRobots: React.FC<{ t: AiFacilitiesProps["texts"]["robots"]; clip?: string }> = ({ t, clip }) => {
  const frame = useCurrentFrame();
  const icons = [IconRobot, IconDrone, IconWrench];
  const colors = [theme.accent, theme.primary, theme.warn];
  return (
    <Stage>
      <div style={{ width: "100%", maxWidth: 1600, display: "flex", flexDirection: "column", gap: 24 }}>
        <SectionTitle label={t.title} delay={0} />
        <Lead text={t.lead} />
        {clip ? (
          <Visual clip={clip} width={1600} height={400} />
        ) : null}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
          {t.cards.map((c, i) => {
            const Icon = icons[i % icons.length], color = colors[i % colors.length];
            const bob = Math.sin((frame + i * 20) / 18) * 6;
            return (
              <RevealText key={c.title} delay={26 + i * 9}>
                <Card accent={color} padding={clip ? 24 : 34} style={{ height: "100%" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: clip ? 12 : 20, alignItems: "flex-start" }}>
                    <div style={{ transform: `translateY(${bob}px)` }}>
                      <IconChip color={color} size={clip ? 70 : 96}><Icon size={clip ? 40 : 54} color={color} /></IconChip>
                    </div>
                    <div style={{ fontFamily: headingFont, fontWeight: 900, fontSize: clip ? 30 : 36, color, lineHeight: 1.3 }}>{c.title}</div>
                    <div style={{ fontSize: clip ? 23 : 26, color: theme.muted, fontWeight: 600, lineHeight: 1.55 }}>{c.sub}</div>
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

/* ═══════════ المشهد ٦ — الصيانةُ التنبّؤية: الحسّاس ← البلاغ ← الفرز ═══════════ */
const ScenePredictive: React.FC<{ t: AiFacilitiesProps["texts"]["predictive"]; clip?: string }> = ({ t, clip }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // منحنى اهتزازٍ يرتفع تدريجياً ثم يتجاوز الحدَّ — القيمُ توضيحيةٌ بلا محور أرقام.
  const W = 900, H = 380, N = 40, LIMIT = 150;
  const pts = Array.from({ length: N }, (_, i) => {
    const x = 40 + (i / (N - 1)) * (W - 80);
    const base = 300 - i * 2.4 - Math.pow(Math.max(0, i - 24), 2.2) * 1.4;
    const noise = Math.sin(i * 1.7) * 10 + Math.cos(i * 0.9) * 6;
    return [x, Math.max(60, base + noise)] as const;
  });
  const drawn = Math.min(N - 1, Math.floor(interpolate(frame, [10, 190], [0, N - 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })));
  const path = pts.slice(0, drawn + 1).map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const crossAt = pts.findIndex(([, y]) => y < LIMIT);
  const crossed = drawn >= crossAt;
  const alert = spring({ frame: crossed ? frame - (10 + (crossAt / (N - 1)) * 180) : -1, fps, config: { damping: 200 } });
  const ticket = spring({ frame: frame - 215, fps, config: { damping: 200 } });
  const stepIcons = [IconSensor, IconTicket, IconSparkles];
  const stepColors = [theme.accent, theme.primary, "#5b21b6"];
  return (
    <Stage>
      <div style={{ width: "100%", maxWidth: 1680, display: "flex", alignItems: "center", gap: 46 }}>
        <div style={{ width: 620, display: "flex", flexDirection: "column", gap: 20 }}>
          <SectionTitle label={t.title} delay={0} size={48} />
          <Lead text={t.lead} accent={theme.danger} />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {t.steps.map((s, i) => {
              const Icon = stepIcons[i % 3], color = stepColors[i % 3];
              return (
                <RevealText key={s} delay={200 + i * 14}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <IconChip color={color} size={54}><Icon size={30} color={color} /></IconChip>
                    <div style={{ fontSize: 26, fontWeight: 700, color: theme.ink }}>{s}</div>
                  </div>
                </RevealText>
              );
            })}
          </div>
        </div>
        <Visual clip={clip} width={960} height={640}>
          <div style={{ position: "absolute", inset: 0, padding: 30, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <IconChip color={theme.primary} size={50}><IconPulse size={28} color={theme.primary} /></IconChip>
              <div style={{ fontFamily: headingFont, fontWeight: 800, fontSize: 26, color: theme.primary }}>{t.chartLabel}</div>
            </div>
            <Card padding={0} style={{ overflow: "hidden" }}>
              <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ display: "block" }}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <line key={i} x1="40" x2={W - 40} y1={40 + i * 75} y2={40 + i * 75} stroke={theme.border} />
                ))}
                <line x1="40" x2={W - 40} y1={LIMIT} y2={LIMIT} stroke={theme.danger} strokeWidth="3" strokeDasharray="12 8" />
                <path d={path} fill="none" stroke={theme.primary} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
                {drawn >= 0 ? <circle cx={pts[drawn][0]} cy={pts[drawn][1]} r="8" fill={crossed ? theme.danger : theme.primary} /> : null}
              </svg>
            </Card>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <div style={{ opacity: alert, transform: `translateY(${interpolate(alert, [0, 1], [14, 0])}px)` }}>
                <Tag color={theme.danger} dark>{t.alert}</Tag>
              </div>
              <div style={{ opacity: ticket, transform: `translateY(${interpolate(ticket, [0, 1], [14, 0])}px)` }}>
                <Tag color={theme.accent} dark><IconTicket size={24} color="#fff" />{t.ticket}</Tag>
              </div>
            </div>
          </div>
        </Visual>
      </div>
    </Stage>
  );
};

/* ═══════════ المشهد ٧ — مبادئُنا ═══════════ */
const ScenePrinciples: React.FC<{ t: AiFacilitiesProps["texts"]["principles"] }> = ({ t }) => {
  const icons = [IconUserCheck, IconDatabase, IconLock, IconLedger];
  const colors = [theme.accent, theme.primary, theme.warn, "#5b21b6"];
  return (
    <Stage>
      <div style={{ width: "100%", maxWidth: 1500, display: "flex", flexDirection: "column", gap: 30 }}>
        <SectionTitle label={t.title} delay={0} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 24 }}>
          {t.items.map((it, i) => {
            const Icon = icons[i % icons.length], color = colors[i % colors.length];
            return (
              <RevealText key={it.title} delay={12 + i * 9}>
                <Card accent={color} padding={30} style={{ display: "flex", alignItems: "center", gap: 22, height: "100%" }}>
                  <IconChip color={color} size={92}><Icon size={52} color={color} /></IconChip>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontFamily: headingFont, fontWeight: 900, fontSize: 34, color, lineHeight: 1.3 }}>{it.title}</div>
                    <div style={{ fontSize: 25, color: theme.muted, fontWeight: 600, lineHeight: 1.5 }}>{it.sub}</div>
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

/* ═══════════ المشهد ٨ — جسرٌ إلى المنصة: أدواتُها (العددُ مشتقٌّ من القائمة) ═══════════ */
const ScenePlatform: React.FC<{ t: AiFacilitiesProps["texts"]["platform"] }> = ({ t }) => {
  const icons = [IconTicket, IconImage, IconRepeat, IconDocument, IconTable, IconDocument, IconSparkles];
  const count = t.tools.length.toLocaleString("ar-EG");
  return (
    <Stage>
      <div style={{ width: "100%", maxWidth: 1560, display: "flex", flexDirection: "column", gap: 28 }}>
        <SectionTitle label={t.title} delay={0} />
        <RevealText delay={8}>
          <div style={{ fontSize: 32, color: theme.ink, fontWeight: 600, lineHeight: 1.6 }}>
            {t.leadBefore}{" "}
            <span style={{ fontFamily: headingFont, fontWeight: 900, fontSize: 44, color: theme.accent }}>{count}</span>{" "}
            {t.leadAfter}
          </div>
        </RevealText>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
          {t.tools.map((tool, i) => {
            const Icon = icons[i % icons.length];
            return (
              <RevealText key={tool} delay={22 + i * 7}>
                <Card padding={18} style={{ display: "flex", alignItems: "center", gap: 14, borderRadius: 999, paddingInline: 26 }}>
                  <IconChip color={theme.primary} size={52}><Icon size={30} color={theme.primary} /></IconChip>
                  <div style={{ fontFamily: headingFont, fontWeight: 800, fontSize: 28, color: theme.primary }}>{tool}</div>
                </Card>
              </RevealText>
            );
          })}
        </div>
        <RevealText delay={110} style={{ display: "flex", justifyContent: "center", marginTop: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 60, height: 4, borderRadius: 4, background: theme.accent }} />
            <div style={{ fontFamily: headingFont, fontSize: 36, color: theme.accent, fontWeight: 900 }}>لنرَها تعمل داخل المنصة</div>
            <div style={{ width: 60, height: 4, borderRadius: 4, background: theme.accent }} />
          </div>
        </RevealText>
      </div>
    </Stage>
  );
};

const Fade: React.FC<{ children: React.ReactNode; durationInFrames: number }> = ({ children, durationInFrames }) => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [durationInFrames - 12, durationInFrames], [1, 0], { extrapolateLeft: "clamp" });
  return <AbsoluteFill style={{ opacity: Math.min(fadeIn, fadeOut) }}>{children}</AbsoluteFill>;
};

export const AiFacilities: React.FC<AiFacilitiesProps> = ({ companyName, title, subtitle, clips, texts }) => {
  const c = clips || {};
  const scene = (key: (typeof AI_SCENES)[number]["key"], node: React.ReactNode) => (
    <Sequence key={key} from={startOf(key)} durationInFrames={framesOf(key)}>
      <Fade durationInFrames={framesOf(key)}>{node}</Fade>
    </Sequence>
  );
  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      <FontLoader />
      <PlatformCanvas />
      {scene("intro", <PlatformIntro companyName={companyName} headline={title} subline={subtitle} />)}
      {scene("problem", <SceneProblem t={texts.problem} clip={c.problem} />)}
      {scene("building", <SceneBuilding t={texts.building} clip={c.building} />)}
      {scene("camera", <SceneCamera t={texts.camera} clip={c.camera} />)}
      {scene("robots", <SceneRobots t={texts.robots} clip={c.robots} />)}
      {scene("predictive", <ScenePredictive t={texts.predictive} clip={c.predictive} />)}
      {scene("principles", <ScenePrinciples t={texts.principles} />)}
      {scene("platform", <ScenePlatform t={texts.platform} />)}
      <Sequence from={framesOf("intro")}>
        <BrandMark />
      </Sequence>
    </AbsoluteFill>
  );
};
