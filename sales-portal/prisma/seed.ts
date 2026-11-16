/* 시연용 시드 데이터. 실행 시점을 기준으로 최근 12개월 데이터를 만든다. (모든 회사명·인명은 가상) */
import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import { mkdirSync } from "node:fs";

let prisma: PrismaClient;
// SEED_D1=1 이면 wrangler 의 로컬 D1(Cloudflare 배포용)에 시드한다. 기본은 .env 의 SQLite 파일.
async function connect() {
  if (process.env.SEED_D1 !== "1") return new PrismaClient();
  const { getPlatformProxy } = await import("wrangler");
  const { PrismaD1 } = await import("@prisma/adapter-d1");
  const { env } = await getPlatformProxy<{ DB: ConstructorParameters<typeof PrismaD1>[0] }>();
  return new PrismaClient({ adapter: new PrismaD1(env.DB) });
}
const force = process.argv.includes("--force");

// ---------- 결정적 난수 ----------
let seedState = 20240611;
function rnd() {
  seedState |= 0;
  seedState = (seedState + 0x6d2b79f5) | 0;
  let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const ri = (a: number, b: number) => Math.floor(rnd() * (b - a + 1)) + a;
const rf = (a: number, b: number) => rnd() * (b - a) + a;
const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
function weighted<T>(items: [T, number][]): T {
  const total = items.reduce((s, x) => s + x[1], 0);
  let r = rnd() * total;
  for (const [v, w] of items) {
    r -= w;
    if (r <= 0) return v;
  }
  return items[items.length - 1][0];
}
const roundTo = (n: number, unit: number) => Math.max(unit, Math.round(n / unit) * unit);

const NOW = new Date();
const DAY = 86400000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);

type Biz = "CHEM" | "API" | "CDMO";
const DOMAIN = "salesportal.example";

// ---------- 사용자 ----------
const SURNAMES = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임", "한", "오", "서", "신", "권", "황", "안", "송", "류", "홍"];
const GIVEN = ["민준", "서연", "도윤", "지우", "하준", "수아", "시우", "지민", "예준", "하은", "주원", "서윤", "건우", "채원", "현우", "지유", "우진", "다은", "선우", "유나", "태윤", "소율", "정우", "은서", "승현", "나연", "재원", "가은", "성민", "혜린"];

type U = { id: string; email: string; name: string; title: string; role: string; business: Biz | null };
const users: U[] = [];
{
  let n = 0;
  const nm = () => `${SURNAMES[(n * 7) % SURNAMES.length]}${GIVEN[n++ % GIVEN.length]}`;
  users.push({ id: "u_admin", email: `admin@${DOMAIN}`, name: nm(), title: "IT기획팀 과장", role: "ADMIN", business: null });
  users.push({ id: "u_exec1", email: `ceo@${DOMAIN}`, name: nm(), title: "대표이사", role: "EXEC", business: null });
  users.push({ id: "u_exec2", email: `cso@${DOMAIN}`, name: nm(), title: "영업총괄 전무", role: "EXEC", business: null });
  const plan: [Biz, string, number][] = [["CHEM", "chem", 9], ["API", "api", 8], ["CDMO", "cdmo", 7]];
  for (const [biz, key] of plan) {
    users.push({ id: `u_head_${key}`, email: `head.${key}@${DOMAIN}`, name: nm(), title: `${biz === "CHEM" ? "케미컬" : biz}사업부장 상무`, role: "HEAD", business: biz });
  }
  const titles = ["사원", "대리", "대리", "과장", "과장", "차장", "부장"];
  for (const [biz, key, cnt] of plan) {
    for (let i = 1; i <= cnt; i++) {
      users.push({ id: `u_${key}${i}`, email: `${key}${i}@${DOMAIN}`, name: nm(), title: `${biz === "CHEM" ? "케미컬" : biz}영업팀 ${titles[(i + 2) % titles.length]}`, role: "SALES", business: biz });
    }
  }
}
const repsOf = (b: Biz) => users.filter((u) => u.role === "SALES" && u.business === b);

// ---------- 단계 ----------
const STAGE_DEF: Record<Biz, [string, number, string][]> = {
  CHEM: [["문의", 10, "OPEN"], ["샘플", 30, "OPEN"], ["견적", 50, "OPEN"], ["협상", 70, "OPEN"], ["수주", 100, "WON"], ["실패", 0, "LOST"]],
  API: [["문의", 10, "OPEN"], ["샘플·문서 제공", 20, "OPEN"], ["고객 평가·실사", 40, "OPEN"], ["견적", 60, "OPEN"], ["공급계약 협상", 80, "OPEN"], ["수주", 100, "WON"], ["실패", 0, "LOST"]],
  CDMO: [["RFP 접수", 10, "OPEN"], ["CDA 체결", 20, "OPEN"], ["제안·견적", 40, "OPEN"], ["계약 협상", 60, "OPEN"], ["계약", 90, "OPEN"], ["기술이전·생산", 100, "WON"], ["실패", 0, "LOST"]],
};
type S = { id: string; business: Biz; name: string; order: number; probability: number; type: string };
const stages: S[] = [];
for (const b of ["CHEM", "API", "CDMO"] as Biz[]) {
  STAGE_DEF[b].forEach(([name, probability, type], i) => stages.push({ id: `st_${b}_${i + 1}`, business: b, name, order: i + 1, probability, type }));
}
const openStages = (b: Biz) => stages.filter((s) => s.business === b && s.type === "OPEN");
const wonStage = (b: Biz) => stages.find((s) => s.business === b && s.type === "WON")!;
const lostStage = (b: Biz) => stages.find((s) => s.business === b && s.type === "LOST")!;

