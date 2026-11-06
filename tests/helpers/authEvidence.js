// Evidence is an allowlist projection. Never persist request bodies, raw HTML,
// HAR/trace/storageState, cookie values, hashes, challenges or email messages.
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

function safeURL(value, base) {
  const url = new URL(value, base);
  for (const key of [...url.searchParams.keys()]) {
    if (/token|otp|captcha|csrf|challenge|email|password/i.test(key)) url.searchParams.set(key, "[REDACTED]");
  }
  return url.pathname + url.search;
}
function cookieFlags(header) {
  return { name: "sid", value: "[REDACTED]", httpOnly: /;\s*HttpOnly/i.test(header), secure: /;\s*Secure/i.test(header), sameSite: header.match(/;\s*SameSite=([^;]+)/i)?.[1] || null, path: header.match(/;\s*Path=([^;]+)/i)?.[1] || null, domainSet: /;\s*Domain=/i.test(header), expiresSet: /;\s*Expires=/i.test(header) };
}
async function databaseSnapshot(db) {
  const [users, activations, resets, sessions, counters, dishes, chefs, ingredients] = await Promise.all([
    db.user.findMany({ select: { status: true, role: true, emailVerifiedAt: true, passwordHash: true }, take: 50 }),
    db.activationChallenge.findMany({ select: { attempts: true, lockedUntil: true, expiresAt: true, usedAt: true, sendCount: true, otpHash: true }, take: 50 }),
    db.passwordReset.findMany({ select: { expiresAt: true, usedAt: true, tokenHash: true }, take: 50 }),
    db.session.findMany({ select: { userId: true, expiresAt: true }, take: 50 }),
    db.rateLimit.findMany({ select: { key: true, count: true, windowStart: true, lockedUntil: true }, take: 50 }),
    db.dish.count(), db.chef.count(), db.ingredient.count(),
  ]);
  return {
    source: "Prisma reads from the isolated real PostgreSQL test schema; up to 50 auth rows per table",
    users: users.map(row => ({ status: row.status, role: row.role, verified: !!row.emailVerifiedAt, passwordAlgorithm: row.passwordHash.startsWith("$argon2id$") ? "Argon2id" : "unexpected", passwordHash: "[REDACTED]" })),
    activations: activations.map(({ otpHash, ...row }) => ({ ...row, otpHashStored: !!otpHash, otpHash: "[REDACTED]" })),
    resets: resets.map(({ tokenHash, ...row }) => ({ ...row, tokenHashStored: !!tokenHash, tokenHash: "[REDACTED]" })),
    sessions: sessions.map(row => ({ authenticated: !!row.userId, expiresAt: row.expiresAt, sid: "[REDACTED]", userId: "[REDACTED]" })),
    counters: counters.map(({ key, ...row }) => ({ key: key.split(":").slice(0, 2).join(":") + ":[REDACTED]", ...row })),
    crudCounts: { dishes, chefs, ingredients },
  };
}
const escape = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
function panelHTML({ name, requests, cookies, snapshot, ui }) {
  return `<!doctype html><html lang="vi"><meta charset="utf-8"><title>Block8 — bằng chứng đã che</title>
  <style>body{font:16px system-ui;line-height:1.5;margin:24px;color:#182235}h1{font-size:24px}h2{font-size:20px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f1f4f8;padding:16px;border-radius:8px;font-size:13px}img{max-width:100%;border:1px solid #ccd}a{color:#1453a3}</style>
  <h1>${escape(name)}</h1><p>Dữ liệu thật trong schema kiểm thử riêng. Không dùng mock bảo mật. Bí mật đã che.</p>
  <p>Đây là báo cáo quan sát thu bằng Playwright/HTTP/Prisma, <strong>không phải ảnh giao diện DevTools</strong>. Ảnh UI là trạng thái quan sát cuối nhóm; bảng Network giữ các request kiểm chứng trong nhóm.</p>
  ${ui ? `<h2>Ảnh UI thật</h2><a href="${escape(ui)}">Mở ảnh UI</a>` : ""}
  <h2>Network — status, redirect, Set-Cookie đã che</h2><pre>${escape(JSON.stringify(requests, null, 2))}</pre>
  <h2>Application / Cookies — thuộc tính quan sát từ browser context</h2><pre>${escape(JSON.stringify(cookies, null, 2))}</pre>
  <h2>Database — snapshot Prisma, hash và định danh đã che</h2><pre>${escape(JSON.stringify(snapshot, null, 2))}</pre></html>`;
}
async function startBrowserEvidence({ base, evidence }) {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || path.join(os.tmpdir(), "ssr-pagination-playwright/node_modules/playwright"));
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  await fs.mkdir(evidence, { recursive: true });
  const entries = [];
  return {
    browser,
    async capture({ name, snapshot, requests, observation }) {
      const label = "group-" + String(entries.length + 1).padStart(2, "0");
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });
      try {
        await context.route("**/*", route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
        if (observation?.cookie?.startsWith("sid=")) await context.addCookies([{ name: "sid", value: observation.cookie.slice(4), url: base }]);
        const page = await context.newPage();
        const browserNetwork = [];
        page.on("response", response => {
          if (response.request().isNavigationRequest()) browserNetwork.push({ method: response.request().method(), url: safeURL(response.url(), base), status: response.status(), source: "real browser navigation" });
        });
        const requested = new URL(observation?.route || "/login", base);
        let route = requested.pathname === "/activate/resend" ? "/activate" : requested.pathname === "/logout" ? "/login" : requested.pathname;
        if (observation?.method === "GET") route += requested.search;
        await page.goto(base + route, { waitUntil: "networkidle" });
        const ui = label + "-ui.png";
        await page.screenshot({ path: path.join(evidence, ui), fullPage: true, mask: [page.locator("input, .auth-captcha [role=img], .auth-account__email, .auth-activation-email")] });
        const cookies = (await context.cookies()).map(({ name: cookieName, httpOnly, secure, sameSite, path: cookiePath, expires }) => ({ name: cookieName, value: "[REDACTED]", httpOnly, secure, sameSite, path: cookiePath, expires }));
        const html = panelHTML({ name, snapshot, requests: [...requests, ...browserNetwork], cookies, ui });
        await fs.writeFile(path.join(evidence, label + ".html"), html);
        // Render only the already-redacted evidence document, never raw payloads.
        await page.setContent(html, { waitUntil: "load" });
        await page.screenshot({ path: path.join(evidence, label + "-network-cookies-db.png"), fullPage: true });
        entries.push({ name, ui, evidence: label + ".html", screenshot: label + "-network-cookies-db.png" });
        return entries.at(-1);
      } finally { await context.close(); }
    },
    async close() {
      await fs.writeFile(path.join(evidence, "index.html"), `<!doctype html><html lang="vi"><meta charset="utf-8"><title>Bằng chứng Block8</title><h1>Block8 — server/DB/browser thật trong schema test</h1><p>Không có cookie/password/OTP/token/đáp án CAPTCHA trong báo cáo. Bảng Network/Cookies/DB là dữ liệu quan sát đã che, không giả làm ảnh DevTools. Không phải dữ liệu nhà hàng production.</p><ol>${entries.map(entry => `<li><a href="${escape(entry.evidence)}">${escape(entry.name)}</a> · <a href="${escape(entry.ui)}">UI</a> · <a href="${escape(entry.screenshot)}">Network/Cookies/DB</a></li>`).join("")}</ol></html>`);
      await browser.close();
    },
  };
}
module.exports = { safeURL, cookieFlags, databaseSnapshot, startBrowserEvidence };
