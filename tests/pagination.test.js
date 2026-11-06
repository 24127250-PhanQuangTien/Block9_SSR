const { test } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { readPagination, makePagination, MAX_OFFSET } = require("../src/pagination");
const { createFixture, installFixture, specialName, specialCategory } = require("./helpers/prismaFixture");
const authFixture = require("./helpers/authFixture");

test("strict positive integers, defaults, safe arithmetic and Prisma offset boundary", () => {
  assert.deepEqual(readPagination("/dishes"), { page: 1, pageSize: 10, skip: 0 });
  for (const pageSize of [1, 10, 20, 50, 100]) {
    assert.deepEqual(readPagination(`/dishes?page=2&pageSize=${pageSize}`), { page: 2, pageSize, skip: pageSize });
  }
  for (const key of ["page", "pageSize"]) {
    for (const value of ["", "0", "-1", "2abc", "2.0", "1e2", "0x2", "NaN", "Infinity", "+2", " 2", "2 ", "9007199254740992", "２"]) {
      assert.throws(() => readPagination(`/dishes?${key}=${encodeURIComponent(value)}`), RangeError, `${key}=${value}`);
    }
    for (const query of [`${key}=1&${key}=2`, `${key}=1&${key}=1`, `${key}[]=1`, `${key}[x]=1`, `${key}=1&${key}[x]=2`]) {
      assert.throws(() => readPagination(`/dishes?${query}`), RangeError, query);
    }
  }
  assert.throws(() => readPagination("/dishes?pageSize=101"), RangeError);
  assert.throws(() => readPagination("/dishes?page=9007199254740991&pageSize=100"), /Vị trí/);
  assert.deepEqual(readPagination(`/dishes?page=${MAX_OFFSET + 1}&pageSize=1`), { page: MAX_OFFSET + 1, pageSize: 1, skip: MAX_OFFSET });
  assert.throws(() => readPagination(`/dishes?page=${MAX_OFFSET + 2}&pageSize=1`), /Vị trí/);
  const maximumPage = Math.floor(MAX_OFFSET / 100) + 1;
  assert.equal(readPagination(`/dishes?page=${maximumPage}&pageSize=100`).skip, (maximumPage - 1) * 100);
  assert.throws(() => readPagination(`/dishes?page=${maximumPage + 1}&pageSize=100`), /Vị trí/);
});

test("large page windows stay bounded and include current, first, last and gaps", () => {
  for (const page of [1, 2, 500000, 999999, 1000000]) {
    const state = makePagination({ page, pageSize: 10, skip: (page - 1) * 10 }, 10000000, "/dishes", {});
    const numbers = state.pages.filter(Number.isInteger);
    assert.ok(numbers.length <= 7);
    assert.ok(numbers.includes(1) && numbers.includes(1000000) && numbers.includes(page));
    assert.equal(new Set(numbers).size, numbers.length);
    assert.ok(state.pages.includes(null));
  }
});

