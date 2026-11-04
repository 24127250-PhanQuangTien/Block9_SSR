// Offline persistence fixture ONLY. Uses the application's real login, Argon2,
// CSRF, requireLogin and session store; never substitutes a security decision.
const { randomUUID } = require("node:crypto");
const security = require("../../src/services/crypto");
process.env.SESSION_SECRET = security.random(48);
process.env.OTP_PEPPER = security.random(48);
process.env.APP_BASE_URL = "http://localhost:3000";
process.env.APP_ORIGIN = "http://localhost:3000";
const password = "Fixture8" + security.random(16);
const user = { id: randomUUID(), email: "fixture@example.test", status: "active", updatedAt: new Date(), passwordHash: null };
const ready = security.hashPassword(password).then(hash => { user.passwordHash = hash; });

function attachAuth(db) {
  function model(key) {
    const rows = new Map();
    const matches = (row, where) => Object.entries(where).every(([name, value]) => value && typeof value === "object" && "gt" in value ? row[name] > value.gt : row[name] === value);
    return {
      async findUnique({ where }) { return rows.get(where[key]) || null; },
      async upsert({ where, create, update }) { const value = rows.has(where[key]) ? { ...rows.get(where[key]), ...update } : { ...create }; rows.set(where[key], value); return value; },
      async deleteMany({ where = {} } = {}) { let count = 0; for (const [id, row] of rows) if (matches(row, where)) { rows.delete(id); count++; } return { count }; },
      async updateMany({ where, data }) { let count = 0; for (const [id, row] of rows) if (matches(row, where)) { rows.set(id, { ...row, ...data }); count++; } return { count }; },
    };
  }
  db.user = { async findUnique({ where }) { await ready; return where.id === user.id || where.email === user.email ? user : null; } };
  db.session = model("sid"); db.rateLimit = model("key");
  db.$transaction = async work => work(db);
  return db;
}

async function login(base) {
  await ready;
  let form = await fetch(base + "/login");
  let csrf = (await form.text()).match(/name="_csrf" value="([^"]+)"/)[1];
  let cookie = form.headers.getSetCookie().find(item => item.startsWith("sid=")).split(";")[0];
  const result = await fetch(base + "/login", { method: "POST", redirect: "manual", headers: { Cookie: cookie }, body: new URLSearchParams({ _csrf: csrf, email: user.email, password }) });
  if (result.status !== 303) throw new Error("Fixture real login failed");
  cookie = result.headers.getSetCookie().find(item => item.startsWith("sid=")).split(";")[0];
  form = await fetch(base + "/login", { headers: { Cookie: cookie } });
  csrf = (await form.text()).match(/name="_csrf" value="([^"]+)"/)[1];
  return { cookie, csrf };
}
module.exports = { attachAuth, login };
