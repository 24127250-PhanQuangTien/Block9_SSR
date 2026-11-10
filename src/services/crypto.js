const crypto = require("node:crypto");
const argon2 = require("argon2");
const validator = require("validator");
const { policy } = require("../config/authPolicy");
const random = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");
const tokenHash = token => crypto.createHash("sha256").update(token).digest("hex");
const normalizeEmail = value => typeof value === "string" ? value.trim().toLowerCase() : "";
const validEmail = value => typeof value === "string" && value.length <= 254 && validator.isEmail(value);
const validPassword = value => typeof value === "string" && value.length >= policy.passwordMin && value.length <= policy.passwordMax && /\p{L}/u.test(value) && /\p{N}/u.test(value);
const hashPassword = password => argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
const verifyPassword = (hash, password) => argon2.verify(hash, typeof password === "string" && password.length <= 128 ? password : "invalid-password-input");
function equal(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const otpCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, "0");
const otpHash = (pepper, userId, otp) => crypto.createHmac("sha256", pepper).update(`${userId}:${otp}`).digest("hex");
function encryptSecret(value, key) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map(part => part.toString("base64url")).join(".");
}
function decryptSecret(value, key) {
  const parts = typeof value === "string" ? value.split(".") : [];
  if (parts.length !== 3) throw new Error("Invalid encrypted MFA secret");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(parts[0], "base64url"));
  decipher.setAuthTag(Buffer.from(parts[1], "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(parts[2], "base64url")), decipher.final()]).toString("utf8");
}
const recoveryHash = code => crypto.createHash("sha256").update(code).digest("hex");
module.exports = { random, tokenHash, normalizeEmail, validEmail, validPassword, hashPassword, verifyPassword, equal, otpCode, otpHash, encryptSecret, decryptSecret, recoveryHash };
