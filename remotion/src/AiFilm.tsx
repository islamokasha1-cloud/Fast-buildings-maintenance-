import React from "react";
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { theme } from "./theme";
import { headingFont, bodyFont } from "./fonts";
import { FontLoader } from "./FontLoader";
import { Card, HeroBanner, IconChip, LogoChip, PlatformCanvas, RevealText } from "./components";
import {
  IconBulb,
  IconCamera,
  IconDrone,
  IconGlobe,
  IconPhone,
  IconPulse,
  IconRobot,
  IconSparkles,
} from "./Icons";

/**
 * فيلم «الذكاء الاصطناعي في إدارة المرافق» — لقطاتٌ مولَّدةٌ كاملةُ الإطار.
 *
 * المشكلة: تركيبةُ `AiFacilities` تعرض اللقطةَ المولَّدةَ خلفيةً داخل إطارٍ مرسوم،
 * والمالكُ أراد العكس (19/09): الفيديو نفسُه هو اللقطات، والهويةُ **داخلها** — شعارُ
 * الشركة على السترة والروبوت ولافتة الجدار — لا فوقها. `higgsfield-shots.mjs`
 * يولّدها بالشعار مرجعاً (`reference-to-video`)، فتخرج بالهوية فعلاً.
 *
 * المبدأ: اللقطةُ تملأ الشاشة، ونضيف ما لا يستطيعه النموذج: عربيةً سليمة (عنوانٌ
 * ووصفٌ أسفلَ كلّ لقطة بلغة المنصة البصرية: كرت أبيض وشريطٌ ملوّن وأيقونةٌ خطية)،
 * وافتتاحيةً بعنوان الفيلم، وبطاقةَ ختامٍ بالتواصل. الذوبانُ بين اللقطات قصير.
 * النصوصُ كلُّها في `defaultProps` (src/Root.tsx)، وبلا رقمٍ أو ادّعاء: الحلولُ
 * «نقدّمها» — والجولةُ الحقيقية للمنصة في فيلمٍ آخر.
 *
 * القرار: مدّةُ كلّ لقطةٍ ثابتةٌ هنا (`SHOT_FRAMES`) ومطابقةٌ لثواني التوليد في
 * `higgsfield-shots.mjs` — فإن غيّرتَ هناك فغيّر هنا. `OffthreadVideo` لأن اللقطةَ
 * بطول المشهد تماماً. الموسيقى `audio/background.mp3` (54 ثانية) — والفيلمُ 54 ثانية.
 */

export type AiFilmShotKey = "intro" | "corridor" | "camera" | "drone" | "predictive" | "outro";

export type AiFilmProps = {
  companyName: string;
  tagline: string;
  phone: string;
  website: string;
  musicVolume?: number;
  /** مساراتُ اللقطات تحت public/ — الافتراضُ ما يكتبه higgsfield-shots.mjs */
  clips: Record<AiFilmShotKey, string>;
  /** عنوانُ الفيلم وسطرُه في الافتتاحية */
  title: string;
  subtitle: string;
  /** عنوانٌ ووصفٌ لكلّ لقطة (الافتتاحيةُ بلا شريط: عنوانُها هو عنوانُ الفيلم) */
  captions: Record<Exclude<AiFilmShotKey, "intro">, { title: string; sub: string }>;
};

/* ─── الخطُّ الزمنيّ ─── */
const XF = 15; // إطاراتُ الذوبان بين لقطتين
export const SHOT_FRAMES: { key: AiFilmShotKey; frames: number }[] = [
  { key: "intro", frames: 240 },
  { key: "corridor", frames: 240 },
  { key: "camera", frames: 300 },
  { key: "drone", frames: 300 },
  { key: "predictive", frames: 300 },
  { key: "outro", frames: 240 },
];
const END_CARD_FRAMES = 90;
const shotStart = (i: number) => SHOT_FRAMES.slice(0, i).reduce((s, x) => s + x.frames, 0) - i * XF;
const shotsEnd = shotStart(SHOT_FRAMES.length - 1) + SHOT_FRAMES[SHOT_FRAMES.length - 1].frames;
export const AI_FILM_FRAMES = shotsEnd - XF + END_CARD_FRAMES; // 1620 = 54 ثانية

const SHOT_STYLE: Record<AiFilmShotKey, { color: string; Icon: React.FC<{ size?: number; color?: string }> }> = {
  intro: { color: theme.primary, Icon: IconSparkles },
  corridor: { color: theme.warn, Icon: IconBulb },
  camera: { color: theme.primary, Icon: IconCamera },
  drone: { color: theme.accent, Icon: IconDrone },
  predictive: { color: theme.danger, Icon: IconPulse },
  outro: { color: theme.accent, Icon: IconRobot },
};

