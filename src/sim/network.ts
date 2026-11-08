import type { LineDef, LineKind, LonLat } from '../types';
import { distKm, distM } from './geo';
import { normName } from './resolve';

// 그래프 구조
//   노드 0..C-1      : 역(환승 단위, complex) — 개찰구/대합실
//   노드 C..         : (역, 운행계통) 승강장 노드
//   간선 kind 0 ride : 승강장 → 다음 역 승강장 (차내 시간, 혼잡 영향)
//   간선 kind 1 board: 역 → 승강장 (대기 + 이동)
//   간선 kind 2 alight: 승강장 → 역 (하차 이동)

export interface Complex {
  id: number;
  name: string;
  lon: number;
  lat: number;
  lineIds: string[];
  tentative: boolean;
}

export interface RideEdge {
  /** 전체 간선 배열에서의 index */
  edge: number;
  lineId: string;
  lineName: string;
  color: string;
  kind: LineKind;
  a: number; // complex index
  b: number;
  aName: string;
  bName: string;
  path: [LonLat, LonLat];
  timeMin: number;
  lengthKm: number;
  tph: number;
  capPerTrain: number;
  capPerHour: number;
  speed: number;
  /** 첨두 배경 승객 (시간당) */
  bgPax: number;
}

export interface Network {
  complexes: Complex[];
  nodeCount: number;
  /** 간선 배열 (typed) */
  eFrom: Int32Array;
  eTo: Int32Array;
  eBase: Float64Array;
  eKind: Uint8Array;
  /** ride 간선이면 rides 배열 index, 아니면 -1 */
  eRide: Int32Array;
  /** board 간선의 역 index (승차 집계용), 아니면 -1 */
  eBoardComplex: Int32Array;
  /** 역방향 인접 (CSR): 노드 v 로 들어오는 간선 */
  inStart: Int32Array;
  inEdges: Int32Array;
  rides: RideEdge[];
  lines: LineDef[];
  /** 열차 애니메이션용 운행 계통 (노선 × 분기) */
  services: ServiceRun[];
}

export interface ServiceRun {
  lineId: string;
  color: string;
  kind: LineKind;
  tph: number;
  /** 정차 좌표 */
  coords: LonLat[];
  /** 구간별 ride index (정방향 i→i+1, 역방향 i+1→i) */
  forward: number[];
  backward: number[];
}

const SNAP_M = 150;
const SAME_NAME_M = 650;
const ALIGHT_MIN = 1.5;
const BOARD_WALK_MIN = 1.5;
const MAX_WAIT_MIN = 10;

