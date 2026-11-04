require("dotenv").config();
const app = require("./app");
require("./services/cleanup").startCleanup(require("./prisma"));

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 Ứng dụng Nhà Hàng SSR đang chạy tại: http://localhost:${PORT}`);
  console.log(`📌 Khách hàng xem thực đơn:        http://localhost:${PORT}/dishes`);
  console.log(`🛠️ Quản trị Món ăn:                http://localhost:${PORT}/admin/dishes`);
  console.log(`🛠️ Quản trị Đầu bếp:               http://localhost:${PORT}/admin/chefs`);
  console.log(`🛠️ Quản trị Nguyên liệu:           http://localhost:${PORT}/admin/ingredients`);
  console.log(`=======================================================`);
});
