import React from "react";

// أيقونات SVG خطية بأسلوب لوحة تحكم — تحل محل الإيموجي
type IconProps = { size?: number; color?: string; strokeWidth?: number };

const base = (size: number): React.SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  xmlns: "http://www.w3.org/2000/svg",
});

const stroke = (color: string, w: number) => ({
  stroke: color,
  strokeWidth: w,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

// تشغيل وصيانة المرافق — مبنى مع ترس
export const IconFacility: React.FC<IconProps> = ({ size = 24, color = "#1b3a6b", strokeWidth = 1.75 }) => (
  <svg {...base(size)}>
    <path d="M3 21h10V6l-5-3-5 3v15Z" {...stroke(color, strokeWidth)} />
    <path d="M6.5 8.5h1M6.5 12h1M6.5 15.5h1M9.5 8.5h1M9.5 12h1" {...stroke(color, strokeWidth)} />
    <circle cx="17.5" cy="15.5" r="3" {...stroke(color, strokeWidth)} />
    <path d="M17.5 11.5v-1.2M17.5 20.7v-1.2M21.5 15.5h-1.2M14.7 15.5h-1.2M20.3 12.7l-.85.85M15.55 18.15l-.85.85M20.3 18.3l-.85-.85M15.55 12.85l-.85-.85" {...stroke(color, strokeWidth)} />
  </svg>
);

// الصيانة الفنية — مفتاح ربط
export const IconWrench: React.FC<IconProps> = ({ size = 24, color = "#1b3a6b", strokeWidth = 1.75 }) => (
  <svg {...base(size)}>
    <path d="M15.5 6.5a3.8 3.8 0 0 0-4.9 4.6l-6.4 6.4a1.7 1.7 0 0 0 2.4 2.4l6.4-6.4a3.8 3.8 0 0 0 4.6-4.9l-2.3 2.3-2.1-.2-.2-2.1 2.3-2.1Z" {...stroke(color, strokeWidth)} />
  </svg>
);

// إدارة المشتريات — عربة تسوق
export const IconCart: React.FC<IconProps> = ({ size = 24, color = "#1b3a6b", strokeWidth = 1.75 }) => (
  <svg {...base(size)}>
    <path d="M3 4h2l2.2 11.2a1.5 1.5 0 0 0 1.5 1.2h8.1a1.5 1.5 0 0 0 1.5-1.2L20.5 8H6" {...stroke(color, strokeWidth)} />
    <circle cx="9" cy="20" r="1.4" {...stroke(color, strokeWidth)} />
    <circle cx="18" cy="20" r="1.4" {...stroke(color, strokeWidth)} />
  </svg>
);

// إدارة المشاريع — لوحة كانبان
export const IconProjects: React.FC<IconProps> = ({ size = 24, color = "#1b3a6b", strokeWidth = 1.75 }) => (
  <svg {...base(size)}>
    <rect x="3" y="4" width="18" height="16" rx="2" {...stroke(color, strokeWidth)} />
    <path d="M8 4v16M8 9h-5M8 14h-5" {...stroke(color, strokeWidth)} />
    <path d="M12 8h5M12 12h5" {...stroke(color, strokeWidth)} />
  </svg>
);

// خدمات المباني — مبنيان
export const IconBuildings: React.FC<IconProps> = ({ size = 24, color = "#1b3a6b", strokeWidth = 1.75 }) => (
  <svg {...base(size)}>
    <path d="M4 21V8l6-3v16" {...stroke(color, strokeWidth)} />
    <path d="M10 21V11l6 3v7" {...stroke(color, strokeWidth)} />
    <path d="M16 21V9l4 2v10M3 21h18" {...stroke(color, strokeWidth)} />
    <path d="M6.5 9v0M6.5 12.5v0M6.5 16v0" {...stroke(color, strokeWidth)} />
  </svg>
);

// الالتزام بالجودة — درع مع علامة صح
export const IconShieldCheck: React.FC<IconProps> = ({ size = 24, color = "#1b3a6b", strokeWidth = 1.75 }) => (
  <svg {...base(size)}>
    <path d="M12 3l7 3v5c0 4.5-3 8.3-7 9.5-4-1.2-7-5-7-9.5V6l7-3Z" {...stroke(color, strokeWidth)} />
    <path d="M8.8 11.8l2.2 2.2 4.2-4.4" {...stroke(color, strokeWidth)} />
  </svg>
);

// أيقونات الأرقام
// التزام بالمواعيد — علامة صح دائرية
export const IconCheckCircle: React.FC<IconProps> = ({ size = 24, color = "#1b3a6b", strokeWidth = 1.75 }) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="9" {...stroke(color, strokeWidth)} />
    <path d="M8 12.3l2.6 2.6L16 9.5" {...stroke(color, strokeWidth)} />
  </svg>
);

// دعم وصيانة — ساعة
export const IconClock: React.FC<IconProps> = ({ size = 24, color = "#1b3a6b", strokeWidth = 1.75 }) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="9" {...stroke(color, strokeWidth)} />
    <path d="M12 7v5.2l3.4 2" {...stroke(color, strokeWidth)} />
  </svg>
);

