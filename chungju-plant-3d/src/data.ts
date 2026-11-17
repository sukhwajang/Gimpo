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
export interface Override { name?: string; use?: string; h?: number; site?: boolean; memo?: string }
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

const LS_KEY = 'plant3d.overrides.v1';

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

  constructor(base: Overrides) {
    this.base = base;
    try {
      this.local = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
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
  replaceAll(o: Overrides) {
    this.local = o;
    this.persist();
  }
  private persist() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(this.local));
    } catch {
      /* 사생활 보호 모드 등: 저장 없이 계속 */
    }
  }
}

export function displayName(b: Building, o: Override): string {
  return o.name || b.name || b.label || '건물';
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
