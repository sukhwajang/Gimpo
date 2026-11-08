import type { Network } from '../sim/network';
import { offsetSegment } from '../sim/geo';
import type { LonLat } from '../types';

export interface TrainPos {
  position: [number, number, number];
  ride: number;
  color: string;
}

interface PreparedRun {
  lineId: string;
  color: string;
  headway: number;
  /** 방향별 구간: 시작/끝 좌표(오프셋 적용), 구간 시간, ride index */
  dirs: { seg: { a: LonLat; b: LonLat; t: number; ride: number }[]; total: number }[];
}

const DWELL = 0.5; // 분
const SIDE_OFFSET_M = 0;

export function prepareRuns(net: Network): PreparedRun[] {
  return net.services.map((s) => {
    const make = (forward: boolean) => {
      const seg = [];
      const n = s.coords.length - 1;
      for (let k = 0; k < n; k++) {
        const i = forward ? k : n - 1 - k;
        const a = forward ? s.coords[i] : s.coords[i + 1];
        const b = forward ? s.coords[i + 1] : s.coords[i];
        const ride = forward ? s.forward[i] : s.backward[i];
        const [oa, ob] = SIDE_OFFSET_M ? offsetSegment(a, b, SIDE_OFFSET_M) : [a, b];
        seg.push({ a: oa, b: ob, t: net.rides[ride].timeMin + DWELL, ride });
      }
      return { seg, total: seg.reduce((x, y) => x + y.t, 0) };
    };
    return { lineId: s.lineId, color: s.color, headway: 60 / Math.max(0.5, s.tph), dirs: [make(true), make(false)] };
  });
}

/** 시뮬레이션 시각 t(분)에서의 열차 위치 */
export function trainPositions(runs: PreparedRun[], t: number, hidden: Record<string, boolean>): TrainPos[] {
  const out: TrainPos[] = [];
  for (const run of runs) {
    if (hidden[run.lineId]) continue;
    for (const dir of run.dirs) {
      if (!dir.seg.length) continue;
      const phase = ((t % run.headway) + run.headway) % run.headway;
      for (let e = phase; e < dir.total; e += run.headway) {
        let acc = 0;
        for (const s of dir.seg) {
          if (e < acc + s.t) {
            const moving = Math.max(0, Math.min(1, (e - acc) / (s.t - DWELL)));
            out.push({
              position: [s.a[0] + (s.b[0] - s.a[0]) * moving, s.a[1] + (s.b[1] - s.a[1]) * moving, 50],
              ride: s.ride,
              color: run.color,
            });
            break;
          }
          acc += s.t;
        }
      }
    }
  }
  return out;
}
