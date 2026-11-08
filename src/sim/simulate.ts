import type { Destination, LineDef, SimSettings, Zone } from '../types';
import { distKm } from './geo';
import { buildNetwork, type Network } from './network';

// ─────────────────────────────────────────────────────────────
// 출근 혼잡 시뮬레이션
//  1. 단지군별 출근 인원 = 세대수 × 가구원 × 출근율 × 기타수요배율
//  2. 목적지 분포 = 중력모형 (일자리 규모 × 거리감쇠) + 거주지 인근 통근(철도 미이용)
//  3. 수단 선택 = 철도(접근+대기+차내+환승+혼잡 체감) vs 버스·승용차 로짓
//  4. 노선 배정 = 최단 경로(혼잡 반영) 반복 배정 (MSA)
//  5. 혼잡도 = 구간 시간당 승객 / (시간당 열차 수 × 열차 정원)
// ─────────────────────────────────────────────────────────────

export const SLOT_LABELS = ['06:00', '06:30', '07:00', '07:30', '08:00', '08:30', '09:00', '09:30'];
/** 집 출발 시각 분포 (30분 단위) */
const PROFILE_NEAR = [0.05, 0.09, 0.14, 0.18, 0.18, 0.15, 0.12, 0.09];
/** 서울 도심에서 먼 곳은 30분 일찍 출발 */
const PROFILE_FAR = [0.1, 0.15, 0.18, 0.18, 0.15, 0.11, 0.07, 0.06];
const CBD: [number, number] = [126.978, 37.567];

const THETA = 0.06; // 수단 선택 민감도 (1/분)
const MU = 0.18; // 역 선택 민감도 (1/분)
const ACCESS_MAX_KM = 3.2;
const MAX_CANDIDATES = 6;

export function crowdFactor(ratio: number): number {
  const over = ratio - 0.8;
  return over > 0 ? 1 + 0.45 * Math.pow(over, 1.5) : 1;
}

export function accessMinutes(km: number): number {
  const walk = (km * 1.25 * 60) / 4.5;
  const feeder = 6 + (km * 1.3 * 60) / 16 + 2;
  return Math.min(walk, feeder);
}

/** 버스·승용차 통행시간: 장거리일수록 고속도로·광역버스 구간이 길어 평균 속도가 오른다 */
export function roadMinutes(km: number, roadSpeed: number): number {
  const v = roadSpeed * (1 + 0.35 * Math.min(1, km / 20));
  return 8 + (km * 1.3 * 60) / v;
}

function egressMinutes(km: number): number {
  const walk = (km * 1.25 * 60) / 4.5;
  const bus = 5 + (km * 1.3 * 60) / 15;
  return Math.min(walk, bus);
}

export interface SimInput {
  lines: LineDef[];
  zones: Zone[];
  destinations: Destination[];
  settings: SimSettings;
  focusRegions: string[];
  probes?: { zoneId: string; destId: string }[];
  iterations?: number;
}

export interface LineMax {
  lineId: string;
  ratio: number;
  ride: number;
}

export interface FocusStats {
  commuters: number;
  railTrips: number;
  railShare: number;
  avgRailMin: number;
  avgRoadMin: number;
}

export interface SlotResult {
  label: string;
  rideLoad: Float32Array;
  rideRatio: Float32Array;
  boardings: Float32Array;
  lineMax: LineMax[];
  focus: FocusStats;
  over150: number;
  totalRail: number;
  zoneRailShare: Float32Array;
  zoneRailMin: Float32Array;
  zoneAccess: Int32Array;
  probes: number[];
}

export interface SimResult {
  network: Network;
  slots: SlotResult[];
  peakSlot: number;
  zoneIds: string[];
  zoneCommuters: Float32Array;
  ms: number;
}