// ---------- 제품 ----------
type P = { id: string; code: string; name: string; business: Biz; unit: string; price: number /* KRW 단가(시드 계산용) */ };
const products: P[] = [];
{
  const chem: [string, string, number][] = [
    ["아세토니트릴 (HPLC급)", "L", 9000], ["테트라하이드로퓨란", "L", 6500], ["디클로로메탄", "L", 3200], ["메탄올 (고순도)", "L", 1800],
    ["에틸아세테이트", "L", 2600], ["이소프로필알코올", "L", 2400], ["N,N-디메틸포름아미드", "kg", 4200], ["톨루엔", "L", 2100],
    ["4-디메틸아미노피리딘", "kg", 185000], ["트리에틸아민", "kg", 7800], ["Boc 무수물", "kg", 62000], ["팔라듐 카본 촉매 10%", "kg", 4200000],
    ["수소화붕소나트륨", "kg", 58000], ["p-톨루엔설폰산", "kg", 12500], ["2-클로로피리딘 중간체", "kg", 96000], ["키랄 아민 중간체 CA-210", "kg", 340000],
  ];
  const api: [string, string, number][] = [
    ["메트포르민 염산염", "kg", 14000], ["아토르바스타틴 칼슘", "kg", 620000], ["로수바스타틴 칼슘", "kg", 1450000], ["암로디핀 베실산염", "kg", 310000],
    ["텔미사르탄", "kg", 280000], ["에스오메프라졸 마그네슘", "kg", 540000], ["시타글립틴 인산염", "kg", 1250000], ["클로피도그렐 황산수소염", "kg", 390000],
    ["레보플록사신", "kg", 165000], ["프레가발린", "kg", 210000], ["도네페질 염산염", "kg", 2400000], ["엔테카비르", "kg", 38000000],
    ["테노포비르 디소프록실", "kg", 780000], ["세레콕시브", "kg", 240000],
  ];
  const cdmo: [string, string, number][] = [
    ["공정개발 서비스 (PD)", "건", 400000000], ["분석법 개발·밸리데이션", "건", 180000000], ["비임상용 원료 생산", "배치", 350000000], ["임상 1상용 원료 생산", "배치", 600000000],
    ["임상 2/3상용 원료 생산", "배치", 1100000000], ["상업용 원료 위탁생산", "배치", 1500000000], ["고활성 원료(HPAPI) 생산", "배치", 1900000000], ["기술이전 패키지", "건", 500000000],
    ["PPQ 배치 생산", "배치", 1300000000], ["안정성 시험 서비스", "건", 90000000],
  ];
  chem.forEach(([name, unit, price], i) => products.push({ id: `p_c${i + 1}`, code: `CH-${1001 + i}`, name, business: "CHEM", unit, price }));
  api.forEach(([name, unit, price], i) => products.push({ id: `p_a${i + 1}`, code: `AP-${2001 + i}`, name, business: "API", unit, price }));
  cdmo.forEach(([name, unit, price], i) => products.push({ id: `p_d${i + 1}`, code: `CD-${3001 + i}`, name, business: "CDMO", unit, price }));
}
const productsOf = (b: Biz) => products.filter((p) => p.business === b);