// حلول متكاملة — هدف
export const IconTarget: React.FC<IconProps> = ({ size = 24, color = "#1b3a6b", strokeWidth = 1.75 }) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="9" {...stroke(color, strokeWidth)} />
    <circle cx="12" cy="12" r="5" {...stroke(color, strokeWidth)} />
    <circle cx="12" cy="12" r="1.4" fill={color} />
  </svg>
);

// أيقونات مساعدة صغيرة
export const IconPhone: React.FC<IconProps> = ({ size = 24, color = "#1b3a6b", strokeWidth = 1.75 }) => (
  <svg {...base(size)}>
    <path d="M5 4h3l1.5 4-2 1.5a11 11 0 0 0 5 5l1.5-2 4 1.5v3a2 2 0 0 1-2 2A15 15 0 0 1 5 6a2 2 0 0 1 0-2Z" {...stroke(color, strokeWidth)} />
  </svg>
);

export const IconGlobe: React.FC<IconProps> = ({ size = 24, color = "#1b3a6b", strokeWidth = 1.75 }) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="9" {...stroke(color, strokeWidth)} />
    <path d="M3 12h18M12 3c2.5 2.4 3.8 5.6 3.8 9S14.5 18.6 12 21c-2.5-2.4-3.8-5.6-3.8-9S9.5 5.4 12 3Z" {...stroke(color, strokeWidth)} />
  </svg>
);

// قطاع المعادن — سندان
export const IconAnvil: React.FC<IconProps> = ({ size = 24, color = "#1b3a6b", strokeWidth = 1.75 }) => (
  <svg {...base(size)}>
    <path
      d="M3 9h12l3-1.6V12h-4.4v3.4H16L17.6 19H6.4L8 15.4h2.4V12H3Z"
      {...stroke(color, strokeWidth)}
    />
  </svg>
);

// علامة صح صغيرة لقوائم الخدمات
export const IconTick: React.FC<IconProps> = ({ size = 24, color = "#0a7c59", strokeWidth = 2.4 }) => (
  <svg {...base(size)}>
    <path d="M5 12.5l4.5 4.5L19 7" {...stroke(color, strokeWidth)} />
  </svg>
);

// شهادة أو اعتماد — وسام
export const IconAward: React.FC<IconProps> = ({ size = 24, color = "#1b3a6b", strokeWidth = 1.75 }) => (
  <svg {...base(size)}>
    <circle cx="12" cy="9" r="6" {...stroke(color, strokeWidth)} />
    <path d="M9.4 9.2l1.8 1.8 3.4-3.5" {...stroke(color, strokeWidth)} />
    <path d="M8.4 14.4L7 21.5l5-2.4 5 2.4-1.4-7.1" {...stroke(color, strokeWidth)} />
  </svg>
);

