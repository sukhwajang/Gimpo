# 영업포탈 (PoC)

제약회사 B2B 영업 조직(케미컬 · API · CDMO)을 위한 영업 파이프라인·실적 관리 웹앱 PoC입니다.
경영진·영업팀 시연을 통해 정식 도입 여부를 판단하기 위한 용도이며, 화면의 모든 버튼은 실제로 동작합니다.

- Next.js 14 (App Router) · TypeScript · Tailwind CSS · shadcn/ui 방식 컴포넌트(Radix) · Recharts
- Prisma + SQLite (설정만 바꾸면 PostgreSQL)
- NextAuth: Microsoft Entra ID SSO + 시연용 이메일 로그인
- SheetJS(xlsx): 엑셀 업로드/다운로드

## 1. 실행 방법

```bash
cd sales-portal
npm install && npm run dev
```

브라우저에서 http://localhost:3000 을 엽니다. 별도 준비는 필요 없습니다.

`npm run dev` 가 처음 실행될 때 자동으로 다음을 수행합니다 (`scripts/setup.mjs`).

1. `.env` 가 없으면 `.env.example` 을 복사하고 `NEXTAUTH_SECRET` 을 생성
2. `prisma db push` 로 SQLite DB(`prisma/dev.db`) 생성
3. DB가 비어 있으면 시연용 시드 데이터 입력 + 업로드 테스트용 엑셀(`public/samples/sap_sales_sample.xlsx`) 생성

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 (최초 실행 시 DB·시드 자동 준비) |
| `npm run build && npm start` | 프로덕션 빌드/실행 |
| `npm run typecheck` | 타입 체크 |
| `npm run db:reset` | DB를 지우고 시드 데이터를 다시 생성 (시연 전 초기화용) |

> 시드 데이터는 **실행한 날짜를 기준으로** 최근 12개월 실적, 이번 주 할 일, 30일 이상 정체된 기회 등이 만들어집니다.
> 시연 직전에 `npm run db:reset` 을 한 번 실행하면 날짜가 자연스럽게 맞습니다.

## 2. 역할별 테스트 계정

로그인 화면에서 이메일만 입력하거나, 역할별 드롭다운에서 계정을 고르면 됩니다(비밀번호 없음, `DEMO_LOGIN=true` 일 때만).

| 역할 | 이메일 | 보이는 범위 |
|---|---|---|
| 관리자 | `admin@salesportal.example` | 전사 + 관리 메뉴 전체 |
| 경영진 | `ceo@salesportal.example`, `cso@salesportal.example` | 전사 + 관리 메뉴 전체 |
| 사업부장 | `head.chem@…`, `head.api@…`, `head.cdmo@…` | 소속 사업부 전체 조회·수정, 목표 설정 |
| 영업담당(케미컬) | `chem1@…` ~ `chem9@…` | 케미컬 조회, 본인 담당만 수정 |
| 영업담당(API) | `api1@…` ~ `api8@…` | API 조회, 본인 담당만 수정 |
| 영업담당(CDMO) | `cdmo1@…` ~ `cdmo7@…` | CDMO 조회, 본인 담당만 수정 |

(도메인은 모두 `@salesportal.example`. 사용자 30명 · 고객사 80곳 · 제품 40개 · 영업기회 150건 · 활동 500건 · 실적 약 1,100행. 회사명·인명은 모두 가상입니다.)

### 권한 매트릭스

| 기능 | 영업담당 | 사업부장 | 경영진 / 관리자 |
|---|---|---|---|
| 고객·기회·활동·실적 조회 | 소속 사업부 | 소속 사업부 | 전사 |
| 고객·기회 등록 | ○ (본인 담당으로) | ○ | ○ |
| 고객·기회 수정, 단계 이동 | 본인 담당만 | 소속 사업부 전체 | 전사 |
| 고객·기회 삭제 | ✕ | 소속 사업부 | 전사 |
| 목표 설정 | ✕ (조회만) | 소속 사업부 | 전사 |
| 실적 업로드 | ✕ | ✕ | ○ |
| 사용자·단계/확률·제품·환율·감사 로그 | ✕ | ✕ | ○ |

