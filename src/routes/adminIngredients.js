const express = require("express");
const router = express.Router();
const prisma = require("../prisma");

const { parseValidId, validateIngredient } = require("../validation");
const { notFound, isPrismaError, serializable } = require("../routeHelpers");
const { requirePermission } = require("../config/authorization");

router.use(requirePermission("ingredient:read"));

// 1. GET /admin/ingredients - Danh sách quản trị nguyên liệu
// 1. GET /admin/ingredients - Danh sách quản trị nguyên liệu (có tìm kiếm q)
router.get("/", async (req, res, next) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const where = q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { unit: { contains: q, mode: "insensitive" } },
          ],
        }
      : {};

    const [ingredients, totalCount] = await Promise.all([
      prisma.ingredient.findMany({
        where,
        include: {
          _count: { select: { dishes: true } },
        },
        orderBy: { id: "asc" },
      }),
      prisma.ingredient.count(),
    ]);

    res.status(200).render("admin/ingredients/index", {
      title: "Quản Trị Nguyên Liệu",
      ingredients,
      totalCount,
      q,
    });
  } catch (error) {
    next(error);
  }
});

// 2. GET /admin/ingredients/new - Mở form thêm nguyên liệu mới
router.get("/new", requirePermission("ingredient:create"), (req, res) => {
  res.status(200).render("admin/ingredients/new", {
    title: "Thêm Nguyên Liệu Mới",
    ingredient: {},
    error: null,
  });
});

// 3. POST /admin/ingredients - Thêm nguyên liệu mới
function saveIngredient(edit) {
  return async (req, res, next) => {
    try {
      const id = edit ? parseValidId(req.params.id) : null;
      if (edit && (id === null || !await prisma.ingredient.findUnique({ where: { id } }))) return notFound(res);
      const { form, errors, data } = validateIngredient(req.body);
      if (errors.length) {
        return res.status(400).render(edit ? "admin/ingredients/edit" : "admin/ingredients/new", {
          title: edit ? "Chỉnh Sửa Nguyên Liệu" : "Thêm Nguyên Liệu Mới",
          ingredient: { ...form, ...(edit ? { id } : {}) }, error: errors.join(" "),
        });
      }
      if (edit) await prisma.ingredient.update({ where: { id }, data });
      else await prisma.ingredient.create({ data });
      return res.redirect(303, "/admin/ingredients");
    } catch (error) {
      if (edit && isPrismaError(error, ["P2025"])) return notFound(res);
      next(error);
    }
  };
}
router.post("/", requirePermission("ingredient:create"), saveIngredient(false));

// 4. GET /admin/ingredients/:id/edit - Mở form sửa nguyên liệu
router.get("/:id/edit", requirePermission("ingredient:update"), async (req, res, next) => {
  try {
    const id = parseValidId(req.params.id);
    if (!id) {
      return res.status(404).render("404", {
        title: "404 - Không Tìm Thấy Nguyên Liệu",
        message: `ID nguyên liệu "${req.params.id}" không hợp lệ.`,
      });
    }

    const ingredient = await prisma.ingredient.findUnique({ where: { id } });
    if (!ingredient) {
      return res.status(404).render("404", {
        title: "404 - Không Tìm Thấy Nguyên Liệu",
        message: `Không tìm thấy nguyên liệu với ID ${id}.`,
      });
    }

    res.status(200).render("admin/ingredients/edit", {
      title: `Chỉnh Sửa: ${ingredient.name}`,
      ingredient,
      error: null,
    });
  } catch (error) {
    next(error);
  }
});

// 5. PATCH /admin/ingredients/:id - Cập nhật nguyên liệu qua Method Override
router.patch("/:id", requirePermission("ingredient:update"), saveIngredient(true));

// 6. GET /admin/ingredients/:id/delete - Trang xác nhận xóa nguyên liệu
router.get("/:id/delete", requirePermission("ingredient:delete"), async (req, res, next) => {
  try {
    const id = parseValidId(req.params.id);
    if (!id) {
      return res.status(404).render("404", {
        title: "404 - Không Tìm Thấy Nguyên Liệu",
        message: `ID nguyên liệu "${req.params.id}" không hợp lệ.`,
      });
    }

    const ingredient = await prisma.ingredient.findUnique({
      where: { id },
      include: {
        dishes: {
          select: { id: true, name: true, category: true, imageUrl: true },
          orderBy: { name: "asc" },
        },
      },
    });

    if (!ingredient) {
      return res.status(404).render("404", {
        title: "404 - Không Tìm Thấy Nguyên Liệu",
        message: `Không tìm thấy nguyên liệu với ID ${id} để xác nhận xóa.`,
      });
    }

    res.status(200).render("admin/ingredients/delete", {
      title: `Xác Nhận Xóa: ${ingredient.name}`,
      ingredient,
      error: null,
    });
  } catch (error) {
    next(error);
  }
});

// 7. DELETE /admin/ingredients/:id - Xóa nguyên liệu qua Method Override
router.delete("/:id", requirePermission("ingredient:delete"), async (req, res, next) => {
  const id = parseValidId(req.params.id);
  if (id === null) return notFound(res);
  try {
    const result = await serializable(prisma, async (db) => {
      const ingredient = await db.ingredient.findUnique({
        where: { id },
        include: { dishes: { select: { id: true, name: true, category: true, imageUrl: true }, orderBy: { name: "asc" } } },
      });
      if (!ingredient) return { missing: true };
      if (ingredient.dishes.length) return { blocked: ingredient };
      await db.ingredient.delete({ where: { id } });
      return {};
    });
    if (result.missing) return notFound(res);
    if (result.blocked) {
      return res.status(400).render("admin/ingredients/delete", {
        title: "Không Thể Xóa: " + result.blocked.name,
        ingredient: result.blocked,
        error: "Không thể xóa nguyên liệu đang được món ăn sử dụng. Vui lòng gỡ nguyên liệu khỏi các món ăn trước.",
      });
    }
    return res.redirect(303, "/admin/ingredients");
  } catch (error) {
    if (isPrismaError(error, ["P2025"])) return notFound(res);
    next(error);
  }
});

module.exports = router;
