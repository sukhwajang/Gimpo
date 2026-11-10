import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { ScatterplotLayer } from '@deck.gl/layers';
import type { PickingInfo } from '@deck.gl/core';
import { useStore } from '../state/store';
import { buildZones } from '../sim/scenario';
import { EXISTING_STATIONS, nearestStation, planStops, type ExistingStation } from '../sim/resolve';
import { PLANS } from '../data/plans';
import { BASEMAPS, basemapStyle } from './basemaps';
import { LABEL_FONT, LABEL_FONT_FALLBACK, WALL_M_PER_100, buildStaticLayers, heightScale, peakRatio, peakRide, type SegDatum, type StaticLayers } from './layers';
import { prepareRuns, trainPositions, type TrainPos } from './trains';
import { congestionClass } from './colors';
import type { Complex } from '../sim/network';
import type { Zone } from '../types';

const INITIAL = { center: [126.755, 37.592] as [number, number], zoom: 10.6, pitch: 50, bearing: -12 };
const SIM_MIN_PER_SEC = 1.2;

const pct = (r: number) => `${Math.round(r * 100)}%`;
const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');
const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string);

const TIP_STYLE: Record<string, string> = {
  backgroundColor: 'rgba(13, 17, 28, 0.96)',
  color: '#eef1f7',
  fontSize: '12.5px',
  lineHeight: '1.55',
  borderRadius: '10px',
  padding: '10px 12px',
  border: '1px solid rgba(148, 163, 184, 0.22)',
  boxShadow: '0 10px 30px rgba(0, 0, 0, 0.45)',
  maxWidth: '300px',
  fontFamily: 'inherit',
};

const pill = (ratio: number) => {
  const c = congestionClass(ratio);
  return `<span class="tip-pill"><i style="background:${c.color}"></i>${c.label}</span>`;
};

