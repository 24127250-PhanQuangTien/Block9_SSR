// Opt-in browser acceptance against the REAL running server. No .env/Prisma.
// Install Playwright outside the application; pass its module directory as argv[2].
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
require("dotenv").config();
const { chromium } = require(process.argv[2] || path.join(os.tmpdir(), "ssr-pagination-playwright/node_modules/playwright"));
const base = "http://localhost:3000";
const evidence = path.resolve(__dirname, "../docs/evidence/pagination-browser");
const inspectOnly = process.argv.includes("--inspect");
const only = process.argv.find(arg => arg.startsWith("--only="))?.slice(7);
const report = { data: "real database via npm start, real session login", origin: base, startedAt: new Date().toISOString(), checks: [], screenshots: [], blockedWrites: 0, blockedDocuments: 0, documentGets: 0 };
let browser;

async function check(name, work) {
  if (only && !name.includes(only)) return;
  try {
    const details = await work();
    report.checks.push({ name, status: "PASS", ...details });
    console.log(JSON.stringify({ check: name, status: "PASS", ...details }));
  } catch (error) {
    // Browser/assertion errors contain only local page state, never env/config.
    const detail = String(error.message).split("\n").slice(0, 5).join(" ").replace(/\u001b\[[0-9;]*m/g, "").slice(0, 600);
    report.checks.push({ name, status: "FAIL", detail });
    console.log(JSON.stringify({ check: name, status: "FAIL", detail }));
    process.exitCode = 1;
  }
}

async function contextFor(width, javaScriptEnabled) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, javaScriptEnabled, reducedMotion: "reduce" });
  await context.route("**/*", route => {
    const request = route.request();
    const requestedURL = new URL(request.url());
    const loginPost = request.method() === "POST" && requestedURL.origin === base && requestedURL.pathname === "/login";
    if (!["GET", "HEAD"].includes(request.method()) && !loginPost) {
      report.blockedWrites++;
      return route.abort("blockedbyclient");
    }
    if (request.isNavigationRequest() && request.resourceType() === "document") {
      const url = new URL(request.url());
      if (url.origin !== base || !["/dishes", "/admin/dishes", "/login"].includes(url.pathname)) {
        report.blockedDocuments++;
        return route.abort("blockedbyclient");
      }
      report.documentGets++;
    }
    return route.continue();
  });
  return context;
}

async function login(context) {
  const page = await context.newPage();
  const publicMenu = await context.request.get(base + "/dishes", { maxRedirects: 0 });
  assert.equal(publicMenu.status(), 200);
  const redirected = await page.goto(base + "/admin/dishes", { waitUntil: "domcontentloaded" });
  const denied = await redirected.request().redirectedFrom().response();
  assert.equal(denied.status(), 303);
  assert.equal(denied.headers().location, "/login");
  const adminDenied = await context.request.get(base + "/admin/dishes", { maxRedirects: 0 });
  assert.equal(adminDenied.status(), 303);
  assert.equal(adminDenied.headers().location, "/login");
  report.unauthenticated303 = (report.unauthenticated303 || 0) + 2;
  assert.equal(new URL(page.url()).pathname, "/login");
  assert.ok(process.env.SEED_USER_EMAIL && process.env.SEED_USER_PASSWORD, "Seed login must be configured locally");
  await page.locator('form[action="/login"] [name="email"]').fill(process.env.SEED_USER_EMAIL);
  await page.locator('form[action="/login"] [name="password"]').fill(process.env.SEED_USER_PASSWORD);
  const [response] = await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded" }), page.locator('form[action="/login"] button').click()]);
  assert.equal(response.status(), 200);
  assert.equal(new URL(page.url()).pathname, "/dishes");
  await loaded(page);
  await page.close();
}

async function loaded(page) {
  await page.locator(".pagination-summary").waitFor();
  assert.equal(await page.locator('form[method="GET"]').count(), 1);
}

async function goto(page, route) {
  const response = await page.goto(base + route, { waitUntil: "domcontentloaded" });
  assert.equal(response.status(), 200);
  await loaded(page);
}

