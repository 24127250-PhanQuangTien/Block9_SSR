// Opt-in read-only UI smoke check. No registration, email, migration or CRUD.
require('dotenv').config();
const { once } = require('node:events');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const app = require('../src/app');
const db = require('../src/prisma');
(async () => {
  const [schema] = await db.$queryRaw`SELECT to_regclass('public."Session"')::text AS session_table`;
  if (!schema.session_table) {
    await fs.writeFile(path.join(__dirname, '../docs/evidence/ui-copy/real-results.json'), JSON.stringify({ status: 'BLOCKED', reason: 'Database is missing public.Session. SSR initializes sessions on public routes too. No migrations applied.' }, null, 2));
    console.log('Real UI check BLOCKED: database is missing public.Session.');
    await db.$disconnect();
    return;
  }
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const routes = schema.session_table ? ['/dishes', '/dishes?page=2', '/login'] : ['/dishes', '/dishes?page=2'];
    const results = [];
    for (const width of [375, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      for (const route of routes) {
        const response = await page.goto(`http://127.0.0.1:${server.address().port}${route}`);
        assert.equal(response.status(), 200, route);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
        if (route.startsWith('/dishes')) assert.equal(await page.locator('.menu-item').count(), 10);
        if (route === '/dishes') await page.screenshot({ path: path.join(__dirname, `../docs/evidence/ui-copy/real-dishes-${width}.png`), fullPage: true });
        results.push({ width, route, status: 'PASS' });
      }
      await page.close();
    }
    if (!schema.session_table) results.push({ route: '/login', status: 'BLOCKED', reason: 'Database is missing public.Session; migrations were not applied by this UI task.' });
    await fs.writeFile(path.join(__dirname, '../docs/evidence/ui-copy/real-results.json'), JSON.stringify(results, null, 2));
    console.log(`${results.filter(row => row.status === 'PASS').length} real-database UI checks passed; login ${schema.session_table ? 'checked' : 'blocked: missing Session table'}.`);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
    await db.$disconnect();
  }
})().catch(error => { console.error(error.name); process.exitCode = 1; });