// ---------- 고객사 (가상의 회사명) ----------
type C = { id: string; code: string; name: string; country: string; businesses: Biz[]; grade: string; ownerId: string; foreign: boolean; cur: string };
const customers: C[] = [];
{
  const krPrefix = ["누리온", "새론결", "다온솔", "미르텍", "가람원", "해솔린", "아라빛", "도담누리", "한울림", "보람새", "나래온", "이든솔", "마루한", "소담결", "온새미", "라온제", "비채움", "하람솔", "예그린", "초롱별",
    "늘해랑", "별하늘", "솔바람", "윤슬", "다솜누리", "가온길", "푸른숲", "세움터", "모아름", "한아름", "새빛돌", "큰가람", "두루미르", "한새빛", "고운결", "너울", "달보드레", "아리솔", "여울목", "희망누리"];
  const krSuffix = ["제약", "바이오", "파마", "케미칼", "생명과학", "정밀화학", "약품", "바이오텍", "헬스케어", "신약"];
  const frPrefix = ["Norvale", "Kestrelia", "Tavora", "Zenthra", "Altimar", "Brevon", "Calyxa", "Dorivian", "Elvaris", "Fenmoor", "Galdris", "Helvora", "Iskander", "Jorvane", "Kalystra", "Lumetra", "Marivex", "Nexolia", "Orvanta", "Pelagon",
    "Quintara", "Rosmeld", "Sylvaris", "Tessandro", "Umbrava", "Valdemar", "Wexlund", "Xanthea", "Yorvik", "Zephira", "Arcanis", "Belcourt", "Corvalen", "Drayfield", "Estrella", "Fjordane", "Glenmora", "Hanzawa", "Shirokane", "Longwei"];
  const frSpec: [string, string, string][] = [
    ["미국", "Pharmaceuticals Inc.", "USD"], ["독일", "Pharma GmbH", "EUR"], ["스위스", "Biotech AG", "EUR"], ["미국", "Therapeutics LLC", "USD"], ["인도", "Lifesciences Pvt. Ltd.", "USD"],
    ["프랑스", "Santé S.A.", "EUR"], ["이탈리아", "Farmaceutici S.p.A.", "EUR"], ["미국", "Biosciences Corp.", "USD"], ["스페인", "Química S.L.", "EUR"], ["영국", "Pharma Ltd.", "USD"],
    ["네덜란드", "Chemicals B.V.", "EUR"], ["브라질", "Farma Ltda.", "USD"], ["멕시코", "Laboratorios S.A. de C.V.", "USD"], ["베트남", "Pharma JSC", "USD"], ["미국", "Bio Inc.", "USD"],
    ["벨기에", "Biologics N.V.", "EUR"], ["튀르키예", "İlaç A.Ş.", "USD"], ["캐나다", "Pharma Inc.", "USD"], ["호주", "Life Sciences Pty Ltd", "USD"], ["싱가포르", "Pharma Pte. Ltd.", "USD"],
  ];
  // 사업 분포: 케미컬 34, API 28, CDMO 18 (+일부 다중)
  const bizPlan: Biz[] = [];
  for (let i = 0; i < 80; i++) bizPlan.push(i % 40 < 17 ? "CHEM" : i % 40 < 31 ? "API" : "CDMO");
  const ownerIdx: Record<Biz, number> = { CHEM: 0, API: 0, CDMO: 0 };
  for (let i = 0; i < 80; i++) {
    const foreign = i >= 40;
    const k = i % 40;
    const primary = bizPlan[i];
    const businesses: Biz[] = [primary];
    if (i % 9 === 4) businesses.push(primary === "CHEM" ? "API" : primary === "API" ? "CDMO" : "API");
    if (i % 23 === 7 && !businesses.includes("CHEM")) businesses.push("CHEM");
    let name: string, country: string, cur: string;
    if (!foreign) {
      const suffix = primary === "CHEM" ? pick(["케미칼", "정밀화학", "제약", "약품"]) : primary === "API" ? pick(["제약", "파마", "약품", "신약", "헬스케어"]) : pick(["바이오", "바이오텍", "생명과학", "신약"]);
      name = `${krPrefix[k]}${krSuffix.includes(suffix) ? suffix : "제약"}`;
      country = "대한민국";
      cur = "KRW";
    } else if (k >= 37) {
      const jp = k === 37 ? ["일본", "製薬株式会社", "USD"] : k === 38 ? ["일본", "ケミカル株式会社", "USD"] : ["중국", "Pharmaceutical Co., Ltd.", "USD"];
      name = k === 39 ? `${frPrefix[k]} ${jp[1]}` : `${frPrefix[k]} ${jp[1]}`;
      country = jp[0];
      cur = jp[2];
    } else {
      const spec = frSpec[k % frSpec.length];
      name = `${frPrefix[k]} ${spec[1]}`;
      country = spec[0];
      cur = spec[2];
    }
    const reps = repsOf(primary);
    const owner = reps[ownerIdx[primary]++ % reps.length];
    const grade = weighted<[string, number][][number][0]>([["A", 22], ["B", 48], ["C", 30]]);
    customers.push({ id: `c_${i + 1}`, code: `${foreign ? "F" : "K"}${String(10001 + i)}`, name, country, businesses, grade, ownerId: owner.id, foreign, cur });
  }
}
const customersOf = (b: Biz) => customers.filter((c) => c.businesses.includes(b));
const ownerFor = (c: C, b: Biz) => {
  const o = users.find((u) => u.id === c.ownerId)!;
  if (o.business === b) return o;
  const reps = repsOf(b);
  return reps[Number(c.id.replace(/\D/g, "")) % reps.length];
};

