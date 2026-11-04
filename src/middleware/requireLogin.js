const { policy } = require("../config/authPolicy");
const cookieOptions = config => ({ httpOnly: true, sameSite: "lax", secure: config.production, path: "/" });
const requireLogin = (db, config) => async (req, res, next) => {
  try {
    const data = req.session;
    if (!data?.userId) return res.redirect(303, "/login");
    const user = await db.user.findUnique({ where: { id: data.userId }, select: { id: true, email: true, status: true, updatedAt: true } });
    if (!user || user.status !== "active" || !Number.isFinite(data.createdAt) || !Number.isFinite(data.lastSeenAt) || Date.now() - data.createdAt >= policy.absolute || Date.now() - data.lastSeenAt >= policy.idle || +user.updatedAt !== data.authVersion) {
      return req.session.destroy(error => {
        if (error) return next(error);
        res.clearCookie("sid", cookieOptions(config));
        res.redirect(303, "/login");
      });
    }
    data.lastSeenAt = Date.now();
    res.locals.currentUser = { id: user.id, email: user.email };
    next();
  } catch (error) { next(error); }
};
module.exports = { requireLogin, cookieOptions };
