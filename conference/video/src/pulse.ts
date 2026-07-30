export const pulse = (frame: number, period = 60, amount = 0.06) =>
  1 + Math.sin((frame / period) * Math.PI * 2) * amount;

export const pulseOpacity = (frame: number, period = 50, min = 0.55, max = 1) => {
  const t = (Math.sin((frame / period) * Math.PI * 2) + 1) / 2;
  return min + (max - min) * t;
};
