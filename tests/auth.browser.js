// Invoked only by the isolated integration harness (--browser).
// Credentials, inbox contents and browser cookie values remain in RAM.
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const { safeURL, databaseSnapshot } = require("./helpers/authEvidence");

module.exports = async function run({ db, base, password, policy, security, message, inbox, clearLimits, startServer, stopServer, evidence, browser }) {
  const report = { data: "Real Chrome + real HTTP/Prisma/PostgreSQL in isolated test schema; local SMTP", startedAt: new Date().toISOString(), chrome: browser.version(), checks: [], screenshots: [], network: [] };
  async function submit(page, action, values) {
    const form = page.locator(`form[action="${action}"]`).first();
    for (const [name, value] of Object.entries(values))
    {
      const field = form.locator(`[name="${name}"]`);
      if (await field.getAttribute("type") === "hidden")
      {
        assert.equal(await field.inputValue(), value);
      }
      else
      {
        await field.fill(value);
      }
    }
    await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded" }), form.locator('button[type="submit"]').click()]);
  }
  async function photo(page, label) {
    await page.screenshot({ path: path.join(evidence, label + ".png"), fullPage: true, animations: "disabled", mask: [page.locator("input, .auth-captcha [role=img], .auth-account__email, .auth-activation-email")] });
    report.screenshots.push(label + ".png");
  }
  async function noOverflow(page) {
    const sizes = await page.evaluate(() => ({ viewport: innerWidth, doc: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
    assert.ok(sizes.doc <= sizes.viewport + 1 && sizes.body <= sizes.viewport + 1, "Document horizontal overflow");
  }
  for (const width of [1440, 375]) for (const javaScriptEnabled of [true, false]) {
    await clearLimits();
    const label = `auth-${width}-${javaScriptEnabled ? "js" : "nojs"}`;
    const email = label + "@example.test";
    const context = await browser.newContext({ viewport: { width, height: 900 }, javaScriptEnabled, reducedMotion: "reduce" });
    const page = await context.newPage();
    let step = "anonymous access and register";
    try {
      await context.route("**/*", route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
      page.on("response", response => {
        if (response.request().isNavigationRequest()) {
          const headers = response.request().headers();
          report.network.push({ case: label, method: response.request().method(), url: safeURL(response.url(), base), status: response.status(), origin: headers.origin || null, fetchSite: headers["sec-fetch-site"] || null });
        }
      });
      const publicMenu = await context.request.get(base + "/dishes?pageSize=10&page=1", { maxRedirects: 0 });
      assert.equal(publicMenu.status(), 200);
      for (const area of ["/admin/dishes", "/admin/chefs", "/admin/ingredients"]) {
        const denied = await context.request.get(base + area, { maxRedirects: 0 });
        assert.equal(denied.status(), 303); assert.equal(denied.headers().location, "/login");
      }
      await page.goto(base + "/register"); await noOverflow(page); await photo(page, label + "-register");
      const challengeId = await page.locator('[name="challengeId"]').inputValue();
      const challenge = await db.captchaChallenge.findUnique({ where: { id: challengeId } });
      const mailBefore = inbox.length;
      await submit(page, "/register", { email, password, captcha: challenge.answer });
      assert.equal(new URL(page.url()).pathname, "/activate");
      assert.equal(await page.locator('input[type="email"]').count(), 0);
      assert.equal(await page.locator('.auth-activation-email').textContent().then(value => value.includes(email)), true);
      const user = await db.user.findUnique({ where: { email } }); assert.equal(user.status, "pending"); assert.equal(user.role, "viewer");
      let activationMail = await message(email, mailBefore, body => body.includes("Mã kích hoạt:"));
      step = "resend cooldown initial disabled state";
      const resendForm = page.locator('[data-resend-form]');
      const resendButton = resendForm.locator('[data-resend-button]');
      assert.equal(await resendButton.isDisabled(), true);
      const firstWait = Number(await resendForm.getAttribute("data-resend-wait-ms"));
      assert.ok(firstWait > 0 && firstWait <= policy.resendDelay);
      if (javaScriptEnabled)
      {
        const firstLabel = await resendForm.locator('[data-resend-countdown]').textContent();
        await page.waitForFunction(label => document.querySelector('[data-resend-countdown]').textContent !== label, firstLabel);
      }
      step = "resend cooldown after reload";
      await page.reload();
      assert.equal(await resendButton.isDisabled(), true);
      assert.ok(Number(await resendForm.getAttribute("data-resend-wait-ms")) <= firstWait);
      const resendCsrf = await resendForm.locator('[name="_csrf"]').inputValue();
      step = "resend cooldown direct POST guard";
      const tooEarly = await context.request.post(base + "/activate/resend", { form: { _csrf: resendCsrf, email }, headers: { Origin: base }, maxRedirects: 0 });
      assert.equal(tooEarly.status(), 429);
      assert.ok(Number(tooEarly.headers()["retry-after"]) > 0);
      // Age only test metadata to exercise expiry without waiting a real minute.
      await db.activationChallenge.update({ where: { userId: user.id }, data: { lastSentAt: new Date(Date.now() - policy.resendDelay - 1000) } });
      await db.rateLimit.update({ where: { key: `resend:minute:${email}` }, data: { windowStart: new Date(Date.now() - policy.resendDelay + 2500) } });
      step = "resend cooldown expiry";
      await page.reload();
      if (javaScriptEnabled)
      {
        await page.waitForFunction(() => !document.querySelector('[data-resend-button]').disabled);
      }
      else
      {
        await new Promise(resolve => setTimeout(resolve, 2600));
        await page.reload();
        assert.equal(await resendButton.isDisabled(), false);
      }
      const resentMailBefore = inbox.length;
      step = "resend cooldown native POST";
      await submit(page, "/activate/resend", { email });
      assert.equal(new URL(page.url()).pathname, "/activate");
      assert.equal(await resendButton.isDisabled(), true);
      activationMail = await message(email, resentMailBefore, body => body.includes("Mã kích hoạt:"));
      await noOverflow(page);
      await photo(page, label + "-resend-cooldown");
      step = "pending login and OTP activation";
      const otp = activationMail.match(/Mã kích hoạt:\s*(\d{6})/)[1];
      await page.goto(base + "/login");
      await submit(page, "/login", { email, password });
      assert.equal(await page.locator('[data-error-code="ACTIVATION_REQUIRED"]').count(), 1);
      await photo(page, label + "-pending-login");
      await page.goto(base + "/activate");
      await submit(page, "/activate", { email, otp: otp === "000000" ? "999999" : "000000" });
      assert.equal(await page.locator('[data-error-code="INVALID_OTP"]').count(), 1);
      await noOverflow(page); await photo(page, label + "-otp-invalid");
      await submit(page, "/activate", { email, otp });
      assert.equal(new URL(page.url()).pathname, "/login");
      const active = await db.user.findUnique({ where: { email } }); assert.equal(active.status, "active"); assert.ok(active.emailVerifiedAt);
      assert.equal(await db.session.count({ where: { userId: user.id } }), 0);
      const anonymousSid = (await context.cookies()).find(cookie => cookie.name === "sid")?.value;
      step = "keyboard login";
      await noOverflow(page); await photo(page, label + "-activated-login");
      // Keyboard navigation with visible focus; Enter submits a native form.
      let focused = false;
      for (let i = 0; i < 30; i++) {
        await page.keyboard.press("Tab");
        focused = await page.locator('#email').evaluate(element => element === document.activeElement);
        if (focused) break;
      }
      assert.ok(focused, "Email is reachable by Tab");
      const focusVisible = await page.locator('#email').evaluate(element => { const style = getComputedStyle(element); return (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) || style.boxShadow !== "none"; });
      assert.ok(focusVisible, "Keyboard focus must be visible");
      await page.locator('#email').fill(email); await page.locator('#password').fill(password);
      await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded" }), page.locator('#password').press("Enter")]);
      assert.equal(new URL(page.url()).pathname, "/dishes");
      const authenticatedCookie = (await context.cookies()).find(cookie => cookie.name === "sid");
      assert.notEqual(authenticatedCookie.value, anonymousSid); assert.equal(authenticatedCookie.httpOnly, true); assert.equal(authenticatedCookie.sameSite, "Lax");
      step = "authenticated pagination and history";
      for (const route of ["/dishes", "/admin/dishes"]) {
        await page.goto(base + route);
        const form = page.locator('form[method="GET"]');
        await form.locator('[name="q"]').fill("Phở");
        await form.locator('[name="pageSize"]').selectOption("10");
        if (route.startsWith("/admin")) {
          await form.locator('[name="category"]').selectOption("Món thử");
          await form.locator('[name="status"]').selectOption("available");
          await form.locator('[name="sort"]').selectOption("name");
        }
        await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded" }), form.locator('button[type="submit"]').click()]);
        assert.equal(new URL(page.url()).searchParams.get("page"), "1");
        assert.match(await page.locator("body").innerText(), /Tổng kết quả:\s*31/);
        const firstURL = page.url();
        await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded" }), page.locator('a[aria-label="Trang 2"]').click()]);
        const secondURL = page.url(); const query = new URL(secondURL).searchParams;
        assert.equal(query.get("page"), "2"); assert.equal(query.get("q"), "Phở"); assert.equal(query.get("pageSize"), "10");
        if (route.startsWith("/admin")) { assert.equal(query.get("sort"), "name"); assert.equal(query.get("status"), "available"); assert.equal(query.get("category"), "Món thử"); }
        assert.equal(await page.locator('[aria-current="page"]').innerText(), "2");
        await page.goBack(); assert.equal(page.url(), firstURL); assert.equal(await form.locator('[name="q"]').inputValue(), "Phở");
        await page.goForward(); assert.equal(page.url(), secondURL); assert.equal(await page.locator('[aria-current="page"]').innerText(), "2");
        await noOverflow(page); await photo(page, label + (route.startsWith("/admin") ? "-admin-pagination" : "-dishes-pagination"));
        await form.locator('[name="pageSize"]').selectOption("20");
        await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded" }), form.locator('button[type="submit"]').click()]);
        assert.equal(new URL(page.url()).searchParams.get("page"), "1"); assert.equal(new URL(page.url()).searchParams.get("pageSize"), "20");
        assert.ok(await page.locator('.pagination [aria-disabled="true"]').count() > 0);
        assert.equal(await page.locator('.pagination a[aria-disabled="true"]').count(), 0);
      }
      if (width === 1440 && javaScriptEnabled) {
        step = "session after restart";
        await stopServer(); await startServer();
        await page.goto(base + "/dishes"); assert.equal(new URL(page.url()).pathname, "/dishes");
        await photo(page, label + "-session-after-restart");
      }
      const csrfDenied = await context.request.post(base + "/admin/dishes", { form: {}, maxRedirects: 0 });
      step = "CSRF and logout";
      assert.equal(csrfDenied.status(), 403);
      await submit(page, "/logout", {}); assert.equal(new URL(page.url()).pathname, "/login");
      const revoked = await context.request.get(base + "/admin/dishes", { headers: { Cookie: "sid=" + authenticatedCookie.value }, maxRedirects: 0 });
      assert.equal(revoked.status(), 303);
      await submit(page, "/login", { email, password });
      const preResetSid = (await context.cookies()).find(cookie => cookie.name === "sid")?.value;
      step = "forgot and reset form";
      await page.goto(base + "/forgot"); await photo(page, label + "-forgot");
      const resetMailBefore = inbox.length;
      await submit(page, "/forgot", { email }); assert.equal(new URL(page.url()).pathname, "/forgot/sent");
      await photo(page, label + "-forgot-sent");
      const resetMail = await message(email, resetMailBefore, body => body.includes("/reset?token="));
      const raw = resetMail.match(/\/reset\?token=([A-Za-z0-9_-]+)/)[1];
      await page.goto(base + "/reset?token=" + raw);
      assert.equal((await db.passwordReset.findUnique({ where: { tokenHash: security.tokenHash(raw) } })).usedAt, null);
      await noOverflow(page); await photo(page, label + "-reset-form");
      const changed = "Changed8-" + security.random(18);
      step = "native reset POST and session revocation";
      await submit(page, "/reset", { password: changed }); assert.equal(new URL(page.url()).pathname, "/login");
      await photo(page, label + "-reset-success-login");
      assert.equal(await db.session.count({ where: { userId: user.id } }), 0);
      const oldSession = await context.request.get(base + "/admin/dishes", { headers: { Cookie: "sid=" + preResetSid }, maxRedirects: 0 }); assert.equal(oldSession.status(), 303);
      await page.goto(base + "/reset?token=" + raw); assert.equal(await page.locator('[data-error-code="INVALID_RESET"]').count(), 1);
      await photo(page, label + "-reset-used");
      report.checks.push({ name: label, status: "PASS", width, javaScriptEnabled, nativeForms: true, resendCooldown: true, sidRotated: true, smtpOTPReceived: true, smtpResetReceived: true, keyboardTabFocusEnter: true, paginationBothLists: true, history: true, csrf403: true, logoutAndResetRevokeSession: true, cookies: [{ name: "sid", value: "[REDACTED]", httpOnly: authenticatedCookie.httpOnly, sameSite: authenticatedCookie.sameSite, secure: authenticatedCookie.secure, path: authenticatedCookie.path }] });
    } catch (error) {
      // Playwright errors can include input values/URLs. Never print their message.
      if (step.startsWith("resend cooldown"))
      {
        report.resendFailure = await page.locator('[data-resend-form]').evaluate(form => ({
          renderedWaitMs: Number(form.dataset.resendWaitMs),
          buttonDisabled: form.querySelector('[data-resend-button]').disabled,
          countdownSeconds: Number(form.querySelector('[data-resend-countdown]').textContent.replace(/\D/g, "")),
        })).catch(() => null);
        report.resendFailureEmailMatches = await page.locator('[data-resend-form] [name="email"]').inputValue().then(value => value === email).catch(() => false);
        report.resendFailureComputedWait = await require("../src/services/resendCooldown").resendCooldown(db, "", email);
        const budget = await db.rateLimit.findUnique({ where: { key: `resend:minute:${email}` } });
        report.resendFailureBudget = budget ? { count: budget.count, windowStart: budget.windowStart, observedAt: new Date() } : null;
      }
      report.checks.push({ name: label, status: "FAIL", step, kind: error.name, details: "withheld to protect credentials, OTP and tokens" });
      await photo(page, label + "-failure").catch(() => {});
      await fs.writeFile(path.join(evidence, "browser-results.json"), JSON.stringify(report, null, 2));
      throw Object.assign(new Error("ISOLATED_BROWSER_CHECK_FAILED"), { name: "BrowserAcceptanceError" });
    } finally { await context.close(); }
  }
  report.database = await databaseSnapshot(db); report.completedAt = new Date().toISOString(); report.status = "PASS";
  await fs.writeFile(path.join(evidence, "browser-results.json"), JSON.stringify(report, null, 2) + "\n");
  return { status: report.status, checks: report.checks.length, screenshots: report.screenshots.length, chrome: report.chrome };
};
