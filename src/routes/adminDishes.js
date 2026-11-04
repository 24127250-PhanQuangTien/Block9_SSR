const express = require("express");
const router = express.Router();
const prisma = require("../prisma");

const { parseValidId, validateDish } = require("../validation");
const { notFound, isPrismaError, serializable } = require("../routeHelpers");
const { paginationRequest, makePagination } = require("../pagination");

// 1. GET /admin/dishes - Danh sách quản trị món ăn (có tìm kiếm, lọc phân loại & trạng thái)
router.get("/", paginationRequest, async (req, res, next) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const category = typeof req.query.category === "string" ? req.query.category.trim() : "";
    const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
    const sort = typeof req.query.sort === "string" ? req.query.sort.trim() : "";

    // Xây dựng điều kiện WHERE linh hoạt, an toàn (Prisma ORM chống SQL Injection)
    const where = {};

    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ];
    }

    if (category) {
      where.category = category;
    }

    if (status === "available") {
      where.available = true;
    } else if (status === "unavailable") {
      where.available = false;
    }

    // Xây dựng orderBy
    let orderBy = { id: "asc" };
    if (sort === "price_asc") {
      orderBy = { price: "asc" };
    } else if (sort === "price_desc") {
      orderBy = { price: "desc" };
    } else if (sort === "newest") {
      orderBy = { createdAt: "desc" };
    } else if (sort === "name") {
      orderBy = { name: "asc" };
    }
    if (sort && Object.keys(orderBy)[0] !== "id") orderBy = [orderBy, { id: "asc" }];

    const filters = { q, category, status, sort };
    const total = await prisma.dish.count({ where });
    const pagination = makePagination(res.locals.pageRequest, total, "/admin/dishes", filters);
    if (pagination.redirect) return res.redirect(303, pagination.redirect);

    // Lấy danh sách món ăn kèm đầu bếp và nguyên liệu
    const [dishes, allCategoriesRaw] = await Promise.all([
      prisma.dish.findMany({
        where,
        orderBy,
        skip: res.locals.pageRequest.skip,
        take: pagination.pageSize,
        include: { chef: true, ingredients: true },
      }),
      prisma.dish.findMany({
        select: { category: true },
        distinct: ["category"],
        where: { category: { not: null } },
      }),
    ]);

    const categories = allCategoriesRaw
      .map((c) => c.category)
      .filter(Boolean)
      .sort();

    res.status(200).render("admin/dishes/index", {
      title: "Quản Trị Món Ăn",
      dishes,
      pagination,
      categories,
      filters,
    });
  } catch (error) {
    next(error);
  }
});

// 2. GET /admin/dishes/new - Mở form thêm món mới (kèm danh sách đầu bếp & nguyên liệu)
router.get("/new", async (req, res, next) => {
  try {
    const [chefs, ingredients] = await Promise.all([
      prisma.chef.findMany({ orderBy: { name: "asc" } }),
      prisma.ingredient.findMany({ orderBy: { name: "asc" } }),
    ]);

    res.status(200).render("admin/dishes/new", {
      title: "Thêm Món Ăn Mới",
      dish: { available: true, ingredients: [] },
      chefs,
      ingredients,
      error: null,
    });
  } catch (error) {
    next(error);
  }
});

// 3. POST /admin/dishes - Thêm món ăn mới (bắt buộc chọn đầu bếp & nguyên liệu)
// The validation reads and nested write share a serializable transaction.
// This also prevents a concurrently removed ingredient from being silently omitted by set.
function saveDish(edit) {
  return async (req, res, next) => {
    const id = edit ? parseValidId(req.params.id) : null;
    if (edit && id === null) return notFound(res);
    const loadOptions = async (db) => {
      const [chefs, ingredients] = await Promise.all([
        db.chef.findMany({ orderBy: { name: "asc" } }),
        db.ingredient.findMany({ orderBy: { name: "asc" } }),
      ]);
      return { chefs, ingredients };
    };
    const renderInvalid = (validation, options) => res.status(400).render(
      edit ? "admin/dishes/edit" : "admin/dishes/new", {
        title: edit ? "Chỉnh Sửa Món Ăn" : "Thêm Món Ăn Mới",
        dish: { ...validation.form, ...(edit ? { id } : {}) },
        ...options, error: validation.errors.join(" "),
      }
    );
    try {
      let result;
      try {
        result = await serializable(prisma, async (db) => {
          if (edit && !await db.dish.findUnique({ where: { id } })) return { missing: true };
          const options = await loadOptions(db);
          const validation = validateDish(req.body, options.chefs, options.ingredients);
          if (validation.errors.length) return { validation, options };
          const links = validation.ingredientIds.map(id => ({ id }));
          const data = { ...validation.data, ingredients: edit ? { set: links } : { connect: links } };
          const dish = edit
            ? await db.dish.update({ where: { id }, data })
            : await db.dish.create({ data });
          return { dish };
        });
      } catch (error) {
        // Only known relation/record errors trigger a fresh existence check.
        // Connectivity and other system errors still go to HTTP 500.
        if (!isPrismaError(error, ["P2003", "P2014", "P2015", "P2017", "P2018", "P2025"])) throw error;
        if (edit && !await prisma.dish.findUnique({ where: { id } })) return notFound(res);
        const options = await loadOptions(prisma);
        const validation = validateDish(req.body, options.chefs, options.ingredients);
        if (!validation.errors.length) throw error;
        return renderInvalid(validation, options);
      }
      if (result.missing) return notFound(res);
      if (result.validation) return renderInvalid(result.validation, result.options);
      return res.redirect(303, "/admin/dishes/" + result.dish.id);
    } catch (error) {
      next(error);
    }
  };
}
router.post("/", saveDish(false));

