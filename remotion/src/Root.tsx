import { Composition } from "remotion";
import { CompanyAnnouncement } from "./CompanyAnnouncement";
import { PlatformIntro } from "./PlatformIntro";
import { fps } from "./theme";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="CompanyAnnouncement"
        component={CompanyAnnouncement}
        durationInFrames={54 * fps}
        fps={fps}
        width={1920}
        height={1080}
        defaultProps={{
          companyName: "شركة المباني السريعة للمقاولات",
          tagline: "المقاولات · إدارة المرافق · تصنيع المعادن — تحت مظلة واحدة",
          phone: "+966 55 841 6888",
          website: "fastbuildings.sa",
          musicVolume: 0.7,
        }}
      />
      {/* افتتاحيةُ فيلم شرح المنصة — يستهلكها `promo-assemble.mjs`.
          منفصلةٌ عن مشهد افتتاح الإعلان لأن رسالتَها غيرُ رسالته. */}
      <Composition
        id="PlatformIntro"
        component={PlatformIntro}
        durationInFrames={5 * fps}
        fps={fps}
        width={1920}
        height={1080}
        defaultProps={{
          companyName: "شركة المباني السريعة للمقاولات",
          headline: "عرضٌ تعريفيٌّ بمنصّة إدارة المرافق والمشتريات",
          subline: "جولةٌ في شاشات النظام كما يراها المستخدم — من البلاغ إلى التقرير",
        }}
      />
    </>
  );
};
