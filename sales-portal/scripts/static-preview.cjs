/* 정적 미리보기 생성기
 * 실제 앱(next start)을 역할별로 로그인해 돌아다니며 화면을 HTML 로 저장한다. → preview-out/
 * 결과물은 서버·DB 없이 열리는 조회 전용 화면이다(저장·드래그·필터·차트 클릭은 동작하지 않음).
 * 사용: npm run build && node scripts/static-preview.cjs
 */
const { chromium } = require("playwright");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PREVIEW_PORT || 3210);
const BASE = `http://localhost:${PORT}`;
const OUT = path.resolve("preview-out");
const ROLES = [
  { key: "r-admin", email: "admin@salesportal.example", label: "관리자", desc: "전사 조회 · 관리 메뉴 전체" },
  { key: "r-head", email: "head.api@salesportal.example", label: "사업부장 (API)", desc: "API 사업부 전체 조회·수정 · 목표 설정" },
  { key: "r-sales", email: "chem1@salesportal.example", label: "영업담당 (케미컬)", desc: "케미컬 조회 · 본인 담당만 수정" },
];
const CONCURRENCY = 6;

const norm = (href) => {
  const u = new URL(href, BASE);
  const q = [...u.searchParams].filter(([, v]) => v !== "").sort((a, b) => (a[0] + a[1] < b[0] + b[1] ? -1 : 1));
  return u.pathname + (q.length ? "?" + q.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&") : "");
};
const fileFor = (role, url) => {
  const u = new URL(url, BASE);
  const p = u.pathname === "/" ? "/index" : u.pathname;
  const qs = [...u.searchParams].map(([k, v]) => `${k}-${v}`).join("_").replace(/[^A-Za-z0-9_.-]/g, "_");
  return `/${role}${p}${qs ? "~" + qs : ""}.html`;
};
const isDetail = (p) => /^\/(customers|opportunities)\/[^/]+$/.test(p);
const skip = (p) => p.startsWith("/api") || p.startsWith("/login") || p.startsWith("/samples") || p.startsWith("/_next");

async function waitServer() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(BASE + "/login")).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("서버가 뜨지 않았습니다.");
}

/** 화면 상태(선택값·입력값)를 속성으로 굳힌 뒤 HTML 을 꺼낸다 */
async function snapshot(page) {
  return page.evaluate(() => {
    document.querySelectorAll("select").forEach((s) => [...s.options].forEach((o) => (o.selected ? o.setAttribute("selected", "") : o.removeAttribute("selected"))));
    document.querySelectorAll("input").forEach((i) => {
      if (i.type === "checkbox" || i.type === "radio") i.checked ? i.setAttribute("checked", "") : i.removeAttribute("checked");
      else if (i.type !== "file" && i.type !== "hidden") i.setAttribute("value", i.value);
    });
    document.querySelectorAll("script, link[rel=preload], link[rel=modulepreload], next-route-announcer").forEach((e) => e.remove());
    const hrefs = [...document.querySelectorAll("a[href^='/']")].map((a) => a.getAttribute("href"));
    return { html: "<!DOCTYPE html>" + document.documentElement.outerHTML, hrefs };
  });
}