// ---------- 환율 (월별) ----------
type R = { year: number; month: number; currency: string; rate: number };
const rates: R[] = [];
{
  let usd = 1345, eur = 1462;
  for (let off = 26; off >= -2; off--) {
    const d = new Date(NOW.getFullYear(), NOW.getMonth() - off, 1);
    usd = Math.min(1450, Math.max(1290, usd + rf(-18, 20)));
    eur = Math.min(1620, Math.max(1410, eur + rf(-20, 23)));
    rates.push({ year: d.getFullYear(), month: d.getMonth() + 1, currency: "USD", rate: Math.round(usd * 10) / 10 });
    rates.push({ year: d.getFullYear(), month: d.getMonth() + 1, currency: "EUR", rate: Math.round(eur * 10) / 10 });
  }
}
const rateOf = (cur: string, d: Date) => {
  if (cur === "KRW") return 1;
  const r = rates.find((x) => x.currency === cur && x.year === d.getFullYear() && x.month === d.getMonth() + 1);
  return r ? r.rate : cur === "USD" ? 1380 : 1500;
};

// ---------- 텍스트 재료 ----------
const CONTACT_TITLES = ["구매팀장", "구매 담당", "R&D 센터장", "QA 팀장", "RA 매니저", "SCM 매니저", "사업개발 이사", "연구소 책임연구원", "CMC 디렉터", "대표이사"];
const F_FIRST = ["Anna", "Markus", "Elena", "David", "Sophie", "Lukas", "Maria", "James", "Priya", "Kenji", "Laura", "Thomas", "Isabel", "Rahul", "Emma", "Pedro", "Nina", "Oliver", "Chloe", "Marco"];
const F_LAST = ["Keller", "Brandt", "Rossi", "Miller", "Dubois", "Novak", "Garcia", "Walker", "Sharma", "Tanaka", "Jensen", "Becker", "Moreno", "Patel", "Clarke", "Silva", "Larsen", "Hughes", "Martin", "Conti"];
const NEXT_ACTIONS: Record<Biz, string[]> = {
  CHEM: ["단가 재견적 송부", "샘플 평가 결과 확인 전화", "연간 물량 계약 조건 협의", "납기 일정 회신", "경쟁사 단가 파악 후 내부 품의", "분기 물량 포캐스트 요청", "구매팀 미팅 일정 확정"],
  API: ["CoA 및 DMF Open Part 송부", "샘플 3배치 발송", "고객 실사 일정 조율", "QA 질의서 회신", "공급계약 초안 검토 회신", "CEP 갱신본 전달", "안정성 자료 추가 제출", "견적서 유효기간 연장 안내"],
  CDMO: ["RFP 질의사항 회신", "CDA 서명본 회수", "기술 제안서 발표 미팅", "견적 상세 내역(BOM) 송부", "MSA 계약서 법무 검토 회신", "기술이전 킥오프 미팅 준비", "사이트 투어 일정 확정", "프로젝트 일정표 수정본 송부"],
};
const ACT_SUBJECTS: Record<string, string[]> = {
  MEETING: ["정기 미팅", "구매팀 대면 미팅", "기술 미팅 (화상)", "단가 협상 미팅", "신규 프로젝트 소개 미팅", "분기 리뷰 미팅", "전시회 부스 미팅"],
  EMAIL: ["견적서 송부", "질의사항 회신", "납기 일정 안내", "미팅 후속 메일", "계약서 초안 송부", "단가 조정 요청 회신"],
  CALL: ["진행 상황 확인 통화", "샘플 평가 결과 문의", "발주 일정 확인", "담당자 변경 안내 통화", "긴급 납기 문의 대응"],
  SAMPLE: ["샘플 발송", "추가 샘플 발송 (3배치)", "평가용 샘플 재발송"],
  DOCUMENT: ["CoA 제공", "DMF Open Part 제공", "CEP 사본 제공", "MSDS 제공", "회사소개서·설비 리스트 제공", "기술 제안서 제공", "안정성 자료 제공"],
};
const ACT_CONTENT = [
  "고객 측 요청사항 정리 후 내부 공유함. 다음 주 중 회신 예정.", "가격 조건에 대해 추가 검토 요청 받음. 경쟁사 대비 5% 내외 차이.", "품질 관련 문의 대응 완료. 추가 자료 요청 없음.",
  "담당자가 긍정적으로 검토 중이며 내부 보고 후 피드백 주기로 함.", "납기 단축 가능 여부 문의 → 생산팀 확인 후 회신 필요.", "연간 물량 기준으로 재견적 요청 받음.",
  "실사 일정 후보일 2개 제안함.", "샘플 평가 결과 규격 적합. 다음 단계 논의 시작.", "의사결정권자 미팅 필요. 다음 방문 시 임원 동행 예정.", "예산 확정 지연으로 일정 1개월 순연 가능성 있음.",
];

