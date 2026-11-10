import { ColumnLayer, GeoJsonLayer, PathLayer, ScatterplotLayer, SolidPolygonLayer, TextLayer } from '@deck.gl/layers';
import { PathStyleExtension, type PathStyleExtensionProps } from '@deck.gl/extensions';
import type { Layer } from '@deck.gl/core';
import type { Complex, Network, RideEdge } from '../sim/network';
import type { SimResult, SlotResult } from '../sim/simulate';
import { segmentRibbon } from '../sim/geo';
import type { LayerToggles, UiState } from '../state/store';
import type { CustomLine, LonLat, Zone } from '../types';
import { BOUNDARIES } from './basemaps';
import { congestionColor, hexToRgba, lighten, type RGBA } from './colors';

/** 혼잡도 100%당 벽 높이 (m) — 기본 줌 기준. 실제 높이는 heightScale 을 곱한다 */
export const WALL_M_PER_100 = 650;

const metersPerPixel = (zoom: number) => (78271.517 * Math.cos((37.58 * Math.PI) / 180)) / Math.pow(2, zoom);

/**
 * 확대·축소해도 벽과 기둥이 화면에서 비슷한 크기로 보이도록 하는 배율.
 * 기본 줌(약 10.6)에서 1, 확대할수록 작아진다.
 */
export function heightScale(zoom: number): number {
  return Math.min(2.6, Math.max(0.06, metersPerPixel(zoom) / 40));
}
/** 인구 1명당 기둥 높이 (m) */
const POP_M = 0.02;

export const LABEL_FONT = '"Pretendard Variable", Pretendard, "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
export const LABEL_FONT_FALLBACK = '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

export interface LayerInput {
  result: SimResult | null;
  slot: number;
  layers: LayerToggles;
  hiddenLines: Record<string, boolean>;
  zoom: number;
  zones: Zone[];
  editLine: CustomLine | null;
  selected: UiState['selected'];
  dark: boolean;
  personsPerHousehold: number;
  fontFamily: string;
  /** 화면 좌표로 바꾸는 함수 (역 이름 겹침 방지용) */
  project: ((lon: number, lat: number) => [number, number]) | null;
  viewSize: [number, number];
}

/** 역간 구간 하나 (양방향 ride 한 쌍: 2p, 2p+1) */
export interface SegDatum {
  p: number;
  ride: RideEdge;
}

/** 그 구간에서 더 혼잡한 방향의 ride index */
export function peakRide(sl: SlotResult, p: number): number {
  return sl.rideRatio[2 * p + 1] > sl.rideRatio[2 * p] ? 2 * p + 1 : 2 * p;
}
export const peakRatio = (sl: SlotResult, p: number) => Math.max(sl.rideRatio[2 * p], sl.rideRatio[2 * p + 1] ?? 0);

const segCache = new WeakMap<Network, SegDatum[]>();
function segments(net: Network): SegDatum[] {
  let d = segCache.get(net);
  if (!d) {
    d = [];
    for (let p = 0; 2 * p < net.rides.length; p++) d.push({ p, ride: net.rides[2 * p] });
    segCache.set(net, d);
  }
  return d;
}

/** 줌 단계별 벽 두께 (m): 화면에서 약 1.8px 로 보이도록 */
function finWidth(zoom: number): number {
  return Math.min(400, Math.max(8, metersPerPixel(zoom) * 1.8));
}
export const zoomBucket = (zoom: number) => Math.round(zoom * 2) / 2;

const finCache = new WeakMap<Network, Map<number, LonLat[][]>>();
function fins(net: Network, bucket: number): LonLat[][] {
  let m = finCache.get(net);
  if (!m) finCache.set(net, (m = new Map()));
  let f = m.get(bucket);
  if (!f) {
    const w = finWidth(bucket);
    f = segments(net).map((d) => segmentRibbon(d.ride.path[0], d.ride.path[1], -w / 2, w / 2, w * 2.4));
    m.set(bucket, f);
  }
  return f;
}

const ZONE_COLORS: Record<string, RGBA> = {
  detail: [150, 166, 255, 105],
  district: [120, 120, 160, 70],
  scenario: [255, 122, 198, 165],
  user: [94, 234, 212, 185],
};

const DARK_INK: RGBA = [9, 12, 20, 240];
const LIGHT_INK: RGBA = [255, 255, 255, 240];

