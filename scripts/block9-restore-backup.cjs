require("dotenv").config();
const fs = require("node:fs/promises");
const path = require("node:path");
const db = require("../src/prisma");

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const output = path.resolve("backups", `block9-restore-${stamp}.json`);
  const [chefs, dishes, ingredients] = await Promise.all([
    db.chef.findMany({ orderBy: { id: "asc" } }),
    db.dish.findMany({ orderBy: { id: "asc" } }),
    db.ingredient.findMany({ orderBy: { id: "asc" } }),
  ]);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify({ generatedAt: new Date().toISOString(), scope: "chef-dish-ingredient restoration", chefs, dishes, ingredients }, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ backup: output, chefCount: chefs.length, dishCount: dishes.length, ingredientCount: ingredients.length }));
}

main().catch(() => { console.error("backup thất bại; không ghi phục hồi."); process.exitCode = 1; }).finally(() => db.$disconnect());