// ---------- 기회 ----------
type O = {
  id: string; business: Biz; title: string; customerId: string; productId: string | null; amount: number; currency: string;
  expectedCloseDate: Date | null; ownerId: string; stageId: string; nextAction: string; nextActionDue: Date | null;
  lostReason: string | null; lostNote: string; auditDate: Date | null; description: string; closedAt: Date | null;
  lastActivityAt: Date; createdAt: Date; updatedAt: Date; stale: boolean;
};
const opps: O[] = [];
const histories: { id: string; opportunityId: string; fromStageId: string | null; toStageId: string; changedById: string; note: string; changedAt: Date }[] = [];
const docs: { opportunityId: string; docType: string; requested: boolean; provided: boolean; providedAt: Date | null }[] = [];
const milestones: { opportunityId: string; name: string; plannedDate: Date | null; actualDate: Date | null; order: number }[] = [];
const API_DOCS = ["CoA", "DMF", "CEP", "MSDS", "GMP Certificate", "Stability Data", "TSE/BSE Statement"];
const MS_NAMES = ["계약 체결", "기술이전 착수", "기술이전 완료", "첫 생산(Engineering Batch)", "PPQ 완료"];
{
  const plan: [Biz, number][] = [["CHEM", 65], ["API", 50], ["CDMO", 35]];
  const stepDays: Record<Biz, [number, number]> = { CHEM: [7, 24], API: [20, 55], CDMO: [30, 80] };
  let n = 0, hn = 0;
  for (const [biz, cnt] of plan) {
    const custs = customersOf(biz);
    const prods = productsOf(biz);
    const open = openStages(biz);
    for (let i = 0; i < cnt; i++) {
      n++;
      const id = `o_${n}`;
      const c = custs[(i * 5 + ri(0, 3)) % custs.length];
      const p = pick(prods);
      const owner = ownerFor(c, biz);
      const outcome = weighted<[string, number][][number][0]>([["WON", 22], ["LOST", 18], ["OPEN", 60]]);
      // 진행 중이면 초기 단계에 더 많이 분포
      const openIdx = outcome === "WON" ? open.length - 1 : weighted(open.map((_, k) => [k, open.length - k * 0.7] as [number, number]));
      const path = open.slice(0, openIdx + 1);
      const gaps = path.slice(1).map(() => ri(stepDays[biz][0], stepDays[biz][1]));
      const closeGap = outcome === "OPEN" ? 0 : ri(stepDays[biz][0], stepDays[biz][1]);
      const stale = outcome === "OPEN" && i % 6 === 3; // 약 15건은 30일 이상 정체
      const tail = outcome === "OPEN" ? (stale ? ri(34, 85) : ri(1, 24)) : ri(3, 320);
      const total = gaps.reduce((s, x) => s + x, 0) + closeGap + tail;
      const createdAt = daysAgo(total);
      let t = createdAt;
      let prev: string | null = null;
      path.forEach((s, k) => {
        if (k > 0) t = addDays(t, gaps[k - 1]);
        histories.push({ id: `h_${++hn}`, opportunityId: id, fromStageId: prev, toStageId: s.id, changedById: owner.id, note: k === 0 ? "기회 등록" : "", changedAt: t });
        prev = s.id;
      });
      let stageId = path[path.length - 1].id;
      let closedAt: Date | null = null;
      let lostReason: string | null = null;
      let lostNote = "";
      if (outcome !== "OPEN") {
        t = addDays(t, closeGap);
        closedAt = t;
        const final = outcome === "WON" ? wonStage(biz) : lostStage(biz);
        if (outcome === "LOST") {
          lostReason = weighted<[string, number][][number][0]>([["PRICE", 35], ["COMPETITOR", 25], ["QUALITY", 14], ["SCHEDULE", 16], ["OTHER", 10]]);
          lostNote = { PRICE: "목표 단가와 8~12% 차이로 합의 불발", COMPETITOR: "기존 공급사와 재계약 결정", QUALITY: "불순물 규격 기준 미충족", SCHEDULE: "요청 납기 내 공급 불가", OTHER: "고객사 프로젝트 내부 중단" }[lostReason]!;
        }
        histories.push({ id: `h_${++hn}`, opportunityId: id, fromStageId: prev, toStageId: final.id, changedById: owner.id, note: outcome === "LOST" ? lostNote : "수주 확정", changedAt: t });
        stageId = final.id;
      }
      // 금액
      const cur = c.cur;
      let krw: number;
      if (biz === "CHEM") krw = rf(0.3, 1) ** 2 * 9e8 + 2e7;
      else if (biz === "API") krw = rf(0.25, 1) ** 2 * 4.2e9 + 1e8;
      else krw = rf(0.3, 1) ** 2.4 * 3.6e10 + 1.2e9;
      const amount = cur === "KRW" ? roundTo(krw, biz === "CHEM" ? 1e6 : 1e7) : roundTo(krw / rateOf(cur, NOW), biz === "CHEM" ? 1000 : 10000);
      const remain = open.length - 1 - openIdx;
      const expectedCloseDate = closedAt ? addDays(closedAt, ri(-10, 10)) : addDays(NOW, ri(10, 30) + remain * ri(stepDays[biz][0], stepDays[biz][1]));
      const hasNext = outcome === "OPEN";
      // 다음 액션 기한: 이번 주/다음 주 위주 + 일부 기한 경과
      const due = hasNext ? addDays(NOW, weighted([[ri(0, 5), 45], [ri(6, 20), 35], [-ri(1, 9), 20]] as [number, number][])) : null;
      const title =
        biz === "CDMO"
          ? `${pick(["KX", "NP", "ZT", "BR", "LM", "AV"])}-${ri(101, 989)} ${p.name}`
          : `${p.name} ${pick(biz === "CHEM" ? ["연간 공급", "신규 공급", "분기 물량", "단가 재계약", "대체 공급선 전환"] : ["신규 공급", "2nd 소스 등록", "연간 공급계약", "수출 공급", "제네릭 프로젝트 공급"])}`;
      const lastChange = closedAt ?? t;
      opps.push({
        id, business: biz, title, customerId: c.id, productId: p.id, amount, currency: cur, expectedCloseDate, ownerId: owner.id, stageId,
        nextAction: hasNext ? pick(NEXT_ACTIONS[biz]) : "", nextActionDue: due, lostReason, lostNote,
        auditDate: biz === "API" && openIdx >= 2 ? addDays(lastChange, ri(-20, 40)) : null,
        description: "", closedAt, lastActivityAt: lastChange, createdAt, updatedAt: lastChange, stale,
      });
      if (biz === "API") {
        API_DOCS.forEach((d, k) => {
          const requested = k < 4 ? openIdx >= 1 || rnd() < 0.5 : openIdx >= 2 && rnd() < 0.6;
          const provided = requested && (openIdx >= 2 || rnd() < 0.5) && !(k === 2 && rnd() < 0.3);
          docs.push({ opportunityId: id, docType: d, requested, provided, providedAt: provided ? addDays(createdAt, ri(5, 40)) : null });
        });
      }
      if (biz === "CDMO") {
        const base = closedAt && outcome === "WON" ? addDays(closedAt, -ri(20, 60)) : expectedCloseDate ?? NOW;
        MS_NAMES.forEach((m, k) => {
          const planned = openIdx >= 2 ? addDays(base, k * ri(55, 95)) : null;
          const done = outcome === "WON" ? (k === 0 || (planned && planned < NOW)) : openIdx >= 4 && k === 0;
          milestones.push({ opportunityId: id, name: m, plannedDate: planned, actualDate: done && planned ? addDays(planned, ri(-5, 12)) : null, order: k });
        });
      }
    }
  }
}