async function crawlRole(browser, role) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const first = await ctx.newPage();
  await first.goto(BASE + "/login");
  await first.fill("input[type=email]", role.email);
  await first.click("button[type=submit]");
  await first.waitForURL(BASE + "/");
  await first.close();

  const pages = new Map(); // url → html
  const queue = ["/"];
  const seen = new Set(queue);
  const add = (from, href) => {
    let url;
    try { url = norm(href); } catch { return; }
    const u = new URL(url, BASE);
    if (skip(u.pathname) || seen.has(url)) return;
    if (u.search) {
      // 조건이 붙은 목록은 주요 화면에서 연결된 것만 뜬다(상세 화면의 검색 링크까지 따라가면 끝이 없다)
      const f = new URL(from, BASE);
      const light = ["/opportunities", "/targets"].includes(u.pathname) && [...u.searchParams.keys()].every((k) => ["view", "business", "year"].includes(k));
      if (!(light || (!f.search && !isDetail(f.pathname)))) return;
    }
    seen.add(url);
    queue.push(url);
  };
  const worker = async () => {
    const page = await ctx.newPage();
    for (;;) {
      const url = queue.shift();
      if (url === undefined) {
        if (busy === 0) break;
        await new Promise((r) => setTimeout(r, 100));
        continue;
      }
      busy++;
      try {
        const res = await page.goto(BASE + url, { waitUntil: "load" });
        if (res && res.status() === 200 && new URL(page.url()).pathname === new URL(url, BASE).pathname) {
          // 차트(Recharts)는 브라우저에서 그려지므로 잠깐 기다린다
          if (await page.locator(".recharts-responsive-container").count()) await page.waitForSelector(".recharts-surface", { timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(150);
          const { html, hrefs } = await snapshot(page);
          pages.set(url, html);
          hrefs.forEach((h) => add(url, h));
        }
      } catch (e) {
        console.warn(`  ! ${role.key} ${url}: ${String(e.message).split("\n")[0]}`);
      }
      busy--;
    }
    await page.close();
  };
  let busy = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await ctx.close();
  return pages;
}

const BAR_CSS = `
#pv-bar{position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:9999;display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:center;max-width:calc(100vw - 24px);background:#0f172a;color:#e2e8f0;border-radius:999px;padding:6px 8px 6px 14px;font-size:12px;box-shadow:0 6px 24px rgba(15,23,42,.35)}
#pv-bar b{color:#fff}#pv-bar a{color:#cbd5e1;border:1px solid #475569;border-radius:999px;padding:3px 10px;text-decoration:none;white-space:nowrap}
#pv-bar a.on{background:#fff;color:#0f172a;border-color:#fff;font-weight:600}
#pv-toast{position:fixed;left:50%;bottom:64px;transform:translateX(-50%);z-index:9999;background:#1e293b;color:#fff;border-radius:8px;padding:8px 14px;font-size:13px;opacity:0;transition:opacity .2s;pointer-events:none}
#pv-toast.show{opacity:1}body{padding-bottom:56px}`;
const BAR_JS = `
(function(){var t=document.getElementById('pv-toast'),h;function toast(m){t.textContent=m;t.className='show';clearTimeout(h);h=setTimeout(function(){t.className=''},2200)}
var MSG='정적 미리보기에서는 동작하지 않습니다 (조회 전용)';
document.addEventListener('click',function(e){var b=e.target.closest('button');if(b){if(b.textContent.indexOf('로그아웃')>=0){location.href='/';return}e.preventDefault();toast(MSG);return}
var a=e.target.closest('a[href="#"]');if(a){e.preventDefault();toast('이 조건의 목록은 미리보기에 포함되지 않았습니다')}},true);
document.addEventListener('submit',function(e){e.preventDefault();toast(MSG)},true);
document.addEventListener('change',function(e){if(e.target.matches('input[type=checkbox],select,input[type=file]'))toast(MSG)},true);
document.addEventListener('dragstart',function(e){e.preventDefault();toast(MSG)},true);})();`;

function finalize(role, url, html, crawled) {
  // 내부 링크를 저장된 파일 경로로 바꾼다. 뜨지 않은 조건부 목록은 조건 없는 화면으로, 그것도 없으면 '#'
  html = html.replace(/href="(\/[^"]*)"/g, (m, raw) => {
    const href = raw.replace(/&amp;/g, "&");
    if (href.startsWith("/_next/")) return m;
    if (href.startsWith("/samples/")) return m;
    let url2;
    try { url2 = norm(href); } catch { return m; }
    if (crawled.has(url2)) return `href="${fileFor(role.key, url2)}"`;
    const p = new URL(url2, BASE).pathname;
    return crawled.has(p) ? `href="${fileFor(role.key, p)}"` : 'href="#"';
  });
  const bar = `<style>${BAR_CSS}</style><div id="pv-toast"></div><div id="pv-bar"><span><b>정적 미리보기</b> · 조회 전용</span>${ROLES.map((r) => `<a href="/${r.key}/index.html" class="${r.key === role.key ? "on" : ""}">${r.label}</a>`).join("")}</div><script>${BAR_JS}</script>`;
  return html.replace("</body>", bar + "</body>");
}