// جهة حكومية — مبنى بأعمدة (يُستخدم كبديل عند غياب لوجو العميل)
export const IconGov: React.FC<IconProps> = ({ size = 24, color = "#1b3a6b", strokeWidth = 1.75 }) => (
  <svg {...base(size)}>
    <path d="M12 3l9 4.5H3L12 3Z" {...stroke(color, strokeWidth)} />
    <path d="M5.5 10v7M9.5 10v7M14.5 10v7M18.5 10v7" {...stroke(color, strokeWidth)} />
    <path d="M3.5 20.5h17M4.5 17.2h15" {...stroke(color, strokeWidth)} />
  </svg>
);

// سهم اتجاه صغير للبطاقات
export const IconArrow: React.FC<IconProps> = ({ size = 24, color = "#1b3a6b", strokeWidth = 1.75 }) => (
  <svg {...base(size)}>
    <path d="M15 6l-6 6 6 6" {...stroke(color, strokeWidth)} />
  </svg>
);

// ── أيقوناتُ فيديو «الذكاء الاصطناعي في إدارة المرافق» (src/AiFacilities.tsx) ──
// كلُّها خطيةٌ بالأسلوب نفسِه: 24×24، خطٌّ 1.75، أطرافٌ مستديرة — لا إيموجي.

// حسّاس — نقطةٌ تبثّ موجات
export const IconSensor: React.FC<IconProps> = ({ size = 24, color = "#1b3a6b", strokeWidth = 1.75 }) => (
  <svg {...base(size)}>
    <circle cx="12" cy="14" r="2" fill={color} />
    <path d="M8.5 10.5a5 5 0 0 1 7 0M5.7 7.7a9 9 0 0 1 12.6 0" {...stroke(color, strokeWidth)} />
    <path d="M12 16v5" {...stroke(color, strokeWidth)} />
  </svg>
);

// كاميرا مراقبة
export const IconCamera: React.FC<IconProps> = ({ size = 24, color = "#1b3a6b", strokeWidth = 1.75 }) => (
  <svg {...base(size)}>
    <path d="M3 8.5l12-3.2 1 3.8-12 3.2L3 8.5Z" {...stroke(color, strokeWidth)} />
    <path d="M16 9.1l4-1v4l-3.4.9" {...stroke(color, strokeWidth)} />
    <path d="M8.5 12.6V17h5M4 19.5h9" {...stroke(color, strokeWidth)} />
    <circle cx="9.5" cy="8.8" r="1.1" {...stroke(color, strokeWidth)} />
  </svg>
);

// روبوت
export const IconRobot: React.FC<IconProps> = ({ size = 24, color = "#1b3a6b", strokeWidth = 1.75 }) => (
  <svg {...base(size)}>
    <rect x="5" y="8" width="14" height="11" rx="2.5" {...stroke(color, strokeWidth)} />
    <path d="M12 8V5M12 5h.01" {...stroke(color, strokeWidth)} />
    <circle cx="12" cy="4.2" r="1" fill={color} />
    <circle cx="9.3" cy="12.5" r="1.1" fill={color} />
    <circle cx="14.7" cy="12.5" r="1.1" fill={color} />
    <path d="M9.5 16h5M2.5 12v4M21.5 12v4" {...stroke(color, strokeWidth)} />
  </svg>
);

// درون فحص
export const IconDrone: React.FC<IconProps> = ({ size = 24, color = "#1b3a6b", strokeWidth = 1.75 }) => (
  <svg {...base(size)}>
    <path d="M9.5 12h5M7 9.5l2.5 2.5-2.5 2.5M17 9.5L14.5 12l2.5 2.5" {...stroke(color, strokeWidth)} />
    <circle cx="5" cy="8" r="2" {...stroke(color, strokeWidth)} />
    <circle cx="19" cy="8" r="2" {...stroke(color, strokeWidth)} />
    <circle cx="5" cy="16" r="2" {...stroke(color, strokeWidth)} />
    <circle cx="19" cy="16" r="2" {...stroke(color, strokeWidth)} />
    <rect x="10" y="10.2" width="4" height="3.6" rx="1" {...stroke(color, strokeWidth)} />
  </svg>
);