async function navigate(page, action) {
  const [response] = await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }), action(),
  ]);
  if (response) assert.equal(response.status(), 200);
  await loaded(page);
}

async function state(page) {
  return page.evaluate(() => {
    const form = document.querySelector('form[method="GET"]');
    const fields = Object.fromEntries([...form.querySelectorAll('input:not([type="hidden"]),select')].map(el => [el.name, el.value]));
    const admin = location.pathname.startsWith("/admin");
    const names = [...document.querySelectorAll(admin ? ".data-table tbody tr td:nth-child(3) a" : ".menu-item__name")];
    const summary = [...document.querySelectorAll(".pagination-summary strong")].map(el => Number(el.textContent));
    return {
      url: location.pathname + location.search, fields,
      ids: names.map(el => Number(el.getAttribute("href").split("/").pop())),
      names: names.map(el => el.textContent.trim()), total: summary[0], shown: summary[1],
      page: Number(document.querySelector('[aria-current="page"]')?.textContent || 1),
      totalPages: Number(document.querySelector(".pagination__status")?.textContent.match(/\/\s*(\d+)/)?.[1] || 1),
    };
  });
}

async function assertState(page, expected) {
  const actual = await state(page);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("History mismatch: " + JSON.stringify({ expectedFields: expected.fields, actualFields: actual.fields, expectedURL: expected.url, actualURL: actual.url, sameRows: JSON.stringify(actual.ids) === JSON.stringify(expected.ids) }));
  assert.deepEqual(actual, expected, "History URL, rows, totals and form fields must match the saved page");
}

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(evidence, name), animations: "disabled", mask: [page.locator('.auth-account__email'), page.locator('input[type="email"]'), page.locator('input[type="password"]')] });
  report.screenshots.push(name);
}

async function layout(page, route, width, nojs) {
  const label = `${route.startsWith("/admin") ? "admin-dishes" : "dishes"}-${width}-${nojs ? "nojs" : "js"}-real`;
  await goto(page, `${route}?page=7&pageSize=10`);
  const current = await state(page);
  assert.equal(current.page, 7);
  assert.equal(current.ids.length, current.shown);
  assert.equal(current.shown, 10);
  assert.ok(current.total > 60, "Real data must support this middle-page scenario");
  assert.equal(await page.locator('.pagination [aria-current="page"]').count(), 1);
  assert.ok(await page.locator(".pagination__gap").count() > 0);
  const active = await page.locator('[aria-current="page"]').evaluate(el => ({ color: getComputedStyle(el).color, bg: getComputedStyle(el).backgroundColor }));
  assert.notEqual(active.color, active.bg);
  const form = page.locator('form[method="GET"]');
  await form.scrollIntoViewIfNeeded();
  await screenshot(page, label + "-form.png");
  await page.locator(".pagination").scrollIntoViewIfNeeded();
  await screenshot(page, label + "-pagination.png");
  const metrics = await page.evaluate(() => {
    const selectors = ['form[method="GET"]', 'input[name="q"]', '#page-size', 'button[type="submit"]', '.pagination', '.pagination__item', '.menu-item', '.admin-filter-field', '.admin-table-card'];
    const outside = [];
    for (const selector of selectors) for (const el of document.querySelectorAll(selector)) {
      const rect = el.getBoundingClientRect();
      if (rect.left < -1 || rect.right > innerWidth + 1) outside.push(selector);
    }
    const table = document.querySelector(".admin-table-card > div");
    return { viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth,
      outside, tableClient: table?.clientWidth, tableScroll: table?.scrollWidth };
  });
  assert.ok(metrics.documentWidth <= width + 1 && metrics.bodyWidth <= width + 1, `Whole-page overflow: ${JSON.stringify(metrics)}`);
  assert.deepEqual(metrics.outside, [], "Controls/list/navigation must fit the viewport");
  if (route.startsWith("/admin")) {
    assert.ok(metrics.tableScroll > metrics.tableClient, "Table should overflow inside its own scroll container");
    const scrolled = await page.locator(".admin-table-card > div").evaluate(el => { el.scrollLeft = 240; return { left: el.scrollLeft, pageX: window.scrollX }; });
    assert.ok(scrolled.left > 0);
    assert.equal(scrolled.pageX, 0);
  }
  return { ...metrics, total: current.total, shown: current.shown };
}

