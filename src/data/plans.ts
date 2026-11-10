import type { PlanDef, Stop } from '../types';

// 김포–서울 관련 철도 계획안 (2026년 11월 기준 공개 보도 정리).
// 정거장 위치가 확정되지 않은 곳은 tentative(가칭·개략 위치)로 표시한다.
// ref 가 있는 역은 기존 역 좌표를 그대로 쓰고 환승역으로 연결된다.

const ref = (name: string, lon: number, lat: number, extra: Partial<Stop> = {}): Stop => ({ name, lon, lat, ref: name, ...extra });
const tent = (name: string, lon: number, lat: number, extra: Partial<Stop> = {}): Stop => ({ name, lon, lat, tentative: true, ...extra });

export const PLANS: PlanDef[] = [
  {
    id: 'L5X',
    name: '서울 5호선 김포·검단 연장',
    shortName: '5호선 연장',
    color: '#C39BE8',
    level: 'passed',
    status: '예타 통과(2026.3) · 기본계획 용역 발주 중(18개월)',
    openYear: '2033 목표 (2040년 이후 전망도)',
    description:
      '대광위 조정안(2024.1) 그대로 예타를 통과한 노선. 방화역 → 강서한강공원 → 고촌 전호·향산 → 풍무 → 인천 검단(아라·신검단중앙) → 감정 → 장기 → 김포한강2 콤팩트시티(석모·누산)까지 약 25.8km, 정거장 10개소(서울 1·인천 2·김포 7). 역 이름은 가칭이고 정확한 위치는 기본계획에서 확정된다. 전호역은 아라뱃길 김포터미널 북측 전호리, 향산역은 향산리 힐스테이트리버시티와 한강푸르지오 리버프론트 사이로 잡았다. 5호선과 직결 운행(환승 없음)으로 가정.',
    sources: [
      { title: '경향신문 — 예타 통과 (2026.3)', url: 'https://www.khan.co.kr/article/202603101430011' },
      { title: '김포시청 — 서울5호선 김포·검단 연장', url: 'https://www.gimpo.go.kr/portal/contents.do?key=5779' },
      { title: '비즈워치 — 대광위 조정안: 검단 2개역, 감정역(S07)', url: 'https://news.bizwatch.co.kr/article/real_estate/2024/01/19/0004' },
      { title: '나무위키 — 김포·검단 연장 역 목록(가칭)', url: 'https://namu.wiki/w/%EC%88%98%EB%8F%84%EA%B6%8C%20%EC%A0%84%EC%B2%A0%205%ED%98%B8%EC%84%A0/%EC%97%B0%EC%9E%A5/%EA%B9%80%ED%8F%AC%C2%B7%EA%B2%80%EB%8B%A8%20%EC%97%B0%EC%9E%A5' },
      { title: '파이낸셜뉴스 — 향산리 S03역 예정지 인근 분양', url: 'https://www.fnnews.com/news/202610261648585657' },
      { title: '기호일보 — 기본계획 착수, 인천 원당사거리·불로역 제안', url: 'https://www.kihoilbo.co.kr/news/articleView.html?idxno=3029076' },
      { title: '경인방송 — 실제 개통 2040년 이후 전망', url: 'https://news.ifm.kr/news/articleView.html?idxno=478014' },
    ],
    serviceId: '5',
    params: { tph: 11, cap: 1280, speed: 42 },
    stops: [
      ref('방화', 126.81282, 37.57767),
      // 서울 구간 1개역: 개화동 행주대교 남단 부근
      tent('강서한강공원(가칭)', 126.803, 37.589),
      // 고촌읍 전호리: 아라뱃길 김포터미널(물류단지·아울렛) 북측
      tent('전호(가칭)', 126.79, 37.6015),
      // 고촌읍 향산리: 힐스테이트리버시티(126.745,37.620)와 한강푸르지오 리버프론트(126.739,37.629) 사이
      tent('향산(가칭)', 126.742, 37.6245),
      ref('풍무', 126.73258, 37.61233),
      ref('아라', 126.71333, 37.59222),
      ref('신검단중앙', 126.69861, 37.6026),
      tent('원당사거리(가칭·인천 요구)', 126.672, 37.597, { option: 'wondang' }),
      tent('불로(가칭·인천 요구)', 126.688, 37.612, { option: 'bullo' }),
      // 인천 불로동 대신 김포 감정동(시 경계 바로 북쪽)에 두기로 한 역
      tent('감정(가칭)', 126.7, 37.6175),
      ref('장기', 126.669, 37.64403),
      // 양촌읍 석모리·누산리: 국도 48호선 축, 김포한강2 콤팩트시티 예정지
      tent('석모(가칭)', 126.654, 37.661),
      tent('누산(가칭)', 126.641, 37.671),
      tent('통진(가칭·김포 요구)', 126.6, 37.689, { option: 'tongjin' }),
    ],
    options: [
      { id: 'wondang', label: '원당사거리역 추가', description: '인천시가 기본계획에 다시 제안 (조정안에서 제외됨)' },
      { id: 'bullo', label: '불로역 추가', description: '인천시가 기본계획에 다시 제안 (조정안에서 감정역으로 대체됨)' },
      { id: 'tongjin', label: '통진(마송) 연장', description: '김포시 요구안' },
    ],
  },
  {
    id: 'GTXD',
    name: '서부권 광역급행철도 (GTX-D 김포~부천~청량리)',
    shortName: '서부권 광역급행',
    color: '#7C8CFF',
    level: 'passed',
    status: '예타 통과(2025.7) · 제5차 국가철도망(2026~2035) 11월 발표 예정',
    openYear: '2033 전후 목표 보도',
    description:
      '김포 장기~신검단중앙~계양~대장~부천종합운동장 21km를 새로 짓고, 부천종합운동장부터 신도림·여의도·용산·서울역·청량리까지는 GTX-B 선로를 함께 쓴다(정거장 10곳: 신설 4·공용 6). 장기→청량리 약 33분 보도에 맞춰 속도를 잡았다. 대장역은 개략 위치.',
    sources: [
      { title: '경기일보 — 서부권 광역급행철도 예타 통과 (2025.7)', url: 'https://www.kyeonggi.com/article/20250710580104' },
      { title: '인천일보 — 신검단중앙·계양역 정차', url: 'https://www.incheonilbo.com/news/articleView.html?idxno=1307181' },
      { title: '김포신문 — 김포~청량리 33분', url: 'https://www.igimpo.com/news/articleView.html?idxno=89311' },
      { title: '뉴스핌 — 제5차 국가철도망 13일 의견수렴', url: 'https://www.newspim.com/news/view/20261106001059' },
    ],
    params: { tph: 6, cap: 1000, speed: 90 },
    stops: [
      ref('장기', 126.669, 37.64403),
      ref('신검단중앙', 126.69861, 37.6026),
      ref('계양', 126.73632, 37.57154),
      tent('대장(가칭)', 126.776, 37.546),
      ref('부천종합운동장', 126.7975, 37.50585),
      ref('신도림', 126.8913, 37.5088),
      ref('여의도', 126.9243, 37.5216),
      ref('용산', 126.9648, 37.5299),
      ref('서울', 126.9726, 37.5547),
      ref('청량리', 127.0447, 37.5801),
    ],
  },
  {
    id: 'GTXDX',
    name: 'GTX-D 경기도 요구안 (김포~강남~하남)',
    shortName: 'GTX-D 강남·하남',
    color: '#5C6FE8',
    level: 'proposal',
    status: '경기도 요구안 · 인천시는 Y자 노선 요구 (제5차 계획 반영 여부 미정)',
    openYear: '미정',
    description:
      '경기도가 요구해 온 김포~부천~강남~하남 노선. 부천종합운동장 이후 경로와 정거장은 개략적으로 가정한 것으로, 실제 계획이 아닌 비교용이다.',
    sources: [
      { title: '시사저널e — GTX-D 노선 쟁점', url: 'https://www.sisajournal-e.com/news/articleView.html?idxno=424013' },
      { title: '인천투데이 — GTX-D Y자 요구', url: 'https://www.incheontoday.com/news/articleView.html?idxno=322798' },
    ],
    params: { tph: 6, cap: 1000, speed: 90 },
    stops: [
      ref('장기', 126.669, 37.64403),
      ref('신검단중앙', 126.69861, 37.6026),
      ref('계양', 126.73632, 37.57154),
      tent('대장(가칭)', 126.776, 37.546),
      ref('부천종합운동장', 126.7975, 37.50585),
      ref('신림', 126.9297, 37.4842),
      ref('사당', 126.9816, 37.4766),
      ref('강남', 127.0276, 37.4979),
      ref('삼성', 127.0631, 37.5089),
      ref('잠실', 127.1001, 37.5133),
      ref('강동', 127.1324, 37.5358),
      ref('하남시청', 127.2061, 37.5404),
    ],
  },
  {
    id: 'DH',
    name: '대장홍대선',
    shortName: '대장홍대선',
    color: '#FF7A9C',
    level: 'construction',
    status: '공사 중 (2025.12 착공) · 홍대입구 구간 소송 중',
    openYear: '2031 목표',
    description:
      '부천 대장지구~홍대입구 약 20.1km, 정거장 12개소(대장·오정·원종·고강·신월·화곡·강서구청·가양·덕은·상암·성산·홍대입구). 원종(서해선)·화곡(5호선)·가양(9호선)·홍대입구 환승. 환승역이 아닌 역은 동 단위 개략 위치.',
    sources: [
      { title: '머니투데이방송 — 구간별 착공', url: 'https://news.mtn.co.kr/news-detail/2026081814510895844' },
      { title: '부천시청 — 대장~홍대선', url: 'https://www.bucheon.go.kr/site/homepage/menu/viewMenu?menuid=148006006003004' },
      { title: '한국경제 — 대장·덕은·화곡', url: 'https://www.hankyung.com/article/2024062354941' },
    ],
    params: { tph: 12, cap: 960, speed: 38 },
    stops: [
      tent('대장(가칭)', 126.776, 37.546),
      tent('오정(가칭)', 126.792, 37.533),
      ref('원종', 126.80484, 37.52406),
      tent('고강(가칭)', 126.821, 37.528),
      tent('신월(가칭)', 126.833, 37.531),
      ref('화곡', 126.84044, 37.54158),
      tent('강서구청(가칭)', 126.8495, 37.551),
      ref('가양', 126.85508, 37.56111),
      tent('덕은(가칭)', 126.866, 37.583),
      tent('상암(가칭)', 126.886, 37.579),
      tent('성산(가칭)', 126.906, 37.566),
      ref('홍대입구', 126.9245, 37.5572),
    ],
  },
  {
    id: 'I2X',
    name: '인천2호선 고양 연장',
    shortName: '인천2 고양연장',
    color: '#FFB25C',
    level: 'study',
    status: '예비타당성조사 진행 중 (2023.8~, 2차 점검 대기)',
    openYear: '미정 (통과 시 2035 목표)',
    description:
      '독정역에서 갈라져 당하 → 검단호수공원 → 불로 → 김포 감정 → 걸포북변 → 시네폴리스 → (한강 건너) 일산테크노밸리 → 킨텍스 → 주엽 → 일산 → 산들마을사거리 → 중산까지 19.63km, 정거장 12개소. 환승역이 아닌 역은 개략 위치. 인천2호선과 직결 운행 가정.',
    sources: [
      { title: '서울신문 — 예타 조속 통과 촉구 (2026.10)', url: 'https://m.go.seoul.co.kr/news/newsView.php?id=20261027500274' },
      { title: '김포시청 — 인천 2호선 연장', url: 'https://www.gimpo.go.kr/portal/contents.do?key=5780' },
      { title: '나무위키 — 고양 연장 정거장 목록', url: 'https://namu.wiki/w/%EC%9D%B8%EC%B2%9C%20%EB%8F%84%EC%8B%9C%EC%B2%A0%EB%8F%84%202%ED%98%B8%EC%84%A0/%EC%97%B0%EC%9E%A5/%EA%B3%A0%EC%96%91%EC%A7%80%EC%84%A0%20%EC%97%B0%EC%9E%A5' },
    ],
    serviceId: 'I2',
    params: { tph: 10, cap: 206, speed: 35 },
    stops: [
      ref('독정', 126.67598, 37.58493),
      tent('당하(가칭)', 126.68, 37.594),
      ref('검단호수공원', 126.68806, 37.6025),
      tent('불로(가칭)', 126.688, 37.612),
      tent('감정(가칭)', 126.699, 37.6205),
      ref('걸포북변', 126.70575, 37.63164),
      tent('시네폴리스(가칭)', 126.724, 37.641),
      tent('일산테크노밸리(가칭)', 126.737, 37.668),
      tent('킨텍스(가칭)', 126.7508, 37.6658),
      ref('주엽', 126.7614, 37.6702),
      ref('일산', 126.7695, 37.6822),
      tent('산들마을사거리(가칭)', 126.778, 37.689),
      tent('중산(가칭)', 126.783, 37.697),
    ],
  },
  {
    id: 'GOLD-OPS',
    name: '김포골드라인 11편성 증차 완료',
    shortName: '골드라인 증차',
    color: '#D9B23A',
    level: 'construction',
    status: '증차 진행 중 (6편성 투입, 5편성 추가 예정)',
    openYear: '배차 2분 30초 → 2분 10초',
    description:
      '정부 계획대로 11편성 증차가 끝나 출근 배차가 약 2분 10초(시간당 약 28회)가 되는 경우. 국토부는 이때 최고 혼잡도가 약 170%로 낮아질 것으로 전망했다.',
    sources: [{ title: '머니투데이 — 혼잡도 183.7%, 증차·5호선 전망 (2026.5)', url: 'https://www.mt.co.kr/estate/2026/05/04/2026050413592244239' }],
    params: { tph: 28, cap: 172, speed: 48 },
    stops: [],
    ops: { target: 'G', tph: 28 },
  },
];

export const LEVEL_LABEL: Record<PlanDef['level'], string> = {
  construction: '공사 중',
  passed: '예타 통과',
  study: '예타 진행',
  national: '국가계획',
  proposal: '요구안',
  ops: '운영 가정',
};
