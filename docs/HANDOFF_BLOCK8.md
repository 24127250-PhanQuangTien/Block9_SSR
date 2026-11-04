# Tiếp tục Block8 trên máy khác

Ngày bắt đầu đợt hoàn thiện: 04/11/2026. Repository: `https://github.com/ChuHaiLi/Web-Block5`; nền đã push `main` commit `36220417dc0bdb0d937889eb215b0ccde9cbf684`.

## Yêu cầu hiện tại của người dùng

Hoàn thiện Block8, ưu tiên đồng thời [prompt nhóm trưởng](requirements/PROMPT-block8-auth-block5-ssr.md) và [bài tập Block8](https://pub.nndkhoa9.win/web/week6/block8-deck.html), nhất là slide48–63. Giữ phân trang SSR, tìm kiếm, filter, pageSize, sort và CRUD của Block5. Không React/SPA/fetch/JSON/JWT/Block9. Không đọc/in credential hoặc nội dung `.env` vào tool output/chat/ảnh/report. Không seed/reset/migrate schema ứng dụng hoặc sửa dữ liệu nhà hàng để kiểm thử. Mọi thử ghi dùng schema PostgreSQL ngẫu nhiên do harness tạo/dọn.

File prompt audit trong `requirements/` là yêu cầu cho **đợt audit trước** (chỉ tạo report); yêu cầu mới của người dùng đã cho phép sửa mã để hoàn thiện. Không dùng lệnh “không sửa source” của đợt audit cũ để dừng công việc hiện tại.

## Nền đã hoàn tất trước đợt mới

Express4/EJS SSR, Prisma5/PostgreSQL; pagination hai list; register/CAPTCHA/OTP/resend/login/logout/forgot/reset; persistent Session/RateLimit; Argon2id, CSRF+Origin, guard toàn CRUD. Role default viewer, chưa RBAC. Có19 test offline,15 nhóm tích hợp và22 browser pagination trước đó; audit gốc tại `BLOCK8_AUTHENTICATION_AUDIT_REPORT.md`, bản commit3622041 có30/34PASS,4PARTIAL. Đây là kết quả **trước khắc phục**, không tự coi là trạng thái cuối mã mới.

## Những sửa đã thực hiện trong bản bàn giao mới

- Resend: bỏ khác biệt429/303 do backstop theo account khi generic quota vẫn cho phép, giữ limiter public áp dụng mọi email. Đây là lỗi thực tế của agent cần hồ sơ trước/sau theo slide63.
- CAPTCHA cóID hợp lệ bị tiêu thụ kể cả answer thiếu/sai kiểu/quá dài.
- OTP kiểm attempts trước so hash kể cả metadata không nhất quán.
- Production không fallback Ethereal/log preview; development vẫn cho preview theo prompt.404 không phản chiếu query có token.
- Sửa lỗi browser reset403: Origin:null do no-referrer; chỉ chấp nhận POSTreset có Fetch Metadata same-origin và CSRF đúng. Giữ403 cho các trường hợp khác. Có hồ sơ lỗi agent `docs/BUG_RESET_BROWSER_403.md`.
- Navbar trang auth có nền đặc để logo/menu nhìn được cả khi tắtJS.
- Mở rộng harness auth:20 nhóm dự kiến, request transcript + DB snapshot đã che, Chrome observer; native auth flow1440/375px, JSon/off, keyboard/history, pagination sau login.
- Thêm wizard `npm.cmd run mail:configure` (Gmail mặc định, input credential không echo) và `npm.cmd run mail:check`; hướng dẫn [MAIL_SETUP.md](MAIL_SETUP.md).

**Đính chính đánh giá cũ:** register hợp lệ cả new/pending/active **phải cùng303** theo mục5.1 prompt; không sửa thành429 riêng cho pending. Prompt cho phép preview Ethereal ở dev. Metadata GET (session rolling/CAPTCHA/counter) xung đột với câu cấm mọi ghi GET nếu hiểu tuyệt đối; không hứa đã loại mọi metadata write. Runtime auth dùng Prisma, nhưng schema/migration hiện PostgreSQL UUID; không khẳng định mọi DB provider đã nghiệm thu.

## Kết quả cuối đợt bàn giao và việc cần tiếp tục

- `npm.cmd test` đã chạy sau sửa: **22/22PASS**; gồm guard mail production, redaction và các trường hợp Origin:null/CSRF.
- HTTP cuối `npm.cmd run test:auth`: **20/20 nhóm PASS,251 request**, hoàn tất2026-11-04T11:46:46.519Z; `docs/evidence/auth-final/http-results.json`, `isolatedSchemaRemoved=true`.
- Browser cuối `npm.cmd run test:auth -- --browser --browser-only` tại cổng3109: **4/4PASS,45 ảnh**, Chrome156.0.8078.80,1440/375px × JSon/off. `docs/evidence/auth-browser-final/browser-results.json` và `http-results.json` xác nhận cleanup. File HTTP của browser-only có checks0 vì chỉ chạy browser; không nhầm với4 ca native trong browser-results.
- Navbar sau sửa đã kiểm riêng **4/4PASS**, ảnh ở `docs/evidence/auth-navbar-final/`; desktop/375,JSon/off, nền đặc/không tràn ngang. UI thật dùng DB schema test riêng.
- Lượt kết hợp đầu tiên thất bại ở native reset403 sau20 nhóm HTTP đạt. Bằng chứng lỗi trước sửa giữ ở auth-reset-before và toàn bộ observer cũ ở auth-observer-before-reset-fix; không coi chúng là kết quả mã cuối. Các bảng Network/Cookies/DB là dữ liệu thật đã che thu qua HTTP/Playwright/Prisma, **không phải ảnh tab DevTools**.
- README, VERIFY, flows, hồ sơ lỗi trước/sau và [ma trận mới](BLOCK8_FINAL_ACCEPTANCE.md) đã cập nhật: **32/34PASS,2PARTIAL** (metadataGET và bảo đảm timing). Chưa có bộ ảnh đúng tab DevTools từng34 tình huống; nhóm cần tự vẽ/trình bày sơ đồ khi nộp theo slide63. Chưa chứng minh đaDB, SMTPinbox/HTTPSproduction hoặc nhiềuinstance.
- Không tự tạo lỗi mới để đáp ứng slide63. Dùng lỗi resend đã có trong3622041 và regression sau sửa.
- Người dùng đã yêu cầu commit/push **bản bàn giao kèm code** lên main. Trên máy mới kiểm `git log` và bảo đảm có `docs/BLOCK8_FINAL_ACCEPTANCE.md`, `tests/auth.browser.js`, `scripts/configure-mail.js`; commit3622041 một mình chưa chứa các sửa đợt mới. Không reset/clean/ghi đè working tree.

## Email thật đang vướng gì?

Chương trình đã tự nạp dotenv và chỉ báo cờ: SMTP_HOST/USER/PASS/FROM **chưa được cấu hình** tại thời điểm kiểm tra; đang dùng **Ethereal**, nên OTP không tới inbox Gmail/Outlook. Bộ test chỉ gửi SMTP local. Người dùng được khuyên Gmail SMTP + App Password; cần chủ tài khoản bật2-Step Verification, tự tạo và nhập credential tại terminal của họ. Không hỏi password/API key/.env trong chat. Chưa có xác nhận inbox thật. Xem `docs/MAIL_SETUP.md`.

## Máy mới: khôi phục môi trường

1. Clone/pull **main chứa bản bàn giao mới**. Không copy node_modules hoặc thư mục công cụ tạm. Nếu máy mới đã có thay đổi local, bảo toàn trước khi pull.
2. Trong Web-Block5: `npm.cmd ci`. Cài Node tương thích dependency Argon2 hiện có.
3. Tự tạo/cấu hình `.env` từ `.env.example`; lấy credential qua kênh riêng được phép hoặc cấu hình lại. Không commit.env. Dùng cùng DB có sẵn; **không chạy seed nhà hàng/dbpush/reset/migration chỉ vì đổi máy**.
4. `npx.cmd prisma generate` dùng bản Prisma local đã cài. `npm.cmd start` hoặc `npm.cmd run dev`.
5. Test offline: `npm.cmd test`. Test auth HTTP tách biệt: `npm.cmd run test:auth`. Test có browser: cài Chrome và `npm.cmd install --prefix "$env:TEMP\ssr-pagination-playwright" playwright@1.64.1`; harness mặc định tìm module ở thư mục đó (hoặc đặt `PLAYWRIGHT_MODULE`). Chạy `npm.cmd run test:auth -- --browser` cho đủ suite hoặc `npm.cmd run test:auth -- --browser --browser-only` để kiểm lại4 context native. Có thể đặt `AUTH_TEST_PORT` khác3108; harness từ chối nếu cổng bị dùng. Không thêm Playwright vào dependency/lockfile app.

Web session cũ nằm ở bảng Session của DB nhưng cookie sid ở browser máy cũ. Đăng nhập lại trên máy mới là cách đơn giản; không chuyển cookie/sid vào Git/chat. Không thể mang server process, SMTP local, Chrome context hoặc bài test đang chạy sang máy mới chỉ bằng copy repo.

## Câu nhắn cho Codex trên máy mới

> Đọc docs/HANDOFF_BLOCK8.md và hai prompt trong docs/requirements/. Tiếp tục hoàn thiện Block8 theo yêu cầu đã ghi, giữ CRUD/phân trang SSR. Trước hết kiểm git status và kết quả docs/evidence/auth-final; bảo toàn thay đổi local. Không in.env/credential, không ghi DB nhà hàng, không seed/reset. Chỉ báo PASS với kiểm thử đã chạy; phân biệt DBtest/SMTP local/browser với inbox/production thật.

Lịch sử chat Codex không nằm trong Git. `codex resume` mở lịch sử đã lưu ở môi trường có phiên đó; không mặc định clone repo là đồng bộ chat. File này chứa ngữ cảnh công việc đủ để bắt đầu phiên mới; không chứa session/cookie hoặc token đăng nhập. Tham khảo [tài liệu Codex CLI chính thức](https://learn.chatgpt.com/docs/codex/cli).
