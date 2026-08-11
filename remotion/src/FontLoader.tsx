import React, { useCallback, useEffect, useState } from "react";
import { continueRender, delayRender, staticFile } from "remotion";

// يحمّل ملف CSS المحلي للخطوط العربية ويؤخّر الرندر حتى تجهز الخطوط
export const FontLoader: React.FC = () => {
  const [handle] = useState(() => delayRender("تحميل الخطوط العربية"));

  const load = useCallback(async () => {
    if (typeof document === "undefined") {
      continueRender(handle);
      return;
    }
    if (!document.getElementById("fbm-fonts")) {
      const link = document.createElement("link");
      link.id = "fbm-fonts";
      link.rel = "stylesheet";
      link.href = staticFile("fonts/fonts.css");
      document.head.appendChild(link);
    }
    try {
      const fonts = (document as any).fonts;
      if (fonts?.load) {
        await Promise.all([
          fonts.load('900 64px "Cairo"'),
          fonts.load('700 32px "Cairo"'),
          fonts.load('400 32px "Tajawal"'),
          fonts.load('700 32px "Tajawal"'),
        ]);
        await fonts.ready;
      }
    } catch (e) {
      // نتابع الرندر حتى لو تعذّر التحميل
    }
    continueRender(handle);
  }, [handle]);

  useEffect(() => {
    load();
  }, [load]);

  return null;
};