// 4. GET /admin/dishes/:id/edit - Mở form sửa món ăn
router.get("/:id/edit", async (req, res, next) => {
  try {
    const id = parseValidId(req.params.id);
    if (!id) {
      return res.status(404).render("404", {
        title: "404 - Không Tìm Thấy Món Ăn",
        message: `ID món ăn "${req.params.id}" không hợp lệ.`,
      });
    }

    const [dish, chefs, ingredients] = await Promise.all([
      prisma.dish.findUnique({
        where: { id },
        include: { chef: true, ingredients: true },
      }),
      prisma.chef.findMany({ orderBy: { name: "asc" } }),
      prisma.ingredient.findMany({ orderBy: { name: "asc" } }),
    ]);

    if (!dish) {
      return res.status(404).render("404", {
        title: "404 - Không Tìm Thấy Món Ăn",
        message: `Không tìm thấy món ăn với ID ${id} để chỉnh sửa.`,
      });
    }

    res.status(200).render("admin/dishes/edit", {
      title: `Chỉnh Sửa: ${dish.name}`,
      dish,
      chefs,
      ingredients,
      error: null,
    });
  } catch (error) {
    next(error);
  }
});

// 5. PATCH /admin/dishes/:id - Cập nhật món ăn
router.patch("/:id", saveDish(true));

// 6. GET /admin/dishes/:id/delete - Trang xác nhận xóa (200 hoặc 404)
router.get("/:id/delete", async (req, res, next) => {
  try {
    const id = parseValidId(req.params.id);
    if (!id) {
      return res.status(404).render("404", {
        title: "404 - Không Tìm Thấy Món Ăn",
        message: `ID món ăn "${req.params.id}" không hợp lệ.`,
      });
    }

    const dish = await prisma.dish.findUnique({
      where: { id },
      include: { chef: true, ingredients: true },
    });

    if (!dish) {
      return res.status(404).render("404", {
        title: "404 - Không Tìm Thấy Món Ăn",
        message: `Không tìm thấy món ăn với ID ${id} để xác nhận xóa.`,
      });
    }

    res.status(200).render("admin/dishes/delete", {
      title: `Xác Nhận Xóa: ${dish.name}`,
      dish,
    });
  } catch (error) {
    next(error);
  }
});

// 7. DELETE /admin/dishes/:id - Xóa món ăn
router.delete("/:id", async (req, res, next) => {
  try {
    const id = parseValidId(req.params.id);
    if (!id) {
      return res.status(404).render("404", {
        title: "404 - Không Tìm Thấy Món Ăn",
        message: `ID món ăn "${req.params.id}" không hợp lệ.`,
      });
    }

    const dish = await prisma.dish.findUnique({ where: { id } });
    if (!dish) {
      return res.status(404).render("404", {
        title: "404 - Không Tìm Thấy Món Ăn",
        message: `Không tìm thấy món ăn với ID ${id} để xóa.`,
      });
    }

    await prisma.dish.delete({ where: { id } });

    return res.redirect(303, "/admin/dishes");
  } catch (error) {
    if (isPrismaError(error, ["P2025"])) return notFound(res);
    next(error);
  }
});

// 8. GET /admin/dishes/:id - Xem chi tiết món ăn trong khu vực Quản Trị
router.get("/:id", async (req, res, next) => {
  try {
    const id = parseValidId(req.params.id);
    if (!id) {
      return res.status(404).render("404", {
        title: "404 - Không Tìm Thấy Món Ăn",
        message: `ID món ăn "${req.params.id}" không hợp lệ.`,
      });
    }

    const dish = await prisma.dish.findUnique({
      where: { id },
      include: { chef: true, ingredients: true },
    });

    if (!dish) {
      return res.status(404).render("404", {
        title: "404 - Không Tìm Thấy Món Ăn",
        message: `Không tìm thấy món ăn với ID ${id} trong hệ thống.`,
      });
    }

    res.status(200).render("admin/dishes/show", {
      title: `Quản Trị Chi Tiết: ${dish.name} - RESTORAN`,
      dish,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
