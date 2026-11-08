import type { DevScenario, Zone } from '../types';
import districtZones from './generated/district-zones.json';

// 김포·검단·계양·강서·양천은 생활권(단지군) 단위로 직접 입력한 추정치.
// 세대수는 2026년 입주 기준 개략값이며, 앱의 '단지' 탭에서 바로 수정할 수 있다.
// 정확한 값이 필요하면 공공데이터포털(공동주택 기본정보) 데이터를 CSV로 불러오면 된다.

const d = (id: string, name: string, lon: number, lat: number, households: number, region: string): Zone => ({
  id, name, lon, lat, households, region, source: 'detail',
});

export const DETAIL_ZONES: Zone[] = [
  // 김포시
  d('gp-yangchon', '양촌 학운·누산', 126.612, 37.646, 6000, '김포'),
  d('gp-gurae', '구래동', 126.628, 37.650, 16000, '김포'),
  d('gp-masan', '마산동', 126.642, 37.645, 15000, '김포'),
  d('gp-janggi', '장기동', 126.668, 37.648, 14000, '김포'),
  d('gp-unyang', '운양동', 126.682, 37.657, 13000, '김포'),
  d('gp-geolpo', '걸포·북변동', 126.705, 37.636, 11000, '김포'),
  d('gp-sau', '사우동', 126.718, 37.623, 11000, '김포'),
  d('gp-pungmu', '풍무동', 126.731, 37.607, 21000, '김포'),
  d('gp-gochon', '고촌읍', 126.768, 37.603, 9000, '김포'),
  d('gp-gamjeong', '감정동', 126.704, 37.613, 7000, '김포'),
  d('gp-tongjin', '통진읍', 126.598, 37.690, 5000, '김포'),

  // 인천 서구
  d('ic-geomdan-n', '검단신도시 북측(호수공원)', 126.688, 37.607, 13000, '검단'),
  d('ic-geomdan-c', '검단신도시 중앙', 126.700, 37.600, 14000, '검단'),
  d('ic-geomdan-s', '검단신도시 남측(아라)', 126.712, 37.594, 10000, '검단'),
  d('ic-wondang', '원당·마전', 126.668, 37.598, 18000, '검단'),
  d('ic-wanggil', '왕길·오류', 126.640, 37.597, 7000, '검단'),
  d('ic-bullo', '불로·대곡', 126.683, 37.615, 6000, '검단'),
  d('ic-geomam', '검암·경서', 126.672, 37.565, 8000, '인천 서구'),
  d('ic-cheongna', '청라국제도시', 126.640, 37.537, 33000, '인천 서구'),
  d('ic-gajeong', '가정·루원시티', 126.676, 37.525, 15000, '인천 서구'),
  d('ic-seongnam', '석남·가좌', 126.677, 37.502, 15000, '인천 서구'),
  d('ic-yeonhui', '연희·심곡', 126.676, 37.545, 10000, '인천 서구'),

  // 인천 계양구
  d('gy-gyesan', '계산·임학', 126.732, 37.543, 20000, '계양'),
  d('gy-jakjeon', '작전·서운', 126.723, 37.530, 15000, '계양'),
  d('gy-hyoseong', '효성동', 126.708, 37.528, 12000, '계양'),
  d('gy-bakchon', '박촌·병방', 126.745, 37.553, 8000, '계양'),
  d('gy-gyulhyeon', '귤현·동양', 126.742, 37.566, 5000, '계양'),

  // 서울 강서구
  d('gs-banghwa', '방화동', 126.812, 37.574, 17000, '강서'),
  d('gs-gonghang', '공항동·송정', 126.810, 37.560, 6000, '강서'),
  d('gs-magok', '마곡지구', 126.832, 37.563, 12000, '강서'),
  d('gs-balsan', '발산·내발산', 126.835, 37.552, 9000, '강서'),
  d('gs-gayang', '가양동', 126.855, 37.564, 16000, '강서'),
  d('gs-deungchon', '등촌·증미', 126.862, 37.553, 15000, '강서'),
  d('gs-yeomchang', '염창동', 126.873, 37.549, 9000, '강서'),
  d('gs-hwagok', '화곡동', 126.843, 37.540, 14000, '강서'),
  d('gs-ujangsan', '우장산', 126.834, 37.548, 7000, '강서'),

  // 서울 양천구
  d('yc-mokdong-n', '목동신시가지 1~7단지', 126.873, 37.532, 18000, '양천'),
  d('yc-mokdong-s', '목동신시가지 8~14단지', 126.862, 37.522, 15000, '양천'),
  d('yc-sinjeong', '신정동(양천구청)', 126.857, 37.515, 14000, '양천'),
  d('yc-sinwol', '신월동', 126.835, 37.528, 12000, '양천'),
  d('yc-sinmok', '신목동', 126.880, 37.541, 8000, '양천'),
  d('yc-sinjeong-nt', '신정뉴타운', 126.850, 37.511, 8000, '양천'),
];

/** 개발 예정 단지 (시나리오로 켜고 끄기) */
export const DEV_SCENARIOS: DevScenario[] = [
  { id: 'hangang2cc', name: '김포한강2 콤팩트시티', description: '약 4.6만 세대 계획 (양촌·마산·장기·운양 일원)', status: '공공주택지구 지정' },
  { id: 'pungmu-station', name: '풍무역세권 도시개발', description: '약 6,800세대', status: '개발 진행' },
  { id: 'geomdan-final', name: '검단신도시 잔여 입주', description: '약 1.5만 세대 추가 입주', status: '입주 진행' },
  { id: 'gochon-riverside', name: '고촌 한강변 신규택지(후보)', description: '약 3.7만 가구 구상 — 국토부 후보지 보도(2026.11)', status: '후보지' },
  { id: 'gyeyang-tv', name: '계양테크노밸리', description: '약 1.7만 세대 (3기 신도시)', status: '입주 예정' },
  { id: 'bucheon-daejang', name: '부천대장지구', description: '약 2만 세대 (3기 신도시)', status: '입주 예정' },
];

const s = (id: string, name: string, lon: number, lat: number, households: number, scenario: string, region: string): Zone => ({
  id, name, lon, lat, households, scenario, region, source: 'scenario',
});

export const SCENARIO_ZONES: Zone[] = [
  s('sc-2cc-e', '한강2 콤팩트시티(동측)', 126.664, 37.664, 23000, 'hangang2cc', '김포'),
  s('sc-2cc-w', '한강2 콤팩트시티(서측)', 126.644, 37.668, 23000, 'hangang2cc', '김포'),
  s('sc-pungmu', '풍무역세권', 126.736, 37.600, 6800, 'pungmu-station', '김포'),
  s('sc-geomdan3', '검단신도시 3단계', 126.701, 37.612, 15000, 'geomdan-final', '검단'),
  s('sc-gochon-rv', '고촌 한강변 신규택지', 126.776, 37.616, 37000, 'gochon-riverside', '김포'),
  s('sc-gyeyang-tv', '계양테크노밸리', 126.750, 37.562, 17000, 'gyeyang-tv', '계양'),
  s('sc-daejang', '부천대장지구', 126.778, 37.546, 20000, 'bucheon-daejang', '부천'),
];

export const DISTRICT_ZONES: Zone[] = (districtZones as Zone[]).map((z) => ({ ...z, source: 'district' as const }));

/** 결과 요약에서 '김포·검단 출발'로 묶는 지역 */
export const FOCUS_REGIONS = ['김포', '검단'];