/* ─── ذوبانُ الدخول والخروج لمشهدٍ بطولٍ معلوم ─── */
const Fade: React.FC<{ children: React.ReactNode; frames: number; inFrames?: number }> = ({ children, frames, inFrames = XF }) => {
  const frame = useCurrentFrame();
  const opacity = Math.min(
    interpolate(frame, [0, inFrames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    interpolate(frame, [frames - XF, frames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
  );
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

/* ─── الشريطُ السفليّ: كرتٌ أبيض بشريطٍ ملوّن وأيقونة — على يمين الشاشة (RTL) ─── */
const LowerThird: React.FC<{ shot: AiFilmShotKey; title: string; sub: string; frames: number }> = ({ shot, title, sub, frames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const st = SHOT_STYLE[shot];
  const enter = spring({ frame: frame - 18, fps, config: { damping: 200 } });
  const leave = interpolate(frame, [frames - 40, frames - 22], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const y = interpolate(enter, [0, 1], [40, 0]);
  return (
    <div style={{ position: "absolute", right: 72, bottom: 64, direction: "rtl", opacity: enter * leave, transform: `translateY(${y}px)` }}>
      <Card accent={st.color} padding={0} style={{ width: 860, display: "flex", alignItems: "center", gap: 22, padding: "22px 28px" }}>
        <IconChip color={st.color} size={72}><st.Icon size={40} color={st.color} /></IconChip>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: headingFont, fontWeight: 900, fontSize: 40, color: theme.primary, lineHeight: 1.25 }}>{title}</div>
          <div style={{ fontFamily: bodyFont, fontWeight: 600, fontSize: 25, color: theme.muted, lineHeight: 1.5 }}>{sub}</div>
        </div>
      </Card>
    </div>
  );
};

/* ─── عنوانُ الفيلم فوق لقطة الافتتاحية ─── */
const TitleOverlay: React.FC<{ title: string; subtitle: string; companyName: string }> = ({ title, subtitle, companyName }) => {
  const frame = useCurrentFrame();
  const leave = interpolate(frame, [170, 200], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ direction: "rtl", alignItems: "center", justifyContent: "flex-end", paddingBottom: 90, opacity: leave }}>
      <div style={{ width: 1180, display: "flex", flexDirection: "column", gap: 18 }}>
        <RevealText delay={12}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <LogoChip size={64} />
            <div style={{ fontFamily: headingFont, fontWeight: 800, fontSize: 30, color: theme.white, textShadow: "0 2px 12px rgba(0,0,0,0.55)" }}>{companyName}</div>
          </div>
        </RevealText>
        <HeroBanner title={title} subtitle={subtitle} delay={22} />
      </div>
    </AbsoluteFill>
  );
};

/* ─── بطاقةُ الختام: الشعارُ والاسمُ والتواصل على خلفية المنصة ─── */
const Pill: React.FC<{ Icon: React.FC<{ size?: number; color?: string }>; text: string }> = ({ Icon, text }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 14, padding: "14px 22px", boxShadow: theme.cardShadow }}>
    <Icon size={28} color={theme.primary} />
    <span style={{ fontSize: 28, fontWeight: 700, color: theme.ink, direction: "ltr", unicodeBidi: "isolate" }}>{text}</span>
  </div>
);

const EndCard: React.FC<{ companyName: string; tagline: string; phone: string; website: string }> = ({ companyName, tagline, phone, website }) => (
  <AbsoluteFill style={{ backgroundColor: theme.bg, direction: "rtl", fontFamily: bodyFont, alignItems: "center", justifyContent: "center" }}>
    <PlatformCanvas />
    <div style={{ width: 1200, display: "flex", flexDirection: "column", alignItems: "center", gap: 28 }}>
      <RevealText delay={2} style={{ display: "flex", justifyContent: "center" }}><LogoChip size={130} /></RevealText>
      <RevealText delay={8}>
        <div style={{ fontFamily: headingFont, fontWeight: 900, fontSize: 60, color: theme.primary, textAlign: "center" }}>{companyName}</div>
      </RevealText>
      <RevealText delay={14}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 60, height: 4, borderRadius: 4, background: theme.accent }} />
          <div style={{ fontSize: 34, color: theme.accent, fontWeight: 800 }}>{tagline}</div>
          <div style={{ width: 60, height: 4, borderRadius: 4, background: theme.accent }} />
        </div>
      </RevealText>
      {(phone || website) && (
        <RevealText delay={20}>
          <div style={{ display: "flex", gap: 18, marginTop: 6 }}>
            {phone ? <Pill Icon={IconPhone} text={phone} /> : null}
            {website ? <Pill Icon={IconGlobe} text={website} /> : null}
          </div>
        </RevealText>
      )}
    </div>
  </AbsoluteFill>
);

export const AiFilm: React.FC<AiFilmProps> = ({ companyName, tagline, phone, website, musicVolume = 0.7, clips, title, subtitle, captions }) => (
  <AbsoluteFill style={{ backgroundColor: "#0b1526" }}>
    <FontLoader />
    {musicVolume > 0 ? <Audio src={staticFile("audio/background.mp3")} volume={musicVolume} /> : null}
    {SHOT_FRAMES.map((s, i) => (
      <Sequence key={s.key} from={shotStart(i)} durationInFrames={s.frames}>
        <Fade frames={s.frames} inFrames={i === 0 ? 30 : XF}>
          <OffthreadVideo src={staticFile(clips[s.key])} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          {s.key === "intro" ? (
            <TitleOverlay title={title} subtitle={subtitle} companyName={companyName} />
          ) : (
            <LowerThird shot={s.key} title={captions[s.key].title} sub={captions[s.key].sub} frames={s.frames} />
          )}
          {/* علامةٌ صغيرة ثابتة أسفل اليسار — الشعارُ داخل اللقطات أصلاً، فهذه للاتّساق مع باقي الأفلام */}
          <div style={{ position: "absolute", left: 56, bottom: 52 }}><LogoChip size={70} /></div>
        </Fade>
      </Sequence>
    ))}
    <Sequence from={shotsEnd - XF} durationInFrames={END_CARD_FRAMES}>
      <Fade frames={END_CARD_FRAMES}>
        <EndCard companyName={companyName} tagline={tagline} phone={phone} website={website} />
      </Fade>
    </Sequence>
  </AbsoluteFill>
);
