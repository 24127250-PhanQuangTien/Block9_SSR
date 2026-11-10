const { authenticator } = require("otplib");
const crypto = require("./crypto");

authenticator.options = { step: 30, digits: 6, algorithm: "sha1", window: 1 };

function secret(user, key) {
  return crypto.decryptSecret(user.mfaSecret, key);
}

function currentStep() {
  return Math.floor(Date.now() / 1000 / 30);
}

function totpStep(user, token, key) {
  // Setup confirmation deliberately runs while mfaEnabled is still false.
  // Callers that consume an already-enabled factor check mfaEnabled before
  // reaching this helper.
  if (!user.mfaSecret || !/^\d{6}$/.test(String(token || ""))) return null;
  let delta;
  try { delta = authenticator.checkDelta(String(token), secret(user, key)); } catch { return null; }
  if (typeof delta !== "number") return null;
  return currentStep() + delta;
}

async function consumeFactor(tx, user, code, key) {
  const token = typeof code === "string" ? code.trim() : "";
  const step = totpStep(user, token, key);
  if (step !== null && (user.mfaLastStep === null || step > user.mfaLastStep)) {
    const claimed = await tx.user.updateMany({
      where: { id: user.id, mfaEnabled: true, OR: [{ mfaLastStep: null }, { mfaLastStep: { lt: step } }] },
      data: { mfaLastStep: step },
    });
    if (claimed.count === 1) return { kind: "totp", step };
  }
  const normalized = token.replace(/[\s-]/g, "").toUpperCase();
  if (!normalized) return null;
  const claimedRecovery = await tx.recoveryCode.updateMany({
    where: { userId: user.id, codeHash: crypto.recoveryHash(normalized), usedAt: null },
    data: { usedAt: new Date() },
  });
  return claimedRecovery.count === 1 ? { kind: "recovery" } : null;
}

function newRecoveryCode() {
  const raw = crypto.random(10).toUpperCase();
  return { raw, display: raw.slice(0, 5) + "-" + raw.slice(5) };
}

async function replaceRecoveryCodes(tx, userId) {
  await tx.recoveryCode.deleteMany({ where: { userId } });
  const codes = Array.from({ length: 10 }, newRecoveryCode);
  await tx.recoveryCode.createMany({ data: codes.map(code => ({ userId, codeHash: crypto.recoveryHash(code.raw) })) });
  return codes.map(code => code.display);
}

module.exports = { authenticator, secret, currentStep, totpStep, consumeFactor, replaceRecoveryCodes, newRecoveryCode };
