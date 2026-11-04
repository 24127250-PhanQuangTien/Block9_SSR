const nodemailer = require("nodemailer");
let transportPromise;
async function transport() {
  if (!transportPromise) transportPromise = (async () => {
    if (process.env.SMTP_HOST) return nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_PORT === "465",
      ...(process.env.SMTP_USER ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } } : {}), connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 });
    const account = await nodemailer.createTestAccount();
    return nodemailer.createTransport({ host: account.smtp.host, port: account.smtp.port, secure: account.smtp.secure, auth: { user: account.user, pass: account.pass }, connectionTimeout: 10000, socketTimeout: 15000 });
  })().catch(error => { transportPromise = null; throw error; });
  return transportPromise;
}
function send(to, subject, text) {
  // Intentionally detached from response timing; never log message/OTP/token.
  setImmediate(async () => {
    try {
      const client = await transport();
      const result = await client.sendMail({ from: process.env.SMTP_FROM || "Restaurant <no-reply@example.test>", to, subject, text });
      const preview = nodemailer.getTestMessageUrl(result);
      if (preview) console.info("Email preview:", preview);
    } catch { console.error("Không gửi được email; kiểm tra cấu hình SMTP. Chi tiết nhạy cảm đã được giữ kín."); }
  });
}
module.exports = { send, transport };
