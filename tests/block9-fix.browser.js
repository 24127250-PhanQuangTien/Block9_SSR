// Run with the server already started. Uses the isolated Playwright tool package,
// never an application dependency. Credentials and MFA values stay in memory.
require("dotenv").config();
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || path.join(os.tmpdir(), "ssr-pagination-playwright/node_modules/playwright"));
const { authenticator } = require("otplib");
const { PrismaClient } = require("@prisma/client");
const signature = require("cookie-signature");
const { configuration } = require("../src/config/authPolicy");

const base = process.env.APP_BASE_URL || "http://localhost:3000";
const db = new PrismaClient();
const evidenceDir = path.resolve("docs/evidence/block9-fix");

function safeUrl(raw) {
  const url = new URL(raw, base);
  return url.pathname;
}

function cookieFlags(headers) {
  const value = headers["set-cookie"];
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list.filter(cookie => /(?:^|;)\s*sid=/i.test(cookie)).map(cookie => ({
    name: "sid",
    value: "[REDACTED]",
    httpOnly: /;\s*HttpOnly/i.test(cookie),
    secure: /;\s*Secure/i.test(cookie),
    sameSite: cookie.match(/;\s*SameSite=([^;]+)/i)?.[1] || null,
    path: cookie.match(/;\s*Path=([^;]+)/i)?.[1] || null,
  }));
}

async function sessionState(page, userId) {
  const signed = (await page.context().cookies(base)).find(cookie => cookie.name === "sid")?.value;
  assert.ok(signed, "browser session cookie was not set");
  const raw = decodeURIComponent(signed);
  const sid = raw.startsWith("s:") ? signature.unsign(raw.slice(2), configuration().secret) : null;
  let row = sid ? await db.session.findUnique({ where: { sid }, select: { data: true } }) : null;
  if (!row) {
    const rows = await db.session.findMany({ orderBy: { expiresAt: "desc" }, select: { data: true } });
    row = rows.find(candidate => { try { const data = JSON.parse(candidate.data); return data.userId === userId || data.mfaPending?.userId === userId; } catch { return false; } }) || null;
  }
  const session = row ? (() => { try { return JSON.parse(row.data); } catch { return {}; } })() : {};
  return {
    hasUserId: !!session.userId,
    hasMfaPending: !!session.mfaPending,
  };
}

async function submit(page, action, values) {
  const form = page.locator(`form[action="${action}"]`).first();
  for (const [name, value] of Object.entries(values)) await form.locator(`[name="${name}"]`).fill(value);
  await Promise.all([
    page.waitForResponse(response => response.url() === base + action && response.request().method() === "POST"),
    form.locator("button").click(),
  ]);
  await page.waitForLoadState("networkidle");
}

