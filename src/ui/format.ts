export const pct = (r: number) => `${Math.round(r * 100)}%`;
export const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');
export const mins = (m: number) => (Number.isFinite(m) && m > 0 ? `${Math.round(m)}분` : '–');

export function signed(n: number, unit = '', digits = 0): string {
  if (!Number.isFinite(n)) return '–';
  const v = digits ? n.toFixed(digits) : Math.round(n).toString();
  if (Math.abs(n) < (digits ? 0.5 * 10 ** -digits : 0.5)) return `±0${unit}`;
  return `${n > 0 ? '+' : ''}${v}${unit}`;
}
