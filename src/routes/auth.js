const express = require("express");
const { policy } = require("../config/authPolicy");
const crypto = require("../services/crypto");
const rate = require("../services/rateLimit");
const captcha = require("../services/captcha");
const otp = require("../services/otp");
const { atomic } = require("../services/atomic");
const mail = require("../services/mail");
const { csrf } = require("../middleware/csrf");
const { requireLogin, cookieOptions } = require("../middleware/requireLogin");
const { resendCooldown } = require("../services/resendCooldown");
const mfa = require("../services/mfa");

module.exports = function authRouter(db, config) {
  const router = express.Router();
  const wrap = work => (req, res, next) => Promise.resolve(work(req, res)).catch(next);
  const post = (path, work, protectedRoute = false) => router.post(path, ...(protectedRoute ? [requireLogin(db, config)] : []), csrf(config), wrap(work));
  const limited = res => res.status(429).render("auth/rateLimited", { title: "429 - Vui Lòng Thử Lại Sau" });
  const emailOf = req => { const value = crypto.normalizeEmail(req.body.email); return value.length <= 254 ? value : ""; };
  const ipKey = (req, purpose) => `${purpose}:ip:${req.ip}`;
  const genericDelay = async start => { const delay = policy.genericResponseFloor - (Date.now() - start); if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay)); };
  // Every missing-user login pays one real Argon2id verification too.
  const dummyHash = crypto.hashPassword(crypto.random());
  const dummy = () => dummyHash;
  const saveSession = req => new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
  const activeUser = userId => db.user.findUnique({ where: { id: userId } });
  const establishSession = async (req, user) => {
    await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
    Object.assign(req.session, { userId: user.id, createdAt: Date.now(), lastSeenAt: Date.now(), authVersion: +user.updatedAt, freshAuthentication: true, csrf: crypto.random(), anonId: crypto.random(24) });
    await saveSession(req);
    delete req.session.freshAuthentication;
  };
  const pendingUser = async req => {
    const pending = req.session.mfaPending;
    if (!pending || !pending.userId || !Number.isFinite(pending.expiresAt) || pending.expiresAt <= Date.now()) return null;
    const user = await activeUser(pending.userId);
    return user && user.status === "active" && user.mfaEnabled ? user : null;
  };
  const renderMfa = (req, res, options = {}) => res.status(options.status || 200).render("auth/mfa", { title: "Xác Minh MFA", error: null, ...options });

  async function renderForm(req, res, view, { email = "", error = null, code = null, showCaptcha = false, message = null, status = 200 } = {})
  {
    let challenge = null;
    if (showCaptcha) {
      if (!await rate.consume(db, ipKey(req, "captcha"), policy.captchaIssueLimit, policy.captchaIssueWindow)) return limited(res);
      challenge = await captcha.issue(db, req.session.anonId, view === "register" ? "register" : "login");
    }
    const resendWaitMs = view === "activate" && email ? await resendCooldown(db, req.ip, email) : 0;
    if (view === "activate" && status === 429)
    {
      res.set("Retry-After", String(Math.max(1, Math.ceil(resendWaitMs / 1000))));
    }
    return res.status(status).render(`auth/${view}`, { title: ({ register: "Đăng Ký", login: "Đăng Nhập", activate: "Kích Hoạt Tài Khoản", forgot: "Quên Mật Khẩu" })[view], email, error, code, challenge, message, resendWaitMs });
  }

  router.get("/register", wrap((req, res) => renderForm(req, res, "register", { showCaptcha: true })));
  post("/register", async (req, res) => {
    const start = Date.now();
    const email = emailOf(req);
    if (!await rate.consume(db, ipKey(req, "register"), policy.registerIP, 3600000)) return limited(res);
    if (!await captcha.verify(db, req.session.anonId, "register", req.body.challengeId, req.body.captcha)) {
      return renderForm(req, res, "register", { email, showCaptcha: true, error: "Mã xác nhận không hợp lệ. Vui lòng thử mã mới.", code: "CAPTCHA_FAILED" });
    }
    if (!crypto.validEmail(email) || !crypto.validPassword(req.body.password)) {
      return renderForm(req, res, "register", { email, showCaptcha: true, error: "Email không hợp lệ hoặc mật khẩu chưa đủ 8–128 ký tự, chữ và số.", code: "VALIDATION_FAILED" });
    }
    // Same hashing cost for new/pending/active accounts; never replace a pending password.
    const passwordHash = await crypto.hashPassword(req.body.password);
    const minuteBudget = await rate.consume(db, `resend:minute:${email}`, 1, policy.resendDelay);
    const hourBudget = await rate.consume(db, `resend:hour:${email}`, policy.resendLimit, policy.resendWindow);
    const issued = await atomic(db, async tx => {
      let user = await tx.user.findUnique({ where: { email } });
      const isNew = !user;
      if (isNew) user = await tx.user.create({ data: { email, emailRaw: req.body.email, passwordHash, status: "pending", role: "viewer" } });
      if (user.status !== "pending") return null;
      if (!isNew && (!minuteBudget || !hourBudget)) return null;
      const result = await otp.issue(tx, user, config.pepper);
      return result.otp ? { email: user.email, code: result.otp } : null;
    });
    if (issued) mail.send(issued.email, "Mã kích hoạt tài khoản", `Mã kích hoạt: ${issued.code}\nMã có hiệu lực trong 10 phút.`);
    req.session.activationEmail = email;
    await genericDelay(start);
    await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
    res.redirect(303, "/activate");
  });

  router.get("/activate", wrap((req, res) => renderForm(req, res, "activate", { email: req.session.activationEmail || "", message: req.session.activationEmail ? "Nếu email hợp lệ, chúng tôi đã gửi mã kích hoạt." : "Vui lòng đăng ký hoặc đăng nhập tài khoản chưa kích hoạt để tiếp tục." })));
  post("/activate", async (req, res) => {
    const email = emailOf(req);
    if (!await rate.consume(db, ipKey(req, "activate"), policy.activationLimit, policy.loginWindow) || !await rate.consume(db, `activate:email:${email}`, policy.activationLimit, policy.loginWindow)) return limited(res);
    const result = await otp.activate(db, email, req.body.otp, config.pepper);
    if (result === "limited") return limited(res);
    if (result !== "active") return renderForm(req, res, "activate", { email, error: "Mã kích hoạt không hợp lệ hoặc không dùng được.", code: "INVALID_OTP" });
    req.session.flash = "Tài khoản đã kích hoạt, hãy đăng nhập.";
    res.redirect(303, "/login");
  });
  post("/activate/resend", async (req, res) => {
    const start = Date.now(), email = emailOf(req);
    req.session.activationEmail = email;
    // Apply cooldown/hour budget to every submitted email, even nonexistent/active.
    if (!await rate.consume(db, ipKey(req, "activate-resend"), policy.activationLimit, policy.loginWindow) || !await rate.consume(db, `resend:minute:${email}`, 1, policy.resendDelay) || !await rate.consume(db, `resend:hour:${email}`, policy.resendLimit, policy.resendWindow))
    {
      return renderForm(req, res, "activate", { email, status: 429, code: "RATE_LIMITED", error: "Bạn cần chờ trước khi gửi lại mã. Nút gửi lại sẽ mở khi hết thời gian hiển thị." });
    }
    const sent = await atomic(db, async tx => {
      const user = await tx.user.findUnique({ where: { email } });
      if (!user || user.status !== "pending") return null;
      return otp.issue(tx, user, config.pepper);
    });
    // Public quotas above apply equally to missing/active/pending emails.
    // An account's extra safety backstop must not reveal its existence/status.
    // Suppress delivery, keeping the same 303 when public quotas allow it.
    if (sent?.otp) mail.send(email, "Mã kích hoạt tài khoản", `Mã kích hoạt: ${sent.otp}\nMã có hiệu lực trong 10 phút.`);
    await genericDelay(start);
    await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
    res.redirect(303, "/activate");
  });

  router.get("/login", wrap(async (req, res) => {
    const email = req.session.loginEmail || "";
    const failed = await rate.read(db, `login:email:${email}`, policy.loginWindow);
    const message = req.session.flash || null;
    delete req.session.flash;
    await renderForm(req, res, "login", { email, message, showCaptcha: failed.count >= policy.loginCaptchaAfter });
  }));
  post("/login", async (req, res) => {
    const email = emailOf(req), key = `login:email:${email}`;
    req.session.loginEmail = email;
    const failures = await rate.read(db, key, policy.loginWindow);
    if (failures.locked || !await rate.consume(db, ipKey(req, "login"), policy.loginIP, policy.loginWindow)) return limited(res);
    if (failures.count >= policy.loginCaptchaAfter && !await captcha.verify(db, req.session.anonId, "login", req.body.challengeId, req.body.captcha)) {
      return renderForm(req, res, "login", { email, showCaptcha: true, error: "Mã xác nhận không hợp lệ. Vui lòng thử mã mới.", code: "CAPTCHA_FAILED" });
    }
    const user = await db.user.findUnique({ where: { email } });
    const matches = await crypto.verifyPassword(user?.passwordHash || await dummy(), req.body.password);
    if (!matches) {
      await rate.consume(db, key, policy.loginLockAfter, policy.loginWindow, policy.loginLock);
      const current = await rate.read(db, key, policy.loginWindow);
      if (current.locked) return limited(res);
      return renderForm(req, res, "login", { email, showCaptcha: current.count >= policy.loginCaptchaAfter, error: "Email hoặc mật khẩu không đúng.", code: "INVALID_CREDENTIALS" });
    }
    if ((await rate.read(db, key, policy.loginWindow)).locked) return limited(res);
    if (user.status !== "active")
    {
      req.session.activationEmail = user.email;
      await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
      return renderForm(req, res, "login", { email, error: "Tài khoản cần kích hoạt trước khi đăng nhập.", code: "ACTIVATION_REQUIRED", showCaptcha: failures.count >= policy.loginCaptchaAfter });
    }
    if (user.mfaEnabled) {
      await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
      Object.assign(req.session, { mfaPending: { userId: user.id, createdAt: Date.now(), expiresAt: Date.now() + policy.mfaPendingTTL }, csrf: crypto.random(), anonId: crypto.random(24) });
      await saveSession(req);
      await db.rateLimit.deleteMany({ where: { key } });
      return res.redirect(303, "/mfa");
    }
    await establishSession(req, user);
    await db.rateLimit.deleteMany({ where: { key } });
    res.redirect(303, "/dishes");
  });

  router.get("/mfa", wrap(async (req, res) => {
    if (!await pendingUser(req)) {
      if (req.session.mfaPending) await new Promise((resolve, reject) => req.session.destroy(error => error ? reject(error) : resolve()));
      return res.redirect(303, "/login");
    }
    return renderMfa(req, res);
  }));

  post("/mfa", async (req, res) => {
    const pending = await pendingUser(req);
    if (!pending) return res.redirect(303, "/login");
    const key = "mfa:user:" + pending.id;
    const current = await rate.read(db, key, policy.mfaWindow);
    if (current.locked) return renderMfa(req, res, { status: 429, error: "Bạn đã thử quá nhiều lần. Vui lòng chờ rồi thử lại." });
    const result = await atomic(db, async tx => {
      const user = await tx.user.findUnique({ where: { id: pending.id } });
      if (!user || user.status !== "active" || !user.mfaEnabled) return null;
      const factor = await mfa.consumeFactor(tx, user, req.body.code, config.mfaEncryptionKey);
      return factor ? tx.user.findUnique({ where: { id: user.id } }) : null;
    });
    if (!result) {
      await rate.consume(db, key, policy.mfaAttempts, policy.mfaWindow, policy.mfaLock);
      const after = await rate.read(db, key, policy.mfaWindow);
      return renderMfa(req, res, { status: after.locked ? 429 : 200, error: after.locked ? "Bạn đã thử quá nhiều lần. Vui lòng chờ rồi thử lại." : "Mã xác minh không hợp lệ." });
    }
    await db.rateLimit.deleteMany({ where: { key } });
    await establishSession(req, result);
    res.redirect(303, "/dishes");
  });

  const beginSetup = async userId => {
    const secret = mfa.authenticator.generateSecret();
    const encrypted = crypto.encryptSecret(secret, config.mfaEncryptionKey);
    return db.user.update({ where: { id: userId }, data: { mfaSecret: encrypted, mfaEnabled: false, mfaLastStep: null } });
  };
  const securityUser = req => activeUser(req.session.userId);
  const renderSetup = async (req, res, error = null) => {
    const user = await securityUser(req);
    if (!user || user.mfaEnabled || !user.mfaSecret) return res.redirect(303, "/account/security");
    const secret = mfa.secret(user, config.mfaEncryptionKey);
    const otpauth = mfa.authenticator.keyuri(user.email, "Restaurant App", secret);
    const qr = await require("qrcode").toString(otpauth, { type: "svg", margin: 1 });
    res.set("Cache-Control", "no-store");
    return res.render("auth/mfaSetup", { title: "Thiết Lập MFA", qr, secret, error });
  };
  const reauthenticate = async (req, password, factor, action) => {
    const user = await securityUser(req);
    if (!user || user.status !== "active" || !user.mfaEnabled || !await crypto.verifyPassword(user.passwordHash, password)) return null;
    return atomic(db, async tx => {
      const fresh = await tx.user.findUnique({ where: { id: user.id } });
      if (!fresh || !await mfa.consumeFactor(tx, fresh, factor, config.mfaEncryptionKey)) return null;
      return action(tx, fresh);
    });
  };

  router.get("/account/security", requireLogin(db, config), wrap(async (req, res) => {
    const user = await securityUser(req);
    res.status(200).render("auth/security", { title: "Bảo Mật Tài Khoản", mfaEnabled: !!user?.mfaEnabled, error: null });
  }));
  post("/account/security/setup", async (req, res) => {
    const user = await securityUser(req);
    if (!user || user.mfaEnabled) return res.redirect(303, "/account/security");
    const updated = await beginSetup(user.id);
    req.session.authVersion = +updated.updatedAt;
    await saveSession(req);
    res.redirect(303, "/account/security/setup");
  }, true);
  router.get("/account/security/setup", requireLogin(db, config), wrap(async (req, res) => {
    return renderSetup(req, res);
  }));
  post("/account/security/setup/confirm", async (req, res) => {
    const user = await securityUser(req);
    if (!user || user.mfaEnabled || !user.mfaSecret) return res.redirect(303, "/account/security");
    const step = mfa.totpStep(user, req.body.code, config.mfaEncryptionKey);
    if (step === null) return renderSetup(req, res, "Mã xác minh không hợp lệ. Hãy nhập mã 6 số hiện tại từ ứng dụng xác thực.");
    const codes = await atomic(db, async tx => {
      const claimed = await tx.user.updateMany({ where: { id: user.id, mfaEnabled: false, mfaSecret: user.mfaSecret, OR: [{ mfaLastStep: null }, { mfaLastStep: { lt: step } }] }, data: { mfaEnabled: true, mfaLastStep: step } });
      if (claimed.count !== 1) return null;
      return mfa.replaceRecoveryCodes(tx, user.id);
    });
    if (!codes) return renderSetup(req, res, "Thiết lập MFA không thể hoàn tất. Hãy tải lại trang và thử mã mới.");
    const updated = await activeUser(user.id);
    req.session.authVersion = +updated.updatedAt;
    await saveSession(req);
    res.set("Cache-Control", "no-store");
    res.render("auth/mfaRecovery", { title: "Mã khôi phục MFA", codes });
  }, true);
  const securityAction = action => async (req, res) => {
    const result = await reauthenticate(req, req.body.password, req.body.code, action);
    if (!result) return res.status(403).render("auth/security", { title: "Bảo Mật Tài Khoản", mfaEnabled: true, error: "Mật khẩu hoặc mã MFA không hợp lệ." });
    if (result.codes) {
      res.set("Cache-Control", "no-store");
      return res.render("auth/mfaRecovery", { title: "Mã khôi phục MFA", codes: result.codes });
    }
    if (result.resetup) {
      const updated = await beginSetup(result.userId);
      req.session.authVersion = +updated.updatedAt;
      await saveSession(req);
      return res.redirect(303, "/account/security/setup");
    }
    const updated = await activeUser(req.session.userId);
    req.session.authVersion = +updated.updatedAt;
    await saveSession(req);
    res.redirect(303, "/account/security");
  };
  post("/account/security/recovery/regenerate", securityAction(async (tx, user) => ({ codes: await mfa.replaceRecoveryCodes(tx, user.id) })), true);
  post("/account/security/disable", securityAction(async (tx, user) => {
    await tx.recoveryCode.deleteMany({ where: { userId: user.id } });
    await tx.user.update({ where: { id: user.id }, data: { mfaEnabled: false, mfaSecret: null, mfaLastStep: null } });
    return {};
  }), true);
  post("/account/security/resetup", securityAction(async (tx, user) => ({ resetup: true, userId: user.id })), true);

  post("/logout", async (req, res) => {
    await new Promise((resolve, reject) => req.session.destroy(error => error ? reject(error) : resolve()));
    res.clearCookie("sid", cookieOptions(config));
    res.redirect(303, "/login");
  });

  router.get("/forgot", wrap((req, res) => renderForm(req, res, "forgot")));
  post("/forgot", async (req, res) => {
    const start = Date.now(), email = emailOf(req);
    if (!await rate.consume(db, ipKey(req, "forgot"), policy.forgotIP, 3600000) || !await rate.consume(db, `forgot:email:${email}`, policy.forgotEmail, 3600000)) return limited(res);
    const token = crypto.random(32), hash = crypto.tokenHash(token), now = new Date();
    const user = await atomic(db, async tx => {
      const account = await tx.user.findUnique({ where: { email } });
      if (!account) return null;
      await tx.passwordReset.updateMany({ where: { userId: account.id, usedAt: null }, data: { usedAt: now } });
      await tx.passwordReset.create({ data: { userId: account.id, tokenHash: hash, expiresAt: new Date(+now + policy.resetTTL) } });
      return account;
    });
    if (user) mail.send(user.email, "Hướng dẫn đặt lại mật khẩu", `Mở liên kết trong 15 phút: ${config.baseUrl}/reset?token=${encodeURIComponent(token)}`);
    await genericDelay(start);
    // PRG with one generic message regardless of account existence.
    res.redirect(303, "/forgot/sent");
  });
  router.get("/forgot/sent", wrap((req, res) => renderForm(req, res, "forgot", { message: "Nếu email đã đăng ký, hướng dẫn đã được gửi." })));

  const rawToken = req => typeof (req.method === "GET" ? req.query.token : req.body.token) === "string" ? (req.method === "GET" ? req.query.token : req.body.token) : "";
  const resetPage = (res, token, usable, error = null) => res.set("Referrer-Policy", "no-referrer").status(200).render("auth/reset", { title: "Đặt Lại Mật Khẩu", token, usable, error });
  router.get("/reset", wrap(async (req, res) => {
    const token = rawToken(req);
    const reset = /^[A-Za-z0-9_-]{43}$/.test(token) ? await db.passwordReset.findUnique({ where: { tokenHash: crypto.tokenHash(token) } }) : null;
    const usable = !!reset && !reset.usedAt && reset.expiresAt > new Date();
    return resetPage(res, usable ? token : "", usable);
  }));
  post("/reset", async (req, res) => {
    const token = rawToken(req);
    res.set("Referrer-Policy", "no-referrer");
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return resetPage(res, "", false);
    const candidate = await db.passwordReset.findUnique({ where: { tokenHash: crypto.tokenHash(token) } });
    if (!candidate || candidate.usedAt || candidate.expiresAt <= new Date()) return resetPage(res, "", false);
    if (!crypto.validPassword(req.body.password)) return resetPage(res, token, true, "Mật khẩu phải có 8–128 ký tự, gồm chữ và số.");
    const passwordHash = await crypto.hashPassword(req.body.password);
    const account = await atomic(db, async tx => {
      const now = new Date(), tokenHash = crypto.tokenHash(token);
      const reset = await tx.passwordReset.findUnique({ where: { tokenHash } });
      if (!reset || reset.usedAt || reset.expiresAt <= now) return null;
      const claimed = await tx.passwordReset.updateMany({ where: { id: reset.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
      if (claimed.count !== 1) return null;
      const user = await tx.user.update({ where: { id: reset.userId }, data: { passwordHash } });
      await tx.passwordReset.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } });
      await tx.session.deleteMany({ where: { userId: user.id } });
      return user;
    });
    if (!account) return resetPage(res, "", false);
    mail.send(account.email, "Mật khẩu đã được thay đổi", "Mật khẩu của bạn vừa được thay đổi. Nếu không phải bạn, hãy liên hệ quản trị.");
    await new Promise((resolve, reject) => req.session.destroy(error => error ? reject(error) : resolve()));
    res.clearCookie("sid", cookieOptions(config));
    res.redirect(303, "/login");
  });

  // SSR reload only: no JSON/fetch endpoint, never return the CAPTCHA answer.
  router.get("/captcha/new", (req, res) => res.redirect(303, req.query.purpose === "register" ? "/register" : "/login"));
  return router;
};
