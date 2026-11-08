import { DEFAULT_SETTINGS } from '../types';
import { DEFAULT_SCENARIO, useStore, type ScenarioState } from './store';

const KEY = 'gimpo-metro-sim:v1';
const UI_KEY = 'gimpo-metro-sim:ui:v1';

function sanitize(raw: unknown): ScenarioState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<ScenarioState>;
  return {
    ...DEFAULT_SCENARIO,
    activePlans: r.activePlans ?? {},
    planOptions: r.planOptions ?? {},
    lineOverrides: r.lineOverrides ?? {},
    customLines: Array.isArray(r.customLines) ? r.customLines : [],
    householdOverrides: r.householdOverrides ?? {},
    activeScenarios: r.activeScenarios ?? {},
    userZones: Array.isArray(r.userZones) ? r.userZones : [],
    settings: { ...DEFAULT_SETTINGS, ...(r.settings ?? {}) },
  };
}

// URL 해시 공유: #s=<base64url(JSON)>
function encode(obj: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decode(s: string): unknown {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function shareUrl(): string {
  const { scenario } = useStore.getState();
  const url = new URL(window.location.href);
  url.hash = 's=' + encode(scenario);
  return url.toString();
}

export function exportJson(): string {
  return JSON.stringify({ app: 'gimpo-metro-sim', version: 1, scenario: useStore.getState().scenario }, null, 2);
}

export function importJson(text: string): boolean {
  try {
    const obj = JSON.parse(text);
    const sc = sanitize(obj.scenario ?? obj);
    if (!sc) return false;
    useStore.getState().setScenario(sc);
    return true;
  } catch {
    return false;
  }
}

export function initPersistence() {
  // 1) 공유 링크 우선
  let loaded = false;
  const m = window.location.hash.match(/s=([A-Za-z0-9_-]+)/);
  if (m) {
    try {
      const sc = sanitize(decode(m[1]));
      if (sc) {
        useStore.getState().setScenario(sc);
        loaded = true;
        useStore.getState().showToast('공유된 시나리오를 불러왔습니다');
      }
    } catch {
      /* 잘못된 링크는 무시 */
    }
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  // 2) 브라우저 저장본
  if (!loaded) {
    try {
      const raw = localStorage.getItem(KEY);
      const sc = raw ? sanitize(JSON.parse(raw)) : null;
      if (sc) useStore.getState().setScenario(sc);
    } catch {
      /* 저장소 사용 불가 */
    }
  }
  try {
    const raw = localStorage.getItem(UI_KEY);
    if (raw) {
      const u = JSON.parse(raw);
      useStore.getState().setUi({
        basemap: u.basemap ?? 'carto-dark',
        vworldKey: u.vworldKey ?? '',
        layers: { ...useStore.getState().ui.layers, ...(u.layers ?? {}) },
        is3d: u.is3d ?? true,
      });
    }
  } catch {
    /* 무시 */
  }

  let t: number | undefined;
  useStore.subscribe((s, prev) => {
    if (s.scenario === prev.scenario && s.ui.basemap === prev.ui.basemap && s.ui.vworldKey === prev.ui.vworldKey && s.ui.layers === prev.ui.layers && s.ui.is3d === prev.ui.is3d) return;
    window.clearTimeout(t);
    t = window.setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(s.scenario));
        localStorage.setItem(UI_KEY, JSON.stringify({ basemap: s.ui.basemap, vworldKey: s.ui.vworldKey, layers: s.ui.layers, is3d: s.ui.is3d }));
      } catch {
        /* 무시 */
      }
    }, 400);
  });
}
