const { random, equal } = require("../services/crypto");
const { policy } = require("../config/authPolicy");
function prepare(req, res, next) {
  const now = Date.now();
  // Rolling activity includes public auth pages, but must never revive a session
  // which is already idle/absolute expired (requireLogin will reject it).
  if (req.session.userId && Number.isFinite(req.session.lastSeenAt) && Number.isFinite(req.session.createdAt) && now - req.session.lastSeenAt < policy.idle && now - req.session.createdAt < policy.absolute) req.session.lastSeenAt = now;
  if (!req.session.csrf) req.session.csrf = random();
  if (!req.session.anonId) req.session.anonId = random(24);
  res.locals.csrfToken = req.session.csrf;
  next();
}
const csrf = config => (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("Origin");
  if ((origin && origin !== config.origin) || !equal(req.session?.csrf, req.body?._csrf)) {
    return res.status(403).render("404", { statusCode: 403, title: "403 - Yêu Cầu Bị Từ Chối", message: "Phiên biểu mẫu không hợp lệ. Hãy tải lại trang và thử lại." });
  }
  next();
};
module.exports = { prepare, csrf };