async function nativeFlow(page, route, width) {
  await goto(page, `${route}?page=1&pageSize=10`);
  const firstName = (await state(page)).names[0];
  const q = firstName.split(/\s+/)[0];
  const filters = { q };
  if (route.startsWith("/admin")) {
    const category = (await page.locator(".data-table tbody tr:first-child td:nth-child(4)").textContent()).trim();
    const statusText = await page.locator(".data-table tbody tr:first-child td:nth-child(8)").textContent();
    filters.category = category;
    filters.status = statusText.includes("Đang phục vụ") ? "available" : "unavailable";
    filters.sort = "name";
  }
  await goto(page, `${route}?page=2&pageSize=10`);
  await page.locator('input[name="q"]').fill(q);
  if (route.startsWith("/admin")) {
    await page.locator('[name="category"]').selectOption(filters.category);
    await page.locator('[name="status"]').selectOption(filters.status);
    await page.locator('[name="sort"]').selectOption(filters.sort);
  }
  const submit = () => page.locator('form[method="GET"] button[type="submit"]').click();
  await navigate(page, submit);
  let first = await state(page);
  assert.equal(first.page, 1);
  assert.equal(new URL(page.url()).searchParams.get("page"), "1");
  for (const [key, value] of Object.entries(filters)) assert.equal(first.fields[key], value);
  assert.ok(first.total > 20, "Fixture-free flow needs enough matching REAL rows for pageSize 20");
  await navigate(page, () => page.locator('.pagination a[rel="next"]').click());
  const second = await state(page);
  assert.equal(second.page, 2);
  assert.notDeepEqual(second.ids, first.ids);
  for (const [key, value] of Object.entries(filters)) assert.equal(new URL(page.url()).searchParams.get(key), value);
  await page.locator('#page-size').selectOption("20");
  await navigate(page, submit);
  let resized = await state(page);
  assert.equal(resized.page, 1);
  assert.equal(resized.shown, 20);
  assert.equal(resized.fields.pageSize, "20");
  for (const [key, value] of Object.entries(filters)) assert.equal(resized.fields[key], value);
  await navigate(page, () => page.locator('.pagination a[rel="next"]').click());
  assert.equal((await state(page)).page, 2);
  await page.locator('input[name="q"]').fill(firstName);
  await navigate(page, submit);
  const searched = await state(page);
  assert.equal(searched.page, 1);
  assert.equal(searched.fields.q, firstName);
  assert.equal(searched.fields.pageSize, "20");
  for (const [key, value] of Object.entries(filters).filter(([key]) => key !== "q")) assert.equal(searched.fields[key], value);
  return { viewport: width, javaScriptEnabled: false, filteredTotal: first.total, pageSizeReset: true, newSearchReset: true };
}

async function focusInfo(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const key = el.matches('input[name="q"]') ? "input" : el.matches('select') ? el.name : el.matches('form[method="GET"] button[type="submit"]') ? "submit" : el.matches('.pagination a') ? "pageLink" : "other";
    return { key, focusVisible: el.matches(':focus-visible'), outline: style.outlineStyle, outlineWidth: parseFloat(style.outlineWidth), shadow: style.boxShadow,
      inView: rect.top >= -1 && rect.bottom <= innerHeight + 1 && rect.left >= -1 && rect.right <= innerWidth + 1,
      rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right }, viewportHeight: innerHeight,
      disabled: el.matches('[aria-disabled="true"]') };
  });
}