class MinHeap {
  keys: Float64Array;
  items: Int32Array;
  size = 0;
  constructor(cap: number) {
    this.keys = new Float64Array(cap);
    this.items = new Int32Array(cap);
  }
  push(item: number, key: number) {
    if (this.size >= this.items.length) {
      const k = new Float64Array(this.items.length * 2);
      k.set(this.keys);
      const it = new Int32Array(this.items.length * 2);
      it.set(this.items);
      this.keys = k;
      this.items = it;
    }
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= key) break;
      this.keys[i] = this.keys[p];
      this.items[i] = this.items[p];
      i = p;
    }
    this.keys[i] = key;
    this.items[i] = item;
  }
  pop(): number {
    const top = this.items[0];
    const lastK = this.keys[--this.size];
    const lastI = this.items[this.size];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.size) break;
      if (c + 1 < this.size && this.keys[c + 1] < this.keys[c]) c++;
      if (this.keys[c] >= lastK) break;
      this.keys[i] = this.keys[c];
      this.items[i] = this.items[c];
      i = c;
    }
    this.keys[i] = lastK;
    this.items[i] = lastI;
    return top;
  }
  topKey() {
    return this.keys[0];
  }
}

interface DestLink {
  complexes: number[];
  egress: number[];
}

/** 목적지 → 모든 노드까지 역방향 최단 비용 */
function reverseDijkstra(net: Network, cost: Float64Array, link: DestLink, dist: Float64Array, next: Int32Array, order: Int32Array): number {
  dist.fill(Infinity);
  next.fill(-1);
  const heap = new MinHeap(net.nodeCount * 2);
  link.complexes.forEach((c, i) => {
    if (link.egress[i] < dist[c]) {
      dist[c] = link.egress[i];
      heap.push(c, link.egress[i]);
    }
  });
  let n = 0;
  const done = new Uint8Array(net.nodeCount);
  while (heap.size) {
    const k = heap.topKey();
    const v = heap.pop();
    if (done[v] || k > dist[v]) continue;
    done[v] = 1;
    order[n++] = v;
    for (let j = net.inStart[v]; j < net.inStart[v + 1]; j++) {
      const e = net.inEdges[j];
      const u = net.eFrom[e];
      const nd = k + cost[e];
      if (nd < dist[u]) {
        dist[u] = nd;
        next[u] = e;
        heap.push(u, nd);
      }
    }
  }
  return n;
}

