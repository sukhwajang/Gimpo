import { ColumnLayer, GeoJsonLayer, PathLayer, ScatterplotLayer, SolidPolygonLayer, TextLayer } from '@deck.gl/layers';
import type { Layer } from '@deck.gl/core';
import type { Complex, Network, RideEdge } from '../sim/network';
import type { SimResult } from '../sim/simulate';
import { segmentRibbon } from '../sim/geo';
import type { LayerToggles, UiState } from '../state/store';
import type { CustomLine, LonLat, Zone } from '../types';
import { BOUNDARIES } from './basemaps';
import { congestionColor, hexToRgba, type RGBA } from './colors';

export const WALL_M_PER_100 = 650;

export interface LayerInput {
  result: SimResult | null;
  slot: number;
  layers: LayerToggles;
  hiddenLines: Record<string, boolean>;
  zoom: number;
  zones: Zone[];
  zoneIndex: Map<string, number>;
  editLine: CustomLine | null;
  selected: UiState['selected'];
  dark: boolean;
  personsPerHousehold: number;
}

const ribbonCache = new WeakMap<Network, LonLat[][]>();
function ribbons(net: Network): LonLat[][] {
  let r = ribbonCache.get(net);
  if (!r) {
    r = net.rides.map((ride) => segmentRibbon(ride.path[0], ride.path[1], 25, 115, 60));
    ribbonCache.set(net, r);
  }
  return r;
}

interface RideDatum {
  i: number;
  ride: RideEdge;
}

const rideDataCache = new WeakMap<Network, RideDatum[]>();
function rideData(net: Network): RideDatum[] {
  let d = rideDataCache.get(net);
  if (!d) {
    d = net.rides.map((ride, i) => ({ i, ride }));
    rideDataCache.set(net, d);
  }
  return d;
}

const ZONE_COLORS: Record<string, RGBA> = {
  detail: [150, 110, 255, 170],
  district: [120, 120, 160, 90],
  scenario: [255, 90, 200, 200],
  user: [60, 220, 255, 210],
};

function isMajor(c: Complex, net: Network): boolean {
  if (c.lineIds.length >= 2) return true;
  return c.lineIds.some((id) => {
    const l = net.lines.find((x) => x.id === id);
    return l ? l.kind !== 'existing' || id === 'G' : false;
  });
}

