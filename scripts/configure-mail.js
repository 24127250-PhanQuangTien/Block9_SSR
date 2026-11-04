// Run interactively in the user's own terminal. Never echo SMTP credentials.
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const { Writable } = require("node:stream");
const { spawnSync } = require("node:child_process");
const dotenv = require("dotenv");
const validator = require("validator");

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("Hãy chạy tương tác trong terminal riêng; không truyền credential qua argv/chat/log.");
  const root = path.resolve(__dirname, "..");
  if (spawnSync("git", ["check-ignore", "--quiet", ".env"], { cwd: root, stdio: "ignore" }).status !== 0 || spawnSync("git", ["ls-files", "--error-unmatch", ".env"], { cwd: root, stdio: "ignore" }).status === 0) throw new Error(".env phải được Git ignore và không tracked trước khi cấu hình.");
  const file = path.join(root, ".env");
  let original = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const existing = dotenv.parse(original);
  let muted = false;
  const output = new Writable({ write(chunk, encoding, done) { if (!muted) process.stdout.write(chunk); done(); } });
  const rl = readline.createInterface({ input: process.stdin, output, terminal: true, historySize: 0 });
  const ask = (label, secret = false) => new Promise(resolve => {
    process.stdout.write(label); muted = secret;
    rl.question("", value => { muted = false; if (secret) process.stdout.write("\n"); resolve(value.trim()); });
  });
  try {
    console.log("Cấu hình SMTP cục bộ. Không đưa mật khẩu vào chat. Các trường credential sẽ KHÔNG hiện khi nhập.");
    const custom = process.argv.includes("--smtp");
    const host = custom ? await ask("SMTP host (Enter giữ cấu hình cũ): ") || existing.SMTP_HOST : "smtp.gmail.com";
    const port = custom ? await ask("SMTP port 465 hoặc 587 (Enter: 587): ") || existing.SMTP_PORT || "587" : "587";
    const user = await ask("Email tài khoản gửi (ẩn; Enter giữ giá trị đã có): ", true) || existing.SMTP_USER;
    let pass = await ask(custom ? "Mật khẩu SMTP (ẩn; Enter giữ giá trị đã có): " : "Mật khẩu ứng dụng Gmail 16 ký tự (ẩn; Enter giữ giá trị đã có): ", true) || existing.SMTP_PASS;
    if (!custom && pass) pass = pass.replace(/\s/g, "");
    if (!host || !/^[a-z0-9.-]+$/i.test(host) || !["465", "587"].includes(port) || !validator.isEmail(user || "") || !pass || /[\r\n]/.test(pass)) throw new Error("Cấu hình SMTP chưa hợp lệ; không ghi file, không in giá trị nhập.");
    if (!custom && !/^[a-z0-9]{16}$/i.test(pass)) throw new Error("Gmail cần mật khẩu ứng dụng 16 ký tự, không dùng mật khẩu đăng nhập; chưa ghi file.");
    const updates = { SMTP_HOST: host, SMTP_PORT: port, SMTP_USER: user, SMTP_PASS: pass, SMTP_FROM: `Restaurant <${user}>` };
    const eol = original.includes("\r\n") ? "\r\n" : "\n";
    for (const [key, value] of Object.entries(updates)) {
      const line = key + "=" + JSON.stringify(value);
      const pattern = new RegExp("^" + key + "=.*$", "m");
      if (pattern.test(original)) original = original.replace(pattern, () => line);
      else original += (original && !original.endsWith("\n") ? eol : "") + line + eol;
    }
    fs.writeFileSync(file, original, { mode: 0o600 });
    console.log("Đã lưu cấu hình SMTP vào .env; không in credential. Chạy npm.cmd run mail:check rồi khởi động lại server.");
  } finally { rl.close(); }
}
main().catch(error => { console.error(error.message && !/password=|smtp:\/\/|@/.test(error.message) ? error.message : "Không cấu hình được SMTP; thông tin nhạy cảm đã được giữ kín."); process.exitCode = 1; });
