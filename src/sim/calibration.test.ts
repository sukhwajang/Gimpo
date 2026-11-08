import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../types';
import { PROBES, toBaselineInput, toSimInput, type FullInput } from './scenario';
import { simulate, type SimResult } from './simulate';

const base: FullInput = {
  activePlans: {},
  planOptions: {},
  lineOverrides: {},
  customLines: [],
  householdOverrides: {},
  activeScenarios: {},
  userZones: [],
  settings: DEFAULT_SETTINGS,
};

function segRatio(res: SimResult, slot: number, lineId: string, a: string, b: string) {
  const r = res.network.rides.findIndex((x) => x.lineId === lineId && x.aName === a && x.bName === b);
  return r >= 0 ? res.slots[slot].rideRatio[r] : NaN;
}

function report(res: SimResult, title: string) {
  const s = res.peakSlot;
  const sl = res.slots[s];
  const lines = sl.lineMax.slice(0, 22).map((m) => {
    const ride = res.network.rides[m.ride];
    return `${ride.lineName.padEnd(8)} ${(m.ratio * 100).toFixed(0).padStart(4)}%  ${ride.aName}→${ride.bName}`;
  });
  const gold = res.slots.map((x) => (segRatio(res, res.slots.indexOf(x), 'G', '고촌', '김포공항') * 100).toFixed(0)).join(' ');
  console.log(
    [
      `== ${title} (${res.ms.toFixed(0)}ms) peak=${sl.label}`,
      `골드라인 고촌→김포공항 by slot: ${gold}`,
      `김포·검단: 통근 ${sl.focus.commuters.toFixed(0)}/h, 철도 ${(sl.focus.railShare * 100).toFixed(0)}%, 철도 ${sl.focus.avgRailMin.toFixed(0)}분, 도로 ${sl.focus.avgRoadMin.toFixed(0)}분`,
      `probes: ${PROBES.map((p, i) => `${p.label} ${sl.probes[i].toFixed(0)}분`).join(', ')}`,
      `150%+ 구간: ${sl.over150}`,
      ...lines,
    ].join('\n'),
  );
}

describe('calibration', () => {
  it('현재 상태가 실제 혼잡도와 비슷한 수준', () => {
    const res = simulate(toBaselineInput(base));
    report(res, '현재');
    const peakGold = Math.max(...res.slots.map((_, i) => segRatio(res, i, 'G', '고촌', '김포공항')));
    // 2026.4 실측 최고 183.7%
    expect(peakGold).toBeGreaterThan(1.7);
    expect(peakGold).toBeLessThan(2.0);
  });

  it('국토부 전망과 비슷: 증차 완료 약 170%, 증차+5호선 연장 160% 안팎', () => {
    const g = (r: SimResult) => Math.max(...r.slots.map((_, i) => segRatio(r, i, 'G', '고촌', '김포공항')));
    const ops = g(simulate(toSimInput({ ...base, activePlans: { 'GOLD-OPS': true } })));
    const both = g(simulate(toSimInput({ ...base, activePlans: { 'GOLD-OPS': true, L5X: true } })));
    expect(ops).toBeGreaterThan(1.6);
    expect(ops).toBeLessThan(1.8);
    expect(both).toBeLessThan(1.68);
    expect(both).toBeLessThan(ops);
  });

  it('5호선 연장 시 골드라인 혼잡 완화', () => {
    const before = simulate(toBaselineInput(base));
    const after = simulate(toSimInput({ ...base, activePlans: { L5X: true } }));
    report(after, '5호선 연장');
    const g = (r: SimResult) => Math.max(...r.slots.map((_, i) => segRatio(r, i, 'G', '고촌', '김포공항')));
    expect(g(after)).toBeLessThan(g(before));
  });

  it('여러 계획 동시 + 개발 시나리오', () => {
    const res = simulate(
      toSimInput({
        ...base,
        activePlans: { L5X: true, GTXD: true, DH: true, I2X: true },
        planOptions: { gtxb: true },
        activeScenarios: { hangang2cc: true, 'geomdan-final': true },
      }),
    );
    report(res, '계획 다수 + 2CC');
    expect(res.slots.length).toBe(8);
  });
});
