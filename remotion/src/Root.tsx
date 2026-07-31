import { Composition } from "remotion";
import { CompanyAnnouncement } from "./CompanyAnnouncement";
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
    </>
  );
};
