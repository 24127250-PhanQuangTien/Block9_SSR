# Manifest file chưa commit

Nền: `feat/backport-block7-pagination-ssr`; bảo toàn các thay đổi phân trang trước Block8. Không commit/push. `.env` chỉ được bổ sung cấu hình local riêng, vẫn bị ignore và không thuộc Git/danh sách này. Không sửa Block7.

| File | Mô tả |
|---|---|
| `.env.example` | Placeholder/cách cấu hình DB, auth, origin/proxy, SMTP và seed; không có secret thật. |
| `README.md` | Cách chạy auth/migration/seed riêng, phân trang giữ lại và kết quả kiểm chứng. |
| `docs/CHANGES.md` | Manifest file để rà diff cả phân trang giữ lại và auth mới. |
| `docs/VERIFY.md` | Checklist từng yêu cầu, curl an toàn, kết quả và giới hạn nghiệm thu. |
| `docs/auth-policy.md` | Khảo sát, chính sách, route và giả định/sai khác minh bạch. |
| `docs/evidence/auth-integration.json` | Kết quả 15 nhóm tích hợp, không chứa credential/cookie/token. |
| `docs/evidence/pagination-browser/admin-dishes-1440-js-real-form.png` | Ảnh browser dùng DB thật, che email/credential; tên ghi màn hình, viewport và JS/no-JS. |
| `docs/evidence/pagination-browser/admin-dishes-1440-js-real-keyboard.png` | Ảnh browser dùng DB thật, che email/credential; tên ghi màn hình, viewport và JS/no-JS. |
| `docs/evidence/pagination-browser/admin-dishes-1440-js-real-pagination.png` | Ảnh browser dùng DB thật, che email/credential; tên ghi màn hình, viewport và JS/no-JS. |
| `docs/evidence/pagination-browser/admin-dishes-1440-nojs-real-form.png` | Ảnh browser dùng DB thật, che email/credential; tên ghi màn hình, viewport và JS/no-JS. |
| `docs/evidence/pagination-browser/admin-dishes-1440-nojs-real-pagination.png` | Ảnh browser dùng DB thật, che email/credential; tên ghi màn hình, viewport và JS/no-JS. |
| `docs/evidence/pagination-browser/admin-dishes-375-js-real-form.png` | Ảnh browser dùng DB thật, che email/credential; tên ghi màn hình, viewport và JS/no-JS. |
| `docs/evidence/pagination-browser/admin-dishes-375-js-real-pagination.png` | Ảnh browser dùng DB thật, che email/credential; tên ghi màn hình, viewport và JS/no-JS. |
| `docs/evidence/pagination-browser/admin-dishes-375-nojs-real-form.png` | Ảnh browser dùng DB thật, che email/credential; tên ghi màn hình, viewport và JS/no-JS. |
| `docs/evidence/pagination-browser/admin-dishes-375-nojs-real-keyboard.png` | Ảnh browser dùng DB thật, che email/credential; tên ghi màn hình, viewport và JS/no-JS. |
| `docs/evidence/pagination-browser/admin-dishes-375-nojs-real-pagination.png` | Ảnh browser dùng DB thật, che email/credential; tên ghi màn hình, viewport và JS/no-JS. |
| `docs/evidence/pagination-browser/dishes-1440-js-real-form.png` | Ảnh browser dùng DB thật, che email/credential; tên ghi màn hình, viewport và JS/no-JS. |
| `docs/evidence/pagination-browser/dishes-1440-js-real-keyboard.png` | Ảnh browser dùng DB thật, che email/credential; tên ghi màn hình, viewport và JS/no-JS. |
| `docs/evidence/pagination-browser/dishes-1440-js-real-pagination.png` | Ảnh browser dùng DB thật, che email/credential; tên ghi màn hình, viewport và JS/no-JS. |
| `docs/evidence/pagination-browser/dishes-1440-nojs-real-form.png` | Ảnh browser dùng DB thật, che email/credential; tên ghi màn hình, viewport và JS/no-JS. |
| `docs/evidence/pagination-browser/dishes-1440-nojs-real-pagination.png` | Ảnh browser dùng DB thật, che email/credential; tên ghi màn hình, viewport và JS/no-JS. |
| `docs/evidence/pagination-browser/dishes-375-js-real-form.png` | Ảnh browser dùng DB thật, che email/credential; tên ghi màn hình, viewport và JS/no-JS. |
| `docs/evidence/pagination-browser/dishes-375-js-real-pagination.png` | Ảnh browser dùng DB thật, che email/credential; tên ghi màn hình, viewport và JS/no-JS. |
| `docs/evidence/pagination-browser/dishes-375-nojs-real-form.png` | Ảnh browser dùng DB thật, che email/credential; tên ghi màn hình, viewport và JS/no-JS. |
| `docs/evidence/pagination-browser/dishes-375-nojs-real-keyboard.png` | Ảnh browser dùng DB thật, che email/credential; tên ghi màn hình, viewport và JS/no-JS. |
| `docs/evidence/pagination-browser/dishes-375-nojs-real-pagination.png` | Ảnh browser dùng DB thật, che email/credential; tên ghi màn hình, viewport và JS/no-JS. |
| `docs/evidence/pagination-browser/results.json` | Kết quả 22 mục browser và danh sách ảnh DB thật. |
| `docs/flows.md` | Bản nháp Mermaid các luồng SSR auth. |
| `package-lock.json` | Khóa dependency auth; không thêm Playwright vào app. |
| `package.json` | Các dependency auth được yêu cầu và scripts cấu hình/migration/seed/test. |
| `prisma/auth-baseline.prisma` | Snapshot năm model auth đã đối chiếu để tiếp nhận bảng hiện có. |
| `prisma/baseline.prisma` | Schema CRUD nền để tạo baseline, không chạy lại trên bảng hiện hữu. |
| `prisma/migrations/202611030001_baseline/migration.sql` | Migration baseline CRUD; chỉ đánh dấu applied trên DB hiện hữu. |
| `prisma/migrations/202611030002_auth/migration.sql` | Migration năm bảng auth; tiếp nhận bảng đã đối chiếu, không ghi đè dữ liệu. |
| `prisma/migrations/202611030003_sessions/migration.sql` | Chỉ bổ sung Session cùng index/FK cho store mới. |
| `prisma/migrations/migration_lock.toml` | Khóa provider PostgreSQL của migration. |
| `prisma/schema.prisma` | Giữ model CRUD; ánh xạ năm bảng auth UUID hiện có và thêm Session. |
| `prisma/seed-auth.js` | Chỉ tạo active viewer từ cấu hình nếu chưa có; không gọi seed cũ. |
| `public/css/style.css` | Auth SSR, layout phân trang responsive, focus/scroll-margin/reduced motion. |
| `scripts/auth-db.js` | Sinh/rà migration, tiếp nhận baseline, kiểm tra snapshot CRUD; lỗi được che. |
| `scripts/configure-auth.js` | Append khóa local còn thiếu bằng crypto; không ghi đè/in credential. |
| `src/app.js` | Session store, headers, requireLogin trước CSRF và bảo vệ toàn cụm CRUD. |
| `src/config/authPolicy.js` | Tập trung hằng số chính sách và kiểm tra cấu hình bắt buộc. |
| `src/middleware/csrf.js` | CSRF synchronizer/Origin, token ẩn danh và rolling activity an toàn. |
| `src/middleware/requireLogin.js` | Chặn guest/inactive/expired, 303 login và cookie options. |
| `src/pagination.js` | Parser nghiêm ngặt, offset bound, URL allowlist, window và redirect. |
| `src/routes/adminDishes.js` | Count theo lọc, skip/take, sort ID phụ và phân trang SSR được giữ. |
| `src/routes/auth.js` | SSR register/activate/resend/login/logout/forgot/reset/CAPTCHA reload. |
| `src/routes/dishes.js` | Phân trang database SSR được giữ lại, name search và quan hệ. |
| `src/server.js` | Tự nạp .env như nền cũ; khởi động dọn metadata auth định kỳ. |
| `src/services/atomic.js` | Transaction Serializable với retry xung đột hữu hạn; không raw SQL. |
| `src/services/captcha.js` | SVG SSR, challenge đúng phiên/purpose, một lần kể cả sai. |
| `src/services/cleanup.js` | Dọn metadata auth hết hạn, giữ lock còn hiệu lực; không đụng CRUD. |
| `src/services/crypto.js` | Argon2id, normalize/validate email, password policy, OTP HMAC/token hash. |
| `src/services/mail.js` | Nodemailer SMTP/Ethereal, gửi async, không log nội dung nhạy cảm. |
| `src/services/otp.js` | HMAC OTP, resend giữ attempts/lock, activation nguyên tử. |
| `src/services/rateLimit.js` | Counter và lock bền vững trong DB, cập nhật nguyên tử. |
| `src/services/sessionStore.js` | Prisma Store get/set/destroy/touch; TTL/userId và chống hồi sinh sid. |
| `src/views/404.ejs` | Hiển thị đúng HTML 400/403/404/500. |
| `src/views/admin/chefs/delete.ejs` | Thêm hidden CSRF vào đúng form POST; giữ CRUD/validation/method override. |
| `src/views/admin/chefs/edit.ejs` | Thêm hidden CSRF vào đúng form POST; giữ CRUD/validation/method override. |
| `src/views/admin/chefs/new.ejs` | Thêm hidden CSRF vào đúng form POST; giữ CRUD/validation/method override. |
| `src/views/admin/dishes/delete.ejs` | Thêm hidden CSRF vào đúng form POST; giữ CRUD/validation/method override. |
| `src/views/admin/dishes/edit.ejs` | Thêm hidden CSRF vào đúng form POST; giữ CRUD/validation/method override. |
| `src/views/admin/dishes/index.ejs` | Giữ filter/sort; GET/pageSize/reset/history và partial phân trang. |
| `src/views/admin/dishes/new.ejs` | Thêm hidden CSRF vào đúng form POST; giữ CRUD/validation/method override. |
| `src/views/admin/ingredients/delete.ejs` | Thêm hidden CSRF vào đúng form POST; giữ CRUD/validation/method override. |
| `src/views/admin/ingredients/edit.ejs` | Thêm hidden CSRF vào đúng form POST; giữ CRUD/validation/method override. |
| `src/views/admin/ingredients/new.ejs` | Thêm hidden CSRF vào đúng form POST; giữ CRUD/validation/method override. |
| `src/views/auth/activate.ejs` | Trang/partial auth EJS, form SSR + CSRF và phản hồi tiếng Việt. |
| `src/views/auth/captcha.ejs` | Trang/partial auth EJS, form SSR + CSRF và phản hồi tiếng Việt. |
| `src/views/auth/end.ejs` | Trang/partial auth EJS, form SSR + CSRF và phản hồi tiếng Việt. |
| `src/views/auth/forgot.ejs` | Trang/partial auth EJS, form SSR + CSRF và phản hồi tiếng Việt. |
| `src/views/auth/login.ejs` | Trang/partial auth EJS, form SSR + CSRF và phản hồi tiếng Việt. |
| `src/views/auth/rateLimited.ejs` | Trang/partial auth EJS, form SSR + CSRF và phản hồi tiếng Việt. |
| `src/views/auth/register.ejs` | Trang/partial auth EJS, form SSR + CSRF và phản hồi tiếng Việt. |
| `src/views/auth/reset.ejs` | Trang/partial auth EJS, form SSR + CSRF và phản hồi tiếng Việt. |
| `src/views/auth/start.ejs` | Trang/partial auth EJS, form SSR + CSRF và phản hồi tiếng Việt. |
| `src/views/dishes/index.ejs` | Form GET/pageSize, reset page, autocomplete off và partial phân trang. |
| `src/views/partials/navbar.ejs` | Email/logout POST CSRF, navbar authenticated rõ cả khi tắt JS. |
| `src/views/partials/pageSize.ejs` | Select 10/20/50 và giữ kích thước hợp lệ nhập qua URL. |
| `src/views/partials/pagination.ejs` | Trước/Sau/window/aria-current và disabled không link. |
| `src/views/partials/resultSummary.ejs` | Tách tổng kết quả khỏi số món trong trang. |
| `tech-choice.md` | Lý do từng công nghệ, đánh đổi và mapping UUID/PG hiện hữu. |
| `tests/auth.integration.js` | 15 nhóm trên DB/server/SMTP thật trong schema test riêng; không mock security. |
| `tests/helpers/authFixture.js` | Persistence offline để test qua login/Argon2/CSRF/guard thật. |
| `tests/helpers/prismaFixture.js` | Fixture 137 món cho kiểm tra danh sách offline; không DB thật. |
| `tests/http.test.js` | Hồi quy HTML/ID/500 sau login thật với persistence fixture. |
| `tests/mail-smoke.js` | Verify kết nối SMTP/Ethereal, không gửi email hoặc in credential. |
| `tests/pagination.browser.js` | Playwright đăng nhập thật, JS off/375px/Tab/history và ảnh che credential. |
| `tests/pagination.test.js` | Hồi quy phân trang offline sau login; guest phải 303 login. |
| `tests/preview-pagination.js` | Preview fixture lịch sử được bảo toàn; không dùng nghiệm thu Block8. |
| `tests/verify-pagination-readonly.js` | HTTP/Prisma sau login, guest 303, --smoke không lặp 101 GET. |

