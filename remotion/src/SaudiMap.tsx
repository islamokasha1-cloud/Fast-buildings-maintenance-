import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "./theme";
import { headingFont } from "./fonts";
import { regions as served } from "./regions";
import regionData from "./saudiRegions.json";

// حدود المناطق الإدارية الثلاث عشرة، مستخرجة من بيانات Natural Earth
// (ne_10m_admin_1) ومبسّطة بخوارزمية دوغلاس-بويكر.
type RegionShape = { name: string; ring: [number, number][] };
const SHAPES = regionData as RegionShape[];

// نطاق الإحداثيات محسوب من البيانات نفسها
const all = SHAPES.flatMap((r) => r.ring);
const LON: [number, number] = [
  Math.min(...all.map((p) => p[0])),
  Math.max(...all.map((p) => p[0])),
];
const LAT: [number, number] = [
  Math.min(...all.map((p) => p[1])),
  Math.max(...all.map((p) => p[1])),
];

// تصحيح تشوّه الإسقاط المستطيل عند خط العرض الأوسط
const KX = Math.cos((((LAT[0] + LAT[1]) / 2) * Math.PI) / 180);

const W = 1000;
const H = Math.round((W * (LAT[1] - LAT[0])) / ((LON[1] - LON[0]) * KX));

const px = (lon: number) => ((lon - LON[0]) / (LON[1] - LON[0])) * W;
const py = (lat: number) => ((LAT[1] - lat) / (LAT[1] - LAT[0])) * H;

const toPath = (ring: [number, number][]) =>
  ring
    .map(([lo, la], i) => `${i === 0 ? "M" : "L"}${px(lo).toFixed(1)},${py(la).toFixed(1)}`)
    .join(" ") + " Z";

const PATHS = SHAPES.map((r) => ({ name: r.name, d: toPath(r.ring) }));

// أسماء المناطق التي تُخدم — لتمييز شكلها على الخريطة
const servedRegionNames = new Set(served.map((r) => r.region).filter(Boolean));

export const SaudiMap: React.FC<{ width?: number }> = ({ width = 1000 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const draw = spring({ frame: frame - 4, fps, config: { damping: 200, stiffness: 42 } });
  const fillIn = interpolate(frame, [20, 42], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <svg
      width={width}
      height={(width * H) / W}
      viewBox={`0 0 ${W} ${H}`}
      style={{ overflow: "visible" }}
    >
      {/* تعبئة المناطق — المخدومة بلون الهوية والباقي رمادي فاتح */}
      {PATHS.map((p) => {
        const isServed = servedRegionNames.has(p.name);
        return (
          <path
            key={p.name}
            d={p.d}
            fill={isServed ? theme.accent : theme.primary}
            opacity={(isServed ? 0.17 : 0.05) * fillIn}
          />
        );
      })}

      {/* الخطوط الفاصلة بين المناطق تُرسم تدريجياً */}
      {PATHS.map((p, i) => {
        const isServed = servedRegionNames.has(p.name);
        return (
          <path
            key={p.name}
            d={p.d}
            fill="none"
            stroke={isServed ? theme.accent : theme.primary}
            strokeWidth={isServed ? 2.6 : 1.6}
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={1 - Math.min(1, draw * 1.15 - i * 0.012)}
            opacity={isServed ? 0.9 : 0.48}
          />
        );
      })}

      {/* علامات المدن */}
      {served.map((r, i) => {
        const x = px(r.lon);
        const y = py(r.lat);
        const delay = 44 + i * 6;
        const s = spring({ frame: frame - delay, fps, config: { damping: 11, mass: 0.7 } });
        const drop = interpolate(s, [0, 1], [-42, 0]);
        const color = r.hq ? theme.accent : theme.primary;
        const pulse = frame - delay > 0 ? ((frame - delay) % 55) / 55 : 0;

        return (
          <g key={r.name} opacity={s} transform={`translate(${x} ${y + drop})`}>
            {r.hq && s > 0.2 ? (
              <circle
                r={12 + pulse * 32}
                fill="none"
                stroke={color}
                strokeWidth={2.5}
                opacity={(1 - pulse) * 0.55}
              />
            ) : null}
            <circle r={r.hq ? 12 : 9} fill={color} />
            <circle r={r.hq ? 5 : 3.6} fill="#fff" />
            <text
              x={0}
              y={r.hq ? -24 : -20}
              textAnchor="middle"
              fill={theme.primary}
              stroke={theme.bg}
              strokeWidth={5}
              paintOrder="stroke"
              style={{ fontFamily: headingFont, fontWeight: 900, fontSize: r.hq ? 30 : 26 }}
            >
              {r.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
