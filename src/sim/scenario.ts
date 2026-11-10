import { DESTINATIONS } from '../data/destinations';
import { DETAIL_ZONES, DISTRICT_ZONES, FOCUS_REGIONS, SCENARIO_ZONES } from '../data/apartments';
import type { CustomLine, LineParams, SimSettings, Zone } from '../types';
import { resolveLines, type ScenarioInput } from './resolve';
import type { SimInput } from './simulate';

export const PROBES = [
  { zoneId: 'gp-gurae', destId: 'yeouido', label: '구래 → 여의도' },
  { zoneId: 'gp-gurae', destId: 'cbd', label: '구래 → 광화문' },
  { zoneId: 'gp-gurae', destId: 'gangnam', label: '구래 → 강남' },
  { zoneId: 'gp-pungmu-n', destId: 'magok', label: '풍무 → 마곡' },
  { zoneId: 'ic-geomdan-c', destId: 'yeouido', label: '검단 → 여의도' },
  { zoneId: 'gp-unyang', destId: 'cbd', label: '운양 → 광화문' },
];

export interface ZoneInput {
  householdOverrides: Record<string, number>;
  activeScenarios: Record<string, boolean>;
  userZones: Zone[];
}

export function buildZones(z: ZoneInput, includeScenarios = true): Zone[] {
  const apply = (zone: Zone): Zone =>
    z.householdOverrides[zone.id] !== undefined ? { ...zone, households: z.householdOverrides[zone.id] } : zone;
  const out = [...DETAIL_ZONES, ...DISTRICT_ZONES].map(apply);
  if (includeScenarios) {
    for (const s of SCENARIO_ZONES) if (z.activeScenarios[s.scenario!]) out.push(apply(s));
    for (const u of z.userZones) out.push(u);
  }
  return out;
}

export interface FullInput extends ScenarioInput, ZoneInput {
  settings: SimSettings;
}

export function toSimInput(f: FullInput): SimInput {
  return {
    lines: resolveLines(f),
    zones: buildZones(f),
    destinations: DESTINATIONS,
    settings: f.settings,
    focusRegions: FOCUS_REGIONS,
    probes: PROBES,
  };
}

/** 비교 기준: 현재 운영 노선 + 현재 입주 단지 (계획·내 노선·개발 시나리오 제외) */
export function toBaselineInput(f: FullInput): SimInput {
  return {
    lines: resolveLines({ activePlans: {}, planOptions: {}, lineOverrides: {}, customLines: [] as CustomLine[] }),
    zones: buildZones(f, false),
    destinations: DESTINATIONS,
    settings: f.settings,
    focusRegions: FOCUS_REGIONS,
    probes: PROBES,
  };
}

export type { LineParams };
