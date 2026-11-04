const { otpCode, otpHash, equal } = require("./crypto");
const { atomic } = require("./atomic");
const { policy } = require("../config/authPolicy");

// Must be called in a serializable transaction. Resends never reset attempts/lock.
async function issue(tx, user, pepper) {
  const now = new Date();
  const old = await tx.activationChallenge.findUnique({ where: { userId: user.id } });
  const withinWindow = old && +now - +old.sendWindowStart < policy.resendWindow;
  if (old && (+now - +old.lastSentAt < policy.resendDelay || (withinWindow && old.sendCount >= policy.resendLimit))) return { limited: true };
  let otp = otpCode();
  while (old && equal(old.otpHash, otpHash(pepper, user.id, otp))) otp = otpCode();
  const values = { purpose: "activation", otpHash: otpHash(pepper, user.id, otp), expiresAt: new Date(+now + policy.otpTTL), lastSentAt: now, sendCount: withinWindow ? old.sendCount + 1 : 1, sendWindowStart: withinWindow ? old.sendWindowStart : now, usedAt: null };
  await tx.activationChallenge.upsert({ where: { userId: user.id }, create: { userId: user.id, ...values }, update: values });
  return { otp };
}

async function activate(db, email, otp, pepper) {
  return atomic(db, async tx => {
    const now = new Date();
    const user = await tx.user.findUnique({ where: { email } });
    if (!user) return "invalid";
    let challenge = await tx.activationChallenge.findUnique({ where: { userId: user.id } });
    if (!challenge) return "invalid";
    if (challenge.lockedUntil && challenge.lockedUntil > now) return "limited";
    if (challenge.lockedUntil && challenge.lockedUntil <= now) {
      challenge = await tx.activationChallenge.update({ where: { id: challenge.id }, data: { attempts: 0, lockedUntil: null } });
    }
    if (challenge.attempts >= policy.otpAttempts) {
      await tx.activationChallenge.update({ where: { id: challenge.id }, data: { lockedUntil: new Date(+now + policy.otpLock) } });
      return "limited";
    }
    const matches = typeof otp === "string" && /^[0-9]{6}$/.test(otp) && equal(challenge.otpHash, otpHash(pepper, user.id, otp));
    if (user.status !== "pending" || challenge.purpose !== "activation" || challenge.usedAt || challenge.expiresAt <= now || challenge.attempts >= policy.otpAttempts || !matches) {
      const attempts = challenge.attempts + 1;
      await tx.activationChallenge.update({ where: { id: challenge.id }, data: { attempts, lockedUntil: attempts >= policy.otpAttempts ? new Date(+now + policy.otpLock) : null } });
      return attempts >= policy.otpAttempts ? "limited" : "invalid";
    }
    const claimed = await tx.activationChallenge.updateMany({ where: { id: challenge.id, usedAt: null, purpose: "activation", expiresAt: { gt: now }, attempts: { lt: policy.otpAttempts }, OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }] }, data: { usedAt: now } });
    if (claimed.count !== 1) return "invalid";
    const activated = await tx.user.updateMany({ where: { id: user.id, status: "pending" }, data: { status: "active", emailVerifiedAt: now } });
    if (activated.count !== 1) throw new Error("ACTIVATION_STATE_CONFLICT");
    return "active";
  });
}
module.exports = { issue, activate };