function labelPriority(c: Complex, net: Network): number {
  let p = c.lineIds.length * 10;
  for (const id of c.lineIds) {
    const l = net.lines.find((x) => x.id === id);
    if (!l) continue;
    if (l.kind !== 'existing') p += 60;
    else if (id === 'G') p += 50;
  }
  if (c.lon < 126.83 && c.lat > 37.55) p += 15;
  return p;
}

const textWidth = (s: string, fs: number) => {
  let w = 0;
  for (const ch of s) w += ch.charCodeAt(0) > 0x2e80 ? fs * 0.93 : fs * 0.58;
  return w;
};

interface LabelDatum {
  c: Complex;
  major: boolean;
}

/** 우선순위가 높은 역부터 화면에 놓고, 이미 놓인 이름과 겹치면 건너뛴다 */
function pickLabels(cands: Complex[], net: Network, inp: LayerInput): LabelDatum[] {
  const scored = cands.map((c) => ({ c, pr: labelPriority(c, net) })).sort((a, b) => b.pr - a.pr || a.c.id - b.c.id);
  if (!inp.project) return scored.slice(0, 60).map(({ c, pr }) => ({ c, major: pr >= 45 }));
  const [vw, vh] = inp.viewSize;
  const boxes: number[][] = [];
  const out: LabelDatum[] = [];
  for (const { c, pr } of scored) {
    const [x, y] = inp.project(c.lon, c.lat);
    if (!(x > -30 && y > -10 && x < vw + 30 && y < vh + 30)) continue;
    const major = pr >= 45;
    const fs = major ? 13 : 12;
    const hw = textWidth(c.name, fs) / 2 + 5;
    const box = [x - hw, y - LABEL_DY - fs / 2 - 3, x + hw, y - LABEL_DY + fs / 2 + 3];
    if (boxes.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
    boxes.push(box);
    out.push({ c, major });
  }
  return out;
}
const LABEL_DY = 15;

function planColorOf(c: Complex, net: Network): RGBA {
  for (const id of c.lineIds) {
    const l = net.lines.find((x) => x.id === id);
    if (l && l.kind !== 'existing') return hexToRgba(l.color, 255);
  }
  return [255, 255, 255, 255];
}

export interface StaticLayers {
  /** 열차보다 아래에 그릴 레이어 */
  below: Layer[];
  /** 열차 위에 그릴 레이어 (역 이름, 선택 강조, 편집 중 노선) */
  above: Layer[];
}

export function buildStaticLayers(inp: LayerInput): StaticLayers {
  const below: Layer[] = [];
  const above: Layer[] = [];
  const { result, slot, layers, hiddenLines, dark } = inp;
  const ink = dark ? DARK_INK : LIGHT_INK;
  const bucket = zoomBucket(inp.zoom);
  const hs = heightScale(inp.zoom);
  const colRadius = Math.max(12, 210 * hs);

  if (layers.boundaries) {
    below.push(
      new GeoJsonLayer({
        id: 'boundaries',
        data: BOUNDARIES,
        stroked: true,
        filled: false,
        getLineColor: dark ? [130, 150, 200, 90] : [60, 70, 100, 110],
        lineWidthMinPixels: 1,
      }),
    );
  }

  if (result) {
    const net = result.network;
    const sl = result.slots[slot];
    const segs = segments(net).filter((d) => !hiddenLines[d.ride.lineId]);
    const solid = segs.filter((d) => d.ride.kind !== 'plan');
    const plan = segs.filter((d) => d.ride.kind === 'plan');
    const widthOf = (d: SegDatum) => (d.ride.kind === 'existing' ? 3.6 : d.ride.kind === 'plan' ? 3.8 : 4.4);

    below.push(
      // 계획·내 노선은 은은한 후광으로 구분
      new PathLayer<SegDatum>({
        id: 'line-glow',
        data: segs.filter((d) => d.ride.kind !== 'existing'),
        getPath: (d) => d.ride.path,
        getColor: (d) => hexToRgba(d.ride.color, 46),
        getWidth: 11,
        widthUnits: 'pixels',
        capRounded: true,
        jointRounded: true,
      }),
      new PathLayer<SegDatum>({
        id: 'line-casing',
        data: segs,
        getPath: (d) => d.ride.path,
        getColor: ink,
        getWidth: (d) => widthOf(d) + 2.6,
        widthUnits: 'pixels',
        capRounded: true,
        jointRounded: true,
        updateTriggers: { getColor: dark },
      }),
      new PathLayer<SegDatum>({
        id: 'line-base',
        data: solid,
        getPath: (d) => d.ride.path,
        getColor: (d) => hexToRgba(d.ride.color, 255),
        getWidth: widthOf,
        widthUnits: 'pixels',
        capRounded: true,
        jointRounded: true,
        pickable: true,
      }),
      // 계획 노선은 점선
      new PathLayer<SegDatum, PathStyleExtensionProps<SegDatum>>({
        id: 'line-plan',
        data: plan,
        getPath: (d) => d.ride.path,
        getColor: (d) => hexToRgba(d.ride.color, 255),
        getWidth: widthOf,
        widthUnits: 'pixels',
        pickable: true,
        extensions: [new PathStyleExtension({ dash: true })],
        getDashArray: [3.2, 2],
        dashJustified: true,
      }),
    );

    if (layers.walls) {
      const polys = fins(net, bucket);
      below.push(
        new SolidPolygonLayer<SegDatum>({
          id: 'walls',
          data: segs.filter((d) => peakRatio(sl, d.p) > 0.04),
          extruded: true,
          getPolygon: (d) => polys[d.p],
          getElevation: (d) => peakRatio(sl, d.p) * WALL_M_PER_100,
          elevationScale: hs,
          getFillColor: (d) => congestionColor(peakRatio(sl, d.p), 232),
          // 윗변·모서리를 밝게 그어 벽이 또렷하게 보이도록
          wireframe: true,
          getLineColor: (d) => lighten(congestionColor(peakRatio(sl, d.p), 255), 0.45),
          pickable: true,
          material: { ambient: 0.7, diffuse: 0.42, shininess: 8, specularColor: [22, 22, 22] },
          updateTriggers: { getPolygon: bucket, getElevation: [slot, result], getFillColor: [slot, result], getLineColor: [slot, result] },
        }),
      );
    }

    if (layers.stations) {
      below.push(
        new ColumnLayer<Complex>({
          id: 'boardings',
          data: net.complexes.filter((c) => sl.boardings[c.id] > 50),
          diskResolution: 16,
          radius: colRadius * 0.7,
          extruded: true,
          getPosition: (c) => [c.lon, c.lat],
          getElevation: (c) => sl.boardings[c.id] * 0.1,
          elevationScale: hs,
          getFillColor: [240, 244, 255, 150],
          pickable: true,
          material: { ambient: 0.7, diffuse: 0.4, shininess: 8, specularColor: [20, 20, 20] },
          updateTriggers: { getElevation: [slot, result] },
        }),
      );
    }
  }

  if (layers.zones) {
    below.push(
      new ColumnLayer<Zone>({
        id: 'zones',
        data: inp.zones.filter((z) => z.source !== 'district'),
        diskResolution: 20,
        radius: colRadius,
        extruded: true,
        getPosition: (z) => [z.lon, z.lat],
        getElevation: (z) => z.households * inp.personsPerHousehold * POP_M,
        elevationScale: hs,
        getFillColor: (z) => ZONE_COLORS[z.source] ?? ZONE_COLORS.detail,
        pickable: true,
        material: { ambient: 0.72, diffuse: 0.36, shininess: 6, specularColor: [18, 18, 18] },
        updateTriggers: { getElevation: [inp.personsPerHousehold] },
      }),
    );
  }

  if (result) {
    const net = result.network;
    const z = inp.zoom;
    const visible = net.complexes.filter((c) => !c.lineIds.every((id) => hiddenLines[id]));
    const baseR = z < 10 ? 1.4 : z < 11 ? 2.1 : z < 12 ? 2.8 : z < 13.5 ? 3.6 : 4.8;

    below.push(
      new ScatterplotLayer<Complex>({
        id: 'stations',
        data: visible,
        getPosition: (c) => [c.lon, c.lat, 12],
        radiusUnits: 'pixels',
        getRadius: (c) => baseR + (c.lineIds.length > 1 ? 1.1 : 0) + (c.tentative ? 0.7 : 0),
        stroked: true,
        filled: true,
        getFillColor: (c) => (c.tentative ? [ink[0], ink[1], ink[2], 255] : dark ? [248, 250, 255, 255] : [255, 255, 255, 255]),
        getLineColor: (c) => (c.tentative ? planColorOf(c, net) : dark ? [9, 12, 20, 255] : [40, 46, 62, 255]),
        lineWidthUnits: 'pixels',
        getLineWidth: (c) => (c.tentative ? 1.8 : 1.2),
        pickable: true,
        // 혼잡도 벽에 가려지지 않게
        parameters: { depthCompare: 'always', depthWriteEnabled: false },
        updateTriggers: { getRadius: baseR, getFillColor: dark, getLineColor: [dark, net] },
      }),
    );

    if (layers.labels && z >= 9.5) {
      const cands = visible.filter((c) => {
        if (z >= 11.6) return true;
        const pr = labelPriority(c, net);
        return z >= 10.4 ? pr >= 20 : pr >= 45;
      });
      above.push(
        new TextLayer<LabelDatum>({
          id: 'labels',
          data: pickLabels(cands, net, inp),
          getPosition: (d) => [d.c.lon, d.c.lat, 12],
          getText: (d) => d.c.name,
          getSize: (d) => (d.major ? 13 : 12),
          sizeUnits: 'pixels',
          getPixelOffset: [0, -LABEL_DY],
          getColor: (d) => (dark ? (d.major ? [245, 247, 252, 255] : [196, 204, 220, 255]) : d.major ? [18, 22, 34, 255] : [70, 78, 98, 255]),
          fontFamily: inp.fontFamily,
          fontWeight: 600,
          characterSet: 'auto',
          fontSettings: { sdf: true, fontSize: 52, buffer: 7, radius: 14 },
          outlineWidth: 3.2,
          outlineColor: dark ? [9, 12, 20, 235] : [255, 255, 255, 235],
          parameters: { depthCompare: 'always', depthWriteEnabled: false },
          updateTriggers: { getColor: dark },
        }),
      );
    }
  }

  // 선택 강조
  if (inp.selected && result) {
    let pos: [number, number] | null = null;
    if (inp.selected.type === 'complex') {
      const c = result.network.complexes[inp.selected.index];
      if (c) pos = [c.lon, c.lat];
    } else if (inp.selected.type === 'zone') {
      const zn = inp.zones[inp.selected.index];
      if (zn) pos = [zn.lon, zn.lat];
    } else if (inp.selected.type === 'ride') {
      const r = result.network.rides[inp.selected.index];
      if (r) pos = [(r.path[0][0] + r.path[1][0]) / 2, (r.path[0][1] + r.path[1][1]) / 2];
    }
    if (pos) {
      above.push(
        new ScatterplotLayer({
          id: 'selected',
          data: [pos],
          getPosition: (p: [number, number]) => p,
          radiusUnits: 'pixels',
          getRadius: 13,
          stroked: true,
          filled: false,
          getLineColor: dark ? [255, 255, 255, 255] : [20, 24, 36, 255],
          lineWidthUnits: 'pixels',
          getLineWidth: 2,
          parameters: { depthCompare: 'always', depthWriteEnabled: false },
        }),
      );
    }
  }

  // 편집 중인 노선
  if (inp.editLine) {
    const l = inp.editLine;
    const color = hexToRgba(l.color, 255);
    const always = { depthCompare: 'always' as const, depthWriteEnabled: false };
    above.push(
      new PathLayer({
        id: 'edit-path',
        data: l.stops.length > 1 ? [l.stops.map((s) => [s.lon, s.lat])] : [],
        getPath: (p: LonLat[]) => p,
        getColor: [color[0], color[1], color[2], 230],
        getWidth: 4,
        widthUnits: 'pixels',
        capRounded: true,
        jointRounded: true,
        parameters: always,
      }),
      new ScatterplotLayer({
        id: 'edit-stops',
        data: l.stops.map((s, i) => ({ s, i })),
        getPosition: (d: { s: { lon: number; lat: number } }) => [d.s.lon, d.s.lat, 30],
        getRadius: 9,
        radiusUnits: 'pixels',
        stroked: true,
        getFillColor: [255, 255, 255, 255],
        getLineColor: color,
        lineWidthUnits: 'pixels',
        getLineWidth: 3,
        parameters: always,
      }),
      new TextLayer({
        id: 'edit-numbers',
        data: l.stops.map((s, i) => ({ s, i })),
        getPosition: (d: { s: { lon: number; lat: number } }) => [d.s.lon, d.s.lat, 30],
        getText: (d: { i: number }) => String(d.i + 1),
        getSize: 11,
        getColor: [20, 20, 30, 255],
        fontFamily: inp.fontFamily,
        fontWeight: 700,
        characterSet: 'auto',
        parameters: always,
      }),
    );
  }

  return { below, above };
}
