import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "./theme";
import { headingFont } from "./fonts";
import { regions } from "./regions";

// حدود المملكة تقريبية (خط الطول، خط العرض) — مرسومة باتجاه عقارب الساعة
// من الشمال الغربي. الغرض تعريفي بصري لا ملاحي.
const OUTLINE: [number, number][] = [
  [34.6, 28.1], [36.0, 29.2], [37.5, 30.0], [38.8, 31.5], [39.2, 32.15],
  [40.4, 31.9], [42.1, 31.1], [44.7, 29.2], [46.4, 29.1], [47.7, 28.5],
  [48.4, 28.5], [49.0, 27.6], [49.6, 27.0], [50.2, 26.2], [50.6, 25.4],
  [51.3, 24.6], [51.6, 24.1], [52.6, 24.0], [55.2, 22.7], [55.7, 22.0],
  [55.2, 20.0], [52.0, 19.0], [49.0, 18.6], [47.0, 17.4], [45.2, 17.4],
  [43.4, 17.4], [42.8, 16.4], [42.6, 16.4], [41.8, 17.5], [41.0, 18.5],
  [40.0, 19.8], [39.5, 20.8], [39.1, 21.5], [38.9, 22.5], [38.0, 23.8],
  [37.2, 24.6], [36.5, 25.5], [36.0, 26.5], [35.2, 27.4],
];

const LON = [34.6, 55.7];
const LAT = [16.4, 32.15];
// تصحيح تشوّه الإسقاط المستطيل عند خط عرض المملكة الأوسط
const KX = Math.cos((24.3 * Math.PI) / 180);

const W = 900;
const H = Math.round((W * (LAT[1] - LAT[0])) / ((LON[1] - LON[0]) * KX));

const px = (lon: number) => ((lon - LON[0]) / (LON[1] - LON[0])) * W;
const py = (lat: number) => ((LAT[1] - lat) / (LAT[1] - LAT[0])) * H;

const PATH =
  OUTLINE.map(([lo, la], i) => `${i === 0 ? "M" : "L"}${px(lo).toFixed(1)},${py(la).toFixed(1)}`).join(" ") + " Z";

export const SaudiMap: React.FC<{ width?: number }> = ({ width = 900 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // رسم الحدود تدريجياً
  const draw = spring({ frame: frame - 4, fps, config: { damping: 200, stiffness: 40 } });
  const fillIn = interpolate(frame, [24, 44], [0, 1], {
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
      {/* تعبئة ناعمة */}
      <path d={PATH} fill={theme.primary} opacity={0.07 * fillIn} />
      {/* الحدود تُرسم تدريجياً */}
      <path
        d={PATH}
        fill="none"
        stroke={theme.primary}
        strokeWidth={3}
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - draw}
        opacity={0.75}
      />

      {regions.map((r, i) => {
        const x = px(r.lon);
        const y = py(r.lat);
        const delay = 46 + i * 8;
        const s = spring({ frame: frame - delay, fps, config: { damping: 11, mass: 0.7 } });
        const drop = interpolate(s, [0, 1], [-46, 0]);
        const color = r.hq ? theme.accent : theme.primary;
        // نبضة مستمرة حول المقر
        const pulse = (frame - delay) > 0 ? ((frame - delay) % 55) / 55 : 0;

        return (
          <g key={r.name} opacity={s} transform={`translate(${x} ${y + drop})`}>
            {r.hq && s > 0.2 ? (
              <circle
                r={14 + pulse * 34}
                fill="none"
                stroke={color}
                strokeWidth={2.5}
                opacity={(1 - pulse) * 0.55}
              />
            ) : null}
            <circle r={r.hq ? 13 : 10} fill={color} />
            <circle r={r.hq ? 5.5 : 4} fill="#fff" />
            <text
              x={0}
              y={r.hq ? -26 : -22}
              textAnchor="middle"
              fill={theme.primary}
              style={{
                fontFamily: headingFont,
                fontWeight: 900,
                fontSize: r.hq ? 30 : 26,
              }}
            >
              {r.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
