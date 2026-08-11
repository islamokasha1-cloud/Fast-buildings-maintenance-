import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "./theme";
import { headingFont, bodyFont } from "./fonts";
import { Card, PlatformCanvas, RevealText } from "./components";
import { FontLoader } from "./FontLoader";

/**
 * افتتاحيةُ فيلم شرح المنصة — مستقلّةٌ عن مشهد افتتاح إعلان الشركة.
 *
 * لماذا مشهدٌ منفصلٌ لا تعديلٌ على `CompanyAnnouncement`: ذاك إعلانٌ عامٌّ عن
 * الشركة وقطاعاتها الثلاثة، وهذا عرضٌ موضوعُه **المنصةُ وحدَها**. لو كُتب
 * «عرضٌ لشرح المنصة» في مشهد الإعلان لصار الإعلانُ يعد بما لا يعرضه.
 * فالمشهدان يتشاركان لغةَ التصميم (التوكنات والخطوط والمكوّنات) ويفترقان
 * في الرسالة — وهذا هو الفرق الذي يجب أن يبقى ظاهراً.
 *
 * يستهلكه `promo-assemble.mjs` كافتتاحيةٍ للفيلم المجمَّع.
 */

export type PlatformIntroProps = {
  companyName: string;
  /** سطرُ التعريف بما سيُعرَض */
  headline: string;
  /** سطرٌ ثانٍ يوضّح طبيعة العرض */
  subline: string;
};

export const PlatformIntro: React.FC<PlatformIntroProps> = ({ companyName, headline, subline }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // الشعارُ يدخل أوّلاً وكبيراً — فهو أوّلُ ما يجب أن يُعرَف.
  const s = spring({ frame, fps, config: { damping: 200 } });
  const logoY = interpolate(s, [0, 1], [26, 0]);
  const logoScale = interpolate(s, [0, 1], [0.92, 1]);
  const ruleW = interpolate(spring({ frame: frame - 22, fps, config: { damping: 200 } }), [0, 1], [0, 260]);

  return (
    <AbsoluteFill style={{ direction: "rtl", fontFamily: bodyFont, color: theme.ink }}>
      <FontLoader />
      <PlatformCanvas />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: "70px 90px" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 30, maxWidth: 1420 }}>
          {/* الشعار كبيراً في لوحٍ أبيض — بمقاس ثلاثةِ أضعاف شريحة الإعلان */}
          <div
            style={{
              width: 300,
              height: 300,
              borderRadius: 74,
              background: theme.surface,
              border: `1px solid ${theme.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: theme.cardShadowLg,
              opacity: s,
              transform: `translateY(${logoY}px) scale(${logoScale})`,
            }}
          >
            <Img src={staticFile("logo.png")} style={{ width: 216, height: "auto" }} />
          </div>

          <RevealText delay={14}>
            <div
              style={{
                fontFamily: headingFont,
                fontWeight: 900,
                fontSize: 62,
                color: theme.primary,
                textAlign: "center",
                lineHeight: 1.25,
              }}
            >
              {companyName}
            </div>
          </RevealText>

          <div style={{ width: ruleW, height: 6, borderRadius: 3, background: theme.accent }} />

          <RevealText delay={30}>
            <Card padding={34} style={{ display: "flex", alignItems: "center", gap: 22, maxWidth: 1320 }}>
              <div style={{ width: 8, height: 92, borderRadius: 4, background: theme.primary, flexShrink: 0 }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontFamily: headingFont, fontWeight: 900, fontSize: 46, color: theme.ink, lineHeight: 1.35 }}>
                  {headline}
                </div>
                <div style={{ fontSize: 30, fontWeight: 500, color: theme.muted, lineHeight: 1.55 }}>{subline}</div>
              </div>
            </Card>
          </RevealText>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
