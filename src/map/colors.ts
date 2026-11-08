export type RGBA = [number, number, number, number];

const STOPS: [number, RGBA][] = [
  [0.0, [45, 194, 107, 255]],
  [0.6, [139, 211, 70, 255]],
  [1.0, [242, 213, 67, 255]],
  [1.3, [245, 166, 35, 255]],
  [1.7, [242, 84, 45, 255]],
  [2.2, [215, 38, 61, 255]],
  [2.8, [155, 29, 99, 255]],
];

/** 혼잡도(정원 대비 비율) → 색 */
export function congestionColor(ratio: number, alpha = 255): RGBA {
  if (!(ratio > 0)) return [...STOPS[0][1].slice(0, 3), alpha] as RGBA;
  for (let i = 1; i < STOPS.length; i++) {
    const [r1, c1] = STOPS[i];
    if (ratio <= r1) {
      const [r0, c0] = STOPS[i - 1];
      const t = (ratio - r0) / (r1 - r0);
      return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t, alpha];
    }
  }
  const last = STOPS[STOPS.length - 1][1];
  return [last[0], last[1], last[2], alpha];
}

export function congestionCss(ratio: number): string {
  const [r, g, b] = congestionColor(ratio);
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

export const LEGEND_STOPS = [
  { ratio: 0.4, label: '여유' },
  { ratio: 0.8, label: '보통' },
  { ratio: 1.0, label: '100% 정원' },
  { ratio: 1.5, label: '150% 몸 밀착' },
  { ratio: 2.0, label: '200%' },
  { ratio: 2.5, label: '250%+' },
];

export function hexToRgba(hex: string, alpha = 255): RGBA {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16), alpha];
}

export function congestionLabel(ratio: number): string {
  if (ratio < 0.8) return '여유';
  if (ratio < 1.0) return '보통';
  if (ratio < 1.3) return '혼잡';
  if (ratio < 1.7) return '매우 혼잡';
  if (ratio < 2.2) return '극심';
  return '탑승 곤란';
}
