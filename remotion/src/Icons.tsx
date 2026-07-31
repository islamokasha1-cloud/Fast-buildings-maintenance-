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

// سهم اتجاه صغير للبطاقات
export const IconArrow: React.FC<IconProps> = ({ size = 24, color = "#1b3a6b", strokeWidth = 1.75 }) => (
  <svg {...base(size)}>
    <path d="M15 6l-6 6 6 6" {...stroke(color, strokeWidth)} />
  </svg>
);
