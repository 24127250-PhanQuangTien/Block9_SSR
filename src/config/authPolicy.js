const MINUTE = 60000;
const policy = Object.freeze({
  passwordMin: 8, passwordMax: 128,
  otpTTL: 10 * MINUTE, otpAttempts: 5, otpLock: 15 * MINUTE,
  resendDelay: MINUTE, resendLimit: 5, resendWindow: 60 * MINUTE,
  captchaTTL: 5 * MINUTE, captchaIssueLimit: 60, captchaIssueWindow: 15 * MINUTE,
  loginWindow: 15 * MINUTE, loginCaptchaAfter: 3, loginLockAfter: 10, loginLock: 5 * MINUTE,
  loginIP: 30, registerIP: 10, forgotIP: 20, forgotEmail: 5, activationLimit: 20,
  resetTTL: 15 * MINUTE, idle: 30 * MINUTE, absolute: 8 * 60 * MINUTE,
  mfaPendingTTL: 5 * MINUTE, mfaAttempts: 5, mfaWindow: 15 * MINUTE, mfaLock: 15 * MINUTE,
  genericResponseFloor: 1200,
});

function configuration(env = process.env) {
  for (const key of ["SESSION_SECRET", "OTP_PEPPER"]) {
    if (typeof env[key] !== "string" || env[key].length < 32) throw new Error(`${key} phải có ít nhất 32 ký tự; cấu hình ở .env.`);
  }
  let mfaEncryptionKey;
  try { mfaEncryptionKey = Buffer.from(env.MFA_ENCRYPTION_KEY || "", "base64"); } catch { mfaEncryptionKey = Buffer.alloc(0); }
  if (mfaEncryptionKey.length !== 32) throw new Error("MFA_ENCRYPTION_KEY phải là base64 của đúng 32 bytes; cấu hình ở .env.");
  let base, origin;
  try { base = new URL(env.APP_BASE_URL || "http://localhost:3000"); origin = new URL(env.APP_ORIGIN || base.origin); }
  catch { throw new Error("APP_BASE_URL hoặc APP_ORIGIN không phải URL hợp lệ; giá trị được giữ kín."); }
  if (base.username || base.password || origin.username || origin.password || !["http:", "https:"].includes(base.protocol) || origin.origin !== base.origin) {
    throw new Error("APP_BASE_URL và APP_ORIGIN phải là URL HTTP(S) cùng origin, không chứa credential.");
  }
  if (env.NODE_ENV === "production" && base.protocol !== "https:") throw new Error("Production yêu cầu HTTPS cho APP_BASE_URL.");
  const trustProxy = env.TRUST_PROXY === "1" ? 1 : env.TRUST_PROXY === "true" ? true : env.TRUST_PROXY === "false" || !env.TRUST_PROXY ? false : env.TRUST_PROXY;
  return { secret: env.SESSION_SECRET, pepper: env.OTP_PEPPER, mfaEncryptionKey, baseUrl: base.origin, origin: origin.origin, production: env.NODE_ENV === "production", trustProxy };
}
module.exports = { policy, configuration };
