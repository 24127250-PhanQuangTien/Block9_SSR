const { policy } = require("../config/authPolicy");
const cookieOptions = config => ({ httpOnly: true, sameSite: "lax", secure: config.production, path: "/" });
const sessionUser = (db, config, required) => async (req, res, next) =>
{
  try
  {
    const data = req.session;
    if (!data?.userId) return required ? res.redirect(303, "/login") : next();
    const user = await db.user.findUnique({ where: { id: data.userId }, select: { id: true, email: true, status: true, role: true, chefId: true, updatedAt: true } });
    if (!user || user.status !== "active" || !Number.isFinite(data.createdAt) || !Number.isFinite(data.lastSeenAt) || Date.now() - data.createdAt >= policy.absolute || Date.now() - data.lastSeenAt >= policy.idle || +user.updatedAt !== data.authVersion) {
      return req.session.destroy(error => {
        if (error) return next(error);
        res.clearCookie("sid", cookieOptions(config));
        if (required) return res.redirect(303, "/login");
        next();
      });
    }
    data.lastSeenAt = Date.now();
    // Authorization data is deliberately refreshed from the database per request.
    res.locals.currentUser = { id: user.id, email: user.email, role: user.role, chefId: user.chefId };
    next();
  }
  catch (error)
  {
    next(error);
  }
};
const requireLogin = (db, config) => sessionUser(db, config, true);
const optionalUser = (db, config) => sessionUser(db, config, false);
module.exports = { requireLogin, optionalUser, cookieOptions };
