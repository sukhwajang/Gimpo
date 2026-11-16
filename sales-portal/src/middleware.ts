export { default } from "next-auth/middleware";

export const config = {
  // 로그인 화면, 인증 API, 정적 파일을 제외한 모든 경로는 로그인 필요
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)"],
};
