import { create } from 'zustand';
import { PLANS } from '../data/plans';
import type { SimResult } from '../sim/simulate';
import { DEFAULT_SETTINGS, type CustomLine, type LineParams, type SimSettings, type Stop, type Zone } from '../types';

export type BasemapId = 'carto-dark' | 'carto-light' | 'osm-3d' | 'vworld-base' | 'vworld-midnight' | 'vworld-satellite' | 'offline';
export type PanelTab = 'lines' | 'zones' | 'settings';

export interface LayerToggles {
  walls: boolean;
  trains: boolean;
  stations: boolean;
  zones: boolean;
  labels: boolean;
  boundaries: boolean;
}

/** 저장·공유되는 시나리오 상태 */
export interface ScenarioState {
  activePlans: Record<string, boolean>;
  planOptions: Record<string, boolean>;
  lineOverrides: Record<string, Partial<LineParams>>;
  customLines: CustomLine[];
  householdOverrides: Record<string, number>;
  activeScenarios: Record<string, boolean>;
  userZones: Zone[];
  settings: SimSettings;
}

export type EditMode =
  | { kind: 'none' }
  | { kind: 'line'; lineId: string }
  | { kind: 'zone' };

export interface UiState {
  tab: PanelTab;
  slot: number;
  playing: boolean;
  basemap: BasemapId;
  vworldKey: string;
  is3d: boolean;
  layers: LayerToggles;
  hiddenLines: Record<string, boolean>;
  edit: EditMode;
  selected: { type: 'complex' | 'zone' | 'ride'; index: number } | null;
  toast: string | null;
}

export interface SimState {
  running: boolean;
  scenario: SimResult | null;
  baseline: SimResult | null;
  error: string | null;
}

export const DEFAULT_SCENARIO: ScenarioState = {
  activePlans: {},
  planOptions: {},
  lineOverrides: {},
  customLines: [],
  householdOverrides: {},
  activeScenarios: {},
  userZones: [],
  settings: DEFAULT_SETTINGS,
};

const DEFAULT_UI: UiState = {
  tab: 'lines',
  slot: 3,
  playing: false,
  basemap: 'carto-dark',
  vworldKey: '',
  is3d: true,
  layers: { walls: true, trains: true, stations: false, zones: true, labels: true, boundaries: false },
  hiddenLines: {},
  edit: { kind: 'none' },
  selected: null,
  toast: null,
};

interface Actions {
  setScenario: (patch: Partial<ScenarioState>) => void;
  togglePlan: (id: string) => void;
  togglePlanOption: (id: string) => void;
  setLineOverride: (lineId: string, p: Partial<LineParams> | null) => void;
  toggleDevScenario: (id: string) => void;
  setHouseholds: (zoneId: string, hh: number | null) => void;
  addUserZone: (z: Zone) => void;
  updateUserZone: (id: string, patch: Partial<Zone>) => void;
  removeUserZone: (id: string) => void;
  setSettings: (p: Partial<SimSettings>) => void;
  resetScenario: () => void;
  // custom lines
  addCustomLine: (l: CustomLine) => void;
  updateCustomLine: (id: string, patch: Partial<CustomLine>) => void;
  removeCustomLine: (id: string) => void;
  addStop: (lineId: string, stop: Stop) => void;
  updateStop: (lineId: string, index: number, patch: Partial<Stop>) => void;
  removeStop: (lineId: string, index: number) => void;
  moveStop: (lineId: string, index: number, dir: -1 | 1) => void;
  // ui
  setUi: (patch: Partial<UiState>) => void;
  setLayer: (k: keyof LayerToggles, v: boolean) => void;
  toggleHiddenLine: (id: string) => void;
  showToast: (msg: string) => void;
  setSim: (patch: Partial<SimState>) => void;
}

export type Store = { scenario: ScenarioState; ui: UiState; sim: SimState } & Actions;

const mapLine = (lines: CustomLine[], id: string, fn: (l: CustomLine) => CustomLine) => lines.map((l) => (l.id === id ? fn(l) : l));