// نبض / اهتزاز — خطُّ إشارة
export const IconPulse: React.FC<IconProps> = ({ size = 24, color = "#1b3a6b", strokeWidth = 1.75 }) => (
  <svg {...base(size)}>
    <path d="M3 12h3.5l2-5 3 10 2.5-7 1.5 2H21" {...stroke(color, strokeWidth)} />
  </svg>
);

// ذكاءٌ اصطناعيّ — بريق
export const IconSparkles: React.FC<IconProps> = ({ size = 24, color = "#1b3a6b", strokeWidth = 1.75 }) => (
  <svg {...base(size)}>
    <path d="M10 4l1.6 4.4L16 10l-4.4 1.6L10 16l-1.6-4.4L4 10l4.4-1.6L10 4Z" {...stroke(color, strokeWidth)} />
    <path d="M18 14l.9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9L18 14Z" {...stroke(color, strokeWidth)} />
  </svg>
);

// قفل — المفتاحُ محفوظٌ خادمياً
export const IconLock: React.FC<IconProps> = ({ size = 24, color = "#1b3a6b", strokeWidth = 1.75 }) => (
  <svg {...base(size)}>
    <rect x="5" y="10.5" width="14" height="10" rx="2" {...stroke(color, strokeWidth)} />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" {...stroke(color, strokeWidth)} />
    <circle cx="12" cy="15.5" r="1.2" fill={color} />
  </svg>
);

// حرارة — مقياس
export const IconThermometer: React.FC<IconProps> = ({ size = 24, color = "#1b3a6b", strokeWidth = 1.75 }) => (
  <svg {...base(size)}>
    <path d="M10 4.5a2 2 0 0 1 4 0v9.3a3.5 3.5 0 1 1-4 0V4.5Z" {...stroke(color, strokeWidth)} />
    <path d="M12 9v6" {...stroke(color, strokeWidth)} />
    <circle cx="12" cy="16.5" r="1.4" fill={color} />
  </svg>
);

// إنارة — مصباح
export const IconBulb: React.FC<IconProps> = ({ size = 24, color = "#1b3a6b", strokeWidth = 1.75 }) => (
  <svg {...base(size)}>
    <path d="M8.5 14.5a5.5 5.5 0 1 1 7 0c-.8.7-1.2 1.4-1.2 2.5h-4.6c0-1.1-.4-1.8-1.2-2.5Z" {...stroke(color, strokeWidth)} />
    <path d="M10 19.5h4M10.5 21.5h3" {...stroke(color, strokeWidth)} />
  </svg>
);

// طاقة — صاعقة
export const IconBolt: React.FC<IconProps> = ({ size = 24, color = "#1b3a6b", strokeWidth = 1.75 }) => (
  <svg {...base(size)}>
    <path d="M13 2.5L5.5 13.5H11l-1 8 7.5-11H12l1-8Z" {...stroke(color, strokeWidth)} />
  </svg>
);

// بلاغ — بطاقة مهمّة
export const IconTicket: React.FC<IconProps> = ({ size = 24, color = "#1b3a6b", strokeWidth = 1.75 }) => (
  <svg {...base(size)}>
    <path d="M4 7.5a1.5 1.5 0 0 1 1.5-1.5h13A1.5 1.5 0 0 1 20 7.5v2a2.5 2.5 0 0 0 0 5v2a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5v-2a2.5 2.5 0 0 0 0-5v-2Z" {...stroke(color, strokeWidth)} />
    <path d="M9 10h6M9 13.5h4" {...stroke(color, strokeWidth)} />
  </svg>
);

