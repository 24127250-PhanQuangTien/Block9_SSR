const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { safeURL, cookieFlags } = require("./helpers/authEvidence");

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
