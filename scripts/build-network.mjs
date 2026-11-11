// 기존 노선 데이터 생성 스크립트
//   입력: data/raw/subway_stations_20260630.csv  (역명·좌표, 공공데이터 기반)
//         data/raw/municipalities.json          (시군구 경계, southkorea-maps / 통계청 2013)
//   출력: src/data/generated/existing-lines.json
//         src/data/generated/boundaries.json
//         src/data/generated/district-zones.json
// 실행: npm run build:network

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LINES, COORD_OVERRIDES } from './lines.config.mjs';
import { DISTRICT_HOUSEHOLDS, NON_APT_HOUSEHOLDS, BOUNDARY_EXCLUDE } from './districts.config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'src/data/generated');
fs.mkdirSync(outDir, { recursive: true });

const BBOX = [126.40, 37.36, 127.25, 37.76];
const inBbox = (x, y) => x >= BBOX[0] && x <= BBOX[2] && y >= BBOX[1] && y <= BBOX[3];

// ---------- CSV ----------
function splitCsvLine(line) {
  const cells = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { cells.push(cur); cur = ''; }
    else cur += ch;
  }
  cells.push(cur);
  return cells;
}
function parseCsv(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(Boolean);
  const header = splitCsvLine(lines[0]);
  return lines.slice(1).map((l) => {
    const cells = splitCsvLine(l);
    return Object.fromEntries(header.map((h, i) => [h, cells[i]]));
  });
}

export function normName(name) {
  let n = name.replace(/\(.*?\)/g, '').trim();
  if (n.length > 2 && n.endsWith('역')) n = n.slice(0, -1);
  return n;
}

const rows = parseCsv(fs.readFileSync(path.join(root, 'data/raw/subway_stations_20260630.csv'), 'utf8'))
  .map((r) => ({ ...r, lon: +r.longitude, lat: +r.latitude, norm: normName(r.station_name) }))
  .filter((r) => inBbox(r.lon, r.lat));

const round = (v, d = 5) => Math.round(v * 10 ** d) / 10 ** d;
const distM = (a, b) => {
  const kx = 111320 * Math.cos(((a[1] + b[1]) / 2) * Math.PI / 180);
  return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 110540);
};

const problems = [];
function lookup(line, name) {
  const key = `${line.id}:${name}`;
  if (COORD_OVERRIDES[key]) return COORD_OVERRIDES[key];
  const n = normName(name);
  for (const ln of line.prefer) {
    const hit = rows.filter((r) => r.line_number === ln && r.norm === n);
    if (hit.length) return [round(hit[0].lon), round(hit[0].lat)];
  }
  const any = rows.filter((r) => r.norm === n);
  if (any.length) return [round(any[0].lon), round(any[0].lat)];
  problems.push(`좌표 없음: ${line.name} ${name}`);
  return null;
}

const existing = LINES.map((line) => {
  const sequences = line.sequences.map((seq, si) => {
    const stops = seq.map((name) => {
      const c = lookup(line, name);
      return c ? { name, lon: c[0], lat: c[1] } : null;
    }).filter(Boolean);
    for (let i = 1; i < stops.length; i++) {
      const d = distM([stops[i - 1].lon, stops[i - 1].lat], [stops[i].lon, stops[i].lat]);
      if (d < 150) problems.push(`역간 거리 의심(${Math.round(d)}m): ${line.name} ${stops[i - 1].name}-${stops[i].name}`);
      if (d > 9000) problems.push(`역간 거리 큼(${Math.round(d)}m): ${line.name} ${stops[i - 1].name}-${stops[i].name}`);
    }
    const tph = line.branchTph ? line.branchTph[si] : line.params.tph;
    const service = line.branchService?.[si] ?? undefined;
    return { tph, ...(service ? { service } : {}), bgPax: Math.round((line.params.bg ?? 0) * tph * line.params.cap), stops };
  });
  return {
    id: line.id,
    name: line.name,
    color: line.color,
    kind: 'existing',
    params: { tph: line.params.tph, cap: line.params.cap, speed: line.params.speed },
    bg: line.params.bg ?? 0,
    note: line.note,
    sequences,
  };
});

fs.writeFileSync(path.join(outDir, 'existing-lines.json'), JSON.stringify(existing));

