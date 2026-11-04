require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");

function cli(args, tolerate = []) {
  const result = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", ...args], { encoding: "utf8", env: process.env, timeout: 120000 });
  const codes = [...new Set(((result.stdout || "") + (result.stderr || "")).match(/\bP\d{4}\b/g) || [])];
  if (result.status !== 0 && !codes.some(code => tolerate.includes(code))) {
    console.error(JSON.stringify({ operation: args.slice(0, 2).join(" "), exit: result.status, codes, details: "withheld" }));
    throw new Error("AUTH_DATABASE_COMMAND_FAILED");
  }
  return result.stdout;
}

async function main() {
  const mode = process.argv[2];
  if (mode === "inspect") {
    const schema = cli(["db", "pull", "--print"]);
    console.log(JSON.stringify({ existingModels: [...schema.matchAll(/model\s+(\w+)\s*\{/g)].map(match => match[1]) }));
    for (const match of schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
      if (["User", "Session", "RateLimit", "CaptchaChallenge", "ActivationChallenge", "PasswordReset"].includes(match[1])) {
        console.log(JSON.stringify({ model: match[1], definition: match[2] }));
      }
    }
    return;
  }
  if (mode === "generate") {
    const baseDir = "prisma/migrations/202611030001_baseline";
    const authDir = "prisma/migrations/202611030002_auth";
    const sessionDir = "prisma/migrations/202611030003_sessions";
    fs.mkdirSync(baseDir, { recursive: true }); fs.mkdirSync(authDir, { recursive: true }); fs.mkdirSync(sessionDir, { recursive: true });
    const current = fs.readFileSync("prisma/schema.prisma", "utf8");
    const authBaseline = current.replace(/\nmodel Session \{[\s\S]*?\n\}/, "").replace(/^\s+sessions\s+Session\[\]\r?\n/m, "");
    fs.writeFileSync("prisma/auth-baseline.prisma", authBaseline);
    const baseline = cli(["migrate", "diff", "--from-empty", "--to-schema-datamodel", "prisma/baseline.prisma", "--script"]);
    const auth = cli(["migrate", "diff", "--from-schema-datamodel", "prisma/baseline.prisma", "--to-schema-datamodel", "prisma/auth-baseline.prisma", "--script"]);
    const sessions = cli(["migrate", "diff", "--from-schema-datamodel", "prisma/auth-baseline.prisma", "--to-schema-datamodel", "prisma/schema.prisma", "--script"]);
    if (/\bDROP\b/i.test(auth) || /ALTER TABLE\s+"(?:dishes|chefs|ingredients|_DishToIngredient)"/i.test(auth)) throw new Error("UNSAFE_AUTH_MIGRATION");
    for (const name of ["User", "RateLimit", "CaptchaChallenge", "ActivationChallenge", "PasswordReset"]) {
      if (!auth.includes(`CREATE TABLE "${name}"`)) throw new Error("AUTH_MIGRATION_MISSING_TABLE");
    }
    fs.writeFileSync(path.join(baseDir, "migration.sql"), baseline);
    fs.writeFileSync(path.join(authDir, "migration.sql"), auth);
    if (/\bDROP\b/i.test(sessions) || !sessions.includes('CREATE TABLE "Session"')) throw new Error("UNSAFE_SESSION_MIGRATION");
    fs.writeFileSync(path.join(sessionDir, "migration.sql"), sessions);
    fs.writeFileSync("prisma/migrations/migration_lock.toml", 'provider = "postgresql"\n');
    cli(["generate"]);
    console.log("Auth migration generated and checked: additions only; no CRUD DDL.");
    return;
  }
  if (mode !== "deploy") throw new Error("Use generate or deploy");
  const db = require("../src/prisma");
  async function snapshot() {
    const rows = await Promise.all([
      db.dish.findMany({ orderBy: { id: "asc" }, include: { ingredients: { orderBy: { id: "asc" } } } }),
      db.chef.findMany({ orderBy: { id: "asc" } }), db.ingredient.findMany({ orderBy: { id: "asc" } }),
    ]);
    return { counts: rows.map(list => list.length), hash: createHash("sha256").update(JSON.stringify(rows)).digest("hex") };
  }
  try {
    const before = await snapshot();
    // Existing Block5 database has no migration history. Mark its baseline ONLY;
    // never execute baseline CREATE statements against existing restaurant tables.
    cli(["migrate", "resolve", "--applied", "202611030001_baseline"], ["P3008"]);
    const remoteSchema = cli(["db", "pull", "--print"]);
    const existingAuth = ["User", "ActivationChallenge", "PasswordReset", "CaptchaChallenge", "RateLimit"].every(name => new RegExp(`model ${name} \\{`).test(remoteSchema));
    if (existingAuth) {
      // Adopt the matching pre-existing auth tables; never recreate/alter their data.
      for (const name of ["user", "activationChallenge", "passwordReset", "captchaChallenge", "rateLimit"]) {
        await db[name].findMany({ take: 1 });
      }
      cli(["migrate", "resolve", "--rolled-back", "202611030002_auth"], ["P3011", "P3012"]);
      cli(["migrate", "resolve", "--applied", "202611030002_auth"], ["P3008"]);
    }
    cli(["migrate", "deploy"]);
    const after = await snapshot();
    if (before.hash !== after.hash) throw new Error("CRUD_DATA_CHANGED_DURING_MIGRATION");
    const authTables = await Promise.all([db.user.count(), db.session.count(), db.rateLimit.count(), db.captchaChallenge.count(), db.activationChallenge.count(), db.passwordReset.count()]);
    console.log(JSON.stringify({ migration: "PASS", crudCounts: after.counts, crudSnapshotUnchanged: true, authTablesAccessible: authTables.length }));
  } finally { await db.$disconnect(); }
}
main().catch(error => {
  console.error(JSON.stringify({ error: /^[A-Z_]+$/.test(error.message) ? error.message : "AUTH_DATABASE_FAILURE", code: /^P\d{4}$/.test(error.code || "") ? error.code : undefined, details: "withheld" }));
  process.exitCode = 1;
});
