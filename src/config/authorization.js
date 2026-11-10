const permissions = Object.freeze({
  viewer: new Set(["read"]),
  editor: new Set(["read", "create", "update"]),
  admin: new Set(["read", "create", "update", "delete"]),
});

function splitPermission(permission) {
  const [resource, action] = typeof permission === "string" ? permission.split(":") : [];
  return { resource, action };
}

function hasPermission(user, permission) {
  const { action } = splitPermission(permission);
  return Boolean(user && permissions[user.role]?.has(action));
}

function can(user, permission, resource = null) {
  const { resource: resourceName, action } = splitPermission(permission);
  if (!resourceName || !hasPermission(user, permission)) return false;
  if (resourceName !== "dish" || action !== "update") return true;
  if (user.role === "admin") return true;
  return user.role === "editor"
    && user.chefId !== null
    && resource?.chefId !== null
    && resource?.chefId === user.chefId
    && resource?.status === "draft";
}

function deny(res) {
  return res.status(403).render("404", {
    statusCode: 403,
    title: "403 - Không Có Quyền",
    message: "Bạn không có quyền thực hiện yêu cầu này.",
  });
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!can(res.locals.currentUser, permission)) return deny(res);
    next();
  };
}

// Kept as a small pure helper for route handlers that load the resource first.
function authorize(user, permission, resource) {
  return can(user, permission, resource);
}

module.exports = { permissions, hasPermission, can, authorize, deny, requirePermission };
