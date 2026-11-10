// Prisma skip is a signed 32-bit Int. Bound the offset as well as JS arithmetic.
const MAX_OFFSET = 2147483647;

function readPagination(originalUrl) {
  // Read raw query entries: duplicates and bracket syntax must not be hidden by
  // Express/qs normalization or its parameter limit. Only these two keys change.
  const query = new URLSearchParams(originalUrl.split("?").slice(1).join("?"));
  function positiveInteger(key, fallback, maximum) {
    const entries = [...query].filter(([name]) => name === key || name.startsWith(`${key}[`));
    if (!entries.length) return fallback;
    if (entries.length !== 1 || entries[0][0] !== key) {
      throw new RangeError(`${key} phải là một số nguyên dương duy nhất, không dùng tham số lặp, mảng hoặc object.`);
    }
    const raw = entries[0][1];
    const value = Number(raw);
    if (!/^[0-9]+$/.test(raw) || !Number.isSafeInteger(value) || value < 1 || value > maximum) {
      throw new RangeError(`${key} phải là số nguyên dương không vượt quá ${maximum}.`);
    }
    return value;
  }
  const page = positiveInteger("page", 1, Number.MAX_SAFE_INTEGER);
  const pageSize = positiveInteger("pageSize", 10, 100);
  const skip = (page - 1) * pageSize;
  if (!Number.isSafeInteger(skip) || skip > MAX_OFFSET) {
    throw new RangeError(`Vị trí bắt đầu trang (page - 1) × pageSize không được vượt quá ${MAX_OFFSET}.`);
  }
  return { page, pageSize, skip };
}

function paginationRequest(req, res, next) {
  try {
    res.locals.pageRequest = readPagination(req.originalUrl);
    next();
  } catch (error) {
    if (!(error instanceof RangeError)) return next(error);
    return res.status(400).render("404", {
      statusCode: 400,
      title: "400 - Tham Số Phân Trang Không Hợp Lệ",
      message: error.message,
    });
  }
}

function makePagination({ page, pageSize, skip }, total, basePath, filters) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const url = (number) => {
    const query = new URLSearchParams();
    // Deliberate allowlist; never copy req.query into links or redirects.
    for (const key of ["q", "category", "status", "availability", "sort"]) {
      if (typeof filters[key] === "string" && filters[key]) query.set(key, filters[key]);
    }
    query.set("pageSize", String(pageSize));
    query.set("page", String(number));
    return `${basePath}?${query}`;
  };
  const first = Math.min(Math.max(1, page - 2), Math.max(1, totalPages - 4));
  const window = Array.from({ length: Math.min(5, totalPages) }, (_, index) => first + index);
  const numbers = [...new Set([1, ...window, totalPages])];
  const pages = [];
  for (const number of numbers) {
    if (pages.length && number - pages[pages.length - 1] > 1) pages.push(null);
    pages.push(number);
  }
  return {
    page, pageSize, total, totalPages, pages, url,
    from: total ? skip + 1 : 0,
    to: Math.min(skip + pageSize, total),
    redirect: page > totalPages ? url(totalPages) : null,
  };
}

module.exports = { readPagination, paginationRequest, makePagination, MAX_OFFSET };
