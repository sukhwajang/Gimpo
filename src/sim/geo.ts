import type { LonLat } from '../types';

const KY = 110540;
const kx = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180);

/** 두 좌표 사이 거리 (m), 수도권 범위에서 충분히 정확한 평면 근사 */
export function distM(aLon: number, aLat: number, bLon: number, bLat: number): number {
  const lat = (aLat + bLat) / 2;
  return Math.hypot((aLon - bLon) * kx(lat), (aLat - bLat) * KY);
}

export const distKm = (aLon: number, aLat: number, bLon: number, bLat: number) => distM(aLon, aLat, bLon, bLat) / 1000;

/** 진행 방향 오른쪽으로 m 만큼 평행 이동한 선분 */
export function offsetSegment(a: LonLat, b: LonLat, meters: number): [LonLat, LonLat] {
  const lat = (a[1] + b[1]) / 2;
  const dx = (b[0] - a[0]) * kx(lat);
  const dy = (b[1] - a[1]) * KY;
  const len = Math.hypot(dx, dy) || 1;
  // 오른쪽 법선 (dy, -dx)
  const nx = (dy / len) * meters;
  const ny = (-dx / len) * meters;
  const ox = nx / kx(lat);
  const oy = ny / KY;
  return [
    [a[0] + ox, a[1] + oy],
    [b[0] + ox, b[1] + oy],
  ];
}

/** 선분 진행 방향 오른쪽에 붙는 사각형(벽 바닥면) */
export function segmentRibbon(a: LonLat, b: LonLat, inner: number, outer: number, trim = 0): LonLat[] {
  const lat = (a[1] + b[1]) / 2;
  const dx = (b[0] - a[0]) * kx(lat);
  const dy = (b[1] - a[1]) * KY;
  const len = Math.hypot(dx, dy) || 1;
  const t = Math.min(trim, len * 0.3);
  const ux = dx / len, uy = dy / len;
  const a2: LonLat = [a[0] + (ux * t) / kx(lat), a[1] + (uy * t) / KY];
  const b2: LonLat = [b[0] - (ux * t) / kx(lat), b[1] - (uy * t) / KY];
  const [i1, i2] = offsetSegment(a2, b2, inner);
  const [o1, o2] = offsetSegment(a2, b2, outer);
  return [i1, i2, o2, o1, i1];
}

export function lerp(a: LonLat, b: LonLat, t: number): LonLat {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
