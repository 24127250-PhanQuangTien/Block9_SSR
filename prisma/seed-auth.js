require("dotenv").config();
const db = require("../src/prisma");
const { normalizeEmail, validEmail, validPassword, hashPassword } = require("../src/services/crypto");

const accounts = [
  ["SEED_VIEWER_EMAIL", "SEED_VIEWER_PASSWORD", "viewer", null],
  ["SEED_EDITOR_A_EMAIL", "SEED_EDITOR_A_PASSWORD", "editor", "Bếp A"],
  ["SEED_EDITOR_B_EMAIL", "SEED_EDITOR_B_PASSWORD", "editor", "Bếp B"],
  ["SEED_ADMIN_EMAIL", "SEED_ADMIN_PASSWORD", "admin", null],
];

async function ensureChef(name) {
  const existing = await db.chef.findFirst({ where: { name } });
  return existing || db.chef.create({ data: { name, specialty: "Bếp mẫu phục vụ phân quyền Block 9" } });
}

async function main() {
  const chefA = await ensureChef("Bếp A");
  const chefB = await ensureChef("Bếp B");

  for (const [emailKey, passwordKey, role, chefName] of accounts) {
    const emailRaw = process.env[emailKey];
    const password = process.env[passwordKey];
    const email = normalizeEmail(emailRaw);
    if (!validEmail(email) || !validPassword(password)) throw new Error(emailKey + " / " + passwordKey + " thiếu hoặc không đạt chính sách; giá trị không được in.");
    const chefId = chefName === "Bếp A" ? chefA.id : chefName === "Bếp B" ? chefB.id : null;
    const existing = await db.user.findUnique({ where: { email } });
    const data = { emailRaw, email, passwordHash: await hashPassword(password), role, chefId, status: "active", emailVerifiedAt: new Date() };
    if (existing) await db.user.update({ where: { id: existing.id }, data });
    else await db.user.create({ data });
  }
  console.log("Đã seed hai đầu bếp, món mẫu và bốn tài khoản RBAC active; credential không được in.");
}
main().catch(() => { console.error("seed:auth thất bại; kiểm tra cấu hình hoặc database. Chi tiết nhạy cảm không được in."); process.exitCode = 1; }).finally(() => db.$disconnect());
