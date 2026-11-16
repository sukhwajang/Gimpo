import { PrismaClient } from "@prisma/client";
import { PrismaD1 } from "@prisma/adapter-d1";

type D1 = ConstructorParameters<typeof PrismaD1>[0];
const g = globalThis as unknown as { prisma?: PrismaClient; d1Clients?: WeakMap<object, PrismaClient> };

/** Cloudflare Workers 에서 실행 중이면 요청에 묶인 D1 바인딩을 돌려준다. (OpenNext 가 넣어 주는 컨텍스트) */
function d1Binding(): D1 | undefined {
  const ctx = (globalThis as unknown as Record<symbol, { env?: { DB?: D1 } } | undefined>)[Symbol.for("__cloudflare-context__")];
  return ctx?.env?.DB;
}

function client(): PrismaClient {
  const db = d1Binding();
  if (db) {
    // Cloudflare: D1 어댑터 사용 (바인딩별로 클라이언트 재사용)
    g.d1Clients ??= new WeakMap();
    let c = g.d1Clients.get(db as object);
    if (!c) {
      c = new PrismaClient({ adapter: new PrismaD1(db) });
      g.d1Clients.set(db as object, c);
    }
    return c;
  }
  // 로컬/일반 서버: DATABASE_URL (SQLite 또는 PostgreSQL)
  g.prisma ??= new PrismaClient();
  return g.prisma;
}

/** 어느 환경에서든 `prisma.user.findMany()` 처럼 그대로 쓸 수 있는 프록시 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_t, prop) {
    const c = client();
    const v = (c as unknown as Record<string | symbol, unknown>)[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(c) : v;
  },
});