// ---------- 활동 500건 ----------
const activities: { id: string; type: string; subject: string; content: string; date: Date; userId: string; customerId: string; opportunityId: string | null }[] = [];
{
  const typeW: Record<Biz, [string, number][]> = {
    CHEM: [["MEETING", 22], ["EMAIL", 34], ["CALL", 30], ["SAMPLE", 10], ["DOCUMENT", 4]],
    API: [["MEETING", 20], ["EMAIL", 28], ["CALL", 16], ["SAMPLE", 14], ["DOCUMENT", 22]],
    CDMO: [["MEETING", 34], ["EMAIL", 32], ["CALL", 14], ["SAMPLE", 2], ["DOCUMENT", 18]],
  };
  let n = 0;
  const lastAct = new Map<string, Date>();
  while (activities.length < 450) {
    const o = opps[Math.floor(rnd() * opps.length)];
    const end = o.closedAt ?? (o.stale ? daysAgo(ri(33, 40)) : NOW);
    const span = Math.max(1, (end.getTime() - o.createdAt.getTime()) / DAY);
    if (o.stale && end <= o.createdAt) continue;
    const date = addDays(o.createdAt, rf(0, span));
    if (date > NOW) continue;
    const type = weighted(typeW[o.business]);
    activities.push({ id: `a_${++n}`, type, subject: pick(ACT_SUBJECTS[type]), content: pick(ACT_CONTENT), date, userId: o.ownerId, customerId: o.customerId, opportunityId: o.id });
    if (!lastAct.has(o.id) || lastAct.get(o.id)! < date) lastAct.set(o.id, date);
  }
  while (activities.length < 500) {
    const c = pick(customers);
    const type = weighted<[string, number][][number][0]>([["MEETING", 40], ["CALL", 35], ["EMAIL", 25]]);
    activities.push({ id: `a_${++n}`, type, subject: pick(["정기 안부 방문", "신년 인사 미팅", "연간 구매 계획 청취", "담당자 변경 인사", "전시회 방문 응대"]), content: pick(ACT_CONTENT), date: daysAgo(rf(1, 330)), userId: c.ownerId, customerId: c.id, opportunityId: null });
  }
  for (const o of opps) {
    const la = lastAct.get(o.id);
    if (la && la > o.lastActivityAt) o.lastActivityAt = la;
    if (o.stale && o.lastActivityAt > daysAgo(31)) o.lastActivityAt = daysAgo(ri(33, 60));
    o.updatedAt = o.lastActivityAt;
  }
}