export function simulate(input: SimInput): SimResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const net = buildNetwork(input.lines);
  const { settings } = input;
  const iterations = input.iterations ?? 6;
  const C = net.complexes.length;
  const E = net.eFrom.length;
  const R = net.rides.length;
  const zones = input.zones.filter((z) => z.households > 0);
  const dests = input.destinations;
  const Z = zones.length;
  const D = dests.length;

  // 목적지 연결
  const destLinks: DestLink[] = dests.map((d) => {
    const near = net.complexes
      .map((c) => ({ c: c.id, km: distKm(c.lon, c.lat, d.lon, d.lat) }))
      .sort((a, b) => a.km - b.km);
    let picked = near.filter((x) => x.km <= d.radiusKm + 0.6);
    if (picked.length < 2) picked = near.slice(0, 2);
    return { complexes: picked.map((x) => x.c), egress: picked.map((x) => egressMinutes(x.km)) };
  });

  // 단지군 전처리
  const zoneCands: { c: number; acc: number }[][] = [];
  const zoneCommuters = new Float32Array(Z);
  const zoneProfile: number[][] = [];
  const zoneFocus = new Uint8Array(Z);
  const pDest = new Float64Array(Z * D);
  const roadMin = new Float64Array(Z * D);
  for (let zi = 0; zi < Z; zi++) {
    const z = zones[zi];
    const cands = net.complexes
      .map((c) => ({ c: c.id, km: distKm(c.lon, c.lat, z.lon, z.lat) }))
      .sort((a, b) => a.km - b.km);
    let within = cands.filter((x) => x.km <= ACCESS_MAX_KM);
    if (within.length < 2) within = cands.slice(0, 2);
    zoneCands.push(
      within
        .map((x) => ({ c: x.c, acc: accessMinutes(x.km) }))
        .sort((a, b) => a.acc - b.acc)
        .slice(0, MAX_CANDIDATES),
    );
    const pop = z.households * settings.personsPerHousehold;
    zoneCommuters[zi] = pop * settings.commuteRate * settings.otherDemandFactor;
    const dCbd = distKm(z.lon, z.lat, CBD[0], CBD[1]);
    zoneProfile.push(dCbd > 15 ? PROFILE_FAR : PROFILE_NEAR);
    zoneFocus[zi] = z.region && input.focusRegions.includes(z.region) ? 1 : 0;
    // 목적지 분포
    const localW = settings.localWeight * (1 + Math.min(2, Math.max(0, (dCbd - 8) / 8)));
    let sum = localW;
    for (let di = 0; di < D; di++) {
      const d = dests[di];
      const km = distKm(z.lon, z.lat, d.lon, d.lat);
      const w = km < 1.0 ? 0 : d.jobs * Math.exp(-km / settings.distanceDecayKm);
      pDest[zi * D + di] = w;
      sum += w;
      roadMin[zi * D + di] = roadMinutes(km, settings.roadSpeed);
    }
    for (let di = 0; di < D; di++) pDest[zi * D + di] /= sum;
  }

  const probeIdx = (input.probes ?? []).map((p) => ({
    z: zones.findIndex((z) => z.id === p.zoneId),
    d: dests.findIndex((d) => d.id === p.destId),
  }));

  const cost = new Float64Array(E);
  const dist = new Float64Array(net.nodeCount);
  const next = new Int32Array(net.nodeCount);
  const order = new Int32Array(net.nodeCount);
  const flowAt = new Float64Array(net.nodeCount);
  const slots: SlotResult[] = [];

  for (let s = 0; s < SLOT_LABELS.length; s++) {
    // 시간당 환산 수요 (30분 수요 × 2)
    const demand = new Float64Array(Z * D);
    for (let zi = 0; zi < Z; zi++) {
      const q = zoneCommuters[zi] * zoneProfile[zi][s] * 2;
      for (let di = 0; di < D; di++) demand[zi * D + di] = q * pDest[zi * D + di];
    }
    const x = new Float64Array(R);
    // 모델 밖 배경 승객 (출근 시간대 분포에 비례)
    const bgFactor = PROFILE_NEAR[s] / Math.max(...PROFILE_NEAR);
    const bg = new Float64Array(R);
    for (let r = 0; r < R; r++) bg[r] = net.rides[r].bgPax * bgFactor;
    const board = new Float64Array(C);
    const zShare = new Float64Array(Z);
    const zMin = new Float64Array(Z);
    const zAccess = new Int32Array(Z).fill(-1);
    const probes = new Array(probeIdx.length).fill(NaN);
    let focus: FocusStats = { commuters: 0, railTrips: 0, railShare: 0, avgRailMin: 0, avgRoadMin: 0 };

    for (let it = 1; it <= iterations; it++) {
      for (let e = 0; e < E; e++) {
        const r = net.eRide[e];
        cost[e] = r >= 0 ? net.eBase[e] * crowdFactor((x[r] + bg[r]) / net.rides[r].capPerHour) : net.eBase[e];
      }
      const y = new Float64Array(R);
      const by = new Float64Array(C);
      const zRail = new Float64Array(Z);
      const zTot = new Float64Array(Z);
      const zTime = new Float64Array(Z);
      const zBest = new Float64Array(Z);
      const zBestC = new Int32Array(Z).fill(-1);
      zBest.fill(Infinity);
      let fCom = 0, fRail = 0, fTime = 0, fRoad = 0;
      const last = it === iterations;

      for (let di = 0; di < D; di++) {
        const n = reverseDijkstra(net, cost, destLinks[di], dist, next, order);
        flowAt.fill(0);
        for (let zi = 0; zi < Z; zi++) {
          const q = demand[zi * D + di];
          if (q <= 0) continue;
          const cands = zoneCands[zi];
          let cmin = Infinity;
          for (const k of cands) cmin = Math.min(cmin, k.acc + dist[k.c]);
          const road = roadMin[zi * D + di];
          let railShare = 0;
          let tExp = Infinity;
          if (Number.isFinite(cmin)) {
            let wsum = 0;
            let tsum = 0;
            for (const k of cands) {
              const c = k.acc + dist[k.c];
              if (!Number.isFinite(c)) continue;
              const w = Math.exp(-MU * (c - cmin));
              wsum += w;
              tsum += w * c;
            }
            tExp = tsum / wsum;
            railShare = 1 / (1 + Math.exp(THETA * (tExp - settings.railBias - road)));
            const qr = q * railShare;
            for (const k of cands) {
              const c = k.acc + dist[k.c];
              if (!Number.isFinite(c)) continue;
              const p = Math.exp(-MU * (c - cmin)) / wsum;
              flowAt[k.c] += qr * p;
              if (last && c < zBest[zi]) { zBest[zi] = c; zBestC[zi] = k.c; }
            }
          }
          if (last) {
            zRail[zi] += q * railShare;
            zTot[zi] += q;
            if (railShare > 0) zTime[zi] += q * railShare * tExp;
            if (zoneFocus[zi]) {
              fCom += q;
              fRail += q * railShare;
              if (railShare > 0) fTime += q * railShare * tExp;
              fRoad += q * (1 - railShare) * road;
            }
            probeIdx.forEach((p, pi) => {
              if (p.z === zi && p.d === di) probes[pi] = tExp;
            });
          }
        }
        // 최단경로 트리를 따라 목적지까지 누적
        for (let i = n - 1; i >= 0; i--) {
          const v = order[i];
          const f = flowAt[v];
          if (f <= 0) continue;
          const e = next[v];
          if (e < 0) continue;
          const r = net.eRide[e];
          if (r >= 0) y[r] += f;
          const bc = net.eBoardComplex[e];
          if (bc >= 0) by[bc] += f;
          flowAt[net.eTo[e]] += f;
        }
      }
      // MSA
      const step = 1 / it;
      for (let r = 0; r < R; r++) x[r] += (y[r] - x[r]) * step;
      for (let c = 0; c < C; c++) board[c] += (by[c] - board[c]) * step;
      if (last) {
        for (let zi = 0; zi < Z; zi++) {
          zShare[zi] = zTot[zi] > 0 ? zRail[zi] / zTot[zi] : 0;
          zMin[zi] = zRail[zi] > 0 ? zTime[zi] / zRail[zi] : 0;
          zAccess[zi] = zBestC[zi];
        }
        focus = {
          commuters: fCom,
          railTrips: fRail,
          railShare: fCom > 0 ? fRail / fCom : 0,
          avgRailMin: fRail > 0 ? fTime / fRail : 0,
          avgRoadMin: fCom - fRail > 0 ? fRoad / (fCom - fRail) : 0,
        };
      }
    }

    const rideLoad = new Float32Array(R);
    const rideRatio = new Float32Array(R);
    const maxBy = new Map<string, LineMax>();
    let over150 = 0;
    for (let r = 0; r < R; r++) {
      rideLoad[r] = x[r] + bg[r];
      const ratio = rideLoad[r] / net.rides[r].capPerHour;
      rideRatio[r] = ratio;
      if (ratio >= 1.5) over150++;
      const id = net.rides[r].lineId;
      const m = maxBy.get(id);
      if (!m || ratio > m.ratio) maxBy.set(id, { lineId: id, ratio, ride: r });
    }
    slots.push({
      label: SLOT_LABELS[s],
      rideLoad,
      rideRatio,
      boardings: Float32Array.from(board),
      lineMax: [...maxBy.values()].sort((a, b) => b.ratio - a.ratio),
      focus,
      over150,
      totalRail: focus.railTrips,
      zoneRailShare: Float32Array.from(zShare),
      zoneRailMin: Float32Array.from(zMin),
      zoneAccess: zAccess,
      probes,
    });
  }

  let peakSlot = 0;
  let peakVal = -1;
  slots.forEach((sl, i) => {
    let sum = 0;
    for (let r = 0; r < sl.rideLoad.length; r++) sum += sl.rideLoad[r] * net.rides[r].lengthKm;
    if (sum > peakVal) { peakVal = sum; peakSlot = i; }
  });

  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return { network: net, slots, peakSlot, zoneIds: zones.map((z) => z.id), zoneCommuters, ms: t1 - t0 };
}
