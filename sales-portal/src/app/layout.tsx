import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "영업포탈", description: "B2B 영업 파이프라인·실적 관리 포탈 (PoC)" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
