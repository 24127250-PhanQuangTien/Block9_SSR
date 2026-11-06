// Real Prisma + real server processes + Argon2 + DB sessions + local SMTP.
// All writes are confined to a fresh random PostgreSQL schema, never the app schema.
// No security middleware is replaced or disabled. Credentials/messages stay in RAM.
if (process.argv.includes("--browser-only") && !process.argv.includes("--browser"))
{
  console.error("BROWSER_FLAG_REQUIRED: dùng --browser cùng --browser-only; chưa chạy kiểm thử.");
  process.exit(1);
}
require("dotenv").config();
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { randomBytes, randomUUID } = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const net = require("node:net");
const fs = require("node:fs/promises");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");
const argon2 = require("argon2");
const security = require("../src/services/crypto");
const { policy } = require("../src/config/authPolicy");
const schema = "auth_test_" + randomBytes(12).toString("hex");
let database;
try { database = new URL(process.env.DATABASE_URL); }
catch { console.error("DATABASE_URL không hợp lệ; cấu hình được giữ kín, chưa chạy kiểm thử."); process.exit(1); }
database.searchParams.set("schema", schema);
// Keep the test runner and both app processes within the remote test DB pool.
database.searchParams.set("connection_limit", "2");
const testPort = process.env.AUTH_TEST_PORT || "3108";
if (!/^[1-9][0-9]{3,4}$/.test(testPort) || Number(testPort) > 65535) throw new Error("INVALID_TEST_PORT");
const testEnv = { ...process.env, DATABASE_URL: database.toString(), PORT: testPort, APP_BASE_URL: `http://localhost:${testPort}`, APP_ORIGIN: `http://localhost:${testPort}`, TRUST_PROXY: "false", NODE_ENV: "test", SESSION_SECRET: security.random(48), OTP_PEPPER: security.random(48), SMTP_HOST: "127.0.0.1", SMTP_USER: "", SMTP_PASS: "", SMTP_FROM: "Auth Test <no-reply@example.test>" };
const db = new PrismaClient({ datasourceUrl: database.toString() });
const base = testEnv.APP_BASE_URL;
const browserOnly = process.argv.includes("--browser-only");
const evidence = path.resolve(process.env.AUTH_EVIDENCE_DIR || (browserOnly ? "docs/evidence/auth-browser-final" : "docs/evidence/auth-final"));
const results = { startedAt: new Date().toISOString(), database: "real isolated PostgreSQL schema", securityMocks: false, checks: [], requests: [], writesToApplicationSchema: 0 };
const inbox = [];
let child, smtp, stage = "setup", created = false;
const serverProcesses = new Set();
const password = "Auth8-" + security.random(18);
let account, pending, pendingOTP;
let lastObservation, browserEvidence;
const { safeURL, cookieFlags, databaseSnapshot } = require("./helpers/authEvidence");

