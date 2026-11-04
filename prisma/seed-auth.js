require("dotenv").config();
const db = require("../src/prisma");
const { normalizeEmail, validEmail, validPassword, hashPassword } = require("../src/services/crypto");
async function main() {
  const email = normalizeEmail(process.env.SEED_USER_EMAIL), password = process.env.SEED_USER_PASSWORD;
  if (!validEmail(email) || !validPassword(password)) throw new Error("SEED_USER_EMAIL / SEED_USER_PASSWORD thiếu hoặc không đạt chính sách; giá trị không được in.");
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.status !== "active") throw new Error("Tài khoản seed đã tồn tại nhưng chưa active; không tự ghi đè tài khoản.");
    console.log("Tài khoản seed active đã tồn tại; không đổi mật khẩu hoặc dữ liệu nhà hàng.");
    return;
  }
  await db.user.create({ data: { emailRaw: process.env.SEED_USER_EMAIL, email, passwordHash: await hashPassword(password), role: "viewer", status: "active", emailVerifiedAt: new Date() } });
  console.log("Đã tạo tài khoản seed active từ cấu hình; không đổi dữ liệu nhà hàng, không in credential.");
}
main().catch(() => { console.error("seed:auth thất bại; kiểm tra cấu hình hoặc tài khoản đã tồn tại. Chi tiết nhạy cảm không được in."); process.exitCode = 1; }).finally(() => db.$disconnect());
