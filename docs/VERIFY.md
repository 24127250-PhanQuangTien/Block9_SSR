# Kiểm chứng Block8 và phân trang SSR

> **Cập nhật phạm vi theo yêu cầu mới:** `/dishes` và `/dishes/:id` được xem công khai; toàn bộ `/admin/*` và logout vẫn cần session hợp lệ. Trang kích hoạt dùng lại email từ phiên, hiển thị một lần thay cho hai ô nhập. Các số liệu và ma trận audit cũ bên dưới thuộc lượt ghi nhận trước thay đổi này; không dùng chúng để tự kết luận đã tái kiểm source mới. Phạm vi public menu là điều chỉnh có chủ đích so với prompt gốc.

**Kiểm thử sau cập nhật ngày 06/11:** offline **25/25 PASS**; [HTTP](evidence/auth-public-menu-http-verified/http-results.json) **22/22 nhóm PASS, 292 request**; [Chrome](evidence/auth-public-menu-browser/browser-results.json) **4/4 PASS, 49 ảnh**. Các schema thử đã được dọn; không ghi dữ liệu vào schema nhà hàng. Các kết quả này không tự chấm lại ma trận audit ngày 04/11.


Nguồn yêu cầu: [slide48–63](https://pub.nndkhoa9.win/web/week6/block8-deck.html). [Audit](../BLOCK8_AUTHENTICATION_AUDIT_REPORT.md) có đủ34 tiêu chí, source và kết quả; [FINAL_ACCEPTANCE](BLOCK8_FINAL_ACCEPTANCE.md) tóm tắt trạng thái hiện tại. Kịch bản dưới đây là hướng dẫn tái kiểm, không tự chứng minh nhóm đã chụp đủ ảnh hoặc tự trình bày.

## Kết quả đã hoàn tất

- Offline24/24PASS: `npm.cmd test` với validation, HTTP/EJS, pagination và auth security.
- [HTTP](evidence/auth-release-http/http-results.json):21/21 nhóm PASS,276 request, schema riêng đã xóa; SMTP local, hai process server thật. Đã chạy lại source cuối gồm mailDiagnostics, hoàn tất 2026-11-04T15:48:33.647Z.
- [Chrome](evidence/auth-release-browser/browser-results.json):4/4PASS,45 ảnh,1440/375px × JS bật/tắt, Chrome156.0.8078.80, hoàn tất 2026-11-04T15:45:29.306Z; [cleanup](evidence/auth-release-browser/http-results.json).
- Người dùng xác nhận đã nhận OTP qua email thật, kích hoạt, đăng nhập và vào `/dishes?pageSize=10&page=1`. Không giữ email/OTP/sid vào repo; chưa xác nhận reset/thông báo password qua inbox ngoài.
- [Cleanup smoke](evidence/auth-cleanup-smoke/cleanup-results.json): module browser thiếu, harness FAIL đúng dự kiến và vẫn dọn schema. Không tính FAIL này vào nghiệm thu ứng dụng và không dùng làm hồ sơ lỗi slide63.

## Chạy kiểm thử an toàn

```powershell
npm.cmd test
$env:AUTH_EVIDENCE_DIR = 'docs/evidence/auth-release-http'
npm.cmd run test:auth
# Playwright ở thư mục công cụ ngoài dependency app:
npm.cmd install --prefix "$env:TEMP\ssr-pagination-playwright" playwright@1.64.1
$env:AUTH_TEST_PORT = '3109'
$env:AUTH_EVIDENCE_DIR = 'docs/evidence/auth-release-browser'
npm.cmd run test:auth -- --browser --browser-only
```

Có thể chạy đủ HTTP+browser bằng `npm.cmd run test:auth -- --browser`; chỉ dùng browser-only khi có cả cờ browser. Đợi status/completedAt và isolatedSchemaRemoved trước kết luận. Chế độ browser-only có0 HTTP checks,4 ca native trong browser-results.

Harness tạo schema PostgreSQL `auth_test_<24 hex>`, migration và fixture chỉ trong schema đó, secret test sinh trong RAM, SMTP TCP local. Không ghi schema ứng dụng. Theo dõi/dọn mọi server process, thử dọn schema cả khi migration thất bại; lỗi đóng browser không bỏ qua cleanup DB.

Không chạy `npm.cmd run seed`, `test:db` cũ, dbpush, reset hoặc migration schema nhà hàng để thử auth. Không gửi OTP/email thật hàng loạt, không brute force tài khoản người dùng. Không mock hoặc bỏ CSRF/CAPTCHA/guard để làm test pass. Không dùng phiên browser đang đăng nhập của người dùng cho suite tự động.

## Checklist từng kịch bản

Tất cả thao tác có ghi dưới đây phải ở schema test. A01…A22 là nhóm trong HTTP JSON; B là browser context. Kết quả PASS nguồn/test có trong audit; ảnh DevTools cần tự chụp theo phần kế tiếp.

| ID | Thao tác tái kiểm | Kết quả cần chứng minh | Quan sát/DB an toàn |
|---|---|---|---|
|SRC-01|Rà crypto, mail, mailDiagnostics, view reset|Không secret raw trong log/DB/bằng chứng ngoài mục đích hợp lệ|Algorithm/hashStored, không hash/raw value|
|SRC-02|Register/login/reset thật|Argon2id, không MD5/SHA password|Chỉ prefix algorithm; A05/A09/A13|
|SRC-03|Login pending đúng password|ACTIVATION_REQUIRED, không authenticated session|Session.userId count0; A06/B|
|SRC-04|Gọi mọi GET/POST/override CRUD quản trị không cookie|303login trước write|A02, count CRUD không đổi|
|SRC-05|GETreset; GETregister/authenticated list|usedAt/password không đổi; công bố metadata GET có ghi|A12/B; Session/CAPTCHA/quota là ngoại lệ PARTIAL|
|SRC-06|Xem hidden/cookie/client data|Chỉ ID/ảnh CAPTCHA, signedSID; store/counter ở server|A04/A16; không chụp đáp án|
|ACT-01|Pending login|Không session authenticated|A06/B|
|ACT-02|Activate OTP đúng|Đúng user active+emailVerifiedAt|A06/A07/B; che OTP/userId|
|ACT-03|OTP sai/expired/used|Cùng INVALID_OTP dưới quota, user status không đổi|A06/A07/A08; khóa ưu tiên429|
|ACT-04|Resend sau cooldown, thử old/new|Cũ bị từ chối, mới kích hoạt được|A07; chỉ chụp thời gian/usedAt|
|ACT-05|Đến ngưỡng attempts/send|Server429, resend không reset attempts/lock|A08/A14/A17; metadata fixture ở mép ngưỡng|
|ACT-06|Register body roleadmin|DB viewer|A05; chỉ role/status|
|ACT-07|GET `/admin/dishes` sau activate|303login, không auto-login|A06/B|
|ACT-08|OTP dùng làm password|INVALID_CREDENTIALS|A06; che toàn bộ payload|
|CAP-01|Register thiếu/sai CAPTCHA|Không tạo user/mail|A04 user/inbox count|
|CAP-02|CAPTCHA+dữ liệu hợp lệ|Pending/OTP đi tiếp|A05/B; không chụp raw email|
|CAP-03|Replay/expired/other-session/purpose|CAPTCHA_FAILED|A04/A16 usedAt; che answer/anonId|
|CAP-04|Sau3 sai bỏ CAPTCHA, dùng password đúng|Dừng trước verify password|A09 count vẫn3; đối chiếu thứ tự source|
|CAP-05|Đúng CAPTCHA, password sai|Email failure count tăng|A09 count4…10|
|CAP-06|Đang khóa, password/CAPTCHA đúng|429, không session|A18 giữ lock qua restart|
|CAP-07|Cookie jar/phiên mới khi khóa|Không né email counter|A09/A21|
|SES-01|Không cookie gọi CRUD quản trị|303login, không write|A02|
|SES-02|Login active|303, SID cookie, vào CRUD/list|A09/A15/B; che giá trị Set-Cookie|
|SES-03|Email lạ/password sai|Cùng INVALID_CREDENTIALS|A09; không dùng timing để suy pass|
|SES-04|SoSID trước/sau trong RAM|Khác nhau|A09/B; không in hai SID|
|SES-05|Stop/start server test, cookie cũ|200 với DB session còn hạn|A10/B; A21 thêm hai process|
|SES-06|POSTlogout, replaycookie, stale store.set|Session rowgone, replay303, không hồi sinh|A10/B/A21|
|SES-07|ThiếuCSRF/Originkhác/null ngoài ngoại lệ|403 khi đã authenticated|A03/A15/U/B; cheCSRF|
|RST-01|Forgot email có/không|Cùng303sent và thông báo|A12/A20/B; timing là hạn chế prompt riêng|
|RST-02|Forgot quá quotaIP/email|429|A12/A14|
|RST-03|Tokenold/expired/used; concurrent reset|Từ chối và password không đổi trái phép; chỉ1 thắng|A12/A13/B; cheURL/token/hash|
|RST-04|GETreset hợp lệ|Form/no-referrer, usedAt vẫnnull|A12/B; so row trước/sau|
|RST-05|Reset đúng|Không auto-login, mọi SID cũ denied|A13/B/A21; Session.userId count0|
|RST-06|Token ởlogin/activate/sid|Không password/OTP/signedSID|A19; token không consume|

## Request trực tiếp và cookie jar

Dùng terminal riêng và schema test; không `curl -v/-i`, không in cookie jar, password, token, raw header/body. Ví dụ chỉ GET để chứng minh guard và lấy form:

```powershell
$authJar = Join-Path $env:TEMP 'block8-cookie-jar.txt'
$authHtml = Join-Path $env:TEMP 'block8-form.html'
curl.exe -s -o $authHtml -w '%{http_code}' http://localhost:3108/admin/dishes
# Mong đợi303; xem Location đã che trong JSON/Network, không theo redirect để nhầm200.
curl.exe -s -c $authJar -o $authHtml http://localhost:3108/login
$csrf = [regex]::Match([IO.File]::ReadAllText($authHtml), 'name="_csrf" value="([^"]+)"').Groups[1].Value
# Không echo csrf/cookie/HTML. POST ở cùng jar, đúng Origin và _csrf.
# Suite test:auth đã thực thi các POST thật và xuất transcript đã che.
```

Để tự tái kiểm bằng curl, lấy lại CSRF từ form mới sau login/regenerate, gửi cookie jar bằng `-b/-c`, body form-urlencoded và Origin cùng APP_ORIGIN; lưu response vào file tạm. Xác minh các status303/200/400/403/429 trong bảng. Không lưu payload chứa password/OTP/token vào Git. Dọn file tạm sau khi kiểm; credential chỉ nhập trong terminal/browser riêng.

## Chụp bằng chứng slide63

Với **mỗi kịch bản** trong bảng, nhóm cần lưu đủ ảnh UI, Network, Application/Cookies và request trực tiếp, kèm DB field liên quan. Bảng HTML do Playwright/HTTP/Prisma dựng từ dữ liệu thật đã che không phải ảnh giao diện DevTools. Các screenshot auth không tự chứng minh đủ toàn bộ34 dòng.

- UI: chụp thông báo/mã lỗi, form/trang đích, viewport1440/375 khi phù hợp; che input email/password/OTP/CAPTCHA và navbar email.
- Network: method, pathname/query đã che, status, redirect; tuyệt đối che token URL, request payload, CSRF/challengeId/OTP/password và Set-Cookie value. Giữ cookie flags nhìn được.
- Application/Cookies: che toàn bộ Value, chỉ giữ name/Path/SameSite/HttpOnly/Secure/expiry; không export storageState/HAR/trace.
- DB: chỉ trạng thái user/verified flag, hạn, usedAt, attempts/lockedUntil/sendCount, session existence/expiry và counter đã che key. Không chụp SID, session.data, passwordHash, OTP/token hash, CAPTCHA answer hoặc địa chỉ/tài khoản thật.
- Sơ đồ: nhóm tự vẽ register+CAPTCHA, login+brute force, logout và forgot/reset, tự giải thích theo slide62. [flows](flows.md) là bản tham khảo, chưa phải xác nhận nhóm đã làm.
- Lỗi agent: dùng [native reset403 trước/sau](BUG_RESET_BROWSER_403.md), không cố ý tạo lỗi ứng dụng mới. Không dùng cleanup smoke hạ tầng thay hồ sơ lỗi này.

## Hồi quy Block5 và giới hạn

A15 thực hiện tạo/sửa/chi tiết/xác nhận/xóa cả ba thực thể trong schema riêng, validation400, missing404, relation guard và303 PRG. Hai list giữ q/filter/sort/pageSize/page/link. Browser kiểm JSon/off, keyboard Tab/Enter, Back/Forward, viewport375 không tràn ngang document, bảng admin cuộn trong container. Không có request CRUD ghi lên dữ liệu nhà hàng của nhóm.

Secure cookie trên HTTPS/reverse proxy deployment, multi-instance/load balancer tải lớn, provider DB khác, timing production và screen reader/OCR chưa được nghiệm thu. GET metadata và timing không được chuyển PASS chỉ vì các suite chạy đạt. Inbox OTP thật đã được người dùng xác nhận; inbox reset/thông báo đổi mật khẩu chưa xác nhận ngoài SMTP local.
