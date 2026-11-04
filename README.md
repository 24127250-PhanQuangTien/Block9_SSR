# Restaurant SSR — Block5 và Authentication Block8

Ứng dụng nhà hàng dùng Node.js, Express 4, EJS, Prisma 5 và PostgreSQL. CRUD, tìm kiếm, bộ lọc, sắp xếp và phân trang được render ở server; các thao tác ghi dùng form HTML và redirect303. Không SPA, fetch/AJAX, JWT hoặc phân quyền Block9.

## Trạng thái nghiệm thu

Các chức năng chính của Block8 đã được triển khai và có kiểm thử: đăng ký với CAPTCHA, OTP kích hoạt, đăng nhập/chống brute force, session bền vững, đăng xuất, quên/đặt lại mật khẩu và bảo vệ toàn bộ CRUD.

Người dùng đã xác nhận đăng ký → CAPTCHA → nhận OTP qua email thật → kích hoạt → đăng nhập → vào `/dishes?pageSize=10&page=1`. Đây là xác nhận thao tác thực tế của người dùng, không phải ảnh/email/token do test tự động thu thập. Lỗi SMTP535 trước đó là lịch sử, không còn là kết luận hiện tại về luồng OTP này.

**Chưa tuyên bố hoàn tất100% hồ sơ nộp bài.** Slide63 còn cần ảnh UI/Network/Application và request trực tiếp cho từng kịch bản, cùng sơ đồ do nhóm tự vẽ. GET vẫn ghi metadata session/CAPTCHA/counter bảo mật; timing chống dò email chưa được bảo đảm. Xem [báo cáo audit hiện tại](BLOCK8_AUTHENTICATION_AUDIT_REPORT.md), [kết quả nghiệm thu](docs/BLOCK8_FINAL_ACCEPTANCE.md) và [cách kiểm chứng](docs/VERIFY.md).

| Bằng chứng đã hoàn tất | Kết quả | Phạm vi |
|---|---|---|
| `npm.cmd test` | 24/24PASS | Validation, HTTP/EJS, phân trang, auth security; persistence fixture offline |
| HTTP/Prisma | 21/21 nhóm PASS,276 request | Schema PostgreSQL ngẫu nhiên, SMTP local, hai server process; [JSON](docs/evidence/auth-release-http/http-results.json) |
| Chrome native form | 4/4PASS,45 ảnh | 1440/375px × JS bật/tắt, auth và hai list sau login; [JSON](docs/evidence/auth-release-browser/browser-results.json) |
| OTP email thật | Người dùng xác nhận thành công | Không lưu địa chỉ, OTP, cookie hay credential vào repo |

HTTP hoàn tất 2026-11-04T15:48:33.647Z; Chrome hoàn tất 2026-11-04T15:45:29.306Z, phiên bản156.0.8078.80. Đây là lượt chạy lại source cuối, gồm logging mail an toàn. Không lấy số test offline làm bằng chứng SMTP/inbox hoặc production.

## Chạy ứng dụng

Cần Node.js tương thích dependency Argon2 trong lockfile và PostgreSQL có thể kết nối từ máy chạy app.

```powershell
npm.cmd ci
# Chỉ tạo .env khi chưa có; không ghi đè cấu hình đang dùng.
Copy-Item .env.example .env
npm.cmd run auth:configure
npx.cmd prisma generate
npm.cmd start
# Hoặc npm.cmd run dev
```

Điền `DATABASE_URL`, `SESSION_SECRET`, `OTP_PEPPER`, `APP_BASE_URL` và `APP_ORIGIN` trong `.env` riêng. Hai secret cần ít nhất32 ký tự; hai URL cùng origin với URL mở trong browser. Production cần HTTPS và `TRUST_PROXY` đúng hạ tầng. `.env` được Git ignore, không commit hoặc gửi vào chat.

Với database hiện có đã có schema auth, không chạy migration/seed/reset chỉ để khởi động lại app. Với database cần cài auth lần đầu, đọc [chính sách/schema](docs/auth-policy.md), rà migration trước khi chạy `npm.cmd run db:auth`. `npm.cmd run seed:auth` là tùy chọn tạo active viewer từ cấu hình local nếu chưa tồn tại; không cần seed để dùng luồng đăng ký.

**Không chạy `npm.cmd run seed`, `db:push` hoặc reset trên dữ liệu nhà hàng cần giữ.** Script seed cũ xóa/nạp lại dữ liệu CRUD. Bộ nghiệm thu Block8 chỉ ghi vào schema test ngẫu nhiên riêng.

## Email

```powershell
npm.cmd run mail:configure
npm.cmd run mail:check
```

Nhập credential trong terminal riêng; các trường email/mật khẩu được ẩn. `mail:check` chỉ kiểm tra kết nối/xác thực, không gửi thư. Sau khi đổi cấu hình, restart server. Hướng dẫn Gmail/App Password và giải thích mã lỗi an toàn ở [MAIL_SETUP](docs/MAIL_SETUP.md).

