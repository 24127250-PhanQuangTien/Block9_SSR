const session = require("express-session");
const { policy } = require("../config/authPolicy");
const { atomic } = require("./atomic");

class PrismaSessionStore extends session.Store {
  constructor(db) { super(); this.db = db; }
  get(sid, callback) {
    this.db.session.findUnique({ where: { sid } }).then(row => {
      if (!row || row.expiresAt <= new Date()) return callback(null, null);
      try { callback(null, JSON.parse(row.data)); } catch { callback(null, null); }
    }, callback);
  }
  set(sid, value, callback = () => {}) {
    const data = { ...value };
    const fresh = data.freshAuthentication === true;
    delete data.freshAuthentication;
    const absolute = data.userId ? Number(data.createdAt) + policy.absolute : Infinity;
    const expiresAt = new Date(Math.min(Date.now() + policy.idle, absolute));
    atomic(this.db, async tx => {
      if (data.userId) {
        const user = await tx.user.findUnique({ where: { id: data.userId } });
        if (!user || user.status !== "active" || +user.updatedAt !== data.authVersion || expiresAt <= new Date()) return;
        // Only the login regeneration may create a new authenticated sid.
        // Loaded requests can update existing rows, never revive a logged-out sid.
        if (!fresh) {
          await tx.session.updateMany({ where: { sid, userId: data.userId, expiresAt: { gt: new Date() } }, data: { data: JSON.stringify(data), expiresAt } });
          return;
        }
      }
      await tx.session.upsert({ where: { sid }, create: { sid, userId: data.userId || null, data: JSON.stringify(data), expiresAt }, update: { userId: data.userId || null, data: JSON.stringify(data), expiresAt } });
    }).then(() => callback(), callback);
  }
  destroy(sid, callback = () => {}) { this.db.session.deleteMany({ where: { sid } }).then(() => callback(), callback); }
  touch(sid, value, callback = () => {}) {
    const absolute = value.userId ? Number(value.createdAt) + policy.absolute : Infinity;
    const expiresAt = new Date(Math.min(Date.now() + policy.idle, absolute));
    this.db.session.updateMany({ where: { sid, expiresAt: { gt: new Date() } }, data: { expiresAt } }).then(() => callback(), callback);
  }
}
module.exports = { PrismaSessionStore };
