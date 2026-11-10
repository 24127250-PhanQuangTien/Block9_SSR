require("dotenv").config();
const { randomInt } = require("node:crypto");
const db = require("../src/prisma");

async function loadPlan(client) {
  const chefs = await client.chef.findMany({ where: { name: { notIn: ["Bếp A", "Bếp B"] } }, select: { id: true, name: true }, orderBy: { id: "asc" } });
  const target = await client.dish.findMany({ where: { chef: { name: { in: ["Bếp A", "Bếp B"] } } }, select: { id: true }, orderBy: { id: "asc" } });
  if (chefs.length === 0) throw new Error("no eligible original chefs found");
  return { chefs, target };
}

async function main() {
  const plan = await loadPlan(db);
  const summary = { eligibleChefCount: plan.chefs.length, targetDishCount: plan.target.length, excludedChefNames: ["Bếp A", "Bếp B"] };
  if (process.argv[2] !== "--confirm") {
    console.log(JSON.stringify({ mode: "dry-run", ...summary }));
    return;
  }

  const result = await db.$transaction(async tx => {
    const current = await loadPlan(tx);
    const assignments = new Map(current.chefs.map(chef => [chef.id, []]));
    for (const dish of current.target) {
      const chef = current.chefs[randomInt(current.chefs.length)];
      assignments.get(chef.id).push(dish.id);
    }
    let changed = 0;
    for (const [chefId, dishIds] of assignments) {
      if (dishIds.length === 0) continue;
      changed += (await tx.dish.updateMany({ where: { id: { in: dishIds }, chefId: { in: [12, 13] } }, data: { chefId } })).count;
    }
    if (changed !== current.target.length) throw new Error("assignment row-count check failed; transaction rolled back");
    const remaining = await tx.dish.count({ where: { chef: { name: { in: ["Bếp A", "Bếp B"] } } } });
    if (remaining !== 0) throw new Error("excluded chefs still own dishes; transaction rolled back");
    return { randomizedDishCount: changed, remainingExcludedChefDishCount: remaining };
  });
  console.log(JSON.stringify({ mode: "confirmed", ...result, eligibleChefCount: plan.chefs.length }));
}

main().catch(() => { console.error("random assignment failed; transaction rolled back or was not started."); process.exitCode = 1; }).finally(() => db.$disconnect());