권한은 메뉴 숨김뿐 아니라 **모든 서버 액션과 페이지에서 다시 검사**합니다(`src/lib/permissions.ts`).
다른 사업부의 상세 주소를 직접 입력하면 404, 관리 화면은 대시보드로 되돌려 보냅니다.

## 3. 시연 시나리오 (권장 순서)

**A. 기회 생성 → 단계 이동 → 수주** (`chem1@…` 로 로그인)

1. 대시보드: 내 달성률, 파이프라인, 이번 주 할 일, 30일 이상 정체 기회 확인
2. 영업기회 → **기회 등록** → 저장하면 상세 화면으로 이동
3. 영업기회(칸반)에서 카드를 다음 단계로 **드래그** → 상세의 "단계 변경 이력"에 자동 기록
4. 카드를 **실패** 열로 드래그 → 사유(가격/품질/일정/경쟁사/기타) 입력 창이 뜨고, 사유 없이는 처리 불가
5. 상세에서 **활동 기록** 추가, 단계 표시줄에서 **수주** 클릭
6. 다른 담당자의 카드(자물쇠 표시)는 끌 수 없고 상세도 조회 전용

**B. 사업별 차이** — `api1@…`: 요청 문서 체크리스트(CoA, DMF, CEP, MSDS…)와 실사 일정 / `cdmo3@…`: 프로젝트 마일스톤

**C. 엑셀 업로드 → 대시보드 반영** (`admin@…` 로 로그인)

1. 대시보드의 "누적 실적" 숫자를 확인
2. 실적 업로드 → "테스트용 샘플 엑셀 내려받기" → 그 파일을 올림
3. 검증 리포트: 전체 51행 중 정상 45 / 오류 6 (필수값 누락 2, 미등록 고객코드 2, 중복 2) → **정상 45행 저장**
4. 대시보드로 돌아가면 실적·달성률·월별 추이·Top 10이 바뀜. 같은 파일을 다시 올리면 전부 "중복"으로 걸러짐
5. 업로드 이력에서 휴지통을 누르면 해당 업로드를 취소(실적 삭제)할 수 있음

**D. 경영진/사업부장 화면** — 사업별 실적 vs 목표, 월별 추이, 고객 Top 10, 단계별 파이프라인(가중 예상 매출), 실패 사유 분석.
차트 막대를 클릭하면 조건이 걸린 목록으로 이동합니다. 목표 메뉴에서 월 목표를 바꾸면 달성률이 즉시 다시 계산됩니다.

**E. 관리** — 단계·확률 설정에서 확률을 바꾸면 칸반과 가중 예상 매출에 반영, 모든 변경은 감사 로그에 기록.

## 4. 구조

```
sales-portal/
├─ prisma/schema.prisma      데이터 모델
├─ prisma/seed.ts            시연용 시드 + 샘플 엑셀 생성
├─ scripts/setup.mjs         dev/build 전 자동 준비 (.env → db push → seed)
└─ src/
   ├─ middleware.ts          로그인하지 않으면 /login 으로
   ├─ lib/
   │  ├─ auth.ts             NextAuth 설정 (Entra ID + 시연용 로그인)
   │  ├─ session.ts          현재 사용자(역할·사업부를 매 요청 DB에서 조회)
   │  ├─ permissions.ts      조회 범위·수정 권한 규칙 (한 곳에 모음)
   │  ├─ sales-import.ts     엑셀 행 검증(필수값·고객코드·중복·환율)
   │  ├─ fx.ts / perf.ts     월별 환율 환산 / 실적 집계
   │  └─ audit.ts            감사 로그 기록
   ├─ components/            ui/(Button, Card, Dialog…), 칸반, 차트, 폼, 엑셀 다운로드
   └─ app/
      ├─ login/              로그인
      └─ (app)/
         ├─ page.tsx         대시보드 (영업담당용 / 사업부장·경영진용)
         ├─ customers/       고객사 목록·상세(담당자, 진행 기회, 실적, 활동 타임라인)
         ├─ opportunities/   칸반·목록·상세 (단계 이력, 문서 체크리스트, 마일스톤)
         ├─ activities/      활동 기록 목록
         ├─ performance/     실적 조회, upload/ 엑셀 업로드
         ├─ targets/         사업부·담당자별 월 목표
         └─ admin/           사용자, 단계·확률, 제품, 환율, 감사 로그
```