function cli(args) {
  const result = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", ...args], { env: testEnv, encoding: "utf8", timeout: 120000 });
  if (result.status !== 0) {
    const code = ((result.stdout || "") + (result.stderr || "")).match(/\bP\d{4}\b/)?.[0];
    throw Object.assign(new Error("ISOLATED_MIGRATION_FAILED"), { code });
  }
}
async function check(name, work) {
  if (browserOnly) return;
  stage = name;
  const firstRequest = results.requests.length;
  await work();
  const snapshot = await databaseSnapshot(db);
  const record = { name, status: "PASS", database: snapshot, requestRange: [firstRequest, results.requests.length] };
  if (browserEvidence) record.artifacts = await browserEvidence.capture({ name, snapshot, requests: results.requests.slice(firstRequest), observation: lastObservation });
  results.checks.push(record);
  console.log(JSON.stringify({ check: name, status: "PASS" }));
}
function decode(value) { return value.replace(/&amp;/g, "&").replace(/&#34;|&quot;/g, '"').replace(/&#39;/g, "'"); }
const hidden = (html, name) => decode(html.match(new RegExp(`name="${name}" value="([^"]*)"`))?.[1] || "");
function assertWriteForms(html) {
  const forms = [...html.matchAll(/<form\b[^>]*method="POST"[^>]*>[\s\S]*?<\/form>/g)];
  assert.ok(forms.length > 0);
  for (const [form] of forms) assert.ok(hidden(form, "_csrf"), "Every POST form must carry its own CSRF token");
}
class Client {
  constructor(requestBase = base)
  {
    this.requestBase = requestBase;
    this.cookie = "";
    this.csrf = "";
  }
  async request(route, values, options = {}) {
    const method = options.method || (values === undefined ? "GET" : "POST");
    const payload = values === undefined ? undefined : { ...(options.noCsrf ? {} : { _csrf: this.csrf }), ...values };
    const response = await fetch(this.requestBase + route, { method, redirect: "manual", signal: AbortSignal.timeout(30000),
      headers: { Accept: "text/html", ...(this.cookie ? { Cookie: this.cookie } : {}), ...(method === "POST" ? { Origin: base } : {}), ...options.headers },
      ...(payload ? { body: new URLSearchParams(payload) } : {}) });
    const cookies = response.headers.getSetCookie();
    for (const item of cookies) if (item.startsWith("sid=")) this.cookie = item.split(";")[0];
    const html = await response.text();
    const token = hidden(html, "_csrf");
    if (token) this.csrf = token;
    results.requests.push({ check: stage, ...(this.requestBase === base ? {} : { instance: "secondary" }), method, url: safeURL(route, base), status: response.status, location: response.headers.get("location") ? safeURL(response.headers.get("location"), base) : null, setCookie: cookies.filter(item => item.startsWith("sid=")).map(cookieFlags) });
    lastObservation = { cookie: this.cookie, route, method };
    return { status: response.status, location: response.headers.get("location"), html, cookies, referrer: response.headers.get("referrer-policy"), retryAfter: response.headers.get("retry-after") };
  }
  get(route) { return this.request(route); }
  post(route, values, options) { return this.request(route, values, options); }
  async login(email = account.email, secret = password) {
    await this.get("/login");
    const response = await this.post("/login", { email, password: secret });
    if (response.status === 303) await this.get("/dishes");
    return response;
  }
}
const sessionId = cookie => decodeURIComponent(cookie.slice(4)).slice(2).split(".")[0];
async function capFrom(response) {
  const id = hidden(response.html, "challengeId");
  assert.ok(id, "Server must issue a challenge");
  const challenge = await db.captchaChallenge.findUnique({ where: { id } });
  assert.ok(challenge);
  assert.equal(response.html.includes(`value="${challenge.answer}"`), false);
  return { challengeId: id, captcha: challenge.answer };
}
async function register(client, email, extra = {}) {
  const form = await client.get("/register");
  const captcha = await capFrom(form);
  return client.post("/register", { ...captcha, captcha: captcha.captcha.toUpperCase(), email, password, ...extra });
}
function bodyOf(raw) {
  const body = raw.slice(raw.indexOf("\r\n\r\n") + 4).replace(/=\r\n/g, "").replace(/=([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  return Buffer.from(body, "binary").toString("utf8");
}
async function message(email, after = 0, predicate = () => true) {
  for (let i = 0; i < 100; i++) {
    const found = inbox.slice(after).find(item => item.to.toLowerCase().includes(email.toLowerCase()) && predicate(bodyOf(item.raw)));
    if (found) return bodyOf(found.raw);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("SMTP_MESSAGE_NOT_RECEIVED");
}
async function clearLimits() { await db.rateLimit.deleteMany(); }
async function launchServer(env, requestBase)
{
  const server = spawn(process.execPath, ["src/server.js"], { env, stdio: "ignore" });
  serverProcesses.add(server);
  for (let i = 0; i < 100; i++)
  {
    if (server.exitCode !== null) throw new Error("TEST_SERVER_EXITED");
    try
    {
      const response = await fetch(requestBase + "/login", { redirect: "manual", signal: AbortSignal.timeout(2000) });
      if (response.status === 200) return server;
    }
    catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("TEST_SERVER_START_TIMEOUT");
}
async function startServer()
{
  child = await launchServer(testEnv, base);
}
async function stopProcess(server)
{
  if (server && server.exitCode === null)
  {
    const ended = once(server, "exit");
    server.kill();
    await ended;
  }
  serverProcesses.delete(server);
}
async function stopServer() {
  await stopProcess(child);
  child = null;
}

async function main() {
  // Never accidentally target somebody else's server already bound to 3108.
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", () => reject(new Error("ISOLATED_TEST_PORT_IN_USE")));
    probe.listen(Number(testPort), () => probe.close(resolve));
  });
  assert.match(schema, /^auth_test_[a-f0-9]{24}$/);
  // A failed migration can already have created part of the isolated schema.
  created = true;
  cli(["migrate", "deploy"]);
  smtp = net.createServer(socket => {
    socket.setEncoding("binary"); socket.write("220 localhost test SMTP\r\n");
    let buffered = "", data = false, recipient = "";
    socket.on("data", chunk => {
      buffered += chunk;
      for (;;) {
        if (data) {
          const end = buffered.indexOf("\r\n.\r\n"); if (end < 0) return;
          inbox.push({ to: recipient, raw: buffered.slice(0, end) }); buffered = buffered.slice(end + 5); data = false;
          socket.write("250 queued\r\n"); continue;
        }
        const end = buffered.indexOf("\r\n"); if (end < 0) return;
        const line = buffered.slice(0, end); buffered = buffered.slice(end + 2);
        if (/^(EHLO|HELO)/i.test(line)) socket.write("250-localhost\r\n250 8BITMIME\r\n");
        else if (/^RCPT TO:/i.test(line)) { recipient = line; socket.write("250 ok\r\n"); }
        else if (/^DATA/i.test(line)) { data = true; socket.write("354 send message\r\n"); }
        else if (/^QUIT/i.test(line)) { socket.end("221 bye\r\n"); return; }
        else socket.write("250 ok\r\n");
      }
    });
  });
  smtp.listen(0, "127.0.0.1"); await once(smtp, "listening"); testEnv.SMTP_PORT = String(smtp.address().port);
  account = await db.user.create({ data: { emailRaw: "active@example.test", email: "active@example.test", passwordHash: await security.hashPassword(password), status: "active", emailVerifiedAt: new Date() } });
  await startServer();
  if (process.argv.includes("--browser")) browserEvidence = await require("./helpers/authEvidence").startBrowserEvidence({ base, evidence });

  await check("mandatory secrets and cookie production policy", async () => {
    const { configuration } = require("../src/config/authPolicy");
    const { cookieOptions } = require("../src/middleware/requireLogin");
    assert.throws(() => configuration({}), /SESSION_SECRET/);
    assert.throws(() => configuration({ SESSION_SECRET: security.random() }), /OTP_PEPPER/);
    const options = cookieOptions({ production: true });
    assert.deepEqual(options, { httpOnly: true, sameSite: "lax", secure: true, path: "/" });
    assert.equal("domain" in options, false);
  });
  await check("public menu is readable while all unauthenticated admin CRUD requests redirect 303 before writes", async () => {
    const anonymous = new Client();
    for (const area of ["dishes", "chefs", "ingredients"]) {
      for (const suffix of ["", "/new", "/1/edit", "/1/delete", "/1"]) {
        const response = await anonymous.get(`/admin/${area}${suffix}`);
        assert.equal(response.status, 303); assert.equal(response.location, "/login");
      }
      for (const suffix of ["", "/1?_method=PATCH", "/1?_method=DELETE"]) {
        const response = await anonymous.post(`/admin/${area}${suffix}`, { name: "blocked" }, { noCsrf: true });
        assert.equal(response.status, 303); assert.equal(response.location, "/login");
      }
    }
    assert.equal((await anonymous.get("/admin")).status, 303);
    assert.equal((await anonymous.get("/")).location, "/dishes");
    const menu = await anonymous.get("/dishes?pageSize=10&page=1");
    assert.equal(menu.status, 200);
    assert.doesNotMatch(menu.html, /action="\/logout"/);
    assert.equal((await anonymous.get("/dishes/1")).status, 404);
    assert.deepEqual(await Promise.all([db.dish.count(), db.chef.count(), db.ingredient.count()]), [0, 0, 0]);
  });
  await check("CSRF and Origin reject public auth submissions", async () => {
    const client = new Client(); await client.get("/login");
    assert.equal((await client.post("/login", { email: account.email, password }, { noCsrf: true })).status, 403);
    assert.equal((await client.post("/login", { email: account.email, password }, { headers: { Origin: "https://other.invalid" } })).status, 403);
    assert.equal((await client.request("/login", { email: account.email }, { method: "PUT", noCsrf: true })).status, 403);
    assert.equal((await client.request("/unknown", {}, { method: "DELETE", noCsrf: true })).status, 403);
  });
  await check("register CAPTCHA missing/wrong/expired/reused/other-session/other-purpose is one-use and creates no account or mail", async () => {
    await clearLimits();
    const client = new Client(), other = new Client();
    const initialUsers = await db.user.count(), initialMail = inbox.length;
    let form = await client.get("/register"), cap = await capFrom(form);
    let response = await client.post("/register", { email: "missing@example.test", password });
    assert.match(response.html, /data-error-code="CAPTCHA_FAILED"/);
    assert.match((await client.post("/register", { challengeId: "malformed", captcha: "x", email: "malformed@example.test", password })).html, /CAPTCHA_FAILED/);
    response = await client.post("/register", { ...cap, captcha: "wrong", email: "wrong@example.test", password });
    assert.match(response.html, /data-error-code="CAPTCHA_FAILED"/);
    response = await client.post("/register", { ...cap, email: "reuse@example.test", password });
    assert.match(response.html, /data-error-code="CAPTCHA_FAILED"/);
    form = await client.get("/register"); cap = await capFrom(form);
    await db.captchaChallenge.update({ where: { id: cap.challengeId }, data: { expiresAt: new Date(Date.now() - 1) } });
    assert.match((await client.post("/register", { ...cap, email: "expired@example.test", password })).html, /CAPTCHA_FAILED/);
    cap = await capFrom(await client.get("/register")); await other.get("/register");
    assert.match((await other.post("/register", { ...cap, email: "session@example.test", password })).html, /CAPTCHA_FAILED/);
    await db.captchaChallenge.update({ where: { id: cap.challengeId }, data: { purpose: "login" } });
    assert.match((await client.post("/register", { ...cap, email: "purpose@example.test", password })).html, /CAPTCHA_FAILED/);
    assert.equal(await db.user.count(), initialUsers); assert.equal(inbox.length, initialMail);
  });
  await check("register normalization, role whitelist, Argon2id and pending password preservation", async () => {
    await clearLimits();
    const client = new Client(), email = "pending@example.test";
    const response = await register(client, " Pending@Example.Test ", { role: "admin" });
    assert.equal(response.status, 303); assert.equal(response.location, "/activate");
    pending = await db.user.findUnique({ where: { email } });
    assert.equal(pending.emailRaw, " Pending@Example.Test "); assert.equal(pending.role, "viewer"); assert.equal(pending.status, "pending");
    assert.ok(pending.passwordHash.startsWith("$argon2id$")); assert.ok(await argon2.verify(pending.passwordHash, password));
    pendingOTP = (await message(email)).match(/Mã kích hoạt:\s*(\d{6})/)[1];
    const oldHash = pending.passwordHash;
    assert.equal((await register(client, email, { password: "Another8" + security.random(12) })).status, 303);
    assert.equal((await db.user.findUnique({ where: { email } })).passwordHash, oldHash);
    const activeResponse = await register(client, account.email);
    assert.equal(activeResponse.status, 303); assert.equal(activeResponse.location, "/activate");
    assert.equal(await db.user.count(), 2);
  });
  await check("pending cannot login, OTP activation is atomic and does not auto-login", async () => {
    await clearLimits();
    const client = new Client();
    const login = await client.login(pending.email);
    assert.equal(login.status, 200); assert.match(login.html, /ACTIVATION_REQUIRED/);
    assert.equal(await db.session.count({ where: { userId: pending.id } }), 0);
    await client.get("/activate");
    const results = await Promise.all([client.post("/activate", { email: pending.email, otp: pendingOTP }), client.post("/activate", { email: pending.email, otp: pendingOTP })]);
    assert.equal(results.filter(result => result.status === 303).length, 1);
    assert.equal(results.filter(result => /INVALID_OTP/.test(result.html)).length, 1);
    const activated = await db.user.findUnique({ where: { id: pending.id } });
    assert.equal(activated.status, "active"); assert.ok(activated.emailVerifiedAt);
    assert.equal((await client.get("/admin/dishes")).status, 303);
    assert.match((await client.post("/activate", { email: pending.email, otp: pendingOTP })).html, /INVALID_OTP/);
    const otpAsPassword = new Client();
    assert.match((await otpAsPassword.login(pending.email, pendingOTP)).html, /INVALID_CREDENTIALS/);
  });
  await check("resent OTP rejects old code and accepts new code through HTTP", async () => {
    await clearLimits(); const client = new Client(), email = "resent-valid@example.test";
    await register(client, email);
    const user = await db.user.findUnique({ where: { email } });
    const oldCode = (await message(email)).match(/Mã kích hoạt:\s*(\d{6})/)[1];
    await db.activationChallenge.update({ where: { userId: user.id }, data: { lastSentAt: new Date(Date.now() - policy.resendDelay - 1) } });
    await db.rateLimit.update({ where: { key: `resend:minute:${email}` }, data: { windowStart: new Date(Date.now() - policy.resendDelay - 1) } });
    const after = inbox.length;
    assert.equal((await client.post("/activate/resend", { email })).status, 303);
    const newCode = (await message(email, after)).match(/Mã kích hoạt:\s*(\d{6})/)[1];
    assert.match((await client.post("/activate", { email, otp: oldCode })).html, /INVALID_OTP/);
    assert.equal((await client.post("/activate", { email, otp: newCode })).status, 303);
    assert.equal((await db.user.findUnique({ where: { id: user.id } })).status, "active");
  });
  await check("OTP resend cooldown, replacement, expiry, attempts and lock persist", async () => {
    await clearLimits();
    const client = new Client(), email = "resend@example.test";
    await register(client, email);
    const user = await db.user.findUnique({ where: { email } });
    const oldOTP = (await message(email)).match(/Mã kích hoạt:\s*(\d{6})/)[1];
    assert.equal((await client.post("/activate/resend", { email })).status, 429);
    const challenge = await db.activationChallenge.findUnique({ where: { userId: user.id } });
    await db.activationChallenge.update({ where: { id: challenge.id }, data: { attempts: 1, lastSentAt: new Date(Date.now() - policy.resendDelay - 1) } });
    await db.rateLimit.update({ where: { key: `resend:minute:${email}` }, data: { windowStart: new Date(Date.now() - policy.resendDelay - 1) } });
    const beforeMail = inbox.length;
    assert.equal((await client.post("/activate/resend", { email })).status, 303);
    const newOTP = (await message(email, beforeMail)).match(/Mã kích hoạt:\s*(\d{6})/)[1];
    const changed = await db.activationChallenge.findUnique({ where: { id: challenge.id } });
    assert.equal(changed.attempts, 1); assert.notEqual(changed.otpHash, challenge.otpHash);
    assert.match((await client.post("/activate", { email, otp: oldOTP })).html, /INVALID_OTP/);
    await db.activationChallenge.update({ where: { id: challenge.id }, data: { expiresAt: new Date(Date.now() - 1) } });
    assert.match((await client.post("/activate", { email, otp: newOTP })).html, /INVALID_OTP/);
    await db.activationChallenge.update({ where: { id: challenge.id }, data: { expiresAt: new Date(Date.now() + policy.otpTTL), attempts: 4 } });
    assert.equal((await client.post("/activate", { email, otp: "wrong" })).status, 429);
    assert.equal((await client.post("/activate", { email, otp: newOTP })).status, 429);
    const locked = await db.activationChallenge.findUnique({ where: { id: challenge.id } });
    assert.ok(locked.lockedUntil > new Date());
    await db.activationChallenge.update({ where: { id: challenge.id }, data: { lastSentAt: new Date(Date.now() - policy.resendDelay - 1) } });
    await db.rateLimit.update({ where: { key: `resend:minute:${email}` }, data: { windowStart: new Date(Date.now() - policy.resendDelay - 1) } });
    assert.equal((await client.post("/activate/resend", { email })).status, 303);
    const afterResend = await db.activationChallenge.findUnique({ where: { id: challenge.id } });
    assert.equal(afterResend.attempts, locked.attempts); assert.equal(+afterResend.lockedUntil, +locked.lockedUntil);
    await db.rateLimit.update({ where: { key: `resend:hour:${email}` }, data: { count: 5 } });
    await db.rateLimit.update({ where: { key: `resend:minute:${email}` }, data: { windowStart: new Date(Date.now() - policy.resendDelay - 1) } });
    assert.equal((await client.post("/activate/resend", { email })).status, 429);
  });
  await check("login generic errors, server CAPTCHA threshold, persistent 10-failure lock and cookie rotation", async () => {
    await clearLimits();
    const client = new Client(); await client.get("/login");
    const missing = await client.post("/login", { email: "unknown@example.test", password });
    const wrong = await client.post("/login", { email: account.email, password: "Wrong8" + security.random(12) });
    assert.match(missing.html, /Email hoặc mật khẩu không đúng/); assert.match(wrong.html, /Email hoặc mật khẩu không đúng/);
    for (let i = 0; i < 2; i++) await client.post("/login", { email: account.email, password: "Wrong8" + security.random(12) });
    let response = await client.post("/login", { email: account.email, password });
    assert.match(response.html, /CAPTCHA_FAILED/);
    assert.equal((await db.rateLimit.findUnique({ where: { key: `login:email:${account.email}` } })).count, 3);
    for (let failure = 4; failure <= 10; failure++) {
      const cap = await capFrom(response);
      response = await client.post("/login", { ...cap, email: account.email, password: "Wrong8" + security.random(12) });
      assert.equal((await db.rateLimit.findUnique({ where: { key: `login:email:${account.email}` } })).count, failure);
    }
    assert.equal(response.status, 429);
    const newBrowser = new Client(); await newBrowser.get("/login");
    assert.equal((await newBrowser.post("/login", { email: account.email, password })).status, 429);
    assert.equal(await db.session.count({ where: { userId: account.id } }), 0);
    await db.rateLimit.update({ where: { key: `login:email:${account.email}` }, data: { lockedUntil: new Date(Date.now() - 1) } });
    const before = client.cookie;
    const logged = await client.login();
    assert.equal(logged.status, 303); assert.equal(logged.location, "/dishes"); assert.notEqual(client.cookie, before);
    const cookie = logged.cookies.find(value => value.startsWith("sid="));
    assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Lax/); assert.match(cookie, /Path=\//); assert.doesNotMatch(cookie, /Domain=/);
    assert.equal(await db.rateLimit.findUnique({ where: { key: `login:email:${account.email}` } }), null);
    assert.ok((await db.rateLimit.findMany({ where: { key: { startsWith: "login:ip:" } } }))[0].count > 0);
  });
  await check("DB session survives real server restart; logout and stale store writes cannot revive sid", async () => {
    await clearLimits();
    const client = new Client(); assert.equal((await client.login()).status, 303);
    const cookie = client.cookie, sid = sessionId(cookie);
    const row = await db.session.findUnique({ where: { sid } }); assert.ok(row && row.userId === account.id);
    await stopServer(); await startServer();
    assert.equal((await client.get("/admin/dishes")).status, 200);
    assert.equal((await client.post("/logout", {}, { noCsrf: true })).status, 403);
    assert.equal((await client.post("/logout", {}, { headers: { Origin: "https://other.invalid" } })).status, 403);
    assert.equal((await client.post("/logout", {})).status, 303);
    assert.equal(await db.session.findUnique({ where: { sid } }), null);
    const { PrismaSessionStore } = require("../src/services/sessionStore");
    const store = new PrismaSessionStore(db);
    await new Promise((resolve, reject) => store.set(sid, JSON.parse(row.data), error => error ? reject(error) : resolve()));
    assert.equal(await db.session.findUnique({ where: { sid } }), null);
    const replay = new Client(); replay.cookie = cookie; assert.equal((await replay.get("/admin/dishes")).status, 303);
  });
  await check("idle, absolute expiry and inactive users are rejected server-side", async () => {
    await clearLimits();
    for (const field of ["createdAt", "lastSeenAt"]) {
      const client = new Client(); await client.login(); const sid = sessionId(client.cookie);
      const row = await db.session.findUnique({ where: { sid } }); const data = JSON.parse(row.data);
      data[field] = Date.now() - (field === "createdAt" ? policy.absolute : policy.idle) - 1;
      await db.session.update({ where: { sid }, data: { data: JSON.stringify(data), expiresAt: new Date(Date.now() + policy.idle) } });
      const publicMenu = await client.get("/dishes");
      assert.equal(publicMenu.status, 200);
      assert.doesNotMatch(publicMenu.html, /action="\/logout"/);
      assert.equal((await client.get("/admin/dishes")).status, 303);
    }
    const client = new Client(); await client.login();
    await db.user.update({ where: { id: account.id }, data: { status: "pending" } });
    assert.equal((await client.get("/admin/dishes")).status, 303);
    account = await db.user.update({ where: { id: account.id }, data: { status: "active" } });
  });
  await check("forgot generic response, canonical reset origin, single token and read-only GET reset", async () => {
    await clearLimits();
    const client = new Client(); await client.get("/forgot");
    const missing = await client.post("/forgot", { email: "noaccount@example.test" });
    const beforeMail = inbox.length;
    const known = await client.post("/forgot", { email: account.email }, { headers: { Host: "untrusted.invalid" } });
    assert.equal(missing.status, 303); assert.equal(known.status, 303); assert.equal(known.location, missing.location);
    assert.match((await client.get(known.location)).html, /Nếu email đã đăng ký, hướng dẫn đã được gửi/);
    const text = await message(account.email, beforeMail, value => value.includes("/reset?token="));
    const url = new URL(text.match(/https?:\/\/[^\s]+\/reset\?token=[A-Za-z0-9_-]+/)[0]);
    assert.equal(url.origin, base);
    const token = url.searchParams.get("token"); const tokenHash = security.tokenHash(token);
    const before = await db.passwordReset.findUnique({ where: { tokenHash } });
    assert.ok(before && before.tokenHash !== token && !before.usedAt);
    const page = await client.get(url.pathname + url.search);
    assert.equal(page.status, 200); assert.equal(page.referrer, "no-referrer");
    assert.deepEqual(await db.passwordReset.findUnique({ where: { tokenHash } }), before);
    await client.post("/forgot", { email: account.email });
    assert.ok((await db.passwordReset.findUnique({ where: { tokenHash } })).usedAt);
    assert.match((await client.get(url.pathname + url.search)).html, /INVALID_RESET/);
    for (let i = 0; i < 3; i++) await client.post("/forgot", { email: account.email });
    assert.equal((await client.post("/forgot", { email: account.email })).status, 429);
  });
  await check("reset is atomic, invalidates all sessions, cannot authenticate as token or activate pending", async () => {
    await clearLimits();
    const one = new Client(), two = new Client(); await one.login(); await two.login();
    const oldCookies = [one.cookie, two.cookie];
    const beforeMail = inbox.length; await one.get("/forgot"); await one.post("/forgot", { email: account.email });
    const text = await message(account.email, beforeMail, value => value.includes("/reset?token="));
    const token = text.match(/\/reset\?token=([A-Za-z0-9_-]+)/)[1];
    const tokenHash = security.tokenHash(token);
    await db.passwordReset.update({ where: { tokenHash }, data: { expiresAt: new Date(Date.now() - 1) } });
    assert.match((await one.get("/reset?token=" + token)).html, /INVALID_RESET/);
    assert.match((await one.post("/reset", { token, password: "weak" })).html, /INVALID_RESET/);
    await db.passwordReset.update({ where: { tokenHash }, data: { expiresAt: new Date(Date.now() + policy.resetTTL) } });
    await one.get("/reset?token=" + token);
    const newPassword = "Changed8" + security.random(18);
    const reset = await Promise.all([one.post("/reset", { token, password: newPassword }), one.post("/reset", { token, password: newPassword })]);
    assert.equal(reset.filter(response => response.status === 303).length, 1);
    assert.equal(reset.filter(response => /INVALID_RESET/.test(response.html)).length, 1);
    assert.equal(await db.session.count({ where: { userId: account.id } }), 0);
    for (const cookie of oldCookies) { const replay = new Client(); replay.cookie = cookie; assert.equal((await replay.get("/admin/dishes")).status, 303); }
    assert.ok(await argon2.verify((await db.user.findUnique({ where: { id: account.id } })).passwordHash, newPassword));
    const notification = await message(account.email, beforeMail, value => value.includes("Mật khẩu của bạn vừa được thay đổi"));
    assert.equal(notification.includes(newPassword), false);
    const client = new Client(); assert.equal((await client.login(account.email, token)).status, 200);
    assert.equal((await client.login(account.email, newPassword)).status, 303);
    await db.user.update({ where: { id: account.id }, data: { passwordHash: await security.hashPassword(password) } });
    const unverified = await db.user.create({ data: { emailRaw: "unverified@example.test", email: "unverified@example.test", passwordHash: await security.hashPassword(password) } });
    const pendingToken = security.random();
    await db.passwordReset.create({ data: { userId: unverified.id, tokenHash: security.tokenHash(pendingToken), expiresAt: new Date(Date.now() + policy.resetTTL) } });
    const anonymous = new Client(); await anonymous.get("/reset?token=" + pendingToken);
    assert.equal((await anonymous.post("/reset", { token: pendingToken, password: newPassword })).status, 303);
    assert.equal((await db.user.findUnique({ where: { id: unverified.id } })).status, "pending");
    assert.equal(await db.session.count({ where: { userId: unverified.id } }), 0);
  });
  await check("IP budgets are enforced independently of account and cookie", async () => {
    await clearLimits(); const client = new Client(); await client.get("/login");
    await client.post("/login", { email: "ip-probe@example.test", password });
    const loginIP = (await db.rateLimit.findMany({ where: { key: { startsWith: "login:ip:" } } }))[0].key;
    const ip = loginIP.slice("login:ip:".length);
    await db.rateLimit.update({ where: { key: loginIP }, data: { count: policy.loginIP } });
    assert.equal((await client.post("/login", { email: account.email, password })).status, 429);
    await clearLimits(); await client.get("/register");
    await db.rateLimit.create({ data: { key: `register:ip:${ip}`, count: policy.registerIP, windowStart: new Date() } });
    assert.equal((await client.post("/register", { email: "blocked@example.test", password })).status, 429);
    await clearLimits(); await client.get("/forgot");
    await db.rateLimit.create({ data: { key: `forgot:ip:${ip}`, count: policy.forgotIP, windowStart: new Date() } });
    assert.equal((await client.post("/forgot", { email: account.email })).status, 429);
    await clearLimits(); await client.get("/activate");
    await db.rateLimit.create({ data: { key: `activate:ip:${ip}`, count: policy.activationLimit, windowStart: new Date() } });
    assert.equal((await client.post("/activate", { email: pending.email, otp: pendingOTP })).status, 429);
    await clearLimits();
    await db.rateLimit.create({ data: { key: `activate:email:${pending.email}`, count: policy.activationLimit, windowStart: new Date() } });
    assert.equal((await client.post("/activate", { email: pending.email, otp: pendingOTP })).status, 429);
    await clearLimits();
    await db.rateLimit.create({ data: { key: `captcha:ip:${ip}`, count: policy.captchaIssueLimit, windowStart: new Date() } });
    assert.equal((await client.get("/register")).status, 429);
  });
  await check("authenticated CRUD all three entities, CSRF, override, validation and pagination", async () => {
    await clearLimits(); const client = new Client(); assert.equal((await client.login()).status, 303);
    for (const area of ["chefs", "ingredients", "dishes"]) {
      const page = await client.get(`/admin/${area}/new`); assert.equal(page.status, 200); assertWriteForms(page.html);
      assert.equal((await client.post(`/admin/${area}`, {}, { noCsrf: true })).status, 403);
      assert.equal((await client.post(`/admin/${area}`, {}, { headers: { Origin: "https://other.invalid" } })).status, 403);
    }
    assert.equal((await client.post("/admin/chefs", { name: "Chef auth", specialty: "Bếp Việt" })).status, 303);
    const chef = await db.chef.findFirst({ where: { name: "Chef auth" } });
    assert.equal((await client.post("/admin/ingredients", { name: "Ingredient auth", quantity: "10", unit: "kg" })).status, 303);
    const ingredient = await db.ingredient.findFirst({ where: { name: "Ingredient auth" } });
    const values = { name: "Món auth", price: "10000", chefId: String(chef.id), ingredientIds: String(ingredient.id), available: "on", category: "Thử" };
    const created = await client.post("/admin/dishes", values); assert.equal(created.status, 303);
    const dish = await db.dish.findFirst({ where: { name: "Món auth" } });
    for (const [area, id] of [["chefs", chef.id], ["ingredients", ingredient.id], ["dishes", dish.id]]) {
      for (const suffix of ["edit", "delete"]) { const page = await client.get(`/admin/${area}/${id}/${suffix}`); assert.equal(page.status, 200); assertWriteForms(page.html); }
    }
    assert.equal((await client.get(created.location)).status, 200);
    assert.equal((await client.get(`/dishes/${dish.id}`)).status, 200);
    const guest = new Client();
    assert.equal((await guest.get(`/dishes/${dish.id}`)).status, 200);
    assert.equal((await guest.get(`/admin/dishes/${dish.id}`)).status, 303);
    assert.equal((await client.post(`/admin/dishes/${dish.id}?_method=PATCH`, { ...values, price: "2abc" })).status, 400);
    assert.equal((await client.post(`/admin/dishes/${dish.id}?_method=PATCH`, { ...values, name: "Món sửa" })).status, 303);
    assert.equal((await client.post(`/admin/chefs/${chef.id}?_method=PATCH`, { name: "Chef sửa", specialty: "Bếp Việt" })).status, 303);
    assert.equal((await client.post(`/admin/ingredients/${ingredient.id}?_method=PATCH`, { name: "Ingredient sửa", quantity: "20", unit: "kg" })).status, 303);
    assert.equal((await client.post(`/admin/ingredients/${ingredient.id}?_method=DELETE`, {})).status, 400);
    assert.equal((await client.post(`/admin/dishes/${dish.id}?_method=DELETE`, {})).status, 303);
    const unblockedDelete = await client.get(`/admin/ingredients/${ingredient.id}/delete`);
    assert.equal(unblockedDelete.status, 200); assertWriteForms(unblockedDelete.html);
    assert.equal((await client.post(`/admin/chefs/${chef.id}?_method=DELETE`, {})).status, 303);
    assert.equal((await client.post(`/admin/ingredients/${ingredient.id}?_method=DELETE`, {})).status, 303);
    assert.equal((await client.get(`/admin/dishes/${dish.id}`)).status, 404);
    await db.dish.createMany({ data: Array.from({ length: 31 }, (_, i) => ({ name: "Phở thử " + i, price: i % 3 * 1000, category: "Món thử", available: true })) });
    for (const route of ["/dishes", "/admin/dishes"]) {
      const page = await client.get(route + "?page=2&pageSize=10&q=" + encodeURIComponent("Phở"));
      assert.equal(page.status, 200); assert.match(page.html, /Tổng kết quả: <strong>31<\/strong>/); assert.match(page.html, /aria-current="page" aria-label="Trang 2"/);
      assert.equal((await client.get(route + "?page=2abc")).status, 400);
      assert.equal((await client.get(route + "?page=999")).status, 303);
    }
  });
  await check("CAPTCHA consumes valid challenges even for omitted, array or oversized answers", async () => {
    await clearLimits();
    const { verify } = require("../src/services/captcha");
    for (const answer of [undefined, ["bad"], "x".repeat(33)]) {
      const client = new Client(); const cap = await capFrom(await client.get("/register"));
      const row = await db.captchaChallenge.findUnique({ where: { id: cap.challengeId } });
      assert.equal(await verify(db, row.anonId, "register", row.id, answer), false);
      assert.ok((await db.captchaChallenge.findUnique({ where: { id: row.id } })).usedAt);
      assert.equal(await verify(db, row.anonId, "register", row.id, cap.captcha), false);
    }
  });
  await check("resend hides pending cooldown when generic quotas and account counters diverge", async () => {
    await clearLimits(); const client = new Client(), email = "resend-private@example.test";
    const user = await db.user.create({ data: { email, emailRaw: email, passwordHash: await security.hashPassword(password) } });
    await db.activationChallenge.create({ data: { userId: user.id, otpHash: security.otpHash(testEnv.OTP_PEPPER, user.id, security.otpCode()), expiresAt: new Date(Date.now() + policy.otpTTL), lastSentAt: new Date(), sendWindowStart: new Date() } });
    await client.get("/login"); const before = inbox.length;
    const existing = await client.post("/activate/resend", { email });
    const missing = await client.post("/activate/resend", { email: "resend-absent@example.test" });
    assert.equal(existing.status, 303); assert.equal(existing.location, missing.location); assert.equal(missing.status, 303);
    assert.equal(inbox.length, before);
  });
  await check("correct CAPTCHA and password cannot bypass a lock persisted through restart", async () => {
    await clearLimits(); const key = `login:email:${account.email}`;
    await db.rateLimit.create({ data: { key, count: 10, windowStart: new Date(), lockedUntil: new Date(Date.now() + policy.loginLock) } });
    const client = new Client(); await client.get("/login");
    assert.equal((await client.post("/login", { email: account.email, password })).status, 429);
    const cap = await capFrom(await client.get("/login"));
    const before = await db.rateLimit.findUnique({ where: { key } });
    await stopServer(); await startServer();
    assert.equal((await client.post("/login", { email: account.email, password, ...cap })).status, 429);
    assert.deepEqual(await db.rateLimit.findUnique({ where: { key } }), before);
    assert.equal((await client.get("/admin/dishes")).status, 303);
  });
  await check("reset token is rejected as password, activation OTP and signed session", async () => {
    await clearLimits(); const email = "token-purpose@example.test", raw = security.random();
    const user = await db.user.create({ data: { email, emailRaw: email, passwordHash: await security.hashPassword(password) } });
    await db.activationChallenge.create({ data: { userId: user.id, otpHash: security.otpHash(testEnv.OTP_PEPPER, user.id, security.otpCode()), expiresAt: new Date(Date.now() + policy.otpTTL), lastSentAt: new Date(), sendWindowStart: new Date() } });
    await db.passwordReset.create({ data: { userId: user.id, tokenHash: security.tokenHash(raw), expiresAt: new Date(Date.now() + policy.resetTTL) } });
    const client = new Client(); assert.match((await client.login(email, raw)).html, /INVALID_CREDENTIALS/);
    await client.get("/activate"); assert.match((await client.post("/activate", { email, otp: raw })).html, /INVALID_OTP/);
    const forged = new Client(); forged.cookie = "sid=" + raw;
    assert.equal((await forged.get("/admin/dishes")).status, 303);
    assert.equal((await db.passwordReset.findUnique({ where: { tokenHash: security.tokenHash(raw) } })).usedAt, null);
  });
  await check("forgot paired timing observations keep identical public status and content", async () => {
    const observations = [];
    for (let pair = 0; pair < 8; pair++) {
      await clearLimits(); const client = new Client(); await client.get("/forgot");
      const times = {};
      for (const known of pair % 2 ? [false, true] : [true, false]) {
        const start = performance.now(); const response = await client.post("/forgot", { email: known ? account.email : "timing-absent@example.test" });
        const elapsed = Math.round(performance.now() - start);
        assert.equal(response.status, 303); assert.equal(response.location, "/forgot/sent");
        assert.match((await client.get(response.location)).html, /Nếu email đã đăng ký, hướng dẫn đã được gửi/);
        times[known ? "knownMs" : "unknownMs"] = elapsed;
      }
      observations.push(times);
    }
    results.forgotTiming = { samples: observations, conclusion: "Descriptive observations only; not proof of constant-time behaviour or a production timing audit." };
  });
  await check("two server processes share sessions, login counters, logout and reset revocation", async () =>
  {
    await clearLimits();
    const port = await new Promise((resolve, reject) =>
    {
      const probe = net.createServer();
      probe.once("error", reject);
      probe.listen(0, "127.0.0.1", () =>
      {
        const assigned = probe.address().port;
        probe.close(() => resolve(assigned));
      });
    });
    const peerBase = `http://127.0.0.1:${port}`;
    const peer = await launchServer({ ...testEnv, PORT: String(port) }, peerBase);
    try
    {
      const first = new Client();
      assert.equal((await first.login()).status, 303);
      const originalCookie = first.cookie;
      const second = new Client(peerBase);
      second.cookie = originalCookie;
      assert.equal((await second.get("/admin/dishes")).status, 200);
      assert.equal((await second.post("/logout", {})).status, 303);
      assert.equal(await db.session.count({ where: { sid: sessionId(originalCookie) } }), 0);
      first.cookie = originalCookie;
      assert.equal((await first.get("/admin/dishes")).status, 303);

      const probes = [new Client(), new Client(peerBase)];
      for (const client of probes) await client.get("/login");
      for (let attempt = 0; attempt < policy.loginCaptchaAfter; attempt++)
      {
        const response = await probes[attempt % 2].post("/login", { email: account.email, password: "Wrong8-" + security.random() });
        assert.match(response.html, /INVALID_CREDENTIALS/);
      }
      const key = `login:email:${account.email}`;
      assert.equal((await db.rateLimit.findUnique({ where: { key } })).count, policy.loginCaptchaAfter);
      for (const client of probes)
      {
        assert.match((await client.post("/login", { email: account.email, password })).html, /CAPTCHA_FAILED/);
      }
      assert.equal((await db.rateLimit.findUnique({ where: { key } })).count, policy.loginCaptchaAfter);

      await clearLimits();
      const sessions = [new Client(), new Client(peerBase)];
      for (const client of sessions) assert.equal((await client.login()).status, 303);
      const oldCookies = sessions.map(client => client.cookie);
      const beforeMail = inbox.length;
      const resetter = new Client(peerBase);
      await resetter.get("/forgot");
      assert.equal((await resetter.post("/forgot", { email: account.email })).status, 303);
      const mailBody = await message(account.email, beforeMail, value => value.includes("/reset?token="));
      const token = mailBody.match(/token=([A-Za-z0-9_-]{43})/)[1];
      assert.equal((await resetter.get("/reset?token=" + token)).status, 200);
      assert.equal((await resetter.post("/reset", { token, password })).status, 303);
      assert.equal(await db.session.count({ where: { userId: account.id } }), 0);
      for (let index = 0; index < sessions.length; index++)
      {
        sessions[index].cookie = oldCookies[index];
        assert.equal((await sessions[index].get("/admin/dishes")).status, 303);
      }
      results.multiInstance = { processes: 2, sharedSession: true, sharedLoginCounter: true, logoutRevokedAcrossProcesses: true, resetRevokedAcrossProcesses: true, transport: "local HTTP; shared configured application origin", deploymentVerified: false };
    }
    finally
    {
      await stopProcess(peer);
    }
  });
  await check("resend SSR countdown persists across reload, explains 429 and respects hour and IP budgets", async () =>
  {
    await clearLimits();
    const client = new Client();
    const email = "cooldown-absent@example.test";
    const remaining = response => Number(response.html.match(/data-resend-wait-ms="(\d+)"/)[1]);
    const button = response => response.html.match(/<button[^>]*data-resend-button[^>]*>/)[0];
    const emptyActivation = await client.get("/activate");
    assert.doesNotMatch(emptyActivation.html, /action="\/activate(?:\/resend)?"/);
    await client.get("/login");
    assert.equal((await client.post("/activate/resend", { email })).status, 303);
    const first = await client.get("/activate");
    assert.doesNotMatch(first.html, /type="email"/);
    assert.match(first.html, /class="auth-activation-email"/);
    assert.ok(remaining(first) > 0 && remaining(first) <= policy.resendDelay);
    assert.match(button(first), /disabled/);
    const key = `resend:minute:${email}`;
    const before = await db.rateLimit.findUnique({ where: { key } });
    const reloaded = await client.get("/activate");
    assert.ok(remaining(reloaded) <= remaining(first));
    assert.deepEqual(await db.rateLimit.findUnique({ where: { key } }), before);
    const denied = await client.post("/activate/resend", { email });
    assert.equal(denied.status, 429);
    assert.match(denied.html, /RATE_LIMITED/);
    assert.match(button(denied), /disabled/);
    assert.ok(Number(denied.retryAfter) > 0);
    const ipKey = (await db.rateLimit.findFirst({ where: { key: { startsWith: "activate-resend:ip:" } } })).key;
    await db.rateLimit.update({ where: { key }, data: { windowStart: new Date(Date.now() - policy.resendDelay - 1000) } });
    assert.doesNotMatch(button(await client.get("/activate")), /disabled/);
    assert.equal((await client.post("/activate/resend", { email })).status, 303);
    await clearLimits();
    await db.rateLimit.create({ data: { key: `resend:hour:${email}`, count: policy.resendLimit, windowStart: new Date() } });
    const hourly = await client.get("/activate");
    assert.ok(remaining(hourly) > policy.resendDelay);
    assert.match(button(hourly), /disabled/);
    assert.equal((await client.post("/activate/resend", { email })).status, 429);
    await clearLimits();
    await db.rateLimit.create({ data: { key: ipKey, count: policy.activationLimit, windowStart: new Date() } });
    assert.match(button(await client.get("/activate")), /disabled/);
    assert.equal((await client.post("/activate/resend", { email })).status, 429);
  });
  if (browserEvidence) {
    stage = "native browser auth acceptance";
    if (browserOnly) await db.dish.createMany({ data: Array.from({ length: 31 }, (_, i) => ({ name: "Phở thử " + i, price: i % 3 * 1000, category: "Món thử", available: true })) });
    await clearLimits();
    results.browser = await require("./auth.browser")({ db, base, password, policy, security, message, inbox, clearLimits, startServer, stopServer, evidence, browser: browserEvidence.browser });
  }
}

main().catch(error => {
  results.checks.push({ name: stage, status: "FAIL", kind: error.name, code: /^P\d{4}$/.test(error.code || "") ? error.code : undefined });
  console.error(JSON.stringify({ check: stage, status: "FAIL", kind: error.name, code: /^P\d{4}$/.test(error.code || "") ? error.code : undefined, details: "withheld to protect credentials and tokens" }));
  process.exitCode = 1;
}).finally(async () =>
{
  async function cleanupStep(name, work)
  {
    try
    {
      await work();
    }
    catch
    {
      console.error(JSON.stringify({ cleanup: name, status: "FAIL", details: "withheld to protect credentials and tokens" }));
      process.exitCode = 1;
    }
  }
  // A browser/process cleanup error must never skip the database cleanup.
  if (browserEvidence) await cleanupStep("browser", () => browserEvidence.close());
  for (const server of [...serverProcesses]) await cleanupStep("server", () => stopProcess(server));
  child = null;
  if (smtp) await cleanupStep("SMTP", () => new Promise((resolve, reject) => smtp.close(error => error ? reject(error) : resolve())));
  let removed = false;
  if (created && /^auth_test_[a-f0-9]{24}$/.test(schema))
  {
    // PostgreSQL-only TEST HARNESS cleanup. No raw SQL exists in auth runtime.
    await cleanupStep("isolated schema", async () =>
    {
      await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      removed = true;
    });
  }
  await cleanupStep("database disconnect", () => db.$disconnect());
  results.status = process.exitCode ? "FAIL" : "PASS";
  results.completedAt = new Date().toISOString();
  await fs.mkdir(evidence, { recursive: true });
  results.isolatedSchemaRemoved = removed;
  await fs.writeFile(path.join(evidence, "http-results.json"), JSON.stringify(results, null, 2) + "\n");
  console.log(JSON.stringify({ status: results.status, groups: results.checks.length, isolatedSchemaRemoved: removed, applicationCrudUntouched: true }));
});