async function main() {
  await fs.mkdir(evidenceDir, { recursive: true });
  const email = process.env.SEED_VIEWER_EMAIL;
  const password = process.env.SEED_VIEWER_PASSWORD;
  assert.ok(email && password, "seed viewer credentials are required");
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() }, select: { id: true, mfaEnabled: true } });
  assert.ok(user, "seed viewer account was not found");
  assert.equal(user.mfaEnabled, false, "seed viewer MFA must be disabled before this acceptance run");

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, javaScriptEnabled: true });
  const page = await context.newPage();
  const network = [];
  let setupCacheControl = "";
  page.on("request", request => {
    if (request.isNavigationRequest()) network.push({ method: request.method(), url: safeUrl(request.url()), cookieSent: !!request.headers().cookie });
  });
  page.on("response", response => {
    if (response.request().isNavigationRequest()) {
      if (safeUrl(response.url()) === "/account/security/setup" && response.status() === 200) setupCacheControl = response.headers()["cache-control"] || "";
      network.push({ method: response.request().method(), url: safeUrl(response.url()), status: response.status(), location: response.headers().location || null, setCookie: cookieFlags(response.headers()) });
    }
  });

  const checks = [];
  const debug = {};
  let step = "start";
  const screenshot = async (name, maskExtra = []) => {
    await page.screenshot({ path: path.join(evidenceDir, name), fullPage: true, animations: "disabled", mask: [page.locator("input, code, [aria-label*=QR], .auth-account__email"), ...maskExtra] });
  };
  try {
    // A: real browser geometry at all required desktop widths and responsive width.
    step = "A-open-menu";
    await page.goto(base + "/dishes", { waitUntil: "networkidle" });
    await page.addStyleTag({ content: ".search-form--paginated{align-items:center!important}.search-form--paginated .page-size-field{justify-content:normal!important}.search-form--paginated .search-input,.search-form--paginated .page-size-field select,.search-form--paginated>.btn{height:auto!important}" });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await screenshot("menu-search-before-1920.png");
    await page.reload({ waitUntil: "networkidle" });
    const geometry = {};
    for (const width of [1920, 1366, 1024]) {
      await page.setViewportSize({ width, height: 1080 });
      geometry[width] = await page.evaluate(() => {
        const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height }; };
        return { input: rect(".search-input"), select: rect(".page-size-field select"), button: rect(".search-form--paginated > button"), label: rect(".page-size-field label") };
      });
    }
    for (const width of [1920, 1366, 1024]) {
      const current = geometry[width];
      assert.ok(Math.abs(current.input.bottom - current.select.bottom) <= 1 && Math.abs(current.select.bottom - current.button.bottom) <= 1, `search bottoms at ${width}`);
      assert.ok(Math.abs(current.input.height - current.select.height) <= 1 && Math.abs(current.select.height - current.button.height) <= 1, `search heights at ${width}`);
      assert.ok(current.label.bottom <= current.select.top, `page-size label at ${width}`);
    }
    await page.setViewportSize({ width: 640, height: 900 });
    const mobile = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth <= innerWidth + 1, direction: getComputedStyle(document.querySelector(".search-form--paginated")).flexDirection }));
    assert.equal(mobile.overflow, true); assert.equal(mobile.direction, "column");
    await page.setViewportSize({ width: 1920, height: 1080 });
    await screenshot("menu-search-after-1920.png");
    checks.push({ name: "A-public-menu-search-layout", status: "PASS", geometry, mobile });

    // B: login -> security -> setup, with request/cookie/session evidence.
    step = "B-login";
    await page.goto(base + "/login", { waitUntil: "domcontentloaded" });
    await submit(page, "/login", { email, password });
    assert.equal(new URL(page.url()).pathname, "/dishes");
    step = "B-security";
    await page.goto(base + "/account/security", { waitUntil: "domcontentloaded" });
    assert.match(await page.locator("body").innerText(), /MFA/);
    const setupForm = page.locator('form[action="/account/security/setup"]');
    step = "B-begin-setup";
    await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded" }), setupForm.locator("button").click()]);
    assert.equal(new URL(page.url()).pathname, "/account/security/setup");
    assert.equal(await page.locator("svg").count() > 0, true);
    step = "B-read-setup";
    const secret = await page.locator("code").first().innerText();
    debug.setupCodeLength = secret.length;
    assert.ok(secret.length >= 16);
    debug.setupCacheControl = setupCacheControl;
    assert.match(setupCacheControl, /no-store/i);
    const setupState = await sessionState(page, user.id); debug.setupState = setupState; assert.equal(setupState.hasUserId, true); assert.equal(setupState.hasMfaPending, false);

    step = "B-wrong-code";
    await submit(page, "/account/security/setup/confirm", { code: "000000" });
    assert.equal(new URL(page.url()).pathname, "/account/security/setup/confirm");
    assert.match(await page.locator("body").innerText(), /không hợp lệ|không thể hoàn tất/i);
    assert.equal(await page.locator("svg").count() > 0, true);
    const wrongCode = await db.user.findUnique({ where: { id: user.id }, select: { mfaEnabled: true } });
    assert.equal(wrongCode.mfaEnabled, false);

    step = "B-valid-setup-code";
    const validCode = authenticator.generate(secret);
    await submit(page, "/account/security/setup/confirm", { code: validCode });
    assert.equal(await page.locator("li code").count(), 10);
    const enabled = await db.user.findUnique({ where: { id: user.id }, select: { mfaEnabled: true } });
    assert.equal(enabled.mfaEnabled, true);
    step = "B-recovery-to-security";
    await page.goto(base + "/account/security", { waitUntil: "domcontentloaded" });
    assert.match(await page.locator("body").innerText(), /MFA.*bật/i);

    step = "B-logout";
    await submit(page, "/logout", {});
    step = "B-login-with-mfa";
    await page.goto(base + "/login", { waitUntil: "domcontentloaded" });
    await submit(page, "/login", { email, password });
    await page.waitForURL(base + "/mfa", { timeout: 30000 });
    assert.equal(new URL(page.url()).pathname, "/mfa");
    step = "B-pending-state";
    const pendingState = await sessionState(page, user.id); debug.pendingState = pendingState; assert.equal(pendingState.hasMfaPending, true); assert.equal(pendingState.hasUserId, false);
    step = "B-admin-denied";
    await page.goto(base + "/admin", { waitUntil: "domcontentloaded" });
    assert.equal(new URL(page.url()).pathname, "/login");
    await page.goto(base + "/mfa", { waitUntil: "domcontentloaded" });
    step = "B-complete-mfa";
    await new Promise(resolve => setTimeout(resolve, 31000));
    await submit(page, "/mfa", { code: authenticator.generate(secret) });
    await page.waitForURL(base + "/dishes", { timeout: 30000 });
    assert.equal(new URL(page.url()).pathname, "/dishes");
    step = "B-admin-allowed";
    await page.goto(base + "/admin", { waitUntil: "domcontentloaded" });
    assert.equal(new URL(page.url()).pathname, "/admin/dishes");
    checks.push({ name: "B-mfa-setup-login-pending-verification", status: "PASS", setupSession: setupState, pendingSession: pendingState, networkEvents: network.length });

    // Cleanup through the normal protected flow; this is not part of the acceptance sequence.
    step = "B-cleanup";
    await new Promise(resolve => setTimeout(resolve, 31000));
    await page.goto(base + "/account/security", { waitUntil: "domcontentloaded" });
    await submit(page, "/account/security/disable", { password, code: authenticator.generate(secret) });
    const cleaned = await db.user.findUnique({ where: { id: user.id }, select: { mfaEnabled: true } });
    assert.equal(cleaned.mfaEnabled, false);
    await fs.writeFile(path.join(evidenceDir, "block9-fix-browser-results.json"), JSON.stringify({ status: "PASS", checks, network: network.map(entry => ({ ...entry, cookieSent: entry.cookieSent || undefined })), secrets: "withheld", otp: "withheld", recoveryCodes: "withheld" }, null, 2) + "\n");
    console.log(JSON.stringify({ status: "PASS", checks: checks.map(check => check.name), evidence: "docs/evidence/block9-fix/block9-fix-browser-results.json" }));
  } catch (error) {
    await fs.writeFile(path.join(evidenceDir, "block9-fix-browser-results.json"), JSON.stringify({ status: "FAIL", step, error: error.name, details: "withheld", debug, network, secrets: "withheld" }, null, 2) + "\n");
    throw error;
  } finally {
    await context.close(); await browser.close(); await db.$disconnect();
  }
}

main().catch(() => { console.error("Block9 fix browser acceptance failed; details withheld."); process.exitCode = 1; });
