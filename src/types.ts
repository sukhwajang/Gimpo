export type LonLat = [number, number];

export interface Stop {
  name: string;
  lon: number;
  lat: number;
  /** 가칭·추정 위치 */
  tentative?: boolean;
  /** 기존 역 이름을 참조하면 그 역 좌표를 그대로 쓰고 환승역이 된다 */
  ref?: string;
  /** 선택 역(옵션 id). 옵션이 켜져 있을 때만 포함 */
  option?: string;
}

export interface LineParams {
  /** 시간당 열차 수 (한 방향, 출근 첨두) */
  tph: number;
  /** 1편성 정원 — 혼잡도 100% 기준 */
  cap: number;
  /** 표정속도 km/h */
  speed: number;
}

export interface Sequence {
  tph: number;
  /** 모델 밖 배경 승객 (첨두 시간당, 한 방향) */
  bgPax?: number;
  stops: Stop[];
}

export type LineKind = 'existing' | 'plan' | 'custom';

export interface LineDef {
  id: string;
  name: string;
  color: string;
  kind: LineKind;
  /** 직결 운행 대상 노선 id (같으면 환승 없이 이어 탄다) */
  serviceId?: string;
  params: LineParams;
  sequences: Sequence[];
  /** 배경 승객 비율 (기존 노선 보정값) */
  bg?: number;
  note?: string;
}

export type PlanLevel = 'construction' | 'passed' | 'study' | 'national' | 'proposal' | 'ops';

export interface PlanOption {
  id: string;
  label: string;
  description?: string;
  default?: boolean;
}

export interface PlanDef {
  id: string;
  name: string;
  shortName: string;
  color: string;
  level: PlanLevel;
  status: string;
  openYear?: string;
  description: string;
  sources: { title: string; url: string }[];
  serviceId?: string;
  params: LineParams;
  stops: Stop[];
  options?: PlanOption[];
  /** 운영 시나리오: 기존 노선 파라미터 변경 */
  ops?: { target: string; tph?: number; cap?: number; speed?: number };
}

export type ZoneSource = 'detail' | 'district' | 'scenario' | 'user';

export interface Zone {
  id: string;
  name: string;
  lon: number;
  lat: number;
  households: number;
  source: ZoneSource;
  region?: string;
  district?: string;
  /** 개발 시나리오 그룹 id */
  scenario?: string;
}

export interface DevScenario {
  id: string;
  name: string;
  description: string;
  status: string;
}

export interface Destination {
  id: string;
  name: string;
  lon: number;
  lat: number;
  /** 상대 일자리 규모 (천 명 단위 개략) */
  jobs: number;
  radiusKm: number;
}

export interface SimSettings {
  /** 가구당 인원 */
  personsPerHousehold: number;
  /** 인구 대비 출근자 비율 */
  commuteRate: number;
  /** 아파트 외 주거·통학 등 추가 수요 배율 */
  otherDemandFactor: number;
  /** 철도 선호 상수 (분) — 클수록 철도 이용 증가 */
  railBias: number;
  /** 첨두 도로(버스·승용차) 평균 속도 km/h */
  roadSpeed: number;
  /** 목적지 거리 감쇠 (km) */
  distanceDecayKm: number;
  /** 거주지 인근(철도 미이용) 통근 비중 가중치 */
  localWeight: number;
  /** 혼잡 회피 강도 — 클수록 붐비는 노선을 피해 다른 노선·버스로 옮김 */
  crowdAversion: number;
}

export const DEFAULT_SETTINGS: SimSettings = {
  personsPerHousehold: 2.4,
  commuteRate: 0.235,
  otherDemandFactor: 1.0,
  railBias: 0,
  roadSpeed: 20,
  distanceDecayKm: 16,
  localWeight: 200,
  crowdAversion: 1.0,
};

export interface CustomLine {
  id: string;
  name: string;
  color: string;
  params: LineParams;
  stops: Stop[];
  visible: boolean;
}