export function MapView({ padRight = 0 }: { padRight?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const staticRef = useRef<StaticLayers>({ below: [], above: [] });
  const runsRef = useRef<ReturnType<typeof prepareRuns>>([]);
  const simTimeRef = useRef(0);
  const [zoom, setZoom] = useState(INITIAL.zoom);
  const zoomRef = useRef(INITIAL.zoom);
  zoomRef.current = zoom;
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [fontFamily, setFontFamily] = useState(LABEL_FONT_FALLBACK);
  // 지도를 옮기거나 돌리면 역 이름 배치를 다시 계산
  const [viewVersion, setViewVersion] = useState(0);

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
    const { below, above } = staticRef.current;
    const layers = [...below];
    const res = st.sim.scenario;
    if (st.ui.layers.trains && res && runsRef.current.length) {
      const sl = res.slots[st.ui.slot];
      const walls = st.ui.layers.walls;
      // 열차는 혼잡도 벽 위를 달린다
      const hs = heightScale(zoomRef.current);
      const heightOf = (ride: number) => (walls ? peakRatio(sl, ride >> 1) * WALL_M_PER_100 * hs + 70 * hs : 30 * hs);
      const data: TrainPos[] = trainPositions(runsRef.current, simTimeRef.current, st.ui.hiddenLines, heightOf);
      layers.push(
        new ScatterplotLayer<TrainPos>({
          id: 'trains',
          data,
          getPosition: (d) => d.position,
          radiusUnits: 'pixels',
          getRadius: 2,
          stroked: true,
          getFillColor: [255, 255, 255, 255],
          getLineColor: [9, 12, 20, 200],
          lineWidthUnits: 'pixels',
          getLineWidth: 1,
        }),
      );
    }
    layers.push(...above);
    overlay.setProps({ layers });
  };

  // 지도 생성
  useEffect(() => {
    if (!containerRef.current) return;
    const st = useStore.getState();
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: basemapStyle(st.ui.basemap, st.ui.vworldKey),
        center: INITIAL.center,
        zoom: INITIAL.zoom,
        pitch: st.ui.is3d ? INITIAL.pitch : 0,
        bearing: st.ui.is3d ? INITIAL.bearing : 0,
        maxPitch: 75,
        attributionControl: { compact: true },
      });
    } catch (e) {
      // WebGL을 쓸 수 없는 브라우저(하드웨어 가속 꺼짐 등) — 패널은 계속 동작
      console.error(e);
      setMapError(String((e as Error)?.message ?? e));
      return;
    }
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-left');

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
    let tileWarned = '';
    map.on('error', (e) => {
      const msg = String((e as { error?: Error }).error?.message ?? '');
      if (!styleOk && /style|Failed to fetch|NetworkError|load/i.test(msg)) fallback();
      // 브이월드 타일 실패는 한 번만 알림
      const s = useStore.getState();
      if ((e as { sourceId?: string }).sourceId === 'base' && s.ui.basemap.startsWith('vworld') && tileWarned !== s.ui.basemap) {
        tileWarned = s.ui.basemap;
        s.showToast("브이월드 지도를 불러오지 못했습니다. 설정 탭의 '키 확인'으로 원인을 확인하세요");
      }
    });
    map.on('load', () => setMapReady(true));
    let lastQ = Math.round(INITIAL.zoom * 4);
    map.on('zoom', () => {
      const q = Math.round(map.getZoom() * 4);
      if (q !== lastQ) {
        lastQ = q;
        setZoom(q / 4);
      }
    });
    map.on('moveend', () => setViewVersion((v) => v + 1));
    map.on('resize', () => setViewVersion((v) => v + 1));
    map.on('click', (e) => onMapClick(e.lngLat.lng, e.lngLat.lat, e.point.x, e.point.y));
    map.on('mousemove', () => {
      const s = useStore.getState();
      map.getCanvas().style.cursor = s.ui.edit.kind !== 'none' ? 'crosshair' : '';
    });

    // 웹폰트가 준비되면 역 이름 글꼴 교체
    let alive = true;
    document.fonts
      ?.load('600 13px "Pretendard Variable"', '김포공항')
      .then((faces) => {
        if (alive && faces.length) setFontFamily(LABEL_FONT);
      })
      .catch(() => undefined);

    return () => {
      alive = false;
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

  // 결과 패널만큼 지도 중심 보정
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const mobile = window.innerWidth <= 900;
    map.easeTo({ padding: { left: 0, right: mobile ? 0 : padRight, top: 40, bottom: mobile ? 90 : 120 }, duration: 400 });
  }, [padRight]);

  // 2D / 3D
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ pitch: ui.is3d ? INITIAL.pitch : 0, bearing: ui.is3d ? map.getBearing() || INITIAL.bearing : 0, duration: 700 });
  }, [ui.is3d]);

  // 정적 레이어
  useEffect(() => {
    const map = mapRef.current;
    staticRef.current = buildStaticLayers({
      result,
      slot: ui.slot,
      layers: ui.layers,
      hiddenLines: ui.hiddenLines,
      zoom,
      zones,
      editLine,
      selected: ui.selected,
      dark,
      personsPerHousehold: scenario.settings.personsPerHousehold,
      fontFamily,
      project: map
        ? (lon, lat) => {
            const p = map.project([lon, lat]);
            return [p.x, p.y];
          }
        : null,
      viewSize: map ? [map.getContainer().clientWidth, map.getContainer().clientHeight] : [0, 0],
    });
    render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, ui.slot, ui.layers, ui.hiddenLines, zoom, zones, editLine, ui.selected, dark, mapReady, scenario.settings.personsPerHousehold, fontFamily, viewVersion]);

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
      const dt = Math.min(0.25, (now - last) / 1000);
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
        const letter = String.fromCharCode(65 + (Math.max(0, st.scenario.customLines.findIndex((l) => l.id === line.id)) % 26));
        let n = line.stops.length + 1;
        while (line.stops.some((s) => s.name === `${letter}${n}`)) n++;
        st.addStop(line.id, { name: `${letter}${n}`, lon: +lon.toFixed(5), lat: +lat.toFixed(5) });
      }
      return;
    }
    if (edit.kind === 'zone') {
      const id = `user-${Date.now().toString(36)}`;
      st.addUserZone({ id, name: `새 단지 ${st.scenario.userZones.length + 1}`, lon: +lon.toFixed(5), lat: +lat.toFixed(5), households: 3000, source: 'user', region: guessRegion(lon, lat) });
      st.setUi({ edit: { kind: 'none' }, tab: 'zones' });
      st.showToast('단지를 추가했습니다. 단지·인구 탭에서 세대수를 조정하세요');
      return;
    }
    const overlay = overlayRef.current;
    const res = st.sim.scenario;
    if (!overlay || !res) return;
    const info = overlay.pickObject({ x, y, radius: 6 });
    if (!info || !info.layer) {
      st.setUi({ selected: null });
      return;
    }
    const id = info.layer.id;
    if (id === 'stations' || id === 'boardings') st.setUi({ selected: { type: 'complex', index: (info.object as Complex).id } });
    else if (id === 'zones') {
      const z = info.object as Zone;
      st.setUi({ selected: { type: 'zone', index: buildZones(st.scenario).findIndex((v) => v.id === z.id) } });
    } else if (id === 'walls' || id === 'line-base' || id === 'line-plan') {
      st.setUi({ selected: { type: 'ride', index: peakRide(res.slots[st.ui.slot], (info.object as SegDatum).p) } });
    }
  }

  function tooltip(info: PickingInfo): { html: string; className: string; style: Record<string, string> } | null {
    const st = useStore.getState();
    const res = st.sim.scenario;
    if (!info.object || !info.layer || !res || st.ui.edit.kind !== 'none') return null;
    const sl = res.slots[st.ui.slot];
    const id = info.layer.id;
    const wrap = (html: string) => ({ html, className: 'map-tip', style: TIP_STYLE });

    if (id === 'walls' || id === 'line-base' || id === 'line-plan') {
      const p = (info.object as SegDatum).p;
      const i = peakRide(sl, p);
      const j = i ^ 1;
      const r = res.network.rides[i];
      const back = res.network.rides[j];
      const ratio = sl.rideRatio[i];
      const bi = baselineIndexRef.current.get(`${r.lineId}|${r.aName}|${r.bName}`);
      const base = bi !== undefined && st.sim.baseline ? st.sim.baseline.slots[st.ui.slot].rideRatio[bi] : undefined;
      const baseTxt = base !== undefined && r.kind === 'existing' && Math.abs(base - ratio) >= 0.005 ? `<div class="tip-sub">현재(2026) ${pct(base)} → 시나리오 ${pct(ratio)}</div>` : '';
      return wrap(
        `<div class="tip-title"><i style="background:${esc(r.color)}"></i>${esc(r.lineName)}</div>` +
          `<div class="tip-row"><span>${esc(r.aName)} → ${esc(r.bName)}</span><b>${pct(ratio)}</b>${pill(ratio)}</div>` +
          (back ? `<div class="tip-row dim"><span>${esc(back.aName)} → ${esc(back.bName)}</span><b>${pct(sl.rideRatio[j])}</b></div>` : '') +
          `<div class="tip-sub">${sl.label} 출발 · 시간당 ${fmt(sl.rideLoad[i])}명 / 정원 ${fmt(r.capPerHour)}명</div>` +
          baseTxt,
      );
    }
    if (id === 'stations' || id === 'boardings') {
      const c = info.object as Complex;
      const lines = c.lineIds
        .map((lid) => res.network.lines.find((l) => l.id === lid))
        .filter((l): l is NonNullable<typeof l> => !!l)
        .map((l) => `<span class="tip-line"><i style="background:${esc(l.color)}"></i>${esc(l.name)}</span>`)
        .join('');
      return wrap(
        `<div class="tip-title">${esc(c.name)}역${c.tentative ? '<em>가칭 · 개략 위치</em>' : ''}</div>` +
          `<div class="tip-lines">${lines}</div>` +
          `<div class="tip-sub">${sl.label} 출발 · 승차(환승 포함) 시간당 ${fmt(sl.boardings[c.id])}명</div>`,
      );
    }
    if (id === 'zones') {
      const z = info.object as Zone;
      const zi = zoneIndexRef.current.get(z.id);
      const share = zi !== undefined ? sl.zoneRailShare[zi] : undefined;
      const mins = zi !== undefined ? sl.zoneRailMin[zi] : undefined;
      const access = zi !== undefined && sl.zoneAccess[zi] >= 0 ? res.network.complexes[sl.zoneAccess[zi]]?.name : undefined;
      const pop = z.households * st.scenario.settings.personsPerHousehold;
      const kind = z.source === 'scenario' ? '<em>개발 예정</em>' : z.source === 'user' ? '<em>직접 추가</em>' : '';
      return wrap(
        `<div class="tip-title">${esc(z.name)}${kind}</div>` +
          `<div class="tip-row"><span>${fmt(z.households)}세대</span><b>약 ${fmt(pop)}명</b></div>` +
          (share !== undefined ? `<div class="tip-sub">장거리 출근 중 철도 이용 ${pct(share)}${mins ? ` · 평균 ${Math.round(mins)}분(체감)` : ''}</div>` : '') +
          (access ? `<div class="tip-sub">주 이용역 ${esc(access)}</div>` : ''),
      );
    }
    return null;
  }

  const baselineIndexRef = useRef(baselineIndex);
  baselineIndexRef.current = baselineIndex;
  const zoneIndexRef = useRef(zoneIndex);
  zoneIndexRef.current = zoneIndex;

  return (
    <>
      <div ref={containerRef} className="map" />
      {mapError && (
        <div className="map-error">
          <b>이 브라우저에서 3D 지도를 켤 수 없습니다.</b>
          <p>
            지도는 WebGL(그래픽 가속)이 필요합니다. 크롬·엣지라면 설정 → 시스템 → <b>그래픽 가속 사용</b>을 켜고 다시 열어 주세요. 카카오톡 같은 앱 안의 브라우저라면 크롬으로 열어 주세요.
            결과 패널의 계산은 그대로 볼 수 있습니다.
          </p>
          <code>{mapError}</code>
        </div>
      )}
    </>
  );
}

function guessRegion(lon: number, lat: number): string | undefined {
  if (lon < 126.79 && lat > 37.6 && !(lon > 126.66 && lon < 126.72 && lat < 37.615)) return '김포';
  if (lon > 126.62 && lon < 126.72 && lat > 37.585 && lat < 37.625) return '검단';
  return undefined;
}
