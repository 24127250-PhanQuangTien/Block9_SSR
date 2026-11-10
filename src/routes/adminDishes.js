const express = require("express");
const router = express.Router();
const prisma = require("../prisma");
const { parseValidId, validateDish } = require("../validation");
const { notFound, isPrismaError, serializable } = require("../routeHelpers");
const { authorize, deny, requirePermission } = require("../config/authorization");
const { paginationRequest, makePagination } = require("../pagination");

router.use(requirePermission("dish:read"));

function invalidId(res, id) { if (id !== null) return false; notFound(res); return true; }
async function formOptions(db) {
  return Promise.all([db.chef.findMany({ orderBy: { name: "asc" } }), db.ingredient.findMany({ orderBy: { name: "asc" } })]);
}

router.get("/", paginationRequest, async (req, res, next) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const category = typeof req.query.category === "string" ? req.query.category.trim() : "";
    const status = ["draft", "published"].includes(req.query.status) ? req.query.status : "";
    const availability = ["available", "unavailable"].includes(req.query.availability) ? req.query.availability : "";
    const sort = typeof req.query.sort === "string" ? req.query.sort.trim() : "";
    const where = {};
    if (q) where.OR = [{ name: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }];
    if (category) where.category = category;
    if (status) where.status = status;
    if (availability) where.available = availability === "available";
    let orderBy = { id: "asc" };
    if (sort === "price_asc") orderBy = { price: "asc" };
    if (sort === "price_desc") orderBy = { price: "desc" };
    if (sort === "newest") orderBy = { createdAt: "desc" };
    if (sort === "name") orderBy = { name: "asc" };
    if (sort && Object.keys(orderBy)[0] !== "id") orderBy = [orderBy, { id: "asc" }];
    const filters = { q, category, status, availability, sort };
    const total = await prisma.dish.count({ where });
    const pagination = makePagination(res.locals.pageRequest, total, "/admin/dishes", filters);
    if (pagination.redirect) return res.redirect(303, pagination.redirect);
    const [dishes, allCategoriesRaw] = await Promise.all([
      prisma.dish.findMany({ where, orderBy, skip: res.locals.pageRequest.skip, take: pagination.pageSize, include: { chef: true, ingredients: true } }),
      prisma.dish.findMany({ select: { category: true }, distinct: ["category"], where: { category: { not: null } } }),
    ]);
    res.status(200).render("admin/dishes/index", { title: "Quản Trị Món Ăn", dishes, pagination, categories: allCategoriesRaw.map(c => c.category).filter(Boolean).sort(), filters });
  } catch (error) { next(error); }
});

router.get("/new", requirePermission("dish:create"), async (req, res, next) => {
  try {
    if (res.locals.currentUser.role === "editor" && res.locals.currentUser.chefId === null) return deny(res);
    const [chefs, ingredients] = await formOptions(prisma);
    res.status(200).render("admin/dishes/new", { title: "Thêm Món Ăn Mới", dish: { available: true, ingredients: [] }, chefs, ingredients, error: null });
  } catch (error) { next(error); }
});