async function keyboard(page, route, width, nojs) {
  await goto(page, `${route}?page=1&pageSize=10`);
  const q = (await state(page)).names[0].split(/\s+/)[0];
  await goto(page, `${route}?page=2&pageSize=10`);
  for (let i = 0; i < 25 && (await focusInfo(page)).key !== "input"; i++) await page.keyboard.press("Tab");
  assert.equal((await focusInfo(page)).key, "input", "Tab must reach the search input");
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(q);
  await navigate(page, () => page.keyboard.press("Enter"));
  assert.equal((await state(page)).page, 1);
  assert.equal((await state(page)).fields.q, q);
  const seen = new Set();
  let changedSize = false;
  for (let i = 0; i < 180; i++) {
    await page.keyboard.press("Tab");
    let info = await focusInfo(page);
    assert.equal(info.disabled, false, "Disabled pagination must be skipped by Tab");
    if (info.key === "other") continue;
    // Native keyboard scrolling can animate; inspect the settled target, not an
    // unrelated image/detail link crossed while tabbing through the list.
    try {
      await page.waitForFunction(() => {
        const r = document.activeElement.getBoundingClientRect();
        return r.top >= -1 && r.bottom <= innerHeight + 1;
      }, null, { timeout: 3000 });
    } catch {
      await screenshot(page, `${route.startsWith('/admin') ? 'admin-dishes' : 'dishes'}-${width}-${nojs ? 'nojs' : 'js'}-focus-diagnostic-real.png`);
      throw new Error("Focus did not settle in viewport: " + JSON.stringify(await focusInfo(page)));
    }
    info = await focusInfo(page);
    seen.add(info.key);
    assert.equal(info.focusVisible, true, "Keyboard focus must match :focus-visible");
    assert.ok((info.outline !== "none" && info.outlineWidth > 0) || info.shadow !== "none", `Missing focus treatment: ${info.key}`);
    if (!info.inView) await screenshot(page, `${route.startsWith('/admin') ? 'admin-dishes' : 'dishes'}-${width}-${nojs ? 'nojs' : 'js'}-focus-diagnostic-real.png`);
  assert.equal(info.inView, true, `Focused control clipped: ${JSON.stringify(info)}`);
    if (info.key === "pageSize" && !changedSize) {
      await page.keyboard.press("ArrowDown");
      assert.equal(await page.locator('#page-size').inputValue(), "20");
      changedSize = true;
    }
    if (info.key === "submit" && changedSize && (await state(page)).fields.pageSize === "20" && !(await page.locator('.pagination-summary').innerText()).includes("Đang hiển thị 20 món")) {
      await navigate(page, () => page.keyboard.press("Enter"));
      assert.equal((await state(page)).page, 1);
      const submitted = await state(page);
      assert.equal(submitted.shown, Math.min(20, submitted.total));
    }
    if (info.key === "pageLink") {
      const label = `${route.startsWith("/admin") ? "admin-dishes" : "dishes"}-${width}-${nojs ? "nojs" : "js"}-real-keyboard.png`;
      await screenshot(page, label);
      const destination = new URL(await page.locator('.pagination a:focus').getAttribute("href"), base);
      await navigate(page, () => page.keyboard.press("Enter"));
      assert.equal(page.url(), destination.href);
      break;
    }
  }
  for (const key of ["input", "pageSize", "submit", "pageLink", ...(route.startsWith("/admin") ? ["category", "status", "sort"] : [])]) assert.ok(seen.has(key), `Tab did not reach ${key}`);
  return { viewport: width, javaScriptEnabled: !nojs, tabTargets: [...seen], enterSearch: true, enterSubmit: true, enterLink: true };
}

