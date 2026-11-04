// Opt-in acceptance against an already running REAL server (npm start).
// Loads configuration through dotenv just like src/server.js; never prints it.
// Only GET over HTTP and allowlisted Prisma reads. No setup/seed/schema changes.
require("dotenv").config();
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const prisma = require("../src/prisma");
const base = new URL(process.argv.slice(2).find(arg => !arg.startsWith("--")) || "http://127.0.0.1:3000");
const smoke = process.argv.includes("--smoke");
let currentCheck = "initialization";
let cookie = "";
const results = { database: "real", checks: 0, pages: 0, redirects: 0, invalid: 0, formSubmissions: 0, total: 0 };
const decode = value => value.replace(/&amp;/g, "&").replace(/&#34;|&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const links = html => [...html.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(match => decode(match[1]));
const rowIds = html => [...new Set([...html.matchAll(/href="\/(?:admin\/)?dishes\/(\d+)"/g)].map(match => Number(match[1])))];
const navHtml = html => html.match(/<nav class="pagination"[\s\S]*?<\/nav>/)?.[0] || "";

// Fail closed if this verifier ever accidentally attempts a write.
prisma.$use((params, next) => {
  if (params.model !== "Dish" || !["count", "findMany"].includes(params.action)) {
    throw new Error("READ_ONLY_GUARD");
  }
  return next(params);
});

function whereFor(path, filters) {
  const where = {};
  if (filters.q) {
    const name = { name: { contains: filters.q, mode: "insensitive" } };
    if (path.startsWith("/admin")) where.OR = [name, { description: { contains: filters.q, mode: "insensitive" } }];
    else Object.assign(where, name);
  }
  if (path.startsWith("/admin")) {
    if (filters.category) where.category = filters.category;
    if (filters.status) where.available = filters.status === "available";
  }
  return where;
}

function orderFor(sort) {
  return ({
    price_asc: [{ price: "asc" }, { id: "asc" }],
    price_desc: [{ price: "desc" }, { id: "asc" }],
    name: [{ name: "asc" }, { id: "asc" }],
    newest: [{ createdAt: "desc" }, { id: "asc" }],
  })[sort] || { id: "asc" };
}

async function get(path) {
  const target = new URL(path, base);
  assert.equal(target.origin, base.origin);
  const response = await fetch(target, { method: "GET", redirect: "manual", headers: { ...(cookie ? { Cookie: cookie } : {}) }, signal: AbortSignal.timeout(30000) });
  results.checks++;
  // Express negotiates a 303 body as text/plain for fetch's default Accept: */*.
  // Rendered pages/errors must be HTML; redirect status/Location are checked below.
  assert.match(response.headers.get("content-type"), response.status >= 300 && response.status < 400 ? /text\/(html|plain)/ : /text\/html/);
  return { status: response.status, location: response.headers.get("location"), html: await response.text() };
}

function makeUrl(path, filters, pageSize, page) {
  return path + "?" + new URLSearchParams({ ...filters, pageSize: String(pageSize), page: String(page) });
}

async function verifyPage(path, filters, pageSize, page) {
  const where = whereFor(path, filters);
  const total = await prisma.dish.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const expected = await prisma.dish.findMany({ where, orderBy: orderFor(filters.sort), skip: (page - 1) * pageSize, take: pageSize, select: { id: true } });
  const response = await get(makeUrl(path, filters, pageSize, page));
  assert.equal(response.status, 200);
  assert.deepEqual(rowIds(response.html), expected.map(row => row.id));
  assert.ok(response.html.includes(`Tổng kết quả: <strong>${total}</strong>`));
  assert.ok(response.html.includes(`Đang hiển thị <strong>${expected.length}</strong>`));
  const nav = navHtml(response.html);
  if (total === 0) {
    assert.equal(nav, "");
    assert.match(response.html, /Không tìm thấy món ăn nào/);
  } else {
    assert.ok(nav.includes(`Trang ${page} / ${totalPages}`));
    assert.ok(nav.includes(`aria-current="page" aria-label="Trang ${page}">${page}</span>`));
    assert.equal((nav.match(/aria-current="page"/g) || []).length, 1);
    assert.match(nav, page === 1 ? /aria-disabled="true">Trước<\/span>/ : /rel="prev">Trước<\/a>/);
    assert.match(nav, page === totalPages ? /aria-disabled="true">Sau<\/span>/ : /rel="next">Sau<\/a>/);
    const hrefs = links(nav);
    assert.ok(hrefs.length <= 8);
    for (const href of hrefs) {
      const url = new URL(href, base);
      assert.equal(url.pathname, path);
      const linkedPage = Number(url.searchParams.get("page"));
      assert.ok(linkedPage >= 1 && linkedPage <= totalPages && linkedPage !== page);
      assert.equal(url.searchParams.get("pageSize"), String(pageSize));
      for (const [key, value] of Object.entries(filters)) assert.equal(url.searchParams.get(key), value);
      assert.equal(url.searchParams.size, Object.keys(filters).length + 2);
    }
  }
  results.pages++;
  return { response, total, totalPages, shown: expected.length };
}

async function verifyGroup(label, path, filters = {}, pageSize = 10) {
  currentCheck = label;
  const total = await prisma.dish.count({ where: whereFor(path, filters) });
  const pages = Math.max(1, Math.ceil(total / pageSize));
  for (const page of new Set([1, Math.ceil(pages / 2), pages])) await verifyPage(path, filters, pageSize, page);
  console.log(JSON.stringify({ check: label, total, pageSize, totalPages: pages, result: "PASS" }));
}

async function verifyRedirect(path, filters, pageSize) {
  const total = await prisma.dish.count({ where: whereFor(path, filters) });
  const last = Math.max(1, Math.ceil(total / pageSize));
  const response = await get(makeUrl(path, { ...filters, unused: "discard" }, pageSize, last + 5));
  assert.equal(response.status, 303);
  const actual = new URL(response.location, base);
  const expected = new URL(makeUrl(path, filters, pageSize, last), base);
  assert.equal(actual.pathname, expected.pathname);
  assert.deepEqual([...actual.searchParams].sort(), [...expected.searchParams].sort());
  assert.equal((await get(response.location)).status, 200);
  results.redirects++;
}

function fieldsFromGetForm(html) {
  const form = html.match(/<form[^>]*method="GET"[\s\S]*?<\/form>/)[0];
  const fields = {};
  for (const match of form.matchAll(/<input\b[^>]*>/g)) {
    const name = match[0].match(/name="([^"]+)"/)?.[1];
    if (name) fields[name] = decode(match[0].match(/value="([^"]*)"/)?.[1] || "");
  }
  for (const match of form.matchAll(/<select\b[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
    const options = [...match[2].matchAll(/<option value="([^"]*)"([^>]*)>/g)];
    const selected = options.find(option => /\bselected\b/.test(option[2])) || options[0];
    fields[match[1]] = decode(selected[1]);
  }
  return fields;
}

async function main() {
  assert.ok(["127.0.0.1", "localhost"].includes(base.hostname) && base.protocol === "http:" && !base.username && !base.password);
  currentCheck = "unauthenticated guard and real login";
  for (const path of ["/dishes", "/admin/dishes"]) {
    const anonymous = await fetch(new URL(path, base), { redirect: "manual" });
    assert.equal(anonymous.status, 303); assert.equal(anonymous.headers.get("location"), "/login");
  }
  const form = await fetch(new URL("/login", base), { redirect: "manual" });
  cookie = form.headers.getSetCookie().find(value => value.startsWith("sid=")).split(";")[0];
  const html = await form.text();
  const csrf = html.match(/name="_csrf" value="([^"]+)"/)[1];
  const logged = await fetch(new URL("/login", base), { method: "POST", redirect: "manual", headers: { Cookie: cookie, Origin: process.env.APP_ORIGIN || base.origin }, body: new URLSearchParams({ _csrf: csrf, email: process.env.SEED_USER_EMAIL, password: process.env.SEED_USER_PASSWORD }) });
  assert.equal(logged.status, 303); assert.equal(logged.headers.get("location"), "/dishes");
  cookie = logged.headers.getSetCookie().find(value => value.startsWith("sid=")).split(";")[0];
  currentCheck = "database count and relation schema";
  results.total = await prisma.dish.count({ where: {} });
  // Check actual chef/ingredient relation columns without exposing row contents.
  await prisma.dish.findMany({ take: 1, include: { chef: true, ingredients: true } });
  console.log(JSON.stringify({ check: currentCheck, total: results.total, result: "PASS" }));
  const sample = (await prisma.dish.findMany({ take: 1, orderBy: { id: "asc" }, select: { name: true, description: true, category: true, available: true } }))[0];
  if (smoke) {
    for (const path of ["/dishes", "/admin/dishes"]) await verifyPage(path, {}, 10, 1);
    console.log(JSON.stringify({ ...results, result: "PASS", authenticatedLogin: true, mode: "smoke only, not the full 101 GET suite", restaurantWritesAttempted: 0 }));
    return;
  }
  const q = sample?.name.trim().split(/\s+/)[0] || "no-existing-dish";
  for (const path of ["/dishes", "/admin/dishes"]) {
    for (const size of [10, 20, 50]) await verifyGroup(`${path} size ${size}`, path, {}, size);
    if (results.total > 1 && results.total <= 10) await verifyGroup(`${path} small pages`, path, {}, 1);
    await verifyGroup(`${path} name search`, path, { q }, 2);
    currentCheck = `${path} redirects`;
    await verifyRedirect(path, {}, 10);
    await verifyRedirect(path, { q }, 2);
    const absent = { q: "pagination-check-" + randomUUID() };
    await verifyPage(path, absent, 10, 1);
    await verifyRedirect(path, absent, 10);

    currentCheck = `${path} invalid parameters`;
    for (const query of ["page=0", "page=2abc", "page=1.5", "page=1&page=2", "page[x]=2", "page[]=2", "page=9007199254740991&pageSize=100", "pageSize=0", "pageSize=101", "pageSize=10&pageSize=20", "pageSize[x]=10"]) {
      const response = await get(`${path}?${query}`);
      assert.equal(response.status, 400);
      assert.match(response.html, /class="error-badge">400</);
      results.invalid++;
    }
    // Simulate native successful GET controls; this does not claim browser QA.
    currentCheck = `${path} GET form resets page and preserves conditions`;
    const filters = path.startsWith("/admin") ? { status: "available", sort: "newest" } : {};
    const count = await prisma.dish.count({ where: whereFor(path, filters) });
    const page = count > 10 ? 2 : 1;
    const loaded = await get(makeUrl(path, filters, 10, page));
    assert.equal(loaded.status, 200);
    const fields = fieldsFromGetForm(loaded.html);
    assert.equal(fields.page, "1");
    for (const [key, value] of Object.entries(filters)) assert.equal(fields[key], value);
    for (const update of [{ q }, { pageSize: "20" }]) {
      const submitted = new URL(path + "?" + new URLSearchParams({ ...fields, ...update }), base);
      assert.equal(submitted.searchParams.get("page"), "1");
      const response = await get(submitted.pathname + submitted.search);
      assert.equal(response.status, 200);
      if (navHtml(response.html)) assert.match(navHtml(response.html), /aria-current="page" aria-label="Trang 1"/);
      results.formSubmissions++;
    }
  }
  for (const sort of ["price_asc", "price_desc", "name", "newest"]) await verifyGroup(`admin sort ${sort}`, "/admin/dishes", { sort });
  for (const status of ["available", "unavailable"]) await verifyGroup(`admin status ${status}`, "/admin/dishes", { status }, 2);
  if (sample?.category) {
    await verifyGroup("admin category", "/admin/dishes", { category: sample.category }, 2);
    const filters = { q, category: sample.category, status: sample.available ? "available" : "unavailable", sort: "newest" };
    await verifyGroup("admin combined filters and sort", "/admin/dishes", filters, 2);
    currentCheck = "admin filtered redirect";
    await verifyRedirect("/admin/dishes", filters, 2);
  }
  if (sample?.description?.trim()) {
    await verifyGroup("admin description search", "/admin/dishes", { q: sample.description.trim().split(/\s+/)[0] }, 2);
  }
  // Encoding round-trip even when the special-character search has no matches.
  currentCheck = "special-character form and redirect encoding";
  for (const path of ["/dishes", "/admin/dishes"]) {
    const filters = { q: 'Phở & "chanh" + / ? #', ...(path.startsWith("/admin") ? { category: 'Món & đặc biệt + /', status: "available", sort: "name" } : {}) };
    const response = await get(makeUrl(path, filters, 20, 1));
    assert.equal(response.status, 200);
    assert.equal(fieldsFromGetForm(response.html).q, filters.q);
    await verifyRedirect(path, filters, 20);
  }
  console.log(JSON.stringify({ ...results, result: "PASS", authenticatedLogin: true, browserVerified: false, restaurantWritesAttempted: 0 }));
}

main().catch(error => {
  // Never print Prisma messages, stack, request/connection URLs or env values.
  const code = typeof error.code === "string" && /^P\d{4}$/.test(error.code) ? error.code : undefined;
  console.error(JSON.stringify({ check: currentCheck, result: "FAIL", code, kind: error instanceof assert.AssertionError ? "assertion" : "runtime", details: "withheld" }));
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