function saveDish(edit) {
  return async (req, res, next) => {
    const id = edit ? parseValidId(req.params.id) : null;
    if (edit && invalidId(res, id)) return;
    try {
      const result = await serializable(prisma, async db => {
        const current = edit ? await db.dish.findUnique({ where: { id } }) : null;
        if (edit && !current) return { missing: true };
        if (edit && !authorize(res.locals.currentUser, "dish:update", current)) return { denied: true };
        if (!edit && res.locals.currentUser.role === "editor" && res.locals.currentUser.chefId === null) return { denied: true };
        const [chefs, ingredients] = await formOptions(db);
        const body = { ...req.body };
        if (res.locals.currentUser.role === "editor") body.chefId = String(res.locals.currentUser.chefId || "");
        const validation = validateDish(body, chefs, ingredients);
        if (validation.errors.length) return { validation, chefs, ingredients };
        const status = edit ? (res.locals.currentUser.role === "admin" ? (req.body.status === "draft" ? "draft" : "published") : current.status) : (res.locals.currentUser.role === "admin" && req.body.status === "published" ? "published" : "draft");
        const relation = edit ? { set: validation.ingredientIds.map(value => ({ id: value })) } : { connect: validation.ingredientIds.map(value => ({ id: value })) };
        if (edit) {
          const where = res.locals.currentUser.role === "editor" ? { id, chefId: res.locals.currentUser.chefId, status: "draft" } : { id };
          const updated = await db.dish.updateMany({ where, data: { name: validation.data.name, description: validation.data.description, price: validation.data.price, category: validation.data.category, available: validation.data.available, imageUrl: validation.data.imageUrl, status, ...(res.locals.currentUser.role === "admin" ? { chefId: validation.data.chefId } : {}) } });
          if (updated.count !== 1) return { denied: true };
          await db.dish.update({ where: { id }, data: { ingredients: relation } });
          return { dish: { id } };
        }
        return { dish: await db.dish.create({ data: { ...validation.data, status, ingredients: relation } }) };
      });
      if (result.missing) return notFound(res);
      if (result.denied) return deny(res);
      if (result.validation) return res.status(400).render(edit ? "admin/dishes/edit" : "admin/dishes/new", { title: edit ? "Chỉnh Sửa Món Ăn" : "Thêm Món Ăn Mới", dish: { ...result.validation.form, ...(edit ? { id } : {}) }, chefs: result.chefs, ingredients: result.ingredients, error: result.validation.errors.join(" ") });
      return res.redirect(303, "/admin/dishes/" + result.dish.id);
    } catch (error) {
      if (isPrismaError(error, ["P2003", "P2014", "P2015", "P2017", "P2018", "P2025"])) return notFound(res);
      next(error);
    }
  };
}

router.post("/", requirePermission("dish:create"), saveDish(false));
router.get("/:id/edit", requirePermission("dish:update"), async (req, res, next) => {
  try {
    const id = parseValidId(req.params.id);
    if (invalidId(res, id)) return;
    const dish = await prisma.dish.findUnique({ where: { id }, include: { chef: true, ingredients: true } });
    if (!dish) return notFound(res);
    if (!authorize(res.locals.currentUser, "dish:update", dish)) return deny(res);
    const [chefs, ingredients] = await formOptions(prisma);
    res.status(200).render("admin/dishes/edit", { title: "Chỉnh Sửa: " + dish.name, dish, chefs, ingredients, error: null });
  } catch (error) { next(error); }
});
router.patch("/:id", requirePermission("dish:update"), saveDish(true));
router.get("/:id/delete", requirePermission("dish:delete"), async (req, res, next) => {
  try {
    const id = parseValidId(req.params.id);
    if (invalidId(res, id)) return;
    const dish = await prisma.dish.findUnique({ where: { id }, include: { chef: true, ingredients: true } });
    if (!dish) return notFound(res);
    res.status(200).render("admin/dishes/delete", { title: "Xác Nhận Xóa: " + dish.name, dish });
  } catch (error) { next(error); }
});
router.delete("/:id", requirePermission("dish:delete"), async (req, res, next) => {
  try {
    const id = parseValidId(req.params.id);
    if (invalidId(res, id)) return;
    const result = await prisma.dish.deleteMany({ where: { id } });
    if (result.count !== 1) return notFound(res);
    res.redirect(303, "/admin/dishes");
  } catch (error) { next(error); }
});
router.get("/:id", async (req, res, next) => {
  try {
    const id = parseValidId(req.params.id);
    if (invalidId(res, id)) return;
    const dish = await prisma.dish.findUnique({ where: { id }, include: { chef: true, ingredients: true } });
    if (!dish) return notFound(res);
    res.status(200).render("admin/dishes/show", { title: "Quản Trị Chi Tiết: " + dish.name + " - RESTORAN", dish });
  } catch (error) { next(error); }
});
module.exports = router;
