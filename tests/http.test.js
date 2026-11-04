// Offline HTTP checks: Express/EJS are real; Prisma is deliberately replaced.
// These tests make no claim about connectivity or persisted database data.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const authFixture = require("./helpers/authFixture");
const prismaPath = require.resolve("../src/prisma");
let reads = 0;
const unavailable = async () => { reads++; throw new Error("PRIVATE database details password=secret"); };
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: authFixture.attachAuth({
  dish: { findMany: unavailable, findUnique: unavailable, count: unavailable },
  chef: { findMany: unavailable, findUnique: unavailable, count: unavailable },
  ingredient: { findMany: unavailable, findUnique: unavailable, count: unavailable },
  $transaction: unavailable,
}) };
const app = require("../src/app");

test("invalid path IDs return 404 before Prisma; database errors render generic 500", async () => {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const auth = await authFixture.login(base);
  const request = (path, method = "GET") => fetch(base + path, { method, redirect: "manual", headers: { Cookie: auth.cookie, ...(!["GET", "HEAD"].includes(method) ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) }, ...(!["GET", "HEAD"].includes(method) ? { body: new URLSearchParams({ _csrf: auth.csrf }) } : {}) });
  try {
    for (const id of ["abc", "0", "-1", "1.5", "2147483648", "1abc", "1e2", "0x1"]) {
      for (const area of ["dishes", "chefs", "ingredients"]) {
        for (const [suffix, method] of [["/edit", "GET"], ["/delete", "GET"], ["", "PATCH"], ["", "DELETE"]]) {
          assert.equal((await request(`/admin/${area}/${id}${suffix}`, method)).status, 404);
        }
      }
      assert.equal((await request(`/dishes/${id}`)).status, 404);
      assert.equal((await request(`/admin/dishes/${id}`)).status, 404);
    }
    assert.equal(reads, 0);
    const logs = [];
    const original = console.error;
    console.error = (...args) => logs.push(JSON.stringify(args));
    try {
      for (const path of ["/dishes", "/admin/dishes", "/admin/chefs", "/admin/ingredients"]) {
        const res = await request(path);
        assert.equal(res.status, 500);
        const html = await res.text();
        assert.match(html, /class="error-badge">500</);
        assert.match(html, /500 - Lỗi Máy Chủ/);
        assert.doesNotMatch(html, /PRIVATE|password=|secret|PrismaClient|P1001|error-badge">404/);
        assert.match(html, /href="\/dishes"/);
      }
    } finally { console.error = original; }
    assert.doesNotMatch(logs.join("\n"), /PRIVATE|password=|secret/);
    for (const area of ["chefs", "ingredients"]) {
      const res = await request(`/admin/${area}/new`);
      assert.equal(res.status, 200);
      assert.match(await res.text(), /method="POST"/);
    }
    assert.equal((await request('/unrecognized?path=%3Cscript%3E')).status, 404);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
