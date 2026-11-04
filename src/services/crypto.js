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
module.exports = { random, tokenHash, normalizeEmail, validEmail, validPassword, hashPassword, verifyPassword, equal, otpCode, otpHash };