// ---------- 최근 12개월 실적 ----------
type SR = { saleDate: Date; business: Biz; customerCode: string; customerName: string; customerId: string; productCode: string; productName: string; quantity: number; unit: string; amount: number; currency: string; amountKrw: number };
const sales: SR[] = [];
function makeSale(biz: Biz, date: Date): SR {
  const pool = customersOf(biz);
  const c = weighted(pool.map((x, k) => [x, (x.grade === "A" ? 6 : x.grade === "B" ? 2.5 : 1) * (k % 5 === 4 ? 0.2 : 1)] as [C, number]));
  const p = pick(productsOf(biz));
  let krw: number;
  if (biz === "CHEM") krw = rf(0.25, 1) ** 2 * 1.1e8 + 6e6;
  else if (biz === "API") krw = rf(0.25, 1) ** 2 * 3.6e8 + 2.5e7;
  else krw = rf(0.4, 1) ** 2 * 1.5e9 + 2e8;
  const cur = c.cur;
  const rate = rateOf(cur, date);
  const amount = cur === "KRW" ? roundTo(krw, 10000) : roundTo(krw / rate, 10);
  const qtyRaw = (amount * rate) / p.price;
  const quantity = p.unit === "건" || p.unit === "배치" ? Math.max(1, Math.round(qtyRaw)) : Math.max(1, Math.round(qtyRaw * 10) / 10);
  return { saleDate: date, business: biz, customerCode: c.code, customerName: c.name, customerId: c.id, productCode: p.code, productName: p.name, quantity, unit: p.unit, amount, currency: cur, amountKrw: Math.round(amount * rate) };
}
{
  const perMonth: Record<Biz, number> = { CHEM: 58, API: 24, CDMO: 6 };
  for (let off = 11; off >= 0; off--) {
    const first = new Date(NOW.getFullYear(), NOW.getMonth() - off, 1);
    const dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const lastDay = off === 0 ? Math.max(1, NOW.getDate() - 1) : dim;
    const season = 0.85 + rf(0, 0.3) + (11 - off) * 0.008;
    for (const biz of ["CHEM", "API", "CDMO"] as Biz[]) {
      const cnt = Math.max(1, Math.round(perMonth[biz] * season * (lastDay / dim)));
      for (let i = 0; i < cnt; i++) {
        const d = new Date(first.getFullYear(), first.getMonth(), ri(1, lastDay), 12);
        sales.push(makeSale(biz, d));
      }
    }
  }
}

// ---------- 목표 ----------
const targets: { year: number; month: number; business: string; userId: string | null; amountKrw: number }[] = [];
{
  const months: { y: number; m: number }[] = [];
  const startY = new Date(NOW.getFullYear(), NOW.getMonth() - 11, 1);
  for (let d = new Date(startY); d <= new Date(NOW.getFullYear(), 11, 1); d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) months.push({ y: d.getFullYear(), m: d.getMonth() + 1 });
  const fullMonths = 11; // 완결된 월 수(대략)
  for (const biz of ["CHEM", "API", "CDMO"] as Biz[]) {
    const bizSales = sales.filter((s) => s.business === biz && !(s.saleDate.getFullYear() === NOW.getFullYear() && s.saleDate.getMonth() === NOW.getMonth()));
    const avg = bizSales.reduce((s, x) => s + x.amountKrw, 0) / fullMonths;
    const lift = biz === "CHEM" ? 0.97 : biz === "API" ? 1.06 : 1.12;
    months.forEach(({ y, m }, k) => targets.push({ year: y, month: m, business: biz, userId: null, amountKrw: roundTo(avg * lift * (0.96 + k * 0.006), 1e7) }));
    for (const rep of repsOf(biz)) {
      const mine = bizSales.filter((s) => customers.find((c) => c.id === s.customerId)!.ownerId === rep.id);
      const uavg = mine.reduce((s, x) => s + x.amountKrw, 0) / fullMonths;
      const ulift = rf(0.85, 1.25);
      months.forEach(({ y, m }) => targets.push({ year: y, month: m, business: biz, userId: rep.id, amountKrw: roundTo(Math.max(uavg, 3e7) * ulift, 1e6) }));
    }
  }
}

// ---------- 업로드 테스트용 샘플 엑셀 ----------
function writeSampleXlsx() {
  const rows: Record<string, unknown>[] = [];
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const label: Record<Biz, string> = { CHEM: "케미컬", API: "API", CDMO: "CDMO" };
  const toRow = (s: SR) => ({ 매출일자: fmt(s.saleDate), 사업구분: label[s.business], 고객코드: s.customerCode, 고객명: s.customerName, 제품코드: s.productCode, 제품명: s.productName, 수량: s.quantity, 단위: s.unit, 금액: s.amount, 통화: s.currency });
  // 오늘 날짜 매출(시드에는 어제까지만 들어 있음) 45건
  const today = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate(), 12);
  for (let i = 0; i < 45; i++) rows.push(toRow(makeSale(i < 34 ? "CHEM" : i < 44 ? "API" : "CDMO", today)));
  // 검증 시연용 오류 행
  rows.splice(7, 0, { ...rows[3] }); // 파일 내 중복
  rows.splice(20, 0, { ...rows[12], 고객코드: "K99999", 고객명: "미등록상사" }); // 미등록 고객코드
  rows.splice(31, 0, { ...rows[15], 금액: "" }); // 필수값 누락
  rows.splice(40, 0, { ...rows[25], 매출일자: "" }); // 필수값 누락
  rows.push({ ...rows[36], 고객코드: "F88888", 고객명: "Unknown Trading Co." }); // 미등록 고객코드
  rows.push({ ...rows[28] }); // 파일 내 중복
  const ws = XLSX.utils.json_to_sheet(rows, { header: ["매출일자", "사업구분", "고객코드", "고객명", "제품코드", "제품명", "수량", "단위", "금액", "통화"] });
  ws["!cols"] = [12, 10, 10, 34, 10, 30, 10, 6, 16, 6].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "매출실적");
  mkdirSync("public/samples", { recursive: true });
  XLSX.writeFile(wb, "public/samples/sap_sales_sample.xlsx");
}

