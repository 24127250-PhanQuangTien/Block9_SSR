const svgCaptcha = require("svg-captcha");
const { equal } = require("./crypto");
const { policy } = require("../config/authPolicy");
const { randomUUID } = require("node:crypto");
async function issue(db, anonId, purpose) {
  const generated = svgCaptcha.create({ size: 5, noise: 2, ignoreChars: "0oO1ilI", color: false, background: "#fffdf5" });
  const id = randomUUID();
  await db.captchaChallenge.create({ data: { id, anonId, purpose, answer: generated.text.toLowerCase(), expiresAt: new Date(Date.now() + policy.captchaTTL) } });
  return { challengeId: id, svg: generated.data };
}
async function verify(db, anonId, purpose, id, answer) {
  if (typeof id !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) return false;
  const now = new Date();
  // Consume first, even for the wrong answer. Concurrent reuse has count=0.
  const claimed = await db.captchaChallenge.updateMany({ where: { id, anonId, purpose, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
  if (claimed.count !== 1) return false;
  // A valid challenge is one-use even if the answer is missing/malformed.
  if (typeof answer !== "string" || answer.length > 32) return false;
  const row = await db.captchaChallenge.findUnique({ where: { id } });
  return equal(row.answer, answer.trim().toLowerCase());
}
module.exports = { issue, verify };
