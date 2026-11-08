// 공공데이터포털 + 브이월드 API로 실제 아파트 단지 세대수·좌표를 받아 CSV로 저장한다.
// 결과 CSV는 앱의 '단지·인구 → CSV 불러오기'로 넣을 수 있다.
//
// 필요한 키 (README 'API 키' 참고)
//   DATA_GO_KR_KEY : 공공데이터포털 일반 인증키 (Decoding 키)
//                    - 국토교통부_공동주택 단지 목록제공 서비스
//                    - 국토교통부_공동주택 기본 정보제공 서비스
//   VWORLD_KEY     : 브이월드 오픈API 인증키 (주소 → 좌표 변환)
//
// 실행 예:
//   DATA_GO_KR_KEY=... VWORLD_KEY=... node scripts/fetch-apartments.mjs 41570 28260 > apartments.csv
//   (시군구 코드: 김포 41570, 인천 서구 28260, 계양 28245, 강서 11500, 양천 11470)
//
// 주의: API 주소·응답 필드는 공공데이터포털 개편 때 바뀔 수 있다. 바뀌었으면 아래 환경변수로 덮어쓴다.
//   APT_LIST_URL, APT_INFO_URL

const DATA_KEY = process.env.DATA_GO_KR_KEY;
const VWORLD_KEY = process.env.VWORLD_KEY;
const LIST_URL = process.env.APT_LIST_URL ?? 'https://apis.data.go.kr/1613000/AptListService3/getSigunguAptList3';
const INFO_URL = process.env.APT_INFO_URL ?? 'https://apis.data.go.kr/1613000/AptBasisInfoServiceV4/getAphusBassInfoV4';

const REGION = { 41570: '김포', 28260: '인천 서구', 28245: '계양', 11500: '강서', 11470: '양천' };

if (!DATA_KEY || !VWORLD_KEY) {
  console.error('DATA_GO_KR_KEY 와 VWORLD_KEY 환경변수가 필요합니다.');
  process.exit(1);
}
const codes = process.argv.slice(2);
if (!codes.length) {
  console.error('시군구 코드를 하나 이상 넣어 주세요. 예: node scripts/fetch-apartments.mjs 41570');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  for (let i = 0; i < 3; i++) {
    const res = await fetch(url);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      if (i === 2) throw new Error(`JSON이 아닌 응답 (${res.status}): ${text.slice(0, 200)}`);
      await sleep(1000 * (i + 1));
    }
  }
}

const items = (json) => {
  const it = json?.response?.body?.items;
  if (!it) return [];
  if (Array.isArray(it)) return it;
  if (Array.isArray(it.item)) return it.item;
  return it.item ? [it.item] : [];
};

async function listComplexes(code) {
  const out = [];
  for (let page = 1; page < 50; page++) {
    const url = `${LIST_URL}?serviceKey=${encodeURIComponent(DATA_KEY)}&sigunguCode=${code}&pageNo=${page}&numOfRows=500&_type=json`;
    const rows = items(await getJson(url));
    out.push(...rows);
    if (rows.length < 500) break;
  }
  return out;
}

async function info(kaptCode) {
  const url = `${INFO_URL}?serviceKey=${encodeURIComponent(DATA_KEY)}&kaptCode=${kaptCode}&_type=json`;
  const json = await getJson(url);
  const it = json?.response?.body?.item ?? items(json)[0];
  return it ?? null;
}

async function geocode(address) {
  for (const type of ['road', 'parcel']) {
    const url = `https://api.vworld.kr/req/address?service=address&request=getcoord&version=2.0&crs=epsg:4326&refine=true&simple=false&format=json&type=${type}&key=${encodeURIComponent(VWORLD_KEY)}&address=${encodeURIComponent(address)}`;
    const json = await getJson(url);
    const p = json?.response?.result?.point;
    if (p?.x && p?.y) return [Number(p.x), Number(p.y)];
  }
  return null;
}

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

console.log('name,region,lat,lon,households');
let ok = 0;
let skipped = 0;
for (const code of codes) {
  const list = await listComplexes(code);
  console.error(`[${code}] 단지 ${list.length}개`);
  for (const c of list) {
    try {
      const d = await info(c.kaptCode);
      const hh = Number(d?.kaptdaCnt ?? d?.hoCnt ?? 0);
      const addr = d?.doroJuso || d?.kaptAddr;
      if (!hh || !addr) { skipped++; continue; }
      const pt = await geocode(addr);
      if (!pt) { skipped++; continue; }
      console.log([csvCell(c.kaptName), csvCell(REGION[code] ?? ''), pt[1].toFixed(6), pt[0].toFixed(6), hh].join(','));
      ok++;
      await sleep(80);
    } catch (e) {
      skipped++;
      console.error(`  ${c.kaptName}: ${e.message}`);
    }
  }
}
console.error(`완료: ${ok}개 단지, 건너뜀 ${skipped}개`);
