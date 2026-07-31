// هوية شركة المباني السريعة للمقاولات
// مطابقة لتوكنات تصميم المنصة (متغيّرات CSS في index.html — الوضع الفاتح)
export const theme = {
  // خلفيات المنصة
  bg: "#eef2f7", // خلفية الصفحة الرمادية
  surface2: "#f4f7fb", // سطح ثانوي
  surface: "#ffffff", // الكروت البيضاء
  border: "#dde3ed", // حدود الكروت

  // الألوان الأساسية
  primary: "#1b3a6b", // الأزرق الكحلي
  primaryL: "#254f92",
  primaryD: "#14305c",
  accent: "#0a7c59", // الأخضر
  accentL: "#0f9d72",
  warn: "#a06010", // الكهرماني
  danger: "#b92c2c",

  // النص
  ink: "#1a202c",
  muted: "#64748b",
  white: "#ffffff",

  // تدرّج بانر الـ hero (من page-hero في المنصة)
  heroGradient: "linear-gradient(135deg,#14305c 0%,#1b3a6b 55%,#254f92 100%)",
  // ظل الكروت (var(--shadow))
  cardShadow: "0 1px 4px rgba(0,0,0,0.07)",
  cardShadowLg: "0 8px 24px rgba(20,48,92,0.10)",
};

export const fps = 30;