function landing(counts, css) {
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>영업포탈 — 정적 미리보기</title><meta name="robots" content="noindex">${css}</head>
<body><main class="flex min-h-screen items-center justify-center bg-slate-100 p-4"><div class="w-full max-w-3xl overflow-hidden rounded-xl border bg-white shadow-lg md:grid md:grid-cols-5">
<div class="flex flex-col justify-between bg-primary p-8 text-primary-foreground md:col-span-2"><div><div class="text-2xl font-bold">영업포탈</div><p class="mt-2 text-sm opacity-80">케미컬 · API · CDMO<br>영업 파이프라인과 실적을 한 곳에서</p></div>
<div class="mt-8 flex gap-1.5"><span class="h-1.5 w-8 rounded-full bg-chem"></span><span class="h-1.5 w-8 rounded-full bg-api"></span><span class="h-1.5 w-8 rounded-full bg-cdmo"></span></div></div>
<div class="space-y-4 p-8 md:col-span-3"><div><h1 class="text-lg font-semibold">정적 미리보기</h1><p class="text-sm text-muted-foreground">역할을 고르면 그 역할로 로그인했을 때의 화면을 볼 수 있습니다.</p></div>
${ROLES.map((r) => `<a href="/${r.key}/index.html" class="block rounded-lg border p-4 hover:bg-slate-50"><div class="font-semibold">${r.label}</div><div class="text-xs text-muted-foreground">${r.desc} · 화면 ${counts[r.key]}개</div></a>`).join("")}
<p class="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">실제 앱의 화면을 그대로 저장한 <b>조회 전용</b> 버전입니다. 모든 데이터는 가상이며, 등록·수정·칸반 드래그·필터·엑셀 업로드/다운로드·차트 클릭은 동작하지 않습니다. 전체 기능은 저장소의 <code>sales-portal</code> 을 <code>npm install &amp;&amp; npm run dev</code> 로 실행해 확인하세요.</p>
</div></div></main></body></html>`;
}

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const server = spawn("npx", ["next", "start", "-p", String(PORT)], { env: { ...process.env, NEXTAUTH_URL: BASE }, stdio: "ignore", detached: true });
  let code = 0;
  try {
    await waitServer();
    const browser = await chromium.launch();
    const counts = {};
    let cssTags = "";
    for (const role of ROLES) {
      const pages = await crawlRole(browser, role);
      const crawled = new Set(pages.keys());
      for (const [url, html] of pages) {
        const file = path.join(OUT, fileFor(role.key, url));
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, finalize(role, url, html, crawled));
      }
      counts[role.key] = pages.size;
      cssTags ||= (pages.get("/").match(/<link[^>]+rel="stylesheet"[^>]*>/g) || []).join("");
      console.log(`[preview] ${role.label}: ${pages.size} 화면`);
      if (pages.size < 10) throw new Error(`${role.label} 화면이 너무 적습니다. 로그인/시드 상태를 확인하세요.`);
    }
    await browser.close();
    fs.cpSync(".next/static/css", path.join(OUT, "_next/static/css"), { recursive: true });
    if (fs.existsSync("public/samples")) fs.cpSync("public/samples", path.join(OUT, "samples"), { recursive: true });
    fs.writeFileSync(path.join(OUT, "index.html"), landing(counts, cssTags));
    fs.writeFileSync(path.join(OUT, "robots.txt"), "User-agent: *\nDisallow: /\n");
  } catch (e) {
    console.error(e);
    code = 1;
  } finally {
    try { process.kill(-server.pid); } catch {}
  }
  process.exit(code);
})();
