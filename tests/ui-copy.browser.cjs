// UI regression preview: disposable in-memory data, no .env and no real DB.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const { once } = require('node:events');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const auth = require('./helpers/authFixture');
const { createFixture, installFixture } = require('./helpers/prismaFixture');
const fixture = createFixture();
fixture.rows.forEach((dish, i) => Object.assign(dish, {
  status: 'published', name: ['Phở bò', 'Bún chả', 'Cơm tấm'][i % 3],
  description: 'Hương vị Việt truyền thống', imageUrl: '/assets/img/dishes/pho-bo.jpg',
}));
fixture.db.dish.findFirst = ({ where }) => fixture.db.dish.findUnique({ where: { id: where.id } });
for (const [model, rows] of [['chef', fixture.chefs], ['ingredient', fixture.ingredients]]) {
  fixture.db[model].count = async () => rows.length;
  fixture.db[model].findUnique = async ({ where }) => ({ ...rows.find(row => row.id === where.id), dishes: [] });
}
installFixture(auth.attachAuth(fixture.db));
fixture.db.captchaChallenge = { async create({ data }) { return data; } };
const app = require('../src/app');
(async () => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const evidence = path.join(__dirname, '../docs/evidence/ui-copy');
  await fs.mkdir(evidence, { recursive: true });
  const report = [];
  try {
    const session = await auth.login(base);
    for (const width of [375, 844, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: width === 844 ? 390 : 900 }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      for (const route of ['/dishes', '/dishes/1', '/login', '/register', '/forgot', '/activate', '/admin/dishes', '/admin/dishes/new', '/admin/dishes/1', '/admin/dishes/1/edit', '/admin/dishes/1/delete', '/admin/chefs', '/admin/chefs/new', '/admin/chefs/1/edit', '/admin/chefs/1/delete', '/admin/ingredients', '/admin/ingredients/new', '/admin/ingredients/1/edit', '/admin/ingredients/1/delete', '/account/security']) {
        await context.clearCookies();
        if (route.startsWith('/admin') || route.startsWith('/account')) {
          const [name, value] = session.cookie.split('=');
          await context.addCookies([{ name, value, url: base }]);
        }
        const response = await page.goto(base + route);
        assert.equal(response.status(), 200, route);
        await page.evaluate(() => document.fonts.ready);
        if (route === '/dishes' && width === 1440) {
          assert.equal(await page.locator('.navbar a[href="/login"]').isVisible(), true);
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${width} ${route} overflow`);
        if (width === 375) {
          await page.locator('.navbar__toggle').click();
          assert.equal(await page.locator('.navbar__toggle').getAttribute('aria-expanded'), 'true');
          await page.keyboard.press('Escape');
          assert.equal(await page.locator('.navbar__toggle').getAttribute('aria-expanded'), 'false');
        }
        if (['/dishes', '/login', '/admin/dishes', '/admin/dishes/new'].includes(route)) {
          await page.screenshot({ path: path.join(evidence, `${route.replaceAll('/', '-').slice(1)}-${width}.png`), fullPage: true });
        }
        report.push({ width, route, status: 'PASS' });
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
    const context = await browser.newContext({ viewport: { width: 375, height: 900 }, javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(base + '/dishes');
    await page.locator('.pagination a').first().click();
    assert.match(page.url(), /page=/);
    assert.equal(await page.locator('.navbar a[href="/login"]').isVisible(), true);
    report.push({ width: 375, javascript: false, status: 'PASS' });
    await context.close();
    await fs.writeFile(path.join(evidence, 'results.json'), JSON.stringify(report, null, 2));
    console.log(`${report.length} UI checks passed (fixture data only).`);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
