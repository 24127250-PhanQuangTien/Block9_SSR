const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { safeURL, cookieFlags } = require("./helpers/authEvidence");

test("resend cooldown uses public budgets, survives reload and respects longer limits without reading accounts", async () =>
{
  const { resendCooldown } = require("../src/services/resendCooldown");
  const { policy } = require("../src/config/authPolicy");
  const now = new Date("2026-11-06T00:00:00Z");
  const email = "cooldown@example.test";
  const rows = new Map();
  const db = {
    rateLimit: {
      async findUnique({ where })
      {
        return rows.get(where.key) || null;
      },
    },
  };
  assert.equal(await resendCooldown(db, "test-ip", email, now), 0);
  const minute = { count: 1, windowStart: new Date(+now - 15000), lockedUntil: null };
  rows.set(`resend:minute:${email}`, minute);
  assert.equal(await resendCooldown(db, "test-ip", email, now), 45000);
  assert.equal(await resendCooldown(db, "test-ip", email, new Date(+now + 5000)), 40000);
  assert.equal(await resendCooldown(db, "test-ip", email, new Date(+now + 45000)), 0);
  assert.deepEqual(minute, { count: 1, windowStart: new Date(+now - 15000), lockedUntil: null });
  rows.set(`resend:hour:${email}`, { count: policy.resendLimit, windowStart: new Date(+now - 1000), lockedUntil: null });
  assert.equal(await resendCooldown(db, "test-ip", email, now), policy.resendWindow - 1000);
  rows.clear();
  rows.set("activate-resend:ip:test-ip", { count: policy.activationLimit, windowStart: now, lockedUntil: null });
  assert.equal(await resendCooldown(db, "test-ip", email, now), policy.loginWindow);
  assert.equal(await resendCooldown(db, "test-ip", "absent@example.test", now), policy.loginWindow);
});

test("mail diagnostics identify authentication/network/TLS failures without copying provider secrets", () =>
{
  const { mailDiagnostic } = require("../src/services/mailDiagnostics");
  const secret = "fixture-secret-never-publish";
  for (const sample of [
    { code: "EAUTH", responseCode: 535, expected: "authentication" },
    { code: "ETIMEDOUT", expected: "connection" },
    { code: "ENOTFOUND", expected: "connection" },
    { code: "CERT_HAS_EXPIRED", expected: "tls" },
    { code: secret, responseCode: secret, expected: "other" },
  ])
  {
    const diagnostic = mailDiagnostic({ ...sample, message: secret, response: secret, command: secret, user: secret, pass: secret });
    assert.equal(diagnostic.category, sample.expected);
    assert.equal(JSON.stringify(diagnostic).includes(secret), false);
    assert.equal(diagnostic.responseCode, sample.code === "EAUTH" ? 535 : null);
  }
  assert.equal(mailDiagnostic(null).category, "other");
});

test("browser-only without browser refuses to report a zero-check PASS before connecting to DB", () =>
{
  const { spawnSync } = require("node:child_process");
  const result = spawnSync(process.execPath, ["tests/auth.integration.js", "--browser-only"],
  {
    cwd: require("node:path").resolve(__dirname, ".."),
    env: { ...process.env, DATABASE_URL: "invalid-unused-fixture" },
    encoding: "utf8",
    timeout: 5000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /BROWSER_FLAG_REQUIRED/);
  assert.equal(result.stdout, "");
});

test("production mail cannot create an Ethereal mailbox when SMTP is missing", () => {
  const script = `require('./src/services/mail').transport().then(()=>process.exit(2),error=>{if(!error.message.includes('SMTP_HOST'))process.exit(3);process.stdout.write('REFUSED');});`;
  const result = execFileSync(process.execPath, ["-e", script], { cwd: require("node:path").resolve(__dirname, ".."), env: { ...process.env, NODE_ENV: "production", SMTP_HOST: "", SMTP_USER: "", SMTP_PASS: "" }, encoding: "utf8", timeout: 5000 });
  assert.equal(result, "REFUSED");
});
test("public evidence removes credential query values and cookie contents", () => {
  const fake = "fixture-secret-never-publish";
  const url = safeURL(`/reset?token=${fake}&_csrf=${fake}&page=2`, "http://localhost:3108");
  assert.equal(url.includes(fake), false); assert.match(url, /page=2/);
  const flags = cookieFlags(`sid=${fake}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=Thu, 01 Jan 2037 00:00:00 GMT`);
  assert.equal(JSON.stringify(flags).includes(fake), false);
  assert.equal(flags.httpOnly, true); assert.equal(flags.secure, true); assert.equal(flags.sameSite, "Lax"); assert.equal(flags.path, "/"); assert.equal(flags.domainSet, false);
});
test("no-referrer reset allows only same-origin metadata plus valid CSRF, never arbitrary null origins", () => {
  const { csrf } = require("../src/middleware/csrf");
  const token = require("../src/services/crypto").random();
  for (const sample of [
    { path: "/reset", origin: "null", site: "same-origin", token, allowed: true },
    { path: "/reset", origin: "null", site: "cross-site", token, allowed: false },
    { path: "/reset", origin: "null", site: "same-site", token, allowed: false },
    { path: "/reset", origin: "null", token, allowed: false },
    { path: "/login", origin: "null", site: "same-origin", token, allowed: false },
    { path: "/reset", origin: "https://other.invalid", site: "same-origin", token, allowed: false },
    { path: "/reset", origin: "null", site: "same-origin", token: "wrong", allowed: false },
  ]) {
    let allowed = false, status;
    const req = { method: "POST", path: sample.path, session: { csrf: token }, body: { _csrf: sample.token }, get(name) { return name === "Origin" ? sample.origin : name === "Sec-Fetch-Site" ? sample.site : undefined; } };
    const res = { status(value) { status = value; return this; }, render() {} };
    csrf({ origin: "http://localhost:3108" })(req, res, () => { allowed = true; });
    assert.equal(allowed, sample.allowed); if (!sample.allowed) assert.equal(status, 403);
  }
});
