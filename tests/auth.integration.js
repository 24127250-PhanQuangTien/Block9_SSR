// Real Prisma + real server processes + Argon2 + DB sessions + local SMTP.
// All writes are confined to a fresh random PostgreSQL schema, never the app schema.
// No security middleware is replaced or disabled. Credentials/messages stay in RAM.
require("dotenv").config();
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { randomBytes, randomUUID } = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const net = require("node:net");
const fs = require("node:fs/promises");
const { PrismaClient } = require("@prisma/client");
const argon2 = require("argon2");
const security = require("../src/services/crypto");
const { policy } = require("../src/config/authPolicy");
const schema = "auth_test_" + randomBytes(12).toString("hex");
const database = new URL(process.env.DATABASE_URL);
database.searchParams.set("schema", schema);
const testEnv = { ...process.env, DATABASE_URL: database.toString(), PORT: "3108", APP_BASE_URL: "http://localhost:3108", APP_ORIGIN: "http://localhost:3108", TRUST_PROXY: "false", NODE_ENV: "test", SESSION_SECRET: security.random(48), OTP_PEPPER: security.random(48), SMTP_HOST: "127.0.0.1", SMTP_USER: "", SMTP_PASS: "", SMTP_FROM: "Auth Test <no-reply@example.test>" };
const db = new PrismaClient({ datasourceUrl: database.toString() });
const base = testEnv.APP_BASE_URL;
const results = { database: "real isolated PostgreSQL schema", securityMocks: false, checks: [], writesToApplicationSchema: 0 };
const inbox = [];
let child, smtp, stage = "setup", created = false;
const password = "Auth8-" + security.random(18);
let account, pending, pendingOTP;

