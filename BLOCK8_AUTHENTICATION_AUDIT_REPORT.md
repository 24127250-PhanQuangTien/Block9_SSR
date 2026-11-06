# Audit Authentication Block8 — source hiện tại

> **Cập nhật phạm vi theo yêu cầu mới:** `/dishes` và `/dishes/:id` được xem công khai; toàn bộ `/admin/*` và logout vẫn cần session hợp lệ. Trang kích hoạt dùng lại email từ phiên, hiển thị một lần thay cho hai ô nhập. Các số liệu và ma trận audit cũ bên dưới thuộc lượt ghi nhận trước thay đổi này; không dùng chúng để tự kết luận đã tái kiểm source mới. Phạm vi public menu là điều chỉnh có chủ đích so với prompt gốc.

**Kiểm thử sau cập nhật ngày 06/11:** offline **25/25 PASS**; [HTTP](docs/evidence/auth-public-menu-http-verified/http-results.json) **22/22 nhóm PASS, 292 request**; [Chrome](docs/evidence/auth-public-menu-browser/browser-results.json) **4/4 PASS, 49 ảnh**. Các schema thử đã được dọn; không ghi dữ liệu vào schema nhà hàng. Các kết quả này không tự chấm lại ma trận audit ngày 04/11.


Ngày đối chiếu:04/11/2026. Repository gốc: `ChuHaiLi/Web-Block5`, nhánh main; cùng source được công bố tại `ChuHaiLi/Web-Block8`. Báo cáo này thay bản audit trước khắc phục; không dùng các line number, kết luận30/34 hoặc trạng thái SMTP cũ làm kết luận hiện tại.

## 1. Kết luận và phạm vi

Đã triển khai đầy đủ các luồng chức năng chính: đăng ký/CAPTCHA/OTP, đăng nhập chống brute force, session-cookie lưu DB, logout, forgot/reset và bảo vệ mọi route CRUD Block5. Giữ Express4/EJS SSR, Prisma5/PostgreSQL, form HTML/PRG303 và phân trang; không REST API auth, SPA, fetch, JWT hoặc RBAC Block9.

Người dùng xác nhận tự đăng ký, giải CAPTCHA, nhận OTP qua email thật, kích hoạt, đăng nhập và mở `/dishes?pageSize=10&page=1` thành công. Xác nhận này bổ sung bằng chứng OTP inbox; không chứng minh toàn bộ kịch bản lỗi, reset email thật hoặc production. Không lưu email, OTP, cookie hay credential của người dùng.

**Chưa thể tuyên bố toàn bộ bài tập và hồ sơ nghiệm thu đã xong100%.** Slide63 yêu cầu bằng chứng theo từng kịch bản và sơ đồ do nhóm vẽ; bộ ảnh đúng tab DevTools/Application cho từng ca chưa đủ. GET vẫn ghi metadata bảo mật. Phần chống dò email bằng timing của prompt nhóm trưởng chưa được bảo đảm.

