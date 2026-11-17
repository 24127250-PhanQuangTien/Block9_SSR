// Real Express/EJS, login, sessions, CSRF and authorization; disposable DB fixture.
// Does not load .env or access the application database.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const auth = require('./helpers/authFixture');
const { createFixture, installFixture } = require('./helpers/prismaFixture');
const fixture = createFixture();
const db = auth.attachAuth(fixture.db);
const profile = { role: 'editor', chefId: 14 };
const findUser = db.user.findUnique.bind(db.user);
db.user.findUnique = async args => {
  const user = await findUser(args);
  return user ? { ...user, ...profile } : null;
};
const dish = fixture.rows.find(row => row.id === 1);
const original = structuredClone({ ...dish, status: 'draft' });
const updates = [];
db.dish.updateMany = async ({ where, data }) => {
  if (!Object.entries(where).every(([key, value]) => dish[key] === value)) return { count: 0 };
  updates.push({ where: { ...where }, data: { ...data } });
  Object.assign(dish, data);
  return { count: 1 };
};
db.dish.update = async ({ where, data }) => {
  assert.equal(where.id, dish.id);
  if (data.ingredients) dish.ingredients = data.ingredients.set.map(({ id }) => fixture.ingredients.find(item => item.id === id));
  return dish;
};
installFixture(db);
const app = require('../src/app');
const values = { name: 'Updated draft', price: '55000', chefId: '14', ingredientIds: '17', available: 'on' };

test('SSR dish editing enforces RBAC first and database ABAC on GET and PATCH', async t => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const session = await auth.login(base);
    const request = async (route, body, method = 'POST') => {
      const response = await fetch(base + route, {
        redirect: 'manual', headers: { Cookie: session.cookie },
        ...(body ? { method, body: new URLSearchParams({ _csrf: session.csrf, ...body }) } : {}),
      });
      return { status: response.status, location: response.headers.get('location'), html: await response.text() };
    };
    const edit = '/admin/dishes/1/edit';
    const patch = '/admin/dishes/1?_method=PATCH';
    const reset = () => {
      Object.assign(dish, structuredClone(original));
      Object.assign(profile, { role: 'editor', chefId: 14 });
      updates.length = 0;
    };

    await t.test('editor can open and submit their own draft; forged privileged fields are ignored', async () => {
      reset();
      const form = await request(edit);
      assert.equal(form.status, 200);
      assert.match(form.html, /name="_csrf"/);
      assert.doesNotMatch(form.html, /name="(?:chefId|status)"/);
      const result = await request(patch, { ...values, role: 'admin', chefId: '1', status: 'published' });
      assert.equal(result.status, 303);
      assert.equal(result.location, '/admin/dishes/1');
      assert.equal(dish.name, values.name);
      assert.equal(dish.chefId, 14);
      assert.equal(dish.status, 'draft');
      assert.equal(updates.length, 1);
      assert.deepEqual(updates[0].where, { id: 1, chefId: 14, status: 'draft' });
    });

    await t.test('direct PATCH without opening a form uses the same ownership and status rules', async () => {
      reset();
      assert.equal((await request('/admin/dishes/1', values, 'PATCH')).status, 303);
      assert.equal(dish.name, values.name);
      for (const row of [{ chefId: 1 }, { status: 'published' }]) {
        reset();
        Object.assign(dish, row);
        const before = structuredClone(dish);
        assert.equal((await request('/admin/dishes/1', values, 'PATCH')).status, 403);
        assert.deepEqual(dish, before);
        assert.equal(updates.length, 0);
      }
    });

    for (const scenario of [
      { name: 'viewer cannot edit', user: { role: 'viewer' } },
      { name: 'editor cannot edit another chef draft', row: { chefId: 1 } },
      { name: 'editor cannot edit a published dish', row: { status: 'published' } },
      { name: 'editor without assigned chef cannot edit', user: { chefId: null } },
    ]) await t.test(scenario.name, async () => {
      reset();
      Object.assign(profile, scenario.user);
      Object.assign(dish, scenario.row);
      const before = structuredClone(dish);
      assert.equal((await request(edit)).status, 403);
      assert.equal((await request(patch, { ...values, role: 'admin', chefId: '14', status: 'draft' })).status, 403);
      assert.deepEqual(dish, before);
      assert.equal(updates.length, 0);
    });

    for (const change of ['published', 'owner', 'role']) await t.test(`PATCH rechecks ${change} after opening the edit form`, async () => {
      reset();
      assert.equal((await request(edit)).status, 200);
      if (change === 'published') dish.status = 'published';
      if (change === 'owner') dish.chefId = 1;
      if (change === 'role') profile.role = 'viewer';
      const before = structuredClone(dish);
      assert.equal((await request(patch, values)).status, 403);
      assert.deepEqual(dish, before);
      assert.equal(updates.length, 0);
    });

    await t.test('admin can edit another chef published dish', async () => {
      reset();
      profile.role = 'admin';
      dish.chefId = 1;
      dish.status = 'published';
      assert.equal((await request(edit)).status, 200);
      assert.equal((await request(patch, { ...values, status: 'published' })).status, 303);
      assert.equal(dish.name, values.name);
      assert.equal(dish.status, 'published');
      assert.equal(dish.chefId, 14);
    });

    await t.test('editor still cannot delete or submit without CSRF', async () => {
      reset();
      assert.equal((await request('/admin/dishes/1/delete')).status, 403);
      assert.equal((await request('/admin/dishes/1?_method=DELETE', {})).status, 403);
      assert.equal((await request(patch, { ...values, _csrf: '' })).status, 403);
      assert.equal(updates.length, 0);
    });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