export function buildNetwork(lines: LineDef[]): Network {
  const complexes: Complex[] = [];
  const findComplex = (name: string, lon: number, lat: number, tentative: boolean): number => {
    const norm = normName(name);
    let best = -1;
    let bestD = Infinity;
    for (const c of complexes) {
      const d = distM(c.lon, c.lat, lon, lat);
      if ((c.name === norm && d < SAME_NAME_M) || d < SNAP_M) {
        if (d < bestD) { bestD = d; best = c.id; }
      }
    }
    if (best >= 0) {
      if (!tentative) complexes[best].tentative = false;
      return best;
    }
    complexes.push({ id: complexes.length, name: norm, lon, lat, lineIds: [], tentative });
    return complexes.length - 1;
  };

  // 1) 역 묶기 — 기존 노선을 먼저 넣어 기준 좌표가 기존 역이 되도록
  const ordered = [...lines].sort((a, b) => (a.kind === 'existing' ? 0 : 1) - (b.kind === 'existing' ? 0 : 1));
  const seqComplexes = new Map<string, number[][]>();
  for (const line of ordered) {
    seqComplexes.set(
      line.id,
      line.sequences.map((seq) =>
        seq.stops.map((s) => {
          const ci = findComplex(s.name, s.lon, s.lat, !!s.tentative);
          if (!complexes[ci].lineIds.includes(line.id)) complexes[ci].lineIds.push(line.id);
          return ci;
        }),
      ),
    );
  }

  const C = complexes.length;
  // 2) 승강장 노드
  const platformIndex = new Map<string, number>();
  const platformTph = new Map<number, number>();
  let nodeCount = C;
  const platform = (ci: number, service: string) => {
    const key = `${ci}|${service}`;
    let n = platformIndex.get(key);
    if (n === undefined) {
      n = nodeCount++;
      platformIndex.set(key, n);
    }
    return n;
  };

  const from: number[] = [];
  const to: number[] = [];
  const base: number[] = [];
  const kind: number[] = [];
  const rideIdx: number[] = [];
  const boardC: number[] = [];
  const rides: RideEdge[] = [];
  const platformComplex = new Map<number, number>();

  const services: ServiceRun[] = [];
  for (const line of ordered) {
    const service = line.serviceId ?? line.id;
    const seqs = seqComplexes.get(line.id)!;
    line.sequences.forEach((seq, si) => {
      const cs = seqs[si];
      const run: ServiceRun = { lineId: line.id, color: line.color, kind: line.kind, tph: seq.tph, coords: [], forward: [], backward: [] };
      for (let i = 0; i < cs.length; i++) {
        const p = platform(cs[i], service);
        platformComplex.set(p, cs[i]);
        platformTph.set(p, Math.max(platformTph.get(p) ?? 0, seq.tph));
      }
      for (let i = 1; i < cs.length; i++) {
        const a = cs[i - 1];
        const b = cs[i];
        if (a === b) continue;
        const sa = seq.stops[i - 1];
        const sb = seq.stops[i];
        if (!run.coords.length) run.coords.push([sa.lon, sa.lat]);
        run.coords.push([sb.lon, sb.lat]);
        run.forward.push(rides.length);
        run.backward.push(rides.length + 1);
        const len = distKm(sa.lon, sa.lat, sb.lon, sb.lat) * 1.12;
        const t = (len / line.params.speed) * 60;
        for (const [x, y, ca, cb] of [
          [sa, sb, a, b],
          [sb, sa, b, a],
        ] as const) {
          const e = from.length;
          from.push(platform(ca, service));
          to.push(platform(cb, service));
          base.push(t);
          kind.push(0);
          rideIdx.push(rides.length);
          boardC.push(-1);
          rides.push({
            edge: e,
            lineId: line.id,
            lineName: line.name,
            color: line.color,
            kind: line.kind,
            a: ca,
            b: cb,
            aName: complexes[ca].name,
            bName: complexes[cb].name,
            path: [
              [x.lon, x.lat],
              [y.lon, y.lat],
            ],
            timeMin: t,
            lengthKm: len,
            tph: seq.tph,
            capPerTrain: line.params.cap,
            capPerHour: Math.max(1, seq.tph * line.params.cap),
            speed: line.params.speed,
            bgPax: seq.bgPax ?? 0,
          });
        }
      }
      if (run.forward.length) services.push(run);
    });
  }

  // 3) 승하차 간선
  for (const [p, ci] of platformComplex) {
    const tph = platformTph.get(p) ?? 10;
    const wait = Math.min(MAX_WAIT_MIN, 30 / Math.max(0.5, tph));
    from.push(ci); to.push(p); base.push(BOARD_WALK_MIN + wait); kind.push(1); rideIdx.push(-1); boardC.push(ci);
    from.push(p); to.push(ci); base.push(ALIGHT_MIN); kind.push(2); rideIdx.push(-1); boardC.push(-1);
  }

  const E = from.length;
  const inCount = new Int32Array(nodeCount + 1);
  for (let e = 0; e < E; e++) inCount[to[e] + 1]++;
  for (let v = 0; v < nodeCount; v++) inCount[v + 1] += inCount[v];
  const inStart = Int32Array.from(inCount);
  const fill = Int32Array.from(inCount);
  const inEdges = new Int32Array(E);
  for (let e = 0; e < E; e++) inEdges[fill[to[e]]++] = e;

  return {
    complexes,
    nodeCount,
    eFrom: Int32Array.from(from),
    eTo: Int32Array.from(to),
    eBase: Float64Array.from(base),
    eKind: Uint8Array.from(kind),
    eRide: Int32Array.from(rideIdx),
    eBoardComplex: Int32Array.from(boardC),
    inStart,
    inEdges,
    rides,
    lines,
    services,
  };
}
