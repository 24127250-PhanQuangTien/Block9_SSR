// In-memory Prisma stand-in. Never imports the real client or loads .env.
// Used for HTTP/EJS contract tests and the local browser preview only.
const specialName = 'Phở & "chanh" + / ? #';
const specialCategory = 'Món & đặc biệt + /';

function createFixture() {
  const chefs = Array.from({ length: 14 }, (_, i) => ({ id: i + 1, name: `Đầu bếp ${i + 1}`, specialty: "Bếp Việt" }));
  const ingredients = Array.from({ length: 17 }, (_, i) => ({ id: i + 1, name: `Nguyên liệu ${i + 1}`, quantity: 10, unit: "kg" }));
  const rows = Array.from({ length: 137 }, (_, i) => ({
    id: i + 1, name: `${specialName} ${i % 4}`, description: `Chỉ mô tả ${i + 1}`,
    category: i % 2 ? "Món khác" : specialCategory, available: i % 3 !== 0,
    price: (i % 3 + 1) * 1000, imageUrl: null, chefId: 14, chef: chefs[13],
    ingredients: [ingredients[16]], createdAt: new Date(2026, 0, i % 3 + 1), updatedAt: new Date(2026, 0, 1),
  })).reverse(); // Ties must not inherit fixture insertion order.
  const calls = [];
  const writes = [];
  let failure = null;
  function record(method, args) {
    calls.push({ method, args });
    if (failure === method) throw new Error("Fixture database unavailable");
  }
  function matches(row, where = {}) {
    return Object.entries(where).every(([key, value]) => {
      if (key === "OR") return value.some(part => matches(row, part));
      if (value && typeof value === "object") {
        if ("contains" in value) return (row[key] || "").toLowerCase().includes(value.contains.toLowerCase());
        if ("not" in value) return row[key] !== value.not;
      }
      return row[key] === value;
    });
  }
  const db = {
    dish: {
      async count(args) { record("dish.count", args); return rows.filter(row => matches(row, args.where)).length; },
      async findMany(args) {
        record("dish.findMany", args);
        if (args.distinct) return [...new Set(rows.map(row => row.category))].map(category => ({ category }));
        // Fail loudly if production forgets database pagination or relations.
        if (!Number.isInteger(args.skip) || !Number.isInteger(args.take) || args.take < 1 || args.take > 100) {
          throw new Error("Unbounded dish list query");
        }
        if (!args.include?.chef || !args.include?.ingredients) throw new Error("Missing list relations");
        const orders = Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy];
        const sorted = rows.filter(row => matches(row, args.where)).sort((left, right) => {
          for (const order of orders) {
            const [key, direction] = Object.entries(order)[0];
            const comparison = left[key] < right[key] ? -1 : left[key] > right[key] ? 1 : 0;
            if (comparison) return direction === "desc" ? -comparison : comparison;
          }
          return 0;
        });
        return sorted.slice(args.skip, args.skip + args.take);
      },
      async findUnique(args) { record("dish.findUnique", args); return rows.find(row => row.id === args.where.id) || null; },
      async create({ data }) {
        writes.push("create");
        const row = { ...rows[0], ...data, id: 1000 };
        rows.push(row);
        return row;
      },
      async update({ where, data }) {
        writes.push("update");
        const row = rows.find(row => row.id === where.id);
        Object.assign(row, data);
        return row;
      },
      async delete({ where }) {
        writes.push("delete");
        const index = rows.findIndex(row => row.id === where.id);
        return rows.splice(index, 1)[0];
      },
    },
    chef: { async findMany(args) { record("chef.findMany", args); return chefs; } },
    ingredient: { async findMany(args) { record("ingredient.findMany", args); return ingredients; } },
    async $transaction(work) { return work(db); },
  };
  return { db, rows, chefs, ingredients, calls, writes, fail: method => { failure = method; } };
}

function installFixture(db) {
  const filename = require.resolve("../../src/prisma");
  require.cache[filename] = { id: filename, filename, loaded: true, exports: db };
}

module.exports = { createFixture, installFixture, specialName, specialCategory };
