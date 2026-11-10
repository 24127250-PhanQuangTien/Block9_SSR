const express = require("express");
const router = express.Router();
const prisma = require("../prisma");

const { parseValidId, validateChef } = require("../validation");
const { notFound, isPrismaError } = require("../routeHelpers");
const { requirePermission } = require("../config/authorization");

router.use(requirePermission("chef:read"));

// 1. GET /admin/chefs - Danh sách quản trị đầu bếp
// 1. GET /admin/chefs - Danh sách quản trị đầu bếp (có tìm kiếm q)
router.get("/", async (req, res, next) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const where = q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { specialty: { contains: q, mode: "insensitive" } },
          ],
        }
      : {};

    const [chefs, totalCount] = await Promise.all([
      prisma.chef.findMany({ where, orderBy: { id: "asc" } }),
      prisma.chef.count(),
    ]);

    res.status(200).render("admin/chefs/index", {
      title: "Quản Trị Đầu Bếp",
      chefs,
      totalCount,
      q,
    });
  } catch (error) {
    next(error);
  }
});

// 2. GET /admin/chefs/new - Mở form thêm đầu bếp mới
router.get("/new", requirePermission("chef:create"), (req, res) => {
  res.status(200).render("admin/chefs/new", {
    title: "Thêm Đầu Bếp Mới",
    chef: {},
    error: null,
  });
});

// 3. POST /admin/chefs - Thêm đầu bếp mới
function saveChef(edit) {
  return async (req, res, next) => {
    try {
      const id = edit ? parseValidId(req.params.id) : null;
      if (edit && (id === null || !await prisma.chef.findUnique({ where: { id } }))) return notFound(res);
      const { form, errors, data } = validateChef(req.body);
      if (errors.length) {
        return res.status(400).render(edit ? "admin/chefs/edit" : "admin/chefs/new", {
          title: edit ? "Chỉnh Sửa Đầu Bếp" : "Thêm Đầu Bếp Mới",
          chef: { ...form, ...(edit ? { id } : {}) }, error: errors.join(" "),
        });
      }
      if (edit) await prisma.chef.update({ where: { id }, data });
      else await prisma.chef.create({ data });
      return res.redirect(303, "/admin/chefs");
    } catch (error) {
      if (edit && isPrismaError(error, ["P2025"])) return notFound(res);
      next(error);
    }
  };
}
router.post("/", requirePermission("chef:create"), saveChef(false));

// 4. GET /admin/chefs/:id/edit - Mở form sửa đầu bếp
router.get("/:id/edit", requirePermission("chef:update"), async (req, res, next) => {
  try {
    const id = parseValidId(req.params.id);
    if (!id) {
      return res.status(404).render("404", {
        title: "404 - Không Tìm Thấy Đầu Bếp",
        message: `ID đầu bếp "${req.params.id}" không hợp lệ.`,
      });
    }

    const chef = await prisma.chef.findUnique({ where: { id } });
    if (!chef) {
      return res.status(404).render("404", {
        title: "404 - Không Tìm Thấy Đầu Bếp",
        message: `Không tìm thấy đầu bếp với ID ${id}.`,
      });
    }

    res.status(200).render("admin/chefs/edit", {
      title: `Chỉnh Sửa: ${chef.name}`,
      chef,
      error: null,
    });
  } catch (error) {
    next(error);
  }
});

// 5. PATCH /admin/chefs/:id - Cập nhật đầu bếp qua Method Override
router.patch("/:id", requirePermission("chef:update"), saveChef(true));

// 6. GET /admin/chefs/:id/delete - Trang xác nhận xóa đầu bếp
router.get("/:id/delete", requirePermission("chef:delete"), async (req, res, next) => {
  try {
    const id = parseValidId(req.params.id);
    if (!id) {
      return res.status(404).render("404", {
        title: "404 - Không Tìm Thấy Đầu Bếp",
        message: `ID đầu bếp "${req.params.id}" không hợp lệ.`,
      });
    }

    const chef = await prisma.chef.findUnique({ where: { id } });
    if (!chef) {
      return res.status(404).render("404", {
        title: "404 - Không Tìm Thấy Đầu Bếp",
        message: `Không tìm thấy đầu bếp với ID ${id} để xác nhận xóa.`,
      });
    }

    res.status(200).render("admin/chefs/delete", {
      title: `Xác Nhận Xóa: ${chef.name}`,
      chef,
    });
  } catch (error) {
    next(error);
  }
});

// 7. DELETE /admin/chefs/:id - Xóa đầu bếp qua Method Override
router.delete("/:id", requirePermission("chef:delete"), async (req, res, next) => {
  try {
    const id = parseValidId(req.params.id);
    if (!id) {
      return res.status(404).render("404", {
        title: "404 - Không Tìm Thấy Đầu Bếp",
        message: `ID đầu bếp "${req.params.id}" không hợp lệ.`,
      });
    }

    const chef = await prisma.chef.findUnique({ where: { id } });
    if (!chef) {
      return res.status(404).render("404", {
        title: "404 - Không Tìm Thấy Đầu Bếp",
        message: `Không tìm thấy đầu bếp với ID ${id} để xóa.`,
      });
    }

    await prisma.chef.delete({ where: { id } });

    return res.redirect(303, "/admin/chefs");
  } catch (error) {
    if (isPrismaError(error, ["P2025"])) return notFound(res);
    next(error);
  }
});

module.exports = router;
