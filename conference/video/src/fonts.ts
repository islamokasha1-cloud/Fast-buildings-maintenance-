import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

export const FONT_UI = "Cairo";
export const FONT_MONO = "JetBrains Mono";

let loaded: Promise<unknown> | null = null;

export const ensureFontsLoaded = () => {
  if (loaded) return loaded;
  loaded = Promise.all([
    loadFont({ family: FONT_UI, url: staticFile("fonts/cairo-arabic-400.woff2"), weight: "400" }),
    loadFont({ family: FONT_UI, url: staticFile("fonts/cairo-arabic-600.woff2"), weight: "600" }),
    loadFont({ family: FONT_UI, url: staticFile("fonts/cairo-arabic-700.woff2"), weight: "700" }),
    loadFont({ family: FONT_UI, url: staticFile("fonts/cairo-arabic-800.woff2"), weight: "800" }),
    loadFont({ family: FONT_UI, url: staticFile("fonts/cairo-latin-400.woff2"), weight: "400" }),
    loadFont({ family: FONT_UI, url: staticFile("fonts/cairo-latin-600.woff2"), weight: "600" }),
    loadFont({ family: FONT_UI, url: staticFile("fonts/cairo-latin-700.woff2"), weight: "700" }),
    loadFont({ family: FONT_UI, url: staticFile("fonts/cairo-latin-800.woff2"), weight: "800" }),
    loadFont({ family: FONT_MONO, url: staticFile("fonts/jbmono-600.woff2"), weight: "600" }),
    loadFont({ family: FONT_MONO, url: staticFile("fonts/jbmono-700.woff2"), weight: "700" }),
  ]);
  return loaded;
};