function cli(args) {
  const result = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", ...args], { env: testEnv, encoding: "utf8", timeout: 120000 });
  if (result.status !== 0) {
    const code = ((result.stdout || "") + (result.stderr || "")).match(/\bP\d{4}\b/)?.[0];
    throw Object.assign(new Error("ISOLATED_MIGRATION_FAILED"), { code });
  }
}
async function check(name, work) { stage = name; await work(); results.checks.push({ name, status: "PASS" }); console.log(JSON.stringify({ check: name, status: "PASS" })); }
function decode(value) { return value.replace(/&amp;/g, "&").replace(/&#34;|&quot;/g, '"').replace(/&#39;/g, "'"); }
const hidden = (html, name) => decode(html.match(new RegExp(`name="${name}" value="([^"]*)"`))?.[1] || "");
function assertWriteForms(html) {
  const forms = [...html.matchAll(/<form\b[^>]*method="POST"[^>]*>[\s\S]*?<\/form>/g)];
  assert.ok(forms.length > 0);
  for (const [form] of forms) assert.ok(hidden(form, "_csrf"), "Every POST form must carry its own CSRF token");
}
class Client {
  constructor() { this.cookie = ""; this.csrf = ""; }
  async request(route, values, options = {}) {
    const method = options.method || (values === undefined ? "GET" : "POST");
    const payload = values === undefined ? undefined : { ...(options.noCsrf ? {} : { _csrf: this.csrf }), ...values };
    const response = await fetch(base + route, { method, redirect: "manual", signal: AbortSignal.timeout(30000),
      headers: { Accept: "text/html", ...(this.cookie ? { Cookie: this.cookie } : {}), ...(method === "POST" ? { Origin: base } : {}), ...options.headers },
      ...(payload ? { body: new URLSearchParams(payload) } : {}) });
    const cookies = response.headers.getSetCookie();
    for (const item of cookies) if (item.startsWith("sid=")) this.cookie = item.split(";")[0];
    const html = await response.text();
    const token = hidden(html, "_csrf");
    if (token) this.csrf = token;
    return { status: response.status, location: response.headers.get("location"), html, cookies, referrer: response.headers.get("referrer-policy") };
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
async function startServer() {
  child = spawn(process.execPath, ["src/server.js"], { env: testEnv, stdio: "ignore" });
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error("TEST_SERVER_EXITED");
    try { const response = await fetch(base + "/login", { redirect: "manual" }); if (response.status === 200) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("TEST_SERVER_START_TIMEOUT");
}
async function stopServer() {
  if (child && child.exitCode === null) { const ended = once(child, "exit"); child.kill(); await ended; }
  child = null;
}

async function main() {
  assert.match(schema, /^auth_test_[a-f0-9]{24}$/);
  cli(["migrate", "deploy"]); created = true;
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

  await check("mandatory secrets and cookie production policy", async () => {
    const { configuration } = require("../src/config/authPolicy");
    const { cookieOptions } = require("../src/middleware/requireLogin");
    assert.throws(() => configuration({}), /SESSION_SECRET/);
    assert.throws(() => configuration({ SESSION_SECRET: security.random() }), /OTP_PEPPER/);
    const options = cookieOptions({ production: true });
    assert.deepEqual(options, { httpOnly: true, sameSite: "lax", secure: true, path: "/" });
    assert.equal("domain" in options, false);
  });
  await check("all unauthenticated CRUD GET/POST/override requests redirect 303 before writes", async () => {
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
    for (const route of ["/", "/admin", "/dishes", "/dishes/1"]) assert.equal((await anonymous.get(route)).status, 303);
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
    assert.equal((await client.get("/dishes")).status, 303);
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
    assert.equal((await client.get("/dishes")).status, 200);
    assert.equal((await client.post("/logout", {}, { noCsrf: true })).status, 403);
    assert.equal((await client.post("/logout", {}, { headers: { Origin: "https://other.invalid" } })).status, 403);
    assert.equal((await client.post("/logout", {})).status, 303);
    assert.equal(await db.session.findUnique({ where: { sid } }), null);
    const { PrismaSessionStore } = require("../src/services/sessionStore");
    const store = new PrismaSessionStore(db);
    await new Promise((resolve, reject) => store.set(sid, JSON.parse(row.data), error => error ? reject(error) : resolve()));
    assert.equal(await db.session.findUnique({ where: { sid } }), null);
    const replay = new Client(); replay.cookie = cookie; assert.equal((await replay.get("/dishes")).status, 303);
  });
  await check("idle, absolute expiry and inactive users are rejected server-side", async () => {
    await clearLimits();
    for (const field of ["createdAt", "lastSeenAt"]) {
      const client = new Client(); await client.login(); const sid = sessionId(client.cookie);
      const row = await db.session.findUnique({ where: { sid } }); const data = JSON.parse(row.data);
      data[field] = Date.now() - (field === "createdAt" ? policy.absolute : policy.idle) - 1;
      await db.session.update({ where: { sid }, data: { data: JSON.stringify(data), expiresAt: new Date(Date.now() + policy.idle) } });
      assert.equal((await client.get("/dishes")).status, 303);
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
    for (const cookie of oldCookies) { const replay = new Client(); replay.cookie = cookie; assert.equal((await replay.get("/dishes")).status, 303); }
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
}

main().catch(error => {
  results.checks.push({ name: stage, status: "FAIL", kind: error.name, code: /^P\d{4}$/.test(error.code || "") ? error.code : undefined });
  console.error(JSON.stringify({ check: stage, status: "FAIL", kind: error.name, code: /^P\d{4}$/.test(error.code || "") ? error.code : undefined, details: "withheld to protect credentials and tokens" }));
  process.exitCode = 1;
}).finally(async () => {
  await stopServer();
  if (smtp) await new Promise(resolve => smtp.close(resolve));
  let removed = false;
  if (created && /^auth_test_[a-f0-9]{24}$/.test(schema)) {
    // PostgreSQL-only TEST HARNESS cleanup. No raw SQL exists in auth runtime.
    try { await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`); removed = true; }
    catch { console.error(JSON.stringify({ isolatedCleanup: "FAILED", schema })); process.exitCode = 1; }
  }
  await db.$disconnect();
  results.status = process.exitCode ? "FAIL" : "PASS";
  await fs.mkdir("docs/evidence", { recursive: true });
  await fs.writeFile("docs/evidence/auth-integration.json", JSON.stringify(results, null, 2) + "\n");
  results.isolatedSchemaRemoved = removed;
  await fs.writeFile("docs/evidence/auth-integration.json", JSON.stringify(results, null, 2) + "\n");
  console.log(JSON.stringify({ status: results.status, groups: results.checks.length, isolatedSchemaRemoved: removed, applicationCrudUntouched: true }));
});
