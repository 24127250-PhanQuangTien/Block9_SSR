const INT_MAX = 2147483647;

// Only decimal strings from forms are accepted; never coerce arrays/objects.
function parseInteger(value, min = 0, trim = true) {
  if (typeof value !== "string") return null;
  const text = trim ? value.trim() : value;
  if (!text.length || /[^0-9]/.test(text)) return null;
  const number = Number(text);
  return Number.isInteger(number) && number >= min && number <= INT_MAX ? number : null;
}

function parseValidId(value) {
  return parseInteger(value, 1, false);
}

function readFields(body, fields, required, errors) {
  const form = {};
  for (const [key, label] of Object.entries(fields)) {
    const value = body[key];
    form[key] = typeof value === "string" ? value : "";
    if (value !== undefined && typeof value !== "string") {
      errors.push(`${label} phải là một giá trị văn bản duy nhất.`);
    } else if (required.includes(key) && !form[key].trim()) {
      errors.push(`${label} không được để trống.`);
    }
  }
  return form;
}

function validateChef(body) {
  const errors = [];
  const form = readFields(body, { name: "Tên đầu bếp", specialty: "Sở trường / chuyên môn" }, ["name", "specialty"], errors);
  return { form, errors, data: { name: form.name.trim(), specialty: form.specialty.trim() } };
}

function validateIngredient(body) {
  const errors = [];
  const form = readFields(body, { name: "Tên nguyên liệu", quantity: "Số lượng", unit: "Đơn vị tính" }, ["name", "quantity", "unit"], errors);
  const quantity = parseInteger(form.quantity);
  if (quantity === null) errors.push(`Số lượng phải là số nguyên từ 0 đến ${INT_MAX}.`);
  return { form, errors, data: { name: form.name.trim(), quantity, unit: form.unit.trim() } };
}

function validateDish(body, chefs, ingredients) {
  const errors = [];
  const form = readFields(body, {
    name: "Tên món ăn", description: "Mô tả", price: "Giá món ăn",
    category: "Phân loại", imageUrl: "Đường dẫn hình ảnh", chefId: "Đầu bếp",
  }, ["name", "price", "chefId"], errors);
  const price = parseInteger(form.price);
  if (price === null) errors.push(`Giá món ăn phải là số nguyên từ 0 đến ${INT_MAX}.`);

  form.available = body.available === "on" || body.available === "true";
  if (body.available !== undefined && (typeof body.available !== "string" || !["on", "true", "false"].includes(body.available))) {
    errors.push("Trạng thái phục vụ không hợp lệ.");
  }

  const chefId = parseValidId(form.chefId);
  if (chefId === null || !chefs.some(chef => chef.id === chefId)) {
    errors.push("Vui lòng chọn một đầu bếp hợp lệ còn tồn tại.");
  }
  const rawIds = body.ingredientIds === undefined ? [] : (Array.isArray(body.ingredientIds) ? body.ingredientIds : [body.ingredientIds]);
  const parsedIds = rawIds.map(parseValidId);
  const ingredientIds = [...new Set(parsedIds.filter(id => id !== null))];
  const existingIds = new Set(ingredients.map(ingredient => ingredient.id));
  if (!rawIds.length || parsedIds.some(id => id === null || !existingIds.has(id))) {
    errors.push("Vui lòng chọn ít nhất một nguyên liệu; tất cả nguyên liệu phải có ID hợp lệ và còn tồn tại.");
  }
  // Valid selections survive a rejected request; any invalid ID still rejects the whole write.
  form.ingredients = ingredientIds.map(id => ({ id }));
  return {
    form, errors,
    data: {
      name: form.name.trim(), description: form.description.trim() || null,
      price, category: form.category.trim() || null, available: form.available,
      imageUrl: form.imageUrl.trim() || null,
      chefId,
    },
    ingredientIds,
  };
}

module.exports = { INT_MAX, parseInteger, parseValidId, validateChef, validateIngredient, validateDish };
