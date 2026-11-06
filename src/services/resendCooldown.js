const { policy } = require("../config/authPolicy");
const rate = require("./rateLimit");

async function resendCooldown(db, ip, email, now = new Date())
{
  // Use only public budgets, never account existence or private OTP metadata.
  const budgets = [
    { key: `activate-resend:ip:${ip}`, limit: policy.activationLimit, window: policy.loginWindow },
    { key: `resend:minute:${email}`, limit: 1, window: policy.resendDelay },
    { key: `resend:hour:${email}`, limit: policy.resendLimit, window: policy.resendWindow },
  ];
  const remaining = await Promise.all(budgets.map(async budget =>
  {
    const state = await rate.read(db, budget.key, budget.window, now);
    if (state.locked) return +state.lockedUntil - +now;
    if (state.count >= budget.limit) return +state.windowStart + budget.window - +now;
    return 0;
  }));
  return Math.max(0, ...remaining);
}

module.exports = { resendCooldown };