export const useStore = create<Store>((set, get) => ({
  scenario: DEFAULT_SCENARIO,
  ui: DEFAULT_UI,
  sim: { running: false, scenario: null, baseline: null, error: null },

  setScenario: (patch) => set((s) => ({ scenario: { ...s.scenario, ...patch } })),
  togglePlan: (id) => {
    const active = { ...get().scenario.activePlans };
    const on = !active[id];
    active[id] = on;
    // 선로를 함께 쓰는 계획은 같이 켜고, 전제 계획을 끄면 같이 끈다
    const linked: string[] = [];
    if (on) {
      for (const r of PLANS.find((p) => p.id === id)?.requires ?? []) {
        if (!active[r]) linked.push(r);
        active[r] = true;
      }
    } else {
      for (const p of PLANS) {
        if (p.requires?.includes(id) && active[p.id]) {
          linked.push(p.id);
          active[p.id] = false;
        }
      }
    }
    set((s) => ({ scenario: { ...s.scenario, activePlans: active } }));
    if (linked.length) {
      const names = linked.map((x) => PLANS.find((p) => p.id === x)?.shortName ?? x).join(', ');
      get().showToast(on ? `선로를 함께 쓰는 ${names}도 같이 켰습니다` : `${names}도 같이 껐습니다`);
    }
  },
  togglePlanOption: (id) =>
    set((s) => ({ scenario: { ...s.scenario, planOptions: { ...s.scenario.planOptions, [id]: !s.scenario.planOptions[id] } } })),
  setLineOverride: (lineId, p) =>
    set((s) => {
      const o = { ...s.scenario.lineOverrides };
      if (p === null) delete o[lineId];
      else o[lineId] = { ...o[lineId], ...p };
      return { scenario: { ...s.scenario, lineOverrides: o } };
    }),
  toggleDevScenario: (id) =>
    set((s) => ({ scenario: { ...s.scenario, activeScenarios: { ...s.scenario.activeScenarios, [id]: !s.scenario.activeScenarios[id] } } })),
  setHouseholds: (zoneId, hh) =>
    set((s) => {
      const o = { ...s.scenario.householdOverrides };
      if (hh === null) delete o[zoneId];
      else o[zoneId] = Math.max(0, Math.round(hh));
      return { scenario: { ...s.scenario, householdOverrides: o } };
    }),
  addUserZone: (z) => set((s) => ({ scenario: { ...s.scenario, userZones: [...s.scenario.userZones, z] } })),
  updateUserZone: (id, patch) =>
    set((s) => ({ scenario: { ...s.scenario, userZones: s.scenario.userZones.map((z) => (z.id === id ? { ...z, ...patch } : z)) } })),
  removeUserZone: (id) => set((s) => ({ scenario: { ...s.scenario, userZones: s.scenario.userZones.filter((z) => z.id !== id) } })),
  setSettings: (p) => set((s) => ({ scenario: { ...s.scenario, settings: { ...s.scenario.settings, ...p } } })),
  resetScenario: () => set({ scenario: DEFAULT_SCENARIO }),

  addCustomLine: (l) => set((s) => ({ scenario: { ...s.scenario, customLines: [...s.scenario.customLines, l] } })),
  updateCustomLine: (id, patch) =>
    set((s) => ({ scenario: { ...s.scenario, customLines: mapLine(s.scenario.customLines, id, (l) => ({ ...l, ...patch })) } })),
  removeCustomLine: (id) => {
    const { ui } = get();
    set((s) => ({
      scenario: { ...s.scenario, customLines: s.scenario.customLines.filter((l) => l.id !== id) },
      ui: ui.edit.kind === 'line' && ui.edit.lineId === id ? { ...s.ui, edit: { kind: 'none' } } : s.ui,
    }));
  },
  addStop: (lineId, stop) =>
    set((s) => ({ scenario: { ...s.scenario, customLines: mapLine(s.scenario.customLines, lineId, (l) => ({ ...l, stops: [...l.stops, stop] })) } })),
  updateStop: (lineId, index, patch) =>
    set((s) => ({
      scenario: {
        ...s.scenario,
        customLines: mapLine(s.scenario.customLines, lineId, (l) => ({ ...l, stops: l.stops.map((st, i) => (i === index ? { ...st, ...patch } : st)) })),
      },
    })),
  removeStop: (lineId, index) =>
    set((s) => ({
      scenario: { ...s.scenario, customLines: mapLine(s.scenario.customLines, lineId, (l) => ({ ...l, stops: l.stops.filter((_, i) => i !== index) })) },
    })),
  moveStop: (lineId, index, dir) =>
    set((s) => ({
      scenario: {
        ...s.scenario,
        customLines: mapLine(s.scenario.customLines, lineId, (l) => {
          const j = index + dir;
          if (j < 0 || j >= l.stops.length) return l;
          const stops = [...l.stops];
          [stops[index], stops[j]] = [stops[j], stops[index]];
          return { ...l, stops };
        }),
      },
    })),

  setUi: (patch) => set((s) => ({ ui: { ...s.ui, ...patch } })),
  setLayer: (k, v) => set((s) => ({ ui: { ...s.ui, layers: { ...s.ui.layers, [k]: v } } })),
  toggleHiddenLine: (id) => set((s) => ({ ui: { ...s.ui, hiddenLines: { ...s.ui.hiddenLines, [id]: !s.ui.hiddenLines[id] } } })),
  showToast: (msg) => {
    set((s) => ({ ui: { ...s.ui, toast: msg } }));
    setTimeout(() => {
      if (get().ui.toast === msg) set((s) => ({ ui: { ...s.ui, toast: null } }));
    }, 3500);
  },
  setSim: (patch) => set((s) => ({ sim: { ...s.sim, ...patch } })),
}));

/** 현재(2026) 상태에서 무언가 바꿨는지 — 계획·내 노선·개발 단지·운행 조정·추가 단지 */
export function scenarioChanged(s: Store): boolean {
  const sc = s.scenario;
  return (
    Object.values(sc.activePlans).some(Boolean) ||
    Object.values(sc.activeScenarios).some(Boolean) ||
    sc.customLines.some((l) => l.visible && l.stops.length >= 2) ||
    Object.keys(sc.lineOverrides).length > 0 ||
    sc.userZones.length > 0
  );
}
