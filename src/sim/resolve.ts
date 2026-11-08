import existingJson from '../data/generated/existing-lines.json';
import { PLANS } from '../data/plans';
import type { CustomLine, LineDef, LineParams, PlanDef, Stop } from '../types';
import { distM } from './geo';

export const EXISTING_LINES: LineDef[] = existingJson as unknown as LineDef[];

export function normName(name: string): string {
  let n = name.replace(/\(.*?\)/g, '').trim();
  if (n.length > 2 && n.endsWith('역')) n = n.slice(0, -1);
  return n;
}

export interface ExistingStation {
  name: string;
  norm: string;
  lon: number;
  lat: number;
  lines: string[];
}

/** 기존 역 목록 (같은 이름 600m 이내는 하나로) */
export const EXISTING_STATIONS: ExistingStation[] = (() => {
  const out: ExistingStation[] = [];
  for (const line of EXISTING_LINES) {
    for (const seq of line.sequences) {
      for (const s of seq.stops) {
        const norm = normName(s.name);
        const hit = out.find((u) => u.norm === norm && distM(u.lon, u.lat, s.lon, s.lat) < 600);
        if (hit) {
          if (!hit.lines.includes(line.id)) hit.lines.push(line.id);
        } else out.push({ name: norm, norm, lon: s.lon, lat: s.lat, lines: [line.id] });
      }
    }
  }
  return out;
})();

export function findExistingStation(name: string, near?: [number, number]): ExistingStation | undefined {
  const norm = normName(name);
  const cands = EXISTING_STATIONS.filter((s) => s.norm === norm);
  if (!cands.length) return undefined;
  if (!near || cands.length === 1) return cands[0];
  return cands.reduce((a, b) => (distM(a.lon, a.lat, near[0], near[1]) <= distM(b.lon, b.lat, near[0], near[1]) ? a : b));
}

/** 클릭 위치 근처의 기존 역 (편집기 스냅용) */
export function nearestStation(lon: number, lat: number, maxM: number, extra: ExistingStation[] = []): ExistingStation | undefined {
  let best: ExistingStation | undefined;
  let bestD = maxM;
  for (const s of [...EXISTING_STATIONS, ...extra]) {
    const d = distM(lon, lat, s.lon, s.lat);
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

export interface ScenarioInput {
  activePlans: Record<string, boolean>;
  planOptions: Record<string, boolean>;
  lineOverrides: Record<string, Partial<LineParams>>;
  customLines: CustomLine[];
}

function applyParams(line: LineDef, p: Partial<LineParams>): LineDef {
  const params = { ...line.params, ...p };
  const scale = line.params.tph > 0 ? params.tph / line.params.tph : 1;
  return {
    ...line,
    params,
    sequences: line.sequences.map((s) => ({ ...s, tph: Math.max(0.5, s.tph * scale) })),
  };
}

export function planStops(plan: PlanDef, options: Record<string, boolean>): Stop[] {
  return plan.stops
    .filter((s) => !s.option || options[s.option])
    .map((s) => {
      if (!s.ref) return s;
      const ex = findExistingStation(s.ref, [s.lon, s.lat]);
      return ex ? { ...s, name: ex.name, lon: ex.lon, lat: ex.lat } : s;
    });
}

export function planToLine(plan: PlanDef, options: Record<string, boolean>): LineDef | null {
  if (plan.ops) return null;
  const stops = planStops(plan, options);
  if (stops.length < 2) return null;
  return {
    id: plan.id,
    name: plan.shortName,
    color: plan.color,
    kind: 'plan',
    serviceId: plan.serviceId,
    params: plan.params,
    sequences: [{ tph: plan.params.tph, stops }],
  };
}

export function customToLine(c: CustomLine): LineDef | null {
  if (c.stops.length < 2) return null;
  return {
    id: c.id,
    name: c.name,
    color: c.color,
    kind: 'custom',
    params: c.params,
    sequences: [{ tph: c.params.tph, stops: c.stops }],
  };
}

/** 시나리오 입력 → 시뮬레이션용 노선 목록 */
export function resolveLines(input: ScenarioInput): LineDef[] {
  const opsOverrides: Record<string, Partial<LineParams>> = {};
  for (const plan of PLANS) {
    if (plan.ops && input.activePlans[plan.id]) {
      const { target, ...rest } = plan.ops;
      opsOverrides[target] = { ...opsOverrides[target], ...rest };
    }
  }
  const lines: LineDef[] = EXISTING_LINES.map((l) => {
    const p = { ...opsOverrides[l.id], ...input.lineOverrides[l.id] };
    return Object.keys(p).length ? applyParams(l, p) : l;
  });
  for (const plan of PLANS) {
    if (!input.activePlans[plan.id]) continue;
    const l = planToLine(plan, input.planOptions);
    const o = input.lineOverrides[plan.id];
    if (l) lines.push(o && Object.keys(o).length ? applyParams(l, o) : l);
  }
  for (const c of input.customLines) {
    if (!c.visible) continue;
    const l = customToLine(c);
    if (l) lines.push(l);
  }
  return lines;
}
