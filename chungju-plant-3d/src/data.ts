// 장면 데이터 형식과 불러오기, 시설 정보 덮어쓰기(이름·용도·높이) 저장

export type Pt = [number, number]; // [동쪽 m, 북쪽 m] — 원점 기준

export interface Building {
  id: string;
  name: string | null;
  label?: string;
  kind: 'industrial' | 'apartment' | 'small';
  site: boolean;
  h: number;
  hEst: boolean;
  area: number;
  src: 'osm' | 'ml' | 'vworld';
  ring: Pt[];
  holes: Pt[][];
  /** 건축물대장(GIS건물통합정보)에서 온 값 */
  use?: string;
  floors?: number;
  approved?: string; // 사용승인일 YYYYMMDD
  reg?: string;      // 연결된 대장 건물 id
  unreg?: boolean;   // 대장에 없는 자동 추출 윤곽
}

export interface Road { name: string | null; kind: string; w: number; tunnel: boolean; pts: Pt[] }
export interface Area { kind: string; name: string | null; ring: Pt[] }

export interface SceneData {
  name: string;
  address: string;
  origin: { lat: number; lon: number };
  halfExtentM: number;
  mPerDegLon: number;
  mPerDegLat: number;
  siteRing: Pt[];
  siteEstimated: boolean;
  attribution: string;
  terrain: { size: number; cellM: number; minX: number; minY: number; heights: number[] };
  buildings: Building[];
  roads: Road[];
  areas: Area[];
  pois: { name: string; p: Pt }[];
}

/** 사용자가 고친 시설 정보. 건물 id 별로 저장 */
export interface Override {
  name?: string; use?: string; h?: number; site?: boolean; memo?: string;
  deleted?: boolean;  // 지운 건물 (복원 가능)
  company?: string;   // 소속 회사 (한 부지에 여러 회사가 있을 때)
  dx?: number; dn?: number; // 윤곽 이동(m, 동·북)
  rot?: number;       // 윤곽 회전(도, 시계 방향)
  scale?: number;     // 윤곽 크기 배율
}
export type Overrides = Record<string, Override>;

/** 실사 모델(glTF) 얹기 설정 — public/data/overlays.json */
export interface Overlay {
  url: string;
  lat: number;
  lon: number;
  headingDeg?: number;
  scale?: number;
  altOffsetM?: number;
  hideBuildingIds?: string[];
}

export const USES = ['미지정', '제조동', '품질관리(QC)', '연구동', '사무동', '창고', '유틸리티', '폐수처리', '위험물 저장', '경비·출입', '복지·식당', '기타'];

/** 사업장 목록 — public/data/sites.json (build_data.py 가 만든다) */
export interface SiteInfo { id: string; name: string; short: string; companies: string[] }

/** 회사 약칭 */
export const COMPANY_ABBR: Record<string, string> = { 코오롱생명과학: 'KLS', 코오롱바이오텍: 'KBT' };

const LS_PREFIX = 'plant3d.overrides.v1';

export async function loadJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const r = await fetch(url);
    if (!r.ok) return fallback;
    return (await r.json()) as T;
  } catch {
    return fallback;
  }
}

export class FacilityStore {
  /** 저장소에 들어 있는 기본값(public/data/facilities.json) 위에 브라우저 저장분을 덮는다 */
  private base: Overrides = {};
  private local: Overrides = {};

  private readonly lsKey: string;

  constructor(base: Overrides, siteId: string) {
    this.base = base;
    // 충주는 사업장을 나누기 전 키를 그대로 쓴다 (이미 고친 내용 유지)
    this.lsKey = siteId === 'chungju' ? LS_PREFIX : `${LS_PREFIX}.${siteId}`;
    try {
      this.local = JSON.parse(localStorage.getItem(this.lsKey) || '{}');
    } catch {
      this.local = {};
    }
  }
  get(id: string): Override {
    return { ...this.base[id], ...this.local[id] };
  }
  set(id: string, patch: Override) {
    this.local[id] = { ...this.local[id], ...patch };
    this.persist();
  }
  all(): Overrides {
    const out: Overrides = {};
    for (const id of new Set([...Object.keys(this.base), ...Object.keys(this.local)])) out[id] = this.get(id);
    return out;
  }
  /** 브라우저에서 고친 내용을 지우고 저장소 기본값으로 되돌린다 */
  reset(id: string) {
    delete this.local[id];
    this.persist();
  }
  replaceAll(o: Overrides) {
    this.local = o;
    this.persist();
  }
  private persist() {
    try {
      localStorage.setItem(this.lsKey, JSON.stringify(this.local));
    } catch {
      /* 사생활 보호 모드 등: 저장 없이 계속 */
    }
  }
}

export function displayName(b: Building, o: Override): string {
  return o.name || b.name || b.label || '건물';
}

/** 이동·회전·크기 조정을 반영한 윤곽 (중심 기준) */
export function transformRings(b: Building, o: Override): { ring: Pt[]; holes: Pt[][] } {
  const dx = o.dx ?? 0, dn = o.dn ?? 0, rot = o.rot ?? 0, s = o.scale ?? 1;
  if (!dx && !dn && !rot && s === 1) return { ring: b.ring, holes: b.holes };
  const [cx, cn] = centroid(b.ring);
  const a = (-rot * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
  const f = ([x, n]: Pt): Pt => {
    const px = (x - cx) * s, pn = (n - cn) * s;
    return [cx + dx + px * c - pn * sn, cn + dn + px * sn + pn * c];
  };
  return { ring: b.ring.map(f), holes: b.holes.map((h) => h.map(f)) };
}

export function pointInRing(x: number, y: number, ring: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function centroid(ring: Pt[]): Pt {
  let x = 0, y = 0;
  for (const p of ring) { x += p[0]; y += p[1]; }
  return [x / ring.length, y / ring.length];
}
