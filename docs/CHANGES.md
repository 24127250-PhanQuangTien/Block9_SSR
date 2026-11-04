# Thay đổi Authentication Block8

Ứng dụng giữ nền Express/EJS SSR, Prisma/PostgreSQL, CRUD nhà hàng và phân trang URL/form/link. Không chuyển React/SPA/fetch/JSON/JWT hoặc Block9.

## Runtime

- Thêm User, ActivationChallenge, PasswordReset, CaptchaChallenge, RateLimit và PrismaSessionStore; cookie sid và session/counter bền vững.
- Register có CAPTCHA trước hash/create/mail; OTP một lần có TTL/attempts/lock, resend giữ attempts; roleviewer do server gán.
- Login có quota IP/email, CAPTCHA sau ngưỡng và Argon2id/hash giả; regenerate sid. Logout destroy DB trước clear cookie; guard toàn CRUD và CSRF mọi form ghi.
- Forgot/reset dùng token hash, transaction claim, thu hồi mọi session; native reset hỗ trợ ngoại lệ Origin:null+same-origin metadata+CSRF đúng, có hồ sơ lỗi thật trước/sau.
- Resend public quota áp mọi email; account backstop chỉ suppress mail, không làm lộ pending qua status. CAPTCHA malformed answer vẫn consume valid challenge; OTP kiểm attempts trước hash.
- Production cấm Ethereal fallback/preview; dev preview riêng tư theo prompt.404 không phản chiếu query token.
- Mail configure nhập credential ẩn; mailcheck không gửi thư. mailDiagnostics dùng allowlist category/code/status, không log raw SMTP reply/error.message/options.
- Navbar auth có nền đặc, dùng được khi tắt JavaScript.

## Kiểm thử và bằng chứng

- Offline24 ca: validation/HTTP/EJS/pagination/security, SMTP error redaction và từ chối browser-only thiếu browser.
- HTTP21 nhóm: schema PostgreSQL ngẫu nhiên riêng, SMTP TCP local; A21 kiểm hai process chia sẻ session/counter và thu hồi qua logout/reset.
- Native Chrome4 context:1440/375px × JSon/off, keyboard/history, register/OTP/login/forgot/reset/logout và phân trang hai list sau login.
- Harness theo dõi mọi server process, dọn schema ngay cả khi migration tạo dở, không bỏ DB cleanup vì lỗi đóng browser. Có smoke đường lỗi setup hạ tầng; không dùng nó làm lỗi agent của ứng dụng.
- JSON allowlist, screenshot che input/email/CAPTCHA; không HAR/trace/storageState/raw payload. Không đổi dependency/lockfile app để cài Playwright.

## Tài liệu hiện tại

README tập trung cách chạy, tính năng và trạng thái nghiệm thu. Audit đã được viết lại theo source hiện tại và slide57–63; tách yêu cầu forgot status/content trên slide với timing trong prompt. VERIFY, FINAL_ACCEPTANCE, auth-policy và MAIL_SETUP ghi rõ bằng chứng/giới hạn. Người dùng xác nhận OTP email thật và login/list thành công; không còn dùng lỗi SMTP535 cũ làm trạng thái hiện tại.

Số liệu cuối và đường dẫn bằng chứng được duy trì ở [FINAL_ACCEPTANCE](BLOCK8_FINAL_ACCEPTANCE.md); audit không tuyên bố100% phần nộp bài khi ảnh DevTools/sơ đồ do nhóm vẽ chưa được xác nhận.