const fixture = createFixture();
installFixture(authFixture.attachAuth(fixture.db));
const app = require("../src/app");
const unescapeHtml = value => value.replace(/&amp;/g, "&").replace(/&#34;|&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const ids = html => [...new Set([...html.matchAll(/href="\/(?:admin\/)?dishes\/(\d+)"/g)].map(match => Number(match[1])))];
const navigation = html => html.match(/<nav class="pagination"[\s\S]*?<\/nav>/)?.[0] || "";
const links = html => [...html.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(match => unescapeHtml(match[1]));

test("Express/EJS pagination contracts with in-memory Prisma (no real database)", async t => {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const path of ["/admin/dishes", "/admin/chefs", "/admin/ingredients"]) {
    const response = await fetch(base + path, { redirect: "manual" });
    assert.equal(response.status, 303); assert.equal(response.headers.get("location"), "/login");
  }
  for (const path of ["/dishes?page=2&pageSize=10", "/dishes/1"])
  {
    const response = await fetch(base + path, { redirect: "manual" });
    assert.equal(response.status, 200);
    assert.doesNotMatch(await response.text(), /action="\/logout"/);
  }
  const auth = await authFixture.login(base);
  async function request(path, values) {
    const form = values === undefined ? undefined : new URLSearchParams(values);
    if (form) form.set("_csrf", auth.csrf);
    const response = await fetch(base + path, {
      redirect: "manual", method: values === undefined ? "GET" : "POST",
      headers: { Cookie: auth.cookie },
      ...(values === undefined ? {} : { body: form }),
    });
    return { status: response.status, location: response.headers.get("location"), type: response.headers.get("content-type"), html: await response.text() };
  }
  const clear = () => { fixture.calls.length = 0; };
  try {
    await t.test("bad pagination returns HTML 400 before any Prisma read on both screens", async () => {
      for (const path of ["/dishes", "/admin/dishes"]) {
        for (const query of ["page=", "page=0", "page=-1", "page=2abc", "page=1.5", "page=1e2", "pageSize=101", "pageSize=9007199254740992", "page=9007199254740991", "page=1&page=2", "pageSize=10&pageSize=20", "page[]=2", "page[x]=2", "pageSize[]=10", "pageSize[x]=10", "page=2147483650&pageSize=1"]) {
          clear();
          const response = await request(`${path}?${query}`);
          assert.equal(response.status, 400, path + query);
          assert.match(response.type, /text\/html/);
          assert.match(response.html, /class="error-badge">400</);
          assert.match(response.html, /Tham Số Phân Trang Không Hợp Lệ/);
          assert.doesNotMatch(response.html, /class="pagination"|ok.*false/);
          assert.equal(fixture.calls.length, 0);
        }
        // qs normally stops parsing at 1000 entries; pagination must not miss this duplicate.
        const padding = Array.from({ length: 1001 }, () => "unused=1").join("&");
        assert.equal((await request(`${path}?page=1&${padding}&page=2`)).status, 400);
      }
    });

    await t.test("first/middle/last pages, default size, row bounds and full relation display", async () => {
      for (const path of ["/dishes", "/admin/dishes"]) {
        for (const [query, start, end, size] of [["", 1, 10, 10], ["?page=7", 61, 70, 10], ["?page=14", 131, 137, 10], ["?pageSize=20&page=2", 21, 40, 20], ["?pageSize=50", 1, 50, 50], ["?pageSize=100", 1, 100, 100], ["?pageSize=7&page=2", 8, 14, 7]]) {
          clear();
          const response = await request(path + query);
          assert.equal(response.status, 200);
          assert.deepEqual(ids(response.html), Array.from({ length: end - start + 1 }, (_, i) => start + i));
          const read = fixture.calls.find(call => call.method === "dish.findMany" && !call.args.distinct);
          assert.equal(read.args.skip, start - 1);
          assert.equal(read.args.take, size);
          assert.deepEqual(read.args.include, { chef: true, ingredients: true });
          assert.deepEqual(read.args.where, fixture.calls.find(call => call.method === "dish.count").args.where);
          assert.match(response.html, /Tổng kết quả: <strong>137<\/strong>/);
          assert.ok(response.html.includes(`Đang hiển thị <strong>${end - start + 1}</strong>`));
          assert.match(response.html, /Đầu bếp 14/);
          assert.match(response.html, /Nguyên liệu 17/);
          if (size === 7) assert.match(response.html, /value="7" selected/);
        }
      }
    });

    await t.test("name-only public search and admin description/category/status keep their existing meaning", async () => {
      assert.match((await request("/dishes?q=" + encodeURIComponent("Chỉ mô tả"))).html, /Tổng kết quả: <strong>0<\/strong>/);
      const response = await request("/admin/dishes?" + new URLSearchParams({ q: "Chỉ mô tả", category: specialCategory, status: "available", page: "2" }));
      assert.equal(response.status, 200);
      const matching = fixture.rows.filter(row => row.category === specialCategory && row.available).sort((a, b) => a.id - b.id);
      assert.deepEqual(ids(response.html), matching.slice(10, 20).map(row => row.id));
      assert.ok(response.html.includes(`Tổng kết quả: <strong>${matching.length}</strong>`));
      const unavailable = await request("/admin/dishes?status=unavailable");
      assert.ok(ids(unavailable.html).every(id => fixture.rows.find(row => row.id === id).available === false));
      const publicResult = await request("/dishes?" + new URLSearchParams({ q: specialName.toUpperCase() }));
      assert.match(publicResult.html, /tìm thấy 137 món/);
      clear();
      await request("/dishes?category=ignored&status=unavailable&sort=price_desc");
      const read = fixture.calls.find(call => call.method === "dish.findMany");
      assert.deepEqual(read.args.where, {});
      assert.deepEqual(read.args.orderBy, { id: "asc" });
    });

    await t.test("all admin sorts break ties by ID across page boundaries", async () => {
      for (const [sort, key, direction] of [["", "id", 1], ["price_asc", "price", 1], ["price_desc", "price", -1], ["name", "name", 1], ["newest", "createdAt", -1]]) {
        const expected = [...fixture.rows].sort((a, b) => (a[key] < b[key] ? -direction : a[key] > b[key] ? direction : a.id - b.id));
        const seen = [];
        for (let page = 1; page <= 14; page++) {
          clear();
          const response = await request(`/admin/dishes?sort=${sort}&page=${page}`);
          assert.equal(response.status, 200);
          seen.push(...ids(response.html));
          const read = fixture.calls.find(call => call.method === "dish.findMany" && !call.args.distinct);
          assert.deepEqual(read.args.orderBy, key === "id" ? { id: "asc" } : [{ [key]: direction === 1 ? "asc" : "desc" }, { id: "asc" }]);
        }
        assert.deepEqual(seen, expected.map(row => row.id), sort);
        assert.equal(new Set(seen).size, 137);
      }
    });

    await t.test("navigation semantics, compact numbers and disabled controls", async () => {
      for (const path of ["/dishes", "/admin/dishes"]) {
        for (const page of [1, 7, 14]) {
          const response = await request(`${path}?page=${page}`);
          const nav = navigation(response.html);
          assert.match(nav, new RegExp(`aria-current="page" aria-label="Trang ${page}">${page}</span>`));
          assert.equal((nav.match(/aria-current="page"/g) || []).length, 1);
          assert.match(nav, /aria-label="Phân trang món ăn"/);
          assert.match(nav, /…/);
          assert.ok(links(nav).length <= 8);
          assert.ok(!links(nav).some(link => new URL(link, base).searchParams.get("page") === String(page)));
          assert.match(nav, page === 1 ? /<span[^>]*aria-disabled="true">Trước<\/span>/ : /rel="prev">Trước<\/a>/);
          assert.match(nav, page === 14 ? /<span[^>]*aria-disabled="true">Sau<\/span>/ : /rel="next">Sau<\/a>/);
        }
      }
    });

    await t.test("links preserve only supported conditions, encode Vietnamese/special characters and forms reset page", async () => {
      for (const path of ["/dishes", "/admin/dishes"]) {
        const filters = { q: specialName, ...(path.startsWith("/admin") ? { category: specialCategory, status: "available", sort: "name" } : {}) };
        const response = await request(path + "?" + new URLSearchParams({ ...filters, page: "2", pageSize: "20", junk: "discard", _method: "DELETE", mode: "fuzzy" }));
        assert.equal(response.status, 200);
        for (const href of links(navigation(response.html))) {
          const url = new URL(href, base);
          assert.equal(url.pathname, path);
          for (const [key, value] of Object.entries(filters)) assert.equal(url.searchParams.get(key), value);
          assert.equal(url.searchParams.get("pageSize"), "20");
          assert.equal(url.searchParams.size, Object.keys(filters).length + 2);
          assert.match(href, /%E1%BB%9F/);
          assert.match(href, /%26/);
          assert.equal((await request(href)).status, 200);
        }
        const form = response.html.match(/<form[^>]*method="GET"[\s\S]*?<\/form>/)[0];
        assert.match(form, /type="hidden" name="page" value="1"/);
        assert.equal((form.match(/name="page"/g) || []).length, 1);
        assert.match(form, /<select id="page-size" name="pageSize">/);
        for (const size of [10, 20, 50]) assert.match(form, new RegExp(`value="${size}"`));
        assert.doesNotMatch(form, /onsubmit|onchange|fetch\(/);
        for (const key of Object.keys(filters)) assert.ok(form.includes(`name="${key}"`));
      }
    });

    await t.test("empty results and out-of-range 303 redirects preserve filters without loops", async () => {
      for (const path of ["/dishes", "/admin/dishes"]) {
        clear();
        const response = await request(`${path}?page=999&pageSize=20`);
        assert.equal(response.status, 303);
        assert.equal(new URL(response.location, base).searchParams.get("page"), "7");
        assert.equal(fixture.calls.filter(call => call.method === "dish.findMany").length, 0);
        assert.equal((await request(response.location)).status, 200);
        const empty = await request(`${path}?q=absent&page=1`);
        assert.equal(empty.status, 200);
        assert.deepEqual(ids(empty.html), []);
        assert.match(empty.html, /Không tìm thấy món ăn nào/);
        assert.match(empty.html, /Tổng kết quả: <strong>0<\/strong>/);
        assert.equal(navigation(empty.html), "");
        const beyond = await request(`${path}?q=absent&page=3&pageSize=50&junk=discard`);
        assert.equal(beyond.status, 303);
        const url = new URL(beyond.location, base);
        assert.deepEqual([...url.searchParams], [["q", "absent"], ["pageSize", "50"], ["page", "1"]]);
        assert.equal((await request(beyond.location)).status, 200);
        const filters = { q: specialName, ...(path.startsWith("/admin") ? { category: specialCategory, status: "available", sort: "newest" } : {}) };
        const redirected = await request(path + "?" + new URLSearchParams({ ...filters, page: "999", pageSize: "10", unused: "x" }));
        const destination = new URL(redirected.location, base);
        assert.equal(redirected.status, 303);
        for (const [key, value] of Object.entries(filters)) assert.equal(destination.searchParams.get(key), value);
        assert.equal(destination.searchParams.has("unused"), false);
        assert.equal((await request(redirected.location)).status, 200);
      }
    });

    await t.test("database failures stay HTML 500 instead of becoming empty results or redirects", async () => {
      const previous = console.error;
      console.error = () => {};
      try {
        for (const method of ["dish.count", "dish.findMany"]) {
          fixture.fail(method);
          for (const path of ["/dishes", "/admin/dishes"]) {
            const response = await request(path);
            assert.equal(response.status, 500);
            assert.match(response.html, /class="error-badge">500</);
            assert.doesNotMatch(response.html, /Fixture database|class="pagination"|Không tìm thấy món ăn nào/);
          }
        }
      } finally { fixture.fail(null); console.error = previous; }
    });

    await t.test("full form options, validation, confirmation, method override, 303 and 404 CRUD regression", async () => {
      for (const suffix of ["new", "1/edit"]) {
        clear();
        const response = await request(`/admin/dishes/${suffix}?pageSize=1`);
        assert.equal(response.status, 200);
        for (const chef of fixture.chefs) assert.match(response.html, new RegExp(`value="${chef.id}"`));
        assert.match(response.html, /Nguyên liệu 17/);
        for (const call of fixture.calls.filter(call => /^(chef|ingredient)\.findMany$/.test(call.method))) {
          assert.equal(call.args.take, undefined);
          assert.equal(call.args.skip, undefined);
        }
        assert.match(response.html, /method="POST"/);
      }
      const before = fixture.writes.length;
      const confirmation = await request("/admin/dishes/1/delete");
      assert.equal(confirmation.status, 200);
      assert.match(confirmation.html, /\?_method=DELETE/);
      assert.equal((await request("/admin/dishes/1?_method=DELETE")).status, 200);
      assert.equal(fixture.writes.length, before);
      const invalid = await request("/admin/dishes", { name: "Giữ tên món", price: "2abc", chefId: "14", ingredientIds: "17" });
      assert.equal(invalid.status, 400);
      assert.match(invalid.html, /value="Giữ tên món"/);
      assert.equal(fixture.writes.length, before);
      const values = { name: "Món test", price: "2000", chefId: "14", ingredientIds: "17", available: "on" };
      const created = await request("/admin/dishes", values);
      assert.equal(created.status, 303);
      assert.equal(created.location, "/admin/dishes/1000");
      const edited = await request("/admin/dishes/1000?_method=PATCH", { ...values, name: "Món đã sửa" });
      assert.equal(edited.status, 303);
      assert.equal(edited.location, "/admin/dishes/1000");
      const deleted = await request("/admin/dishes/1000?_method=DELETE", {});
      assert.equal(deleted.status, 303);
      assert.equal(deleted.location, "/admin/dishes");
      assert.deepEqual(fixture.writes.slice(before), ["create", "update", "delete"]);
      for (const path of ["/dishes/1000", "/admin/dishes/1000", "/admin/dishes/1000/edit", "/admin/dishes/1000/delete"]) {
        assert.equal((await request(path)).status, 404);
      }
      assert.equal((await request("/admin/dishes/1000?_method=PATCH", values)).status, 404);
      assert.equal((await request("/admin/dishes/1000?_method=DELETE", {})).status, 404);
    });

    await t.test("a completely empty database and a list shrinking past the last page recover on GET", async () => {
      const saved = fixture.rows.splice(0);
      try {
        for (const path of ["/dishes", "/admin/dishes"]) {
          assert.equal((await request(path + "?page=1")).status, 200);
          const beyond = await request(path + "?page=2");
          assert.equal(beyond.status, 303);
          const empty = await request(beyond.location);
          assert.equal(empty.status, 200);
          assert.equal(navigation(empty.html), "");
        }
        fixture.rows.push(...saved.slice(0, 11));
        for (const path of ["/dishes", "/admin/dishes"]) {
          assert.equal(ids((await request(path + "?page=2")).html).length, 1);
        }
        fixture.rows.pop(); // Simulate another request deleting the only last-page item.
        for (const path of ["/dishes", "/admin/dishes"]) {
          const beyond = await request(path + "?page=2");
          assert.equal(beyond.status, 303);
          const last = await request(beyond.location);
          assert.equal(last.status, 200);
          assert.equal(ids(last.html).length, 10);
          assert.match(navigation(last.html), /aria-disabled="true">Sau<\/span>/);
        }
      } finally { fixture.rows.splice(0, fixture.rows.length, ...saved); }
    });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
