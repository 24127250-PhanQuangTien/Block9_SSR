async function cleanup(db) {
  const now = new Date();
  await Promise.all([
    db.session.deleteMany({ where: { expiresAt: { lte: now } } }),
    db.captchaChallenge.deleteMany({ where: { expiresAt: { lte: now } } }),
    db.passwordReset.deleteMany({ where: { expiresAt: { lte: now } } }),
    db.activationChallenge.deleteMany({ where: { expiresAt: { lte: now }, OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }] } }),
    db.rateLimit.deleteMany({ where: { windowStart: { lt: new Date(Date.now() - 2 * 3600000) }, OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }] } }),
  ]);
}
function startCleanup(db) {
  const work = () => cleanup(db).catch(() => console.error("Dọn dữ liệu auth tạm thời thất bại; không ghi chi tiết kết nối."));
  work();
  const timer = setInterval(work, 15 * 60000);
  timer.unref();
  return timer;
}
module.exports = { cleanup, startCleanup };
