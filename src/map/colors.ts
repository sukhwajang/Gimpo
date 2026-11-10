export type RGBA = [number, number, number, number];

export interface CongestionClass {
  /** 이 값 미만이면 이 단계 (정원 대비 비율) */
  max: number;
  label: string;
  range: string;
  color: string;
  rgb: [number, number, number];
}

const cls = (max: number, label: string, range: string, color: string): CongestionClass => ({ max, label, range, color, rgb: hexToRgb(color) });

// 혼잡도 단계. 정부 혼잡 관리 기준(130% 주의 · 150% 경계 · 170% 심각)에 맞춘 6단계.
// 색은 어두운 배경에서 이웃 단계끼리 색각 이상(적록)에서도 구분되도록 검증한 조합이다
// (이웃 단계 ΔE: 정상 16.5 이상, 적록 색각 12.6 이상, 배경 대비 3:1 이상).
export const CONGESTION_CLASSES: CongestionClass[] = [
  cls(0.8, '여유', '80% 미만', '#5AA2F0'),
  cls(1.3, '보통', '80~130%', '#3CCFAE'),
  cls(1.5, '주의', '130~150%', '#F5D547'),
  cls(1.7, '혼잡', '150~170%', '#FB8B3C'),
  cls(2.0, '심각', '170~200%', '#EE4466'),
  cls(Infinity, '극심', '200% 이상', '#A855F7'),
];

export function congestionClass(ratio: number): CongestionClass {
  for (const c of CONGESTION_CLASSES) if (ratio < c.max) return c;
  return CONGESTION_CLASSES[CONGESTION_CLASSES.length - 1];
}

/** 혼잡도(정원 대비 비율) → 단계 색 */
export function congestionColor(ratio: number, alpha = 255): RGBA {
  const c = congestionClass(ratio > 0 ? ratio : 0).rgb;
  return [c[0], c[1], c[2], alpha];
}

export const congestionCss = (ratio: number): string => congestionClass(ratio).color;
export const congestionLabel = (ratio: number): string => congestionClass(ratio).label;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

export function hexToRgba(hex: string, alpha = 255): RGBA {
  const [r, g, b] = hexToRgb(/^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(hex) ? hex : '#888888');
  return [r, g, b, alpha];
}

/** 밝은 쪽으로 섞기 (0~1) */
export function lighten(c: RGBA, t: number): RGBA {
  return [c[0] + (255 - c[0]) * t, c[1] + (255 - c[1]) * t, c[2] + (255 - c[2]) * t, c[3]];
}
