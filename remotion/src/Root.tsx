import { Composition } from "remotion";
import { CompanyAnnouncement } from "./CompanyAnnouncement";
import { fps } from "./theme";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="CompanyAnnouncement"
        component={CompanyAnnouncement}
        durationInFrames={30 * fps}
        fps={fps}
        width={1920}
        height={1080}
        defaultProps={{
          companyName: "شركة المباني السريعة للمقاولات",
          tagline: "شريكك الموثوق في تشغيل وصيانة المرافق وإدارة المشتريات",
          phone: "",
          website: "",
        }}
      />
    </>
  );
};
