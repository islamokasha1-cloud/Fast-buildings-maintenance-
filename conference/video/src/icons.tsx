import React from "react";

const base: React.SVGProps<SVGSVGElement> = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export const IconTickets = (p: React.SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><rect x="4" y="4" width="16" height="14" rx="1.5" /><path d="M4 9h16M9 4v5" /></svg>
);
export const IconCalendar = (p: React.SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><rect x="5" y="4" width="14" height="17" rx="1.5" /><path d="M8 2v4M16 2v4M5 9h14" /><circle cx="9" cy="13" r="1" /></svg>
);
export const IconArchive = (p: React.SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><rect x="4" y="4" width="16" height="5" rx="1" /><rect x="4" y="11" width="16" height="9" rx="1" /><path d="M9 15h6" /></svg>
);
export const IconCart = (p: React.SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><circle cx="9" cy="19" r="1.4" /><circle cx="17" cy="19" r="1.4" /><path d="M3 4h2l2.2 11h10.6L20 8H6.4" /></svg>
);
export const IconWarehouse = (p: React.SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M4 9l8-5 8 5v10a1 1 0 01-1 1H5a1 1 0 01-1-1V9z" /><path d="M9 20v-6h6v6" /></svg>
);
export const IconBars = (p: React.SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>
);
export const IconKpi = (p: React.SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M4 19V13M10 19V6M16 19v-9" /><circle cx="4" cy="11" r="1.3" /><circle cx="10" cy="4" r="1.3" /><circle cx="16" cy="8" r="1.3" /></svg>
);
export const IconTv = (p: React.SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><rect x="3" y="4" width="18" height="12" rx="1.5" /><path d="M9 20h6M12 16v4" /></svg>
);
export const IconChat = (p: React.SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M4 5h16v10H8l-4 4V5z" /></svg>
);
export const IconPhone = (p: React.SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M4 4h16v12H7l-3 3V4z" /></svg>
);
export const IconBox = (p: React.SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 7v10l9 4 9-4V7" /></svg>
);
export const IconCircleX = (p: React.SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="M15 9l-6 6M9 9l6 6" /></svg>
);
export const IconCheck = (p: React.SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M4 12l5 5L20 6" /></svg>
);
export const IconShield = (p: React.SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3z" /></svg>
);
