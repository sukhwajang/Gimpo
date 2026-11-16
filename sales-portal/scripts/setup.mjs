// npm run dev / build 전에 자동 실행: .env 생성 → 스키마 반영 → (비어 있으면) 시드
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";

if (!existsSync(".env")) {
  const env = readFileSync(".env.example", "utf8").replace(
    'NEXTAUTH_SECRET="change-me"',
    `NEXTAUTH_SECRET="${randomBytes(32).toString("hex")}"`
  );
  writeFileSync(".env", env);
  console.log("[setup] .env 파일을 생성했습니다.");
}
const run = (cmd) => execSync(cmd, { stdio: "inherit" });
if (!existsSync("node_modules/.prisma/client/index.js")) run("npx prisma generate");
run("npx prisma db push --skip-generate");
run("npx tsx --env-file=.env prisma/seed.ts");
