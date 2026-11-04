const express = require("express");
const router = express.Router();
const prisma = require("../prisma");
const { parseValidId } = require("../validation");
const { paginationRequest, makePagination } = require("../pagination");

// 1. GET /dishes - Danh sách món ăn cho khách hàng (có tìm kiếm qua query `q`)
router.get("/", paginationRequest, async (req, res, next) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

    const where = q
      ? {
          name: {
            contains: q,
            mode: "insensitive", // Tìm kiếm không phân biệt chữ hoa / thường
          },
        }
      : {};
    const total = await prisma.dish.count({ where });
    const pagination = makePagination(res.locals.pageRequest, total, "/dishes", { q });
    if (pagination.redirect) return res.redirect(303, pagination.redirect);

    const dishes = await prisma.dish.findMany({
      where,
      skip: res.locals.pageRequest.skip,
      take: pagination.pageSize,
      include: {
        chef: true,
        ingredients: true,
      },
      orderBy: { id: "asc" },
    });

    res.status(200).render("dishes/index", {
      title: "Thực Đơn Nhà Hàng",
      dishes,
      q,
      pagination,
    });
  } catch (error) {
    next(error);
  }
});

// 2. GET /dishes/:id - Chi tiết một món ăn (404 khi id sai hoặc không tồn tại)
router.get("/:id", async (req, res, next) => {
  try {
    const id = parseValidId(req.params.id);

    // Kiểm tra id có phải là số nguyên dương hợp lệ không
    if (id === null) {
      return res.status(404).render("404", {
        title: "404 - Không Tìm Thấy Món Ăn",
        message: `ID món ăn "${req.params.id}" không hợp lệ.`,
      });
    }

    const dish = await prisma.dish.findUnique({
      where: { id },
      include: {
        chef: true,
        ingredients: true,
      },
    });

    if (!dish) {
      return res.status(404).render("404", {
        title: "404 - Món Ăn Không Tồn Tại",
        message: `Không tìm thấy món ăn với ID ${id} trong thực đơn.`,
      });
    }

    res.status(200).render("dishes/show", {
      title: `${dish.name} - Chi Tiết Món Ăn`,
      dish,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