Đã tải/đọc lại66 slide từ [Block8](https://pub.nndkhoa9.win/web/week6/block8-deck.html), trọng tâm48–63; không chỉ suy từ báo cáo cũ. Phân biệt:

- **Slide57–61:**34 tiêu chí gồm6 câu kiểm source và28 kịch bản nghiệm thu. RST-01 trên slide61 chỉ yêu cầu cùng nội dung/status, không yêu cầu chứng minh constant-time.
- **Prompt nhóm trưởng:** thêm yêu cầu thời gian không phân biệt được tài khoản và câu cấm mọi GET ghi dữ liệu. Các sai khác được công bố trong auth-policy.
- **Hồ sơ nộp slide62–63:** không được thay bằng tỷ lệ test hoặc lời xác nhận một happy path.

## 2. Bằng chứng và phương pháp

| Nguồn | Kết quả đã hoàn tất | Giới hạn |
|---|---|---|
| `npm.cmd test` | 24/24PASS | Fixture persistence offline; Argon2/routes/CSRF/guard thật, không chứng minh PostgreSQL hay SMTP ngoài |
| A01…A21 | 21/21 nhóm PASS,276 request | [HTTP/Prisma thật](docs/evidence/auth-release-http/http-results.json), schema ngẫu nhiên riêng, SMTP TCP local, cleanup thành công |
| B | 4/4 Chrome PASS,45 ảnh | [Native browser](docs/evidence/auth-release-browser/browser-results.json),1440/375px × JSon/off; [cleanup](docs/evidence/auth-release-browser/http-results.json) |
| Người dùng xác nhận | OTP inbox thật và login/CRUD list thành công | Báo cáo bằng lời, không thu cookie/email/OTP hoặc ảnh tài khoản |
| Cleanup smoke | PASS cho đường lỗi harness | [JSON](docs/evidence/auth-cleanup-smoke/cleanup-results.json); HTTP FAIL cùng thư mục là lỗi setup browser cố ý để thử cleanup, không phải FAIL auth |

Đã chạy lại source cuối, gồm logging mail an toàn: HTTP hoàn tất 2026-11-04T15:48:33.647Z; Chrome156.0.8078.80 hoàn tất 2026-11-04T15:45:29.306Z. Cả hai statusPASS và schema riêng đã dọn; offline24/24PASS. Không chạy seed/reset/dbpush/migration schema nhà hàng để kiểm thử; mọi ghi tích hợp ở schema PostgreSQL ngẫu nhiên do harness tạo và dọn. Không mock quyết định bảo mật. Không SMTP thật hàng loạt, không HAR/storageState/raw payload.

A01…A21 là thứ tự `checks` trong HTTP JSON. B là bốn context trong browser-results; HTTP checks0 của browser-only là đúng chế độ. Không dùng riêng cờ browser-only thiếu browser, harness đã từ chối trước mở DB.

## 3. Luồng và dữ liệu thực tế

| Luồng | Hiện thực/source |
|---|---|
| Register | `src/routes/auth.js`, POST `/register`: IP quota → consume CAPTCHA → validate → Argon2id mọi nhánh hợp lệ → transaction tạo pending.viewer hoặc giữ pending password → OTP async khi còn quota →303 `/activate` cùng thông báo |
| Activate/resend | `src/services/otp.js`, `issue/activate`: HMAC gắn user/purpose, TTL/attempts/lock; resend thay mã nhưng giữ attempts/lock; claim có điều kiện trong transaction; activate xong303login, chưa authenticated |
| Login | `src/routes/auth.js`, POST `/login`: lock/quota → CAPTCHA khi cần → Argon2 verify thật hoặc hash giả → tăng fail counter, pending bị chặn; active regenerate SID/CSRF/anonId và lưu session rồi303dishes |
| Logout | POST `/logout`: requireLogin + CSRF → destroy DB session → clearCookie đúng thuộc tính →303login |
| Forgot | POST `/forgot`: quota IP/email → transaction invalid token cũ và tạo hash token mới nếu có user → gửi mail async →303 `/forgot/sent` chung |
| Reset | GET chỉ kiểm token và hiện form, không claim; POST validate/Argon2 → transaction claim usedAt, đổi hash, invalid token còn lại, xóa mọi session user → mail thông báo →303login; không kích hoạt pending |
| CRUD/phân trang | `src/app.js`, router dishes/admin: requireLogin trước CSRF và router; mọi list/detail/new/edit/delete/write được bảo vệ; count/skip/take và form/link HTML |

Model trong `prisma/schema.prisma`: User, ActivationChallenge, PasswordReset, CaptchaChallenge, RateLimit, Session; bảng cũ `session` không phải store đang dùng. Runtime auth chỉ dùng Prisma Client; schema UUID và migrations hiện PostgreSQL, không khẳng định migration chạy nguyên trên mọi provider.

Password dùng Argon2id,64MiB/timeCost3/parallelism1. OTP6 số từ crypto.randomInt, HMAC-SHA256 với pepper+userId; reset token32 byte random base64url, chỉ lưu SHA-256. Reset hidden token hợp lệ và nội dung email là nơi mang bearer secret theo chức năng; không đưa vào bằng chứng công khai. Dev Ethereal preview được prompt cho phép nhưng link là thông tin riêng; production cấm fallback/preview. `mailDiagnostics` chỉ xuất category/code/status trong danh sách cho phép, không xuất error.message/reply/options/credential.

## 4. CAPTCHA và brute force

Nguồn: `src/services/captcha.js` (`issue`, `verify`), `src/routes/auth.js` (`renderForm`, login/register), `src/config/authPolicy.js`.

- svg-captcha tạo SVG5 ký tự, noise2, bỏ ký tự dễ nhầm. Không reCAPTCHA ngoài; hostname/action/score không áp dụng.
- Register luôn cần; login cần từ3 lần password sai theo email trong15 phút. Activate/resend/forgot/reset không có CAPTCHA riêng.
- `CaptchaChallenge` lưu UUID, anonId, purpose, answer lowercase, expiresAt5 phút, usedAt. Answer ở DB đọc được để xác minh ảnh, không hidden answer/JSON/cookie/client JS. Cookie chỉ chứa SID có chữ ký.
- Với ID đúng, consume nguyên tử theo anonId/purpose/expiry/usedAt **trước** kiểm answer. Answer thiếu, array hoặc quá dài vẫn tiêu thụ challenge hợp lệ; ID malformed không chọn được row. Đây là sửa so với audit cũ.
- Sai/thiếu trả HTML200 CAPTCHA_FAILED và ảnh mới khi còn quota; replay/hết hạn/sai phiên/purpose bị chặn. Login thiếu CAPTCHA dừng trước password verify. Đúng CAPTCHA không xóa counter hoặc bỏ khóa.
- Đổi mã bằng link tải lại SSR; phát ảnh tối đa60/IP/15 phút, kể cả render lại lỗi. Không cần fetch/JSON.
- Có label/link đổi mã; chưa có audio, screen-reader/OCR audit. CAPTCHA chỉ tăng chi phí bot, không phải chứng minh danh tính hoặc thay rate limit.

## 5. Rate limit thực tế

Nguồn: `src/config/authPolicy.js`, `src/services/rateLimit.js` (`read/consume`), `src/services/otp.js` và auth router. Email trim/lowercase toàn bộ trước tạo key. IP do Express `req.ip`; trust proxy lấy từ cấu hình, mặc định false. Hai bộ đếm độc lập; nhánh short-circuit có thể chặn trước khi tăng counter tiếp theo.

| Hành động | Theo IP | Theo email/tài khoản | Cửa sổ/chờ/khóa | Reset và kết quả |
|---|---|---|---|---|
| Cấp CAPTCHA |60 lần|Không|15 phút|Hết window mở lại; vượt429|
| Register |10 POST|Dùng budget gửi1/60s,5/giờ và backstop challenge|IP1 giờ; cooldown60s|IP vượt429; mọi nhánh hợp lệ new/pending/active vẫn303, mail được suppress nếu hết budget|
| Login request |30 POST|Email counter riêng|15 phút|Thành công giữ IP budget; đang khóa email có thể dừng trước consume IP|
| Login password sai |Quota request ở trên|Từ3 cần CAPTCHA,10 khóa|Window15 phút, khóa5 phút|Sai lần10 trả429; đúng CAPTCHA không reset; login thành công xóa email key; hết khóa read coi count0|
| Activate request |20 POST|20 POST|15 phút|Vượt key nào cũng429 trước OTP|
| OTP không hợp lệ |Ngoài quota request|5 lần/challenge|Khóa15 phút|Resend giữ attempts/lock; hết khóa activate tiếp mới mở lại attempts; lần5 đã429|
| Resend |20 POST|1/60s,5/giờ|IP15 phút; email60s/1 giờ|Public quota áp cả absent/active/pending; quá429. Backstop account chỉ suppress mail, không tạo khác status303/429 riêng|
| Forgot |20 POST|5 POST, kể cả email lạ|1 giờ|Vượt429; không tạo token mới|
| Reset |Không có limiter riêng|Không có counter riêng|Token15 phút/single-use; POST có CSRF|Sai token HTML200 INVALID_RESET; không có429 riêng|
| Logout/CRUD |Không có quota auth riêng|Session active+CSRF|Idle/absolute session|Guard303 hoặc CSRF403|

Counter/lock ở RateLimit hoặc ActivationChallenge, không RAM/cookie. A09/A18 kiểm lock qua cookie mới và restart; A21 kiểm dùng chung counter giữa hai process. Chưa chứng minh cấu hình req.ip sau proxy production hoặc race tải lớn xuyên instance.

## 6. Session, cookie và restore

Nguồn: `src/app.js`, `src/services/sessionStore.js`, `src/middleware/requireLogin.js`, `src/middleware/csrf.js`.

- express-session kiểm chữ ký SID, gọi PrismaSessionStore.get → Session.findUnique → kiểm expiresAt → JSON.parse → req.session. Không JWT/MemoryStore/Redis.
- Cookie `sid`: HttpOnly, SameSite=Lax, Path=/, không Domain, Secure khi production; idle30 phút rolling. Server còn kiểm hạn tuyệt đối8 giờ, active và authVersion=User.updatedAt. Cookie không chứa toàn bộ hồ sơ user.
- Bảng Session lưu sid nguyên dạng, userId nullable/index, data JSON text và expiresAt. Không hash SID/mã hóa JSON ở tầng ứng dụng. Data chứa cookie/csrf/anonId; khi authenticated thêm userId, createdAt, lastSeenAt, authVersion. Không chứa password/OTP/reset raw do router gán.
- Login regenerate trước gán identity. `freshAuthentication` chỉ cho phép tạo authenticated row vừa đăng nhập; request cũ chỉ update row còn tồn tại. Version user ngăn hồi sinh session sau reset.
- set/touch lấy expiry=min(now+idle,createdAt+absolute). GET cũng có thể gia hạn metadata. Cleanup chạy khi khởi động và mỗi15 phút cho metadata hết hạn; không chạm bảng nhà hàng.
- Logout destroy trước clearCookie. Reset deleteMany tất cả Session.userId trong transaction. A10 kiểm replay/stale set; A21 kiểm logout/reset xuyên hai process.
- **Session restoration:** sau restart, browser gửi cookie cũ, process mới tra lại cùng bảng Session. Không có hàm/sản phẩm tên restore riêng hoặc backup/restore DB. A10 và B thực sự restart server test; không chỉ đọc source để suy ra.
- **Password reset:** PasswordReset.tokenHash/userId/expiresAt/usedAt là dữ liệu khác Session. Không có bảng restore. Xóa cookie chỉ ngừng browser gửi SID, không tự xóa row; logout mới thu hồi phía server.

## 7. Ma trận34 tiêu chí slide57–61

PASS ở bảng là đúng yêu cầu tương ứng trên slide và bằng chứng test đã chạy, không phải chứng nhận production. SRC-05 giữ PARTIAL vì metadata GET. Riêng RST-01 có cùng nội dung/status nên PASS theo slide61; yêu cầu timing bổ sung của prompt vẫn PARTIAL, không được gộp thành đã đạt.

| ID | Yêu cầu | Theo slide | Source thực tế và bằng chứng |
|---|---|---|---|
| SRC-01 | Không lưu/log/response secret raw trái mục đích |PASS|crypto/mail/mailDiagnostics; A05/A12/A13; U guard production/redaction. Email/form reset đúng chức năng, preview dev giữ riêng|
| SRC-02 | Password hash phù hợp |PASS|crypto.hashPassword Argon2id; A05/A09/A13|
| SRC-03 | Pending không authenticated |PASS|POSTlogin chặn trước regenerate; A06/B Session.userId không được cấp|
| SRC-04 | Guard mọi CRUD |PASS|app.use requireLogin trước routers; A02/A15/B|
| SRC-05 | GET không đổi dữ liệu, nhất là reset |PARTIAL|GETreset không đổi usedAt/password (A12/B), nhưng prepare/store/captcha/rate phát ảnh ghi metadata bảo mật|
| SRC-06 | Store/counter server, answer không ở client |PASS|Session/RateLimit/CaptchaChallenge; A04/A09/A10/A16/A18|
| ACT-01 | Pending login bị từ chối |PASS|A06/B ACTIVATION_REQUIRED, không authenticated session|
| ACT-02 | OTP đúng active đúng user/verifiedAt |PASS|otp.activate transaction conditional claim; A06/A07/B|
| ACT-03 | OTP sai/expired/used cùng lỗi |PASS|INVALID_OTP dưới quota; A06/A07/A08/B; khóa ưu tiên429|
| ACT-04 | Resend thay mã cũ |PASS|otp.issue; A07 old rejected/new accepted|
| ACT-05 | Quá thử/gửi429, resend giữ attempts |PASS|activate/resend quota+lock; A08/A14/A17; register hợp lệ vẫn303 theo mục5.1 prompt|
| ACT-06 | Body roleadmin vẫn viewer |PASS|User.create role cố định; A05|
| ACT-07 | Activate không auto-login |PASS|303login; A06/B store/guard kiểm chưa authenticated|
| ACT-08 | OTP không làm password |PASS|Argon2 login độc lập OTP; A06|
| CAP-01 | Register sai/thiếu CAPTCHA không user/mail |PASS|verify trước hash/create/send; A04|
| CAP-02 | CAPTCHA và dữ liệu đúng đi tới OTP |PASS|A05/B SMTP local; thêm xác nhận OTP thật của người dùng|
| CAP-03 | Replay/expired/purpose sai bị chặn |PASS|captcha.verify conditional updateMany; A04/A16|
| CAP-04 | Bỏ CAPTCHA sau ngưỡng bị chặn trước password |PASS|POSTlogin thứ tự lock/captcha/password; A09|
| CAP-05 | Đúng CAPTCHA, sai password vẫn tăng count |PASS|rate.consume email; A09 các lần4–10|
| CAP-06 | Khóa vẫn429 dù đúng password/CAPTCHA |PASS|A09/A18 giữ lock qua restart|
| CAP-07 | Cookie mới không reset email counter |PASS|RateLimit DB, key email; A09/A21|
| SES-01 | Anonymous CRUD303, dữ liệu không đổi |PASS|guard prefix mọi method; A02, CRUD schema test vẫn rỗng|
| SES-02 | Active login303, Set-Cookie, vào CRUD |PASS|POSTlogin regenerate/save; A09/A15/B và người dùng xác nhận|
| SES-03 | Email lạ/password sai cùng lỗi |PASS|INVALID_CREDENTIALS, hash giả; A09|
| SES-04 | SID đổi sau login |PASS|req.session.regenerate; A09/B so sánh trong RAM|
| SES-05 | Session tồn tại qua restart |PASS|PrismaSessionStore.get; A10/B restart thật; A21 chia sẻ giữa hai process|
| SES-06 | Logout xóa row, replay bị từ chối |PASS|destroy rồi clearCookie; A10/B/A21, stale set không hồi sinh|
| SES-07 | CSRF chặn form từ nơi khác |PASS|middleware csrf và token mọi form; A03/A15/U/B. Ngoại lệ resetnull rất hẹp|
| RST-01 | Forgot cùng nội dung/status |PASS|POSTforgot303sent + thông báo chung; A12/A20/B. Timing không được bảo đảm, xem mục8|
| RST-02 | Forgot vượt quota429 |PASS|IP20/email5 mỗi giờ; A12/A14|
| RST-03 | Old/expired/used reset bị từ chối |PASS|PasswordReset conditional usedAt transaction; A12/A13/B, hai request chỉ một thắng|
| RST-04 | GETreset chỉ form, usedAt không đổi |PASS|GETreset findUnique/read, no-referrer; A12/B deep-equal row|
| RST-05 | Reset không auto-login, SID cũ denied |PASS|transaction password/token/session; A13/B/A21, pending vẫn pending|
| RST-06 | Reset token không dùng ở route khác |PASS|A19 token không làm password/OTP/signedSID; không consume trái mục đích|

**Tổng theo34 mục slide:33PASS/0FAIL/1PARTIAL.** Theo hợp đồng prompt nhóm trưởng thêm timing vào RST-01: **32PASS/0FAIL/2PARTIAL**. Đây là hai phạm vi yêu cầu khác nhau, không phải tăng điểm bằng thay mã test. Không suy phần trăm hoàn thành toàn bài từ số nhóm test hoặc hai tổng này.

## 8. Sai khác, hạn chế và việc còn thiếu

1. **GET metadata:** không có GET ghi nhà hàng, active user, password hoặc claim reset token; có ghi Session/TTL, CAPTCHA và quota phát ảnh. Chưa đáp ứng câu cấm mọi ghi GET nếu hiểu tuyệt đối. Đã công bố trong auth-policy, không ẩn thao tác nghiệp vụ trong GET.
2. **Timing:** floor1200ms không phải constant-time. A20 lượt cuối276 request,8 cặp luân phiên known/unknown: trung bình1981/1786ms; known1930–2172ms, unknown1737–1859ms, không chồng lấn. Có dấu hiệu phân biệt theo thời gian; không coi nội dung/status giống nhau hoặc gửi mail async là bằng chứng loại enumeration. Lượt mới có thể khác, không benchmark production.
3. **Slide63:** có ảnh UI, request/redirect/cookie flags và DB snapshot đã che bằng API; chưa đủ ảnh đúng giao diện DevTools Network/Application cho từng kịch bản. Không gọi bảng HTML dựng lại là ảnh DevTools. Nhóm còn tự vẽ/giải thích các sơ đồ đăng ký, login/brute force, logout, forgot/reset từ bản tham khảo trong flows.
4. **Production:** Secure cookie cấu hình và test hàm đã có, chưa quan sát HTTPS/proxy thực tế. Hai process HTTP local không chứng minh load balancer/deployment/race tải lớn. Chưa kiểm provider DB khác, screen reader hoặc OCR.
5. **SMTP:** người dùng xác nhận OTP thật thành công; reset/thông báo đổi mật khẩu qua inbox ngoài chưa được xác nhận. Lỗi EAUTH535 trước đó là lịch sử. Không gửi thêm mail thật để chứng minh lại hoặc xin credential trong chat.
6. **Hardening ngoài đề:** reset chưa có limiter chuyên biệt; SID/session JSON chưa hash/encrypt trong DB; CAPTCHA chưa có phương án audio. Không đánh dấu thiếu các mục này là FAIL kịch bản mà slide không yêu cầu, nhưng cần cân nhắc nếu triển khai công khai.

Đính chính audit cũ: production hiện không fallback/log preview Ethereal; register mọi nhánh hợp lệ phải303 nên không coi riêng pending303 là lỗi; resend đã sửa khác biệt public status do backstop account; answer malformed vẫn consume valid CAPTCHA; OTP attempts được kiểm trước hash. Các finding cũ trái source hiện tại đã được thay, không giữ nguyên làm phát hiện đang mở.

## 9. Câu hỏi trình bày slide62

| Câu hỏi | Trả lời theo mã hiện tại |
|---|---|
| Cookie và session khác nhau? |Cookie mang SID có chữ ký, row DB mang dữ liệu/expiry. Xóa cookie không hủy row; logout destroy mới thu hồi.|
| Store ở đâu, chứng minh restart? |Bảng Session qua PrismaSessionStore. A10/B thực sự stop/start process và dùng cookie cũ nhận200; row vẫn trong DB.|
| CAPTCHA chặn gì, vì sao vẫn cần counter? |Tăng chi phí tự động gửi form, không xác minh danh tính và không loại credential stuffing. Counter theo email/IP và lock vẫn phải chạy server.|
| Pending bị chặn, resend reset attempts? |Login chặn trước regenerate; requireLogin đòi active. otp.issue không reset attempts/lockedUntil, đổi mã không gỡ khóa.|
| Public route nào, vì sao? |Auth/static phục vụ đăng ký, kích hoạt, khôi phục quyền truy cập khi chưa login. Toàn CRUD và logout cần authenticated session.|
| Reset lưu gì, chứng minh revoke session? |PasswordReset chỉ tokenHash/userId/expiry/usedAt. A13/B/A21 thấy Session.userId xóa, hai cookie cũ không truy cập được.|
| Restore có phải reset? |Không. Restore phiên là tra lại Session theo SID sau restart; reset là đổi password bằng token. Không có backup/restore database riêng.|
| Roleviewer có bị cấm admin CRUD? |Không. Bài này xác thực, chưa RBAC; mọi active user được CRUD. Register không tin body role.|

## 10. Năm đoạn cần tự đọc kỹ khi review diff

1. `src/app.js`: cấu hình express-session, cookie và trust proxy; express-session đọc/kiểm chữ ký SID. Không tự tin header client khi xác định IP.
2. `src/services/sessionStore.js` (`get/set/touch/destroy`): expiry, authenticated row mới, update row còn tồn tại và authVersion để không hồi sinh session đã thu hồi.
3. `src/middleware/requireLogin.js` và vị trí mount trong app: chặn mọi prefix CRUD/method trước CSRF/router, active + idle/absolute + user version.
4. `src/services/rateLimit.js`, `src/services/otp.js`, `src/services/atomic.js`: transaction Serializable/retry hữu hạn, counter/lock bền vững và conditional claim dùng một lần.
5. `src/services/captcha.js` và `src/middleware/csrf.js`: ràng buộc purpose/anonId/TTL, consume trước answer; CSRF mọi form và ngoại lệ Origin:null chỉ reset+same-origin metadata+token đúng.

## 11. Hồ sơ lỗi agent và tái kiểm

Lỗi thật native Chrome reset403 vì no-referrer làm Origin:null có [hồ sơ trước/sau](docs/BUG_RESET_BROWSER_403.md), ảnh lỗi và JSON trước sửa; test browser sau sửa kiểm4 context native reset303login, token một lần, session bị thu hồi. Không tạo lỗi ứng dụng mới để đáp ứng slide63. Cleanup smoke chỉ là fault injection hạ tầng test, không dùng làm hồ sơ lỗi agent của ứng dụng.

Cách chạy, cookie jar, mẫu curl không in secret và checklist ảnh/database: [VERIFY](docs/VERIFY.md). Chính sách công bố và sai khác: [auth-policy](docs/auth-policy.md). Kết quả tóm tắt: [FINAL_ACCEPTANCE](docs/BLOCK8_FINAL_ACCEPTANCE.md).
