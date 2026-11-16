export const BUSINESSES = ["CHEM", "API", "CDMO"] as const;
export type Business = (typeof BUSINESSES)[number];

export const BUSINESS_LABEL: Record<string, string> = { CHEM: "케미컬", API: "API", CDMO: "CDMO" };
export const BUSINESS_COLOR: Record<string, string> = { CHEM: "#2563eb", API: "#059669", CDMO: "#7c3aed" };
export const BUSINESS_BADGE: Record<string, string> = {
  CHEM: "bg-blue-50 text-blue-700 border-blue-200",
  API: "bg-emerald-50 text-emerald-700 border-emerald-200",
  CDMO: "bg-violet-50 text-violet-700 border-violet-200",
};
export const BUSINESS_BAR: Record<string, string> = { CHEM: "bg-chem", API: "bg-api", CDMO: "bg-cdmo" };

export const ROLES = ["SALES", "HEAD", "EXEC", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABEL: Record<string, string> = { SALES: "영업담당", HEAD: "사업부장", EXEC: "경영진", ADMIN: "관리자" };

export const CURRENCIES = ["KRW", "USD", "EUR"] as const;
export const GRADES = ["A", "B", "C"] as const;

export const LOST_REASONS = ["PRICE", "QUALITY", "SCHEDULE", "COMPETITOR", "OTHER"] as const;
export const LOST_REASON_LABEL: Record<string, string> = {
  PRICE: "가격", QUALITY: "품질", SCHEDULE: "일정", COMPETITOR: "경쟁사", OTHER: "기타",
};

export const ACTIVITY_TYPES = ["MEETING", "EMAIL", "CALL", "SAMPLE", "DOCUMENT"] as const;
export const ACTIVITY_LABEL: Record<string, string> = {
  MEETING: "미팅", EMAIL: "메일", CALL: "통화", SAMPLE: "샘플 발송", DOCUMENT: "문서 제공",
};

export const API_DOC_TYPES = ["CoA", "DMF", "CEP", "MSDS", "GMP Certificate", "Stability Data", "TSE/BSE Statement"];
export const CDMO_MILESTONES = ["계약 체결", "기술이전 착수", "기술이전 완료", "첫 생산(Engineering Batch)", "PPQ 완료"];

export const STAGE_TYPE_LABEL: Record<string, string> = { OPEN: "진행", WON: "수주", LOST: "실패" };

export const COUNTRIES = [
  "대한민국", "미국", "독일", "일본", "중국", "인도", "스위스", "프랑스", "이탈리아", "스페인",
  "영국", "네덜란드", "벨기에", "브라질", "멕시코", "베트남", "태국", "인도네시아", "튀르키예", "캐나다", "호주", "싱가포르",
];

export const SALES_COLUMNS = ["매출일자", "사업구분", "고객코드", "고객명", "제품코드", "제품명", "수량", "단위", "금액", "통화"] as const;