async function main() {
  prisma = await connect();
  const existing = await prisma.user.count();
  if (existing > 0 && !force) {
    console.log(`[seed] 이미 데이터가 있어 건너뜁니다 (사용자 ${existing}명). 초기화: npm run db:reset`);
    return;
  }
  // 초기화
  await prisma.auditLog.deleteMany();
  await prisma.salesRecord.deleteMany();
  await prisma.uploadBatch.deleteMany();
  await prisma.target.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.stageHistory.deleteMany();
  await prisma.opportunityDocument.deleteMany();
  await prisma.milestone.deleteMany();
  await prisma.opportunity.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.product.deleteMany();
  await prisma.stage.deleteMany();
  await prisma.exchangeRate.deleteMany();
  await prisma.user.deleteMany();

  await prisma.user.createMany({ data: users });
  await prisma.stage.createMany({ data: stages });
  await prisma.product.createMany({ data: products.map(({ price: _p, ...p }) => p) });
  await prisma.exchangeRate.createMany({ data: rates });
  await prisma.customer.createMany({
    data: customers.map((c, i) => ({ id: c.id, code: c.code, name: c.name, country: c.country, businesses: c.businesses.join(","), grade: c.grade, ownerId: c.ownerId, createdAt: daysAgo(400 + ((i * 37) % 600)) })),
  });
  const contacts = customers.flatMap((c, i) => {
    const cnt = 1 + (i % 3);
    return Array.from({ length: cnt }, (_, k) => {
      const name = c.foreign ? `${F_FIRST[(i * 3 + k * 7) % F_FIRST.length]} ${F_LAST[(i * 5 + k * 3) % F_LAST.length]}` : `${SURNAMES[(i * 3 + k * 5 + 2) % SURNAMES.length]}${GIVEN[(i * 7 + k * 11 + 5) % GIVEN.length]}`;
      return {
        customerId: c.id, name, title: CONTACT_TITLES[(i + k * 3) % CONTACT_TITLES.length],
        email: `contact${k + 1}@${c.code.toLowerCase()}.example`, phone: c.foreign ? "" : `02-${ri(300, 999)}-${ri(1000, 9999)}`,
      };
    });
  });
  await prisma.contact.createMany({ data: contacts });
  await prisma.opportunity.createMany({ data: opps.map(({ stale: _s, ...o }) => o) });
  await prisma.stageHistory.createMany({ data: histories });
  await prisma.opportunityDocument.createMany({ data: docs });
  await prisma.milestone.createMany({ data: milestones });
  await prisma.activity.createMany({ data: activities.map((a) => ({ ...a, createdAt: a.date })) });

  // 실적은 월 단위 업로드 배치로 넣는다
  const byMonth = new Map<string, SR[]>();
  for (const s of sales) {
    const k = `${s.saleDate.getFullYear()}-${String(s.saleDate.getMonth() + 1).padStart(2, "0")}`;
    if (!byMonth.has(k)) byMonth.set(k, []);
    byMonth.get(k)!.push(s);
  }
  for (const [k, list] of byMonth) {
    const [y, m] = k.split("-").map(Number);
    const batch = await prisma.uploadBatch.create({
      data: { fileName: `SAP_매출실적_${k}.xlsx`, uploadedById: "u_admin", totalRows: list.length, savedRows: list.length, errorRows: 0, createdAt: new Date(Math.min(NOW.getTime(), new Date(y, m, 2, 9).getTime())) },
    });
    await prisma.salesRecord.createMany({ data: list.map((s) => ({ ...s, uploadId: batch.id })) });
  }
  await prisma.target.createMany({ data: targets });
  await prisma.auditLog.create({ data: { userId: "u_admin", userName: users[0].name, action: "CREATE", entity: "System", summary: "시연용 초기 데이터 생성" } });

  writeSampleXlsx();
  console.log(`[seed] 완료: 사용자 ${users.length}, 고객 ${customers.length}, 제품 ${products.length}, 기회 ${opps.length}, 활동 ${activities.length}, 실적 ${sales.length}행`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma?.$disconnect();
    if (process.env.SEED_D1 === "1") process.exit(0); // 로컬 D1 프록시 종료
  });
