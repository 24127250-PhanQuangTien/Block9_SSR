const { atomic } = require("./atomic");
async function read(db, key, window, now = new Date()) {
  const row = await db.rateLimit.findUnique({ where: { key } });
  if (!row) return { count: 0, locked: false };
  if (row.lockedUntil && row.lockedUntil > now) return { ...row, locked: true };
  if ((row.lockedUntil && row.lockedUntil <= now) || +now - +row.windowStart >= window) return { count: 0, locked: false };
  return { ...row, locked: false };
}
async function consume(db, key, limit, window, lockDuration = 0) {
  return atomic(db, async tx => {
    const now = new Date();
    const previous = await read(tx, key, window, now);
    if (previous.locked || previous.count >= limit) return false;
    const count = previous.count + 1;
    await tx.rateLimit.upsert({ where: { key }, create: { key, count, windowStart: now, lockedUntil: count >= limit && lockDuration ? new Date(+now + lockDuration) : null },
      update: { count, windowStart: previous.count ? previous.windowStart : now, lockedUntil: count >= limit && lockDuration ? new Date(+now + lockDuration) : null } });
    return true;
  });
}
module.exports = { read, consume };
