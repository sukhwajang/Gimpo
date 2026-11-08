import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { ScatterplotLayer } from '@deck.gl/layers';
import type { Layer, PickingInfo } from '@deck.gl/core';
import { useStore } from '../state/store';
import { buildZones } from '../sim/scenario';
import { EXISTING_STATIONS, nearestStation, planStops, type ExistingStation } from '../sim/resolve';
import { PLANS } from '../data/plans';
import { BASEMAPS, basemapStyle } from './basemaps';
import { buildStaticLayers } from './layers';
import { prepareRuns, trainPositions, type TrainPos } from './trains';
import { congestionLabel, hexToRgba } from './colors';
import type { Complex } from '../sim/network';
import type { Zone } from '../types';

const INITIAL = { center: [126.76, 37.585] as [number, number], zoom: 10.7, pitch: 52, bearing: -14 };
const SIM_MIN_PER_SEC = 1.2;

const pct = (r: number) => `${Math.round(r * 100)}%`;
const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');

export function MapView({ padLeft = 0, padRight = 0 }: { padLeft?: number; padRight?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const staticRef = useRef<Layer[]>([]);
  const runsRef = useRef<ReturnType<typeof prepareRuns>>([]);
  const simTimeRef = useRef(0);
  const [zoom, setZoom] = useState(INITIAL.zoom);
  const [mapReady, setMapReady] = useState(false);

  const result = useStore((s) => s.sim.scenario);
  const baseline = useStore((s) => s.sim.baseline);
  const ui = useStore((s) => s.ui);
  const scenario = useStore((s) => s.scenario);

  const zones = useMemo(() => buildZones(scenario), [scenario]);
  const zoneIndex = useMemo(() => new Map((result?.zoneIds ?? []).map((id, i) => [id, i])), [result]);
  const editLine = ui.edit.kind === 'line' ? scenario.customLines.find((l) => l.id === (ui.edit as { lineId: string }).lineId) ?? null : null;
  const dark = BASEMAPS.find((b) => b.id === ui.basemap)?.dark ?? true;

  // 기준(현재) 구간 혼잡도 찾기용
  const baselineIndex = useMemo(() => {
    const m = new Map<string, number>();
    baseline?.network.rides.forEach((r, i) => m.set(`${r.lineId}|${r.aName}|${r.bName}`, i));
    return m;
  }, [baseline]);

  const render = () => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const st = useStore.getState();
    const layers = [...staticRef.current];
    if (st.ui.layers.trains && st.sim.scenario && runsRef.current.length) {
      const slot = st.sim.scenario.slots[st.ui.slot];
      const data: TrainPos[] = trainPositions(runsRef.current, simTimeRef.current, st.ui.hiddenLines);
      layers.push(
        new ScatterplotLayer<TrainPos>({
          id: 'trains',
          data,
          getPosition: (d) => d.position,
          getRadius: (d) => 55 + Math.min(1.5, slot.rideRatio[d.ride]) * 25,
          radiusMinPixels: 2.4,
          radiusMaxPixels: 8,
          stroked: true,
          getFillColor: (d) => hexToRgba(d.color, 255),
          getLineColor: [255, 255, 255, 230],
          lineWidthMinPixels: 1,
          updateTriggers: { getRadius: [st.ui.slot, st.sim.scenario] },
        }),
      );
    }
    overlay.setProps({ layers });
  };

  // 지도 생성
  useEffect(() => {
    if (!containerRef.current) return;
    const st = useStore.getState();
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: basemapStyle(st.ui.basemap, st.ui.vworldKey),
      center: INITIAL.center,
      zoom: INITIAL.zoom,
      pitch: st.ui.is3d ? INITIAL.pitch : 0,
      bearing: st.ui.is3d ? INITIAL.bearing : 0,
      maxPitch: 75,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    const overlay = new MapboxOverlay({
      interleaved: false,
      layers: [],
      getTooltip: (info: PickingInfo) => tooltip(info),
    });
    overlayRef.current = overlay;
    map.addControl(overlay as unknown as maplibregl.IControl);

    let styleOk = false;
    const fallback = () => {
      const s = useStore.getState();
      if (!styleOk && s.ui.basemap !== 'offline') {
        s.setUi({ basemap: 'offline' });
        s.showToast('배경지도를 불러오지 못해 오프라인 지도로 전환했습니다');
      }
    };
    const timer = window.setTimeout(fallback, 9000);
    map.on('style.load', () => {
      styleOk = true;
      window.clearTimeout(timer);
    });
    map.on('error', (e) => {
      const msg = String((e as { error?: Error }).error?.message ?? '');
      if (!styleOk && /style|Failed to fetch|NetworkError|load/i.test(msg)) fallback();
    });
    map.on('load', () => setMapReady(true));
    map.on('zoomend', () => setZoom(map.getZoom()));
    map.on('click', (e) => onMapClick(e.lngLat.lng, e.lngLat.lat, e.point.x, e.point.y));
    map.on('mousemove', () => {
      const s = useStore.getState();
      map.getCanvas().style.cursor = s.ui.edit.kind !== 'none' ? 'crosshair' : '';
    });

    return () => {
      window.clearTimeout(timer);
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
  }, []);

  // 배경지도 변경
  const firstStyle = useRef(true);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (firstStyle.current) {
      firstStyle.current = false;
      return;
    }
    map.setStyle(basemapStyle(ui.basemap, ui.vworldKey));
  }, [ui.basemap, ui.vworldKey]);

  // 좌우 패널만큼 지도 중심 보정
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const mobile = window.innerWidth <= 900;
    map.easeTo({ padding: { left: mobile ? 0 : padLeft, right: mobile ? 0 : padRight, top: 60, bottom: 80 }, duration: 400 });
  }, [padLeft, padRight]);

  // 2D / 3D
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ pitch: ui.is3d ? INITIAL.pitch : 0, bearing: ui.is3d ? map.getBearing() || INITIAL.bearing : 0, duration: 700 });
  }, [ui.is3d]);

  // 정적 레이어
  useEffect(() => {
    staticRef.current = buildStaticLayers({
      result,
      slot: ui.slot,
      layers: ui.layers,
      hiddenLines: ui.hiddenLines,
      zoom,
      zones,
      zoneIndex,
      editLine,
      selected: ui.selected,
      dark,
      personsPerHousehold: scenario.settings.personsPerHousehold,
    });
    render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, ui.slot, ui.layers, ui.hiddenLines, zoom, zones, zoneIndex, editLine, ui.selected, dark, mapReady, scenario.settings.personsPerHousehold]);

  useEffect(() => {
    runsRef.current = result ? prepareRuns(result.network) : [];
  }, [result]);

  // 열차 애니메이션
  useEffect(() => {
    if (!ui.layers.trains) {
      render();
      return;
    }
    let raf = 0;
    let last = performance.now();
    let lastDraw = 0;
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      simTimeRef.current += dt * SIM_MIN_PER_SEC;
      if (now - lastDraw > 33) {
        lastDraw = now;
        render();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.layers.trains]);

  function onMapClick(lon: number, lat: number, x: number, y: number) {
    const st = useStore.getState();
    const edit = st.ui.edit;
    if (edit.kind === 'line') {
      const line = st.scenario.customLines.find((l) => l.id === edit.lineId);
      if (!line) return;
      const extra: ExistingStation[] = [];
      for (const p of PLANS) {
        if (!st.scenario.activePlans[p.id]) continue;
        for (const s of planStops(p, st.scenario.planOptions)) extra.push({ name: s.name, norm: s.name, lon: s.lon, lat: s.lat, lines: [p.id] });
      }
      for (const c of st.scenario.customLines) {
        if (c.id === line.id) continue;
        for (const s of c.stops) extra.push({ name: s.name, norm: s.name, lon: s.lon, lat: s.lat, lines: [c.id] });
      }
      const snap = nearestStation(lon, lat, 380, extra);
      if (snap) {
        if (line.stops.some((s) => s.name === snap.name)) {
          st.showToast(`${snap.name}역은 이미 이 노선에 있습니다`);
          return;
        }
        st.addStop(line.id, { name: snap.name, lon: snap.lon, lat: snap.lat, ref: EXISTING_STATIONS.includes(snap) ? snap.name : undefined });
      } else {
        st.addStop(line.id, { name: `${line.name} ${line.stops.length + 1}`, lon: +lon.toFixed(5), lat: +lat.toFixed(5) });
      }
      return;
    }
    if (edit.kind === 'zone') {
      const id = `user-${Date.now().toString(36)}`;
      st.addUserZone({ id, name: `새 단지 ${st.scenario.userZones.length + 1}`, lon: +lon.toFixed(5), lat: +lat.toFixed(5), households: 3000, source: 'user', region: guessRegion(lon, lat) });
      st.setUi({ edit: { kind: 'none' }, tab: 'zones' });
      st.showToast('단지를 추가했습니다. 왼쪽 단지 탭에서 세대수를 조정하세요');
      return;
    }
    const overlay = overlayRef.current;
    if (!overlay) return;
    const info = overlay.pickObject({ x, y, radius: 6 });
    if (!info || !info.layer) {
      st.setUi({ selected: null });
      return;
    }
    const id = info.layer.id;
    if (id === 'stations' || id === 'boardings') st.setUi({ selected: { type: 'complex', index: (info.object as Complex).id } });
    else if (id === 'zones') {
      const z = info.object as Zone;
      st.setUi({ selected: { type: 'zone', index: buildZones(st.scenario).findIndex((x) => x.id === z.id) } });
    } else if (id === 'walls' || id === 'line-base') st.setUi({ selected: { type: 'ride', index: (info.object as { i: number }).i } });
  }

  function tooltip(info: PickingInfo): { html: string; style?: Record<string, string> } | null {
    const st = useStore.getState();
    const res = st.sim.scenario;
    if (!info.object || !info.layer || !res) return null;
    const sl = res.slots[st.ui.slot];
    const style = { backgroundColor: 'rgba(14,18,30,0.94)', color: '#e8ecf5', fontSize: '12px', borderRadius: '8px', padding: '8px 10px', border: '1px solid #2c3550' };
    const id = info.layer.id;
    if (id === 'walls' || id === 'line-base') {
      const i = (info.object as { i: number }).i;
      const r = res.network.rides[i];
      const ratio = sl.rideRatio[i];
      const bi = baselineIndexRef.current.get(`${r.lineId}|${r.aName}|${r.bName}`);
      const base = bi !== undefined && st.sim.baseline ? st.sim.baseline.slots[st.ui.slot].rideRatio[bi] : undefined;
      const delta = base !== undefined && r.kind === 'existing' ? ` <span style="color:#9aa6c4">(현재 ${pct(base)})</span>` : '';
      return {
        html: `<b>${r.lineName}</b> ${r.aName} → ${r.bName}<br/>혼잡도 <b>${pct(ratio)}</b> · ${congestionLabel(ratio)}${delta}<br/>시간당 ${fmt(sl.rideLoad[i])}명 / 정원 ${fmt(r.capPerHour)}명<br/><span style="color:#9aa6c4">${sl.label} 출발 기준 · 열차 ${r.tph.toFixed(0)}회/시</span>`,
        style,
      };
    }
    if (id === 'stations' || id === 'boardings') {
      const c = info.object as Complex;
      const lines = c.lineIds.map((lid) => res.network.lines.find((l) => l.id === lid)?.name ?? lid).join(', ');
      return {
        html: `<b>${c.name}</b>${c.tentative ? ' <span style="color:#f5c26b">(가칭·개략 위치)</span>' : ''}<br/>${lines}<br/>승차(환승 포함) 시간당 ${fmt(sl.boardings[c.id])}명`,
        style,
      };
    }
    if (id === 'zones') {
      const z = info.object as Zone;
      const zi = zoneIndexRef.current.get(z.id);
      const share = zi !== undefined ? sl.zoneRailShare[zi] : undefined;
      const mins = zi !== undefined ? sl.zoneRailMin[zi] : undefined;
      const access = zi !== undefined && sl.zoneAccess[zi] >= 0 ? res.network.complexes[sl.zoneAccess[zi]]?.name : undefined;
      const pop = z.households * st.scenario.settings.personsPerHousehold;
      return {
        html: `<b>${z.name}</b><br/>${fmt(z.households)}세대 · 약 ${fmt(pop)}명${share !== undefined ? `<br/>장거리 출근 중 철도 이용 ${pct(share)}` : ''}${mins ? ` · 평균 ${Math.round(mins)}분(체감)` : ''}${access ? `<br/>주 이용역: ${access}` : ''}`,
        style,
      };
    }
    return null;
  }

  const baselineIndexRef = useRef(baselineIndex);
  baselineIndexRef.current = baselineIndex;
  const zoneIndexRef = useRef(zoneIndex);
  zoneIndexRef.current = zoneIndex;

  return <div ref={containerRef} className="map" />;
}

function guessRegion(lon: number, lat: number): string | undefined {
  if (lon < 126.79 && lat > 37.6 && !(lon > 126.66 && lon < 126.72 && lat < 37.615)) return '김포';
  if (lon > 126.62 && lon < 126.72 && lat > 37.585 && lat < 37.625) return '검단';
  return undefined;
}