export function buildStaticLayers(inp: LayerInput): Layer[] {
  const out: Layer[] = [];
  const { result, slot, layers, hiddenLines } = inp;

  if (layers.boundaries) {
    out.push(
      new GeoJsonLayer({
        id: 'boundaries',
        data: BOUNDARIES,
        stroked: true,
        filled: false,
        getLineColor: inp.dark ? [120, 140, 190, 110] : [60, 70, 100, 120],
        lineWidthMinPixels: 1,
      }),
    );
  }

  if (result) {
    const net = result.network;
    const sl = result.slots[slot];
    const rides = rideData(net).filter((d) => !hiddenLines[d.ride.lineId]);
    const pairs = rides.filter((d) => d.i % 2 === 0);
    const ribbonsArr = ribbons(net);

    // 계획·내 노선 강조(glow)
    out.push(
      new PathLayer<RideDatum>({
        id: 'line-glow',
        data: pairs.filter((d) => d.ride.kind !== 'existing'),
        getPath: (d) => d.ride.path,
        getColor: (d) => hexToRgba(d.ride.color, 90),
        getWidth: 12,
        widthUnits: 'pixels',
        capRounded: true,
      }),
    );
    out.push(
      new PathLayer<RideDatum>({
        id: 'line-base',
        data: pairs,
        getPath: (d) => d.ride.path,
        getColor: (d) => hexToRgba(d.ride.color, 255),
        getWidth: (d) => (d.ride.kind === 'existing' ? 3.5 : 5),
        widthUnits: 'pixels',
        capRounded: true,
        jointRounded: true,
        pickable: true,
      }),
    );

    if (layers.walls) {
      out.push(
        new SolidPolygonLayer<RideDatum>({
          id: 'walls',
          data: rides.filter((d) => sl.rideRatio[d.i] > 0.03),
          extruded: true,
          getPolygon: (d) => ribbonsArr[d.i],
          getElevation: (d) => sl.rideRatio[d.i] * WALL_M_PER_100,
          getFillColor: (d) => congestionColor(sl.rideRatio[d.i], 215),
          pickable: true,
          material: { ambient: 0.55, diffuse: 0.6, shininess: 24, specularColor: [60, 60, 60] },
          updateTriggers: { getElevation: [slot, result], getFillColor: [slot, result] },
        }),
      );
    }

    if (layers.stations) {
      const maxB = Math.max(1, ...sl.boardings);
      out.push(
        new ColumnLayer<Complex>({
          id: 'boardings',
          data: net.complexes.filter((c) => sl.boardings[c.id] > 50),
          diskResolution: 12,
          radius: 170,
          extruded: true,
          getPosition: (c) => [c.lon, c.lat],
          getElevation: (c) => sl.boardings[c.id] * 0.12,
          getFillColor: (c) => [40, 200, 210, 120 + Math.round((sl.boardings[c.id] / maxB) * 120)],
          pickable: true,
          updateTriggers: { getElevation: [slot, result], getFillColor: [slot, result] },
        }),
      );
    }

    out.push(
      new ScatterplotLayer<Complex>({
        id: 'stations',
        data: net.complexes.filter((c) => !c.lineIds.every((id) => hiddenLines[id])),
        getPosition: (c) => [c.lon, c.lat, 20],
        getRadius: (c) => (c.lineIds.length > 1 ? 150 : 100),
        radiusMinPixels: 2.5,
        radiusMaxPixels: 9,
        stroked: true,
        filled: true,
        getFillColor: (c) => (c.tentative ? [0, 0, 0, 0] : inp.dark ? [245, 245, 250, 255] : [255, 255, 255, 255]),
        getLineColor: (c) => (c.tentative ? [255, 255, 255, 230] : [30, 34, 48, 255]),
        lineWidthMinPixels: 1.5,
        pickable: true,
      }),
    );

    if (layers.labels) {
      const z = inp.zoom;
      const labelData = net.complexes.filter((c) => {
        if (c.lineIds.every((id) => hiddenLines[id])) return false;
        if (z >= 12.3) return true;
        if (z >= 11) return isMajor(c, net) || (c.lon < 126.83 && c.lat > 37.55);
        if (z >= 10) return c.lineIds.length >= 3 || (isMajor(c, net) && c.lon < 126.83);
        return false;
      });
      out.push(
        new TextLayer<Complex>({
          id: 'labels',
          data: labelData,
          getPosition: (c) => [c.lon, c.lat, 60],
          getText: (c) => c.name,
          getSize: 12,
          sizeUnits: 'pixels',
          getPixelOffset: [0, -14],
          getColor: inp.dark ? [235, 238, 245, 255] : [25, 30, 45, 255],
          fontFamily: '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
          fontWeight: 600,
          characterSet: 'auto',
          fontSettings: { sdf: true, fontSize: 48, buffer: 6 },
          outlineWidth: 3,
          outlineColor: inp.dark ? [14, 19, 32, 230] : [255, 255, 255, 230],
          updateTriggers: { getColor: inp.dark },
        }),
      );
    }
  }

  if (layers.zones) {
    const shown = inp.zones.filter((z) => z.source !== 'district');
    out.push(
      new ColumnLayer<Zone>({
        id: 'zones',
        data: shown,
        diskResolution: 6,
        radius: 320,
        angle: 30,
        extruded: true,
        getPosition: (z) => [z.lon, z.lat],
        getElevation: (z) => z.households * inp.personsPerHousehold * 0.03,
        getFillColor: (z) => ZONE_COLORS[z.source] ?? ZONE_COLORS.detail,
        pickable: true,
        updateTriggers: { getElevation: [inp.personsPerHousehold] },
      }),
    );
  }

  // 선택 강조
  if (inp.selected && result) {
    let pos: [number, number] | null = null;
    if (inp.selected.type === 'complex') {
      const c = result.network.complexes[inp.selected.index];
      if (c) pos = [c.lon, c.lat];
    } else if (inp.selected.type === 'zone') {
      const z = inp.zones[inp.selected.index];
      if (z) pos = [z.lon, z.lat];
    }
    if (pos) {
      out.push(
        new ScatterplotLayer({
          id: 'selected',
          data: [pos],
          getPosition: (p: [number, number]) => p,
          getRadius: 420,
          radiusMinPixels: 10,
          stroked: true,
          filled: false,
          getLineColor: [255, 255, 255, 255],
          lineWidthMinPixels: 2.5,
        }),
      );
    }
  }

  // 편집 중인 노선
  if (inp.editLine) {
    const l = inp.editLine;
    const color = hexToRgba(l.color, 255);
    out.push(
      new PathLayer({
        id: 'edit-path',
        data: l.stops.length > 1 ? [l.stops.map((s) => [s.lon, s.lat])] : [],
        getPath: (p: LonLat[]) => p,
        getColor: [color[0], color[1], color[2], 200],
        getWidth: 4,
        widthUnits: 'pixels',
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
        lineWidthMinPixels: 3,
      }),
      new TextLayer({
        id: 'edit-numbers',
        data: l.stops.map((s, i) => ({ s, i })),
        getPosition: (d: { s: { lon: number; lat: number } }) => [d.s.lon, d.s.lat, 40],
        getText: (d: { i: number }) => String(d.i + 1),
        getSize: 11,
        getColor: [20, 20, 30, 255],
        fontWeight: 700,
        characterSet: 'auto',
      }),
    );
  }

  return out;
}