// ---------- 경계 ----------
const muni = JSON.parse(fs.readFileSync(path.join(root, 'data/raw/municipalities.json'), 'utf8'));
function ringsOf(geom) {
  if (geom.type === 'Polygon') return [geom.coordinates];
  if (geom.type === 'MultiPolygon') return geom.coordinates;
  return [];
}
function featBbox(f) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const poly of ringsOf(f.geometry)) for (const ring of poly) for (const [x, y] of ring) {
    b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y);
  }
  return b;
}
const intersects = (b) => !(b[2] < BBOX[0] || b[0] > BBOX[2] || b[3] < BBOX[1] || b[1] > BBOX[3]);
const feats = muni.features.filter((f) => {
  const code = f.properties.code;
  return (code.startsWith('11') || code.startsWith('23') || code.startsWith('31')) && !BOUNDARY_EXCLUDE.includes(code) && intersects(featBbox(f));
});
const roundGeom = (g) => ({
  type: g.type,
  coordinates: g.type === 'Polygon'
    ? g.coordinates.map((r) => r.map(([x, y]) => [round(x, 4), round(y, 4)]))
    : g.coordinates.map((p) => p.map((r) => r.map(([x, y]) => [round(x, 4), round(y, 4)]))),
});
const boundaries = {
  type: 'FeatureCollection',
  features: feats.map((f) => ({ type: 'Feature', properties: { code: f.properties.code, name: f.properties.name }, geometry: roundGeom(f.geometry) })),
};
fs.writeFileSync(path.join(outDir, 'boundaries.json'), JSON.stringify(boundaries));

// ---------- 구별 배경 수요 → 역별 가상 단지 ----------
function pointInRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function pointInFeature(pt, f) {
  return ringsOf(f.geometry).some((poly) => pointInRing(pt, poly[0]) && !poly.slice(1).some((h) => pointInRing(pt, h)));
}
function centroid(f) {
  let sx = 0, sy = 0, n = 0;
  for (const poly of ringsOf(f.geometry)) for (const [x, y] of poly[0]) { sx += x; sy += y; n++; }
  return [sx / n, sy / n];
}

// 역 위치 (환승역 중복 제거: 이름 같고 600m 이내면 하나로)
// 경전철만 서는 역은 배후 수요 가중치를 절반으로 (대량 수송 노선 역에 더 많이 배분)
const LIGHT_LINES = ['G', 'I2', 'SL', 'UI'];
const uniqueStations = [];
for (const line of existing) for (const seq of line.sequences) for (const s of seq.stops) {
  const n = normName(s.name);
  const w = LIGHT_LINES.includes(line.id) ? 0.35 : 1;
  const hit = uniqueStations.find((u) => u.norm === n && distM([u.lon, u.lat], [s.lon, s.lat]) < 600);
  if (hit) hit.weight = Math.max(hit.weight, w);
  else uniqueStations.push({ norm: n, lon: s.lon, lat: s.lat, weight: w });
}

const zones = [];
const districtEntries = [
  ...Object.entries(DISTRICT_HOUSEHOLDS).map(([code, [label, hh]]) => [code, label, hh, '배경']),
  ...Object.entries(NON_APT_HOUSEHOLDS).map(([code, [label, hh]]) => [code, label, hh, '아파트 외 배경']),
];
for (const [code, label, households, tag] of districtEntries) {
  const f = feats.find((x) => x.properties.code === code);
  if (!f) { problems.push(`경계 없음: ${code} ${label}`); continue; }
  const inside = uniqueStations.filter((s) => pointInFeature([s.lon, s.lat], f));
  if (!inside.length) {
    const c = centroid(f);
    zones.push({ id: `d${code}`, name: `${label} (${tag})`, lon: round(c[0]), lat: round(c[1]), households, district: code, source: 'district' });
    continue;
  }
  const wsum = inside.reduce((a, s) => a + s.weight, 0);
  inside.forEach((s, i) => zones.push({ id: `d${code}-${i}`, name: `${label} · ${s.norm}역 주변 (${tag})`, lon: s.lon, lat: s.lat, households: Math.round((households * s.weight) / wsum), district: code, source: 'district', ...(code === '31230' ? { region: '김포' } : {}) }));
}
fs.writeFileSync(path.join(outDir, 'district-zones.json'), JSON.stringify(zones));

const stopCount = existing.reduce((a, l) => a + l.sequences.reduce((b, s) => b + s.stops.length, 0), 0);
console.log(`노선 ${existing.length}개, 정차 ${stopCount}개, 고유 역 ${uniqueStations.length}개`);
console.log(`경계 ${boundaries.features.length}개, 배경 구역 ${zones.length}개`);
if (problems.length) {
  console.log('\n확인 필요:');
  for (const p of problems) console.log(' - ' + p);
}