async function history(page, route, width, nojs) {
  await goto(page, `${route}?page=1&pageSize=10`);
  const q = (await state(page)).names[0].split(/\s+/)[0];
  await goto(page, `${route}?page=2&pageSize=10`);
  const original = await state(page);
  await page.locator('input[name="q"]').fill(q);
  if (route.startsWith("/admin")) {
    await page.locator('[name="status"]').selectOption("available");
    await page.locator('[name="sort"]').selectOption("newest");
  }
  await navigate(page, () => page.locator('form[method="GET"] button[type="submit"]').click());
  const filtered = await state(page);
  await navigate(page, () => page.locator('.pagination a[rel="next"]').click());
  const next = await state(page);
  await page.goBack({ waitUntil: "domcontentloaded" }); await loaded(page);
  await assertState(page, filtered);
  await page.goBack({ waitUntil: "domcontentloaded" }); await loaded(page);
  await assertState(page, original);
  await page.goForward({ waitUntil: "domcontentloaded" }); await loaded(page);
  await assertState(page, filtered);
  await page.goForward({ waitUntil: "domcontentloaded" }); await loaded(page);
  await assertState(page, next);
  return { viewport: width, javaScriptEnabled: !nojs, back: 2, forward: 2, urlRowsFormMatch: true };
}

async function boundary(page, route) {
  await goto(page, `${route}?page=1&pageSize=10`);
  const first = await state(page);
  assert.equal(await page.locator('.pagination span[aria-disabled="true"]', { hasText: "Trước" }).count(), 1);
  assert.equal(await page.locator('.pagination a', { hasText: /^Trước$/ }).count(), 0);
  await navigate(page, () => page.locator(`.pagination a[aria-label="Trang ${first.totalPages}"]`).click());
  assert.equal((await state(page)).page, first.totalPages);
  assert.equal(await page.locator('.pagination span[aria-disabled="true"]', { hasText: "Sau" }).count(), 1);
  assert.equal(await page.locator('.pagination a', { hasText: /^Sau$/ }).count(), 0);
  assert.equal(await page.locator('.pagination [aria-disabled="true"][href],.pagination [aria-disabled="true"][tabindex]').count(), 0);
  return { totalPages: first.totalPages, disabledNotLinks: true };
}

async function main() {
  await fs.mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ channel: "chrome", headless: true });
  report.browser = browser.version();
  report.playwright = require(path.join(path.dirname(require.resolve(process.argv[2] || path.join(os.tmpdir(), "ssr-pagination-playwright/node_modules/playwright"))), "package.json")).version;
  for (const width of [1440, 375]) for (const nojs of [false, true]) {
    const context = await contextFor(width, !nojs);
    try {
      await login(context);
      for (const route of ["/dishes", "/admin/dishes"]) {
        const page = await context.newPage();
        page.setDefaultTimeout(20000);
        page.setDefaultNavigationTimeout(30000);
        await check(`layout ${route} ${width} ${nojs ? "nojs" : "js"}`, () => layout(page, route, width, nojs));
        if (!inspectOnly) {
          if (nojs) await check(`native GET workflow ${route} ${width} nojs`, () => nativeFlow(page, route, width));
          if ((width === 1440 && !nojs) || (width === 375 && nojs)) {
            await check(`keyboard ${route} ${width} ${nojs ? "nojs" : "js"}`, () => keyboard(page, route, width, nojs));
            await check(`history ${route} ${width} ${nojs ? "nojs" : "js"}`, () => history(page, route, width, nojs));
          }
          if (width === 1440 && !nojs) await check(`first-last ${route}`, () => boundary(page, route));
        }
        await page.close();
      }
    } finally { await context.close(); }
  }
  assert.equal(report.blockedWrites, 0, "No write request may be attempted");
  assert.equal(report.blockedDocuments, 0, "No navigation outside the two SSR lists may be attempted");
}

main().catch(error => {
  process.exitCode = 1;
  console.error(JSON.stringify({ fatal: error.name, detail: String(error.message).split("\n")[0].slice(0, 400) }));
}).finally(async () => {
  if (browser) await browser.close();
  report.completedAt = new Date().toISOString();
  report.status = process.exitCode ? "FAIL" : "PASS";
  await fs.writeFile(path.join(evidence, inspectOnly ? "inspection.json" : "results.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, documentGets: report.documentGets, blockedWrites: report.blockedWrites, screenshots: report.screenshots.length, evidence }));
});