### ERD

```mermaid
erDiagram
  User ||--o{ Customer : "담당"
  User ||--o{ Opportunity : "담당"
  User ||--o{ Activity : "작성"
  User ||--o{ Target : "개인 목표"
  User ||--o{ AuditLog : ""
  Customer ||--o{ Contact : ""
  Customer ||--o{ Opportunity : ""
  Customer ||--o{ Activity : ""
  Customer ||--o{ SalesRecord : ""
  Stage ||--o{ Opportunity : "현재 단계"
  Product ||--o{ Opportunity : ""
  Opportunity ||--o{ StageHistory : "단계 이력"
  Opportunity ||--o{ Activity : ""
  Opportunity ||--o{ OpportunityDocument : "API 문서 체크리스트"
  Opportunity ||--o{ Milestone : "CDMO 마일스톤"
  UploadBatch ||--o{ SalesRecord : ""
  ExchangeRate { int year int month string currency float rate }
  Target { int year int month string business string userId float amountKrw }
```

### 계산 규칙

- **원화 환산**: 실적은 업로드 시 *매출월 환율*로 환산해 저장합니다(해당 월 환율이 없으면 직전 월). 환율을 고치면 그 달 실적을 자동으로 다시 환산합니다. 파이프라인 금액은 *최신 환율*로 환산합니다.
- **가중 예상 매출** = 예상 금액(원화) × 현재 단계의 성공확률
- **달성률** = 연 누적 실적 ÷ 1월~당월 누적 목표
- **담당자 실적** = 본인이 담당하는 고객의, 본인 소속 사업부 매출
- **30일 이상 업데이트 없음** = 진행 중인 기회 중 마지막 활동 기록·단계 변경이 30일보다 오래된 건
- CDMO는 요구사항대로 `계약(90%)` 까지가 진행 단계이고 `기술이전·생산(100%)` 이 수주 단계입니다.

## 5. Microsoft Entra ID(Azure AD) SSO 연동

코드는 이미 들어 있고(`src/lib/auth.ts`), 환경변수 3개만 채우면 로그인 화면에 "Microsoft 계정으로 로그인" 버튼이 나타납니다.

1. **Azure Portal → Microsoft Entra ID → 앱 등록 → 새 등록**
   - 지원 계정 유형: *이 조직 디렉터리의 계정만 (단일 테넌트)*
   - 리디렉션 URI (웹): `https://<포탈 주소>/api/auth/callback/azure-ad`
     (로컬 테스트: `http://localhost:3000/api/auth/callback/azure-ad`)
2. **개요**에서 `애플리케이션(클라이언트) ID`, `디렉터리(테넌트) ID` 복사
3. **인증서 및 비밀 → 새 클라이언트 비밀** 생성 후 *값* 복사 (만료일 관리 필요)
4. **API 사용 권한**: Microsoft Graph 위임 권한 `openid`, `profile`, `email`, `User.Read` (기본값) → 필요 시 관리자 동의
5. `.env` 설정 후 서버 재시작

   ```env
   NEXTAUTH_URL="https://<포탈 주소>"
   NEXTAUTH_SECRET="<openssl rand -hex 32 결과>"
   AZURE_AD_CLIENT_ID="…"
   AZURE_AD_CLIENT_SECRET="…"
   AZURE_AD_TENANT_ID="…"
   DEMO_LOGIN="false"      # 운영에서는 반드시 끌 것
   ```

6. **사용자 매핑**: SSO로 로그인한 사람의 이메일(UPN)이 포탈의 *사용자·역할* 화면에 **활성 상태로 등록**되어 있어야 들어올 수 있습니다.
   등록되지 않은 계정은 "등록되지 않은 계정" 안내와 함께 거부됩니다. 역할·사업부는 포탈에서 관리합니다.

