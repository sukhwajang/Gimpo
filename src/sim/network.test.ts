import { describe, expect, it } from 'vitest';
import { buildNetwork } from './network';
import { EXISTING_LINES, resolveLines } from './resolve';
import type { CustomLine } from '../types';

const empty = { activePlans: {}, planOptions: {}, lineOverrides: {}, customLines: [] as CustomLine[] };

describe('network', () => {
  it('기존 노선의 환승역을 하나의 역으로 묶는다', () => {
    const net = buildNetwork(EXISTING_LINES);
    const gimpo = net.complexes.filter((c) => c.name === '김포공항');
    expect(gimpo).toHaveLength(1);
    expect(gimpo[0].lineIds.sort()).toEqual(['5', '9', 'A', 'G', 'WS'].sort());
    const seoul = net.complexes.find((c) => c.name === '서울')!;
    expect(seoul.lineIds).toEqual(expect.arrayContaining(['1', '4', 'A']));
  });

  it('구간은 양방향으로 만들어지고 정원은 열차 횟수 × 정원', () => {
    const net = buildNetwork(EXISTING_LINES);
    const g = net.rides.filter((r) => r.lineId === 'G');
    expect(g).toHaveLength(18);
    expect(g[0].capPerHour).toBe(24 * 172);
  });

  it('5호선 연장은 방화역에서 5호선과 직결(같은 승강장 노드)', () => {
    const lines = resolveLines({ ...empty, activePlans: { L5X: true } });
    const net = buildNetwork(lines);
    const banghwa = net.complexes.find((c) => c.name === '방화')!;
    expect(banghwa.lineIds).toEqual(expect.arrayContaining(['5', 'L5X']));
    // 방화 승차 간선은 5호선·연장이 공유하므로 1개
    let boards = 0;
    for (let e = 0; e < net.eFrom.length; e++) if (net.eKind[e] === 1 && net.eBoardComplex[e] === banghwa.id) boards++;
    expect(boards).toBe(1);
  });

  it('선택 역 옵션을 켜면 정거장이 늘어난다', () => {
    const off = resolveLines({ ...empty, activePlans: { L5X: true } }).find((l) => l.id === 'L5X')!;
    const on = resolveLines({ ...empty, activePlans: { L5X: true }, planOptions: { wondang: true, tongjin: true } }).find((l) => l.id === 'L5X')!;
    expect(on.sequences[0].stops.length).toBe(off.sequences[0].stops.length + 2);
  });

  it('운영 시나리오는 기존 노선 파라미터를 바꾼다', () => {
    const lines = resolveLines({ ...empty, activePlans: { 'GOLD-OPS': true } });
    expect(lines.find((l) => l.id === 'G')!.params.tph).toBe(28);
  });

  it('내 노선이 기존 역 이름을 쓰면 환승역으로 연결된다', () => {
    const custom: CustomLine = {
      id: 'c1',
      name: '테스트선',
      color: '#fff',
      visible: true,
      params: { tph: 10, cap: 960, speed: 40 },
      stops: [
        { name: '풍무', lon: 126.73258, lat: 37.61233, ref: '풍무' },
        { name: '새역', lon: 126.76, lat: 37.58 },
        { name: '마곡나루', lon: 126.82761, lat: 37.56672, ref: '마곡나루' },
      ],
    };
    const net = buildNetwork(resolveLines({ ...empty, customLines: [custom] }));
    const pm = net.complexes.find((c) => c.name === '풍무')!;
    expect(pm.lineIds).toEqual(expect.arrayContaining(['G', 'c1']));
    const mg = net.complexes.find((c) => c.name === '마곡나루')!;
    expect(mg.lineIds).toEqual(expect.arrayContaining(['9', 'A', 'c1']));
  });
});