// صورة
export const IconImage: React.FC<IconProps> = ({ size = 24, color = "#1b3a6b", strokeWidth = 1.75 }) => (
  <svg {...base(size)}>
    <rect x="3.5" y="5" width="17" height="14" rx="2" {...stroke(color, strokeWidth)} />
    <circle cx="9" cy="10" r="1.6" {...stroke(color, strokeWidth)} />
    <path d="M20 15.5l-4.5-4.5-6 6.5M4 18l4-4 2.5 2.5" {...stroke(color, strokeWidth)} />
  </svg>
);

// تكرار — كشفُ الأعطال المتكرّرة
export const IconRepeat: React.FC<IconProps> = ({ size = 24, color = "#1b3a6b", strokeWidth = 1.75 }) => (
  <svg {...base(size)}>
    <path d="M17 3l3 3-3 3" {...stroke(color, strokeWidth)} />
    <path d="M4 12V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3" {...stroke(color, strokeWidth)} />
    <path d="M20 12v3a3 3 0 0 1-3 3H4" {...stroke(color, strokeWidth)} />
  </svg>
);

// مستند نصّي — تقريرٌ أو خطاب
export const IconDocument: React.FC<IconProps> = ({ size = 24, color = "#1b3a6b", strokeWidth = 1.75 }) => (
  <svg {...base(size)}>
    <path d="M6 3.5h8l4 4v13H6v-17Z" {...stroke(color, strokeWidth)} />
    <path d="M14 3.5v4h4M9 12h6M9 15.5h6M9 8.5h2" {...stroke(color, strokeWidth)} />
  </svg>
);

// جدول مقارنة
export const IconTable: React.FC<IconProps> = ({ size = 24, color = "#1b3a6b", strokeWidth = 1.75 }) => (
  <svg {...base(size)}>
    <rect x="3.5" y="5" width="17" height="14" rx="2" {...stroke(color, strokeWidth)} />
    <path d="M3.5 10h17M3.5 14.5h17M9.5 5v14M15 5v14" {...stroke(color, strokeWidth)} />
  </svg>
);

// إنسانٌ يقرّر — شخصٌ مع علامة صح
export const IconUserCheck: React.FC<IconProps> = ({ size = 24, color = "#1b3a6b", strokeWidth = 1.75 }) => (
  <svg {...base(size)}>
    <circle cx="10" cy="8" r="3.5" {...stroke(color, strokeWidth)} />
    <path d="M3.5 20a6.5 6.5 0 0 1 13 0" {...stroke(color, strokeWidth)} />
    <path d="M15.5 12.5l2 2 4-4" {...stroke(color, strokeWidth)} />
  </svg>
);

// قاعدة بيانات — البياناتُ داخل المنصة
export const IconDatabase: React.FC<IconProps> = ({ size = 24, color = "#1b3a6b", strokeWidth = 1.75 }) => (
  <svg {...base(size)}>
    <ellipse cx="12" cy="6" rx="7" ry="2.6" {...stroke(color, strokeWidth)} />
    <path d="M5 6v12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6" {...stroke(color, strokeWidth)} />
    <path d="M5 12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6" {...stroke(color, strokeWidth)} />
  </svg>
);

// سجلّ — كلُّ نداءٍ مسجَّل
export const IconLedger: React.FC<IconProps> = ({ size = 24, color = "#1b3a6b", strokeWidth = 1.75 }) => (
  <svg {...base(size)}>
    <rect x="5" y="3.5" width="14" height="17" rx="2" {...stroke(color, strokeWidth)} />
    <path d="M8.5 8h7M8.5 11.5h7M8.5 15h4" {...stroke(color, strokeWidth)} />
  </svg>
);

// قطرة — تسرّبُ المياه
export const IconDrop: React.FC<IconProps> = ({ size = 24, color = "#1b3a6b", strokeWidth = 1.75 }) => (
  <svg {...base(size)}>
    <path d="M12 3.5s6 6.4 6 10.6a6 6 0 0 1-12 0C6 9.9 12 3.5 12 3.5Z" {...stroke(color, strokeWidth)} />
  </svg>
);