> 이 저장소에서는 실제 테넌트가 없어 SSO 로그인 자체는 실행해 보지 못했습니다. 설정 후 첫 로그인으로 확인이 필요합니다.
> (이메일 대신 UPN이 내려오는 테넌트를 위해 `preferred_username` 도 함께 확인하도록 해 두었습니다.)

## 6. PostgreSQL 전환

스키마는 SQLite 전용 기능(enum·Json 등)을 쓰지 않아 그대로 옮겨집니다.

1. `prisma/schema.prisma` 의 datasource 를 수정

   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```

2. `.env` 의 `DATABASE_URL="postgresql://user:password@host:5432/salesportal?schema=public"`
3. `npx prisma generate && npx prisma db push` (운영은 `prisma migrate dev` 로 마이그레이션 이력을 만들어 `migrate deploy` 로 배포 권장)
4. 시연 데이터가 필요하면 `npm run db:seed`

참고: 검색은 Prisma `contains` 를 쓰는데 SQLite는 대소문자를 구분하지 않고 PostgreSQL은 구분합니다. 전환 시 검색 조건에 `mode: "insensitive"` 를 추가하세요.
이 PoC는 PostgreSQL에서 실제로 돌려 보지는 않았습니다.

## 7. PoC 범위와 한계

**제외한 것(요구사항)**: SAP 실시간 연동, 결재 워크플로, 다국어, 모바일 앱, 이메일 발송

**알고 있는 한계**

- 칸반 드래그는 마우스(PC) 기준입니다. 태블릿 터치에서는 상세 화면의 단계 표시줄로 단계를 바꿀 수 있습니다.
- 대시보드 집계는 해당 연도 실적을 읽어 서버 메모리에서 계산합니다. 현재 규모(연 수천 행)에서는 충분하지만 데이터가 커지면 SQL 집계나 집계 테이블이 필요합니다.
- 담당자 실적은 *현재* 고객 담당자를 기준으로 계산하므로, 담당자를 바꾸면 과거 실적도 새 담당자에게 넘어갑니다.
- 고객 한 곳에 담당 영업은 1명입니다(여러 사업과 거래하는 고객의 사업별 담당자 분리는 미지원).
- `npm audit` 에 `xlsx`(npm 배포판 0.18.5)와 Next.js 14 관련 경고가 남아 있습니다. 아래 과제 참고.

## 8. 정식 도입 시 남은 과제

| 구분 | 과제 |
|---|---|
| 인증·보안 | 시연용 로그인 제거, Entra ID 그룹 → 역할 자동 매핑(선택), 세션 만료·감사 정책 확정, 보안 점검(모의해킹), 개인정보(고객 담당자 연락처) 처리 방침 |
| 라이브러리 | `xlsx` 를 SheetJS 공식 배포본(최신)으로 교체하거나 서버 측 파싱으로 전환, Next.js 최신 보안 패치 버전 적용 |
| 데이터 | PostgreSQL 전환·백업·마이그레이션 체계, 기존 엑셀(고객·기회) 이관, 고객/제품 마스터를 SAP 기준으로 정합화 |
| SAP 연동 | 엑셀 업로드를 배치(일/월) 인터페이스로 대체할지 결정, 매출 취소·반품(음수) 처리 규칙, 고객코드 매핑 규칙 |
| 실적 귀속 | 실적 발생 시점의 담당자 고정(스냅숏), 사업별 담당자 분리, 조직 개편 이력 |
| 환율 | 사내 기준환율(월평균/월말) 확정, 자동 수신 여부 |
| 업무 기능 | 견적·계약 문서 첨부(SharePoint 연계), 알림(Teams/메일), 결재 연계, 단가 이력, 목표 버전 관리(수정 이력) |
| 운영 | 배포 환경(Azure App Service 등)·모니터링·로그 보관, 감사 로그 보존 기간, 테스트 자동화, 사용자 교육 |
| 성능 | 목록 페이지네이션(현재 실적 300건·활동/감사 로그 1,000건까지 화면 표시), 집계 쿼리 최적화 |