Development thiếu SMTP dùng Ethereal: thư không tới inbox thật, preview link phải giữ riêng. Production không fallback Ethereal. App không log password, OTP, reset token, CAPTCHA answer hoặc giá trị cookie; lỗi SMTP chỉ log category/code/status được phép. SMTP lỗi không làm phản hồi đăng ký/forgot tiết lộ tài khoản tồn tại.

## Routes và xác thực

- Public: GET/POST `/register`, `/activate`, `/login`, `/forgot`, `/reset`; POST `/activate/resend`; GET `/forgot/sent`, `/captcha/new`; static assets.
- Protected: `/`, `/admin`, `/dishes`, `/dishes/:id`, toàn bộ `/admin/dishes`, `/admin/chefs`, `/admin/ingredients`, và POST `/logout`.
- Chưa đăng nhập gọi CRUD bằng bất kỳ method nào đều303 `/login`; pending không có session authenticated. Login active đổi SID, lưu session trong PostgreSQL. Logout và reset thu hồi session phía server.
- Mọi form ghi có CSRF; Origin được kiểm tra. Ngoại lệ native reset Origin:null chỉ cho POST `/reset` + Fetch Metadata same-origin + CSRF đúng.
- `role` do server gán mặc định viewer; mọi active user được CRUD theo phạm vi bài. Chưa làm RBAC/ABAC.

## Phân trang SSR

Hai list `/dishes` và `/admin/dishes` dùng URL, form GET và liên kết HTML, hoạt động khi tắt JavaScript.

- Mặc định page1/pageSize10; UI chọn10/20/50, backend chấp nhận pageSize1–100. Tham số sai, trùng, array/object hoặc vượt giới hạn offset trả HTML400 trước truy vấn.
- Khách tìm theo tên, ID tăng dần. Quản trị tìm tên/mô tả, lọc category/status, sort giá/tên/ngày tạo; sort thêm ID để xử lý giá trị bằng nhau.
- Prisma `count/skip/take` lấy đúng trang cùng quan hệ đầu bếp/nguyên liệu. Form tìm/lọc/đổi pageSize về page1; link giữ điều kiện hợp lệ và mã hóa tiếng Việt.
- Trang vượt phạm vi303 về trang cuối hoặc page1 khi rỗng; lỗi DB vẫn HTML500. Không tải toàn bộ danh sách rồi phân trang trong browser.
- Trước/Sau, cửa sổ số trang, `aria-current`, trạng thái disabled và vùng cuộn bảng hỗ trợ desktop/375px, bàn phím, Back/Forward.

Ví dụ: `/dishes?q=ph%E1%BB%9F&pageSize=20&page=2`, `/admin/dishes?status=available&sort=newest&pageSize=10&page=2`.

## Kiểm thử

```powershell
npm.cmd test
npm.cmd run test:auth
# Công cụ browser nằm ngoài dependency/lockfile app:
npm.cmd install --prefix "$env:TEMP\ssr-pagination-playwright" playwright@1.64.1
npm.cmd run test:auth -- --browser
# Chỉ chạy4 context browser:
npm.cmd run test:auth -- --browser --browser-only
```

Harness HTTP mặc định dùng port3108; đặt `AUTH_TEST_PORT` khi cần và `AUTH_EVIDENCE_DIR` để giữ riêng từng lượt. Browser-only cần cả hai cờ; HTTP checks0 của chế độ này không thay cho kết quả4 ca trong browser-results. Harness dùng schema `auth_test_<24 hex>`, secret test sinh trong RAM và SMTP TCP local; dọn schema/process sau khi chạy. Không dùng `test:db`/seed nhà hàng cũ để nghiệm thu Block8.

## Tài liệu

- [Audit source và34 tiêu chí](BLOCK8_AUTHENTICATION_AUDIT_REPORT.md)
- [Tóm tắt nghiệm thu và phần còn thiếu](docs/BLOCK8_FINAL_ACCEPTANCE.md)
- [Chính sách authentication](docs/auth-policy.md)
- [Kịch bản kiểm chứng và chụp DevTools](docs/VERIFY.md)
- [Sơ đồ tham khảo và câu hỏi trình bày](docs/flows.md)
- [Lỗi agent reset403: trước/sau](docs/BUG_RESET_BROWSER_403.md)
- [Lựa chọn kỹ thuật](tech-choice.md), [thay đổi](docs/CHANGES.md), [prompt yêu cầu](docs/requirements/)

Nguồn bài tập: [Block8, slide48–63](https://pub.nndkhoa9.win/web/week6/block8-deck.html). Đã đọc lại66 slide khi cập nhật tài liệu. Các số liệu database hoặc test cũ trong Git history không được dùng làm số lượng dữ liệu hiện tại.
