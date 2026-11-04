# Báo cáo kiểm tra Authentication Block8

> **Lưu ý phiên bản:** nội dung audit dưới đây là snapshot của mã trước khắc phục, đã commit ở3622041. Sau đó người dùng yêu cầu tiếp tục sửa mã và bàn giao máy mới. Đọc [kết quả khắc phục hiện tại](docs/BLOCK8_FINAL_ACCEPTANCE.md) và [file bàn giao](docs/HANDOFF_BLOCK8.md) để biết trạng thái mới; không áp dụng nguyên bảng30/34 hoặc câu “chỉ thêm báo cáo” của audit lịch sử cho working tree sau sửa.

## 1. Tóm tắt điều hành

**Đối tượng:** Web-Block5, giữ nền Express/EJS và phân trang SSR đang triển khai. **Ngày audit:** 04/11/2026, múi giờ UTC+7. **Nhánh:** `feat/backport-block7-pagination-ssr`. **HEAD:** `2220580234324fd75becd06c612ee5c40a627252`.

HEAD là commit nền; phần pagination và authentication hiện nằm trong các thay đổi **chưa commit**. Vì vậy kết luận áp dụng cho working tree đã đọc, không có nghĩa commit HEAD một mình chứa Block8. Không đổi nhánh, commit hoặc push.

Stack xác định từ `package.json`, lockfile và mã chạy: Node.js, Express 4, EJS, Prisma 5/PostgreSQL, `express-session` với store Prisma tự viết, Argon2id, `svg-captcha`, Nodemailer, `validator`, dotenv. **SSR** là server dựng HTML để trình duyệt nhận trang hoàn chỉnh; không có React/SPA hoặc fetch trong luồng auth này. **Session** là trạng thái đăng nhập lưu phía server; **cookie** là dữ liệu nhỏ trình duyệt gửi kèm request để server tìm đúng session.

**Mức sẵn sàng:** các luồng auth cốt lõi đã chạy được trên server, Prisma và PostgreSQL thật trong schema kiểm thử riêng; chưa đủ cơ sở công bố đạt toàn bộ yêu cầu hoặc sẵn sàng production. Bộ offline mới chạy đạt **19/19**; bộ tích hợp có sẵn, chạy từ bản sao tạm không đổi nội dung, đạt **15/15 nhóm**; sáu ca audit bổ sung hoàn tất **6/6**. Trong **34 tiêu chí: 30 PASS, 0 FAIL, 4 PARTIAL, 0 UNVERIFIED, 0 NOT_APPLICABLE**. Các nội dung production/browser chưa kiểm được thống kê riêng ở mục14. Không quy đổi số nhóm test thành phần trăm hoàn thành sản phẩm.

Các điểm cần chú ý trước nghiệm thu: liên kết preview email được ghi log ở nhánh Ethereal; ngữ nghĩa “GET không đổi dữ liệu” cần phân biệt dữ liệu nghiệp vụ với metadata auth; trạng thái HTTP khi chặn gửi OTP qua đăng ký lặp chưa thống nhất với route resend. Chưa nghiệm thu hộp mail thật, HTTPS/reverse proxy production, chạy nhiều instance và phân tích timing có ý nghĩa thống kê.

## 2. Phạm vi và phương pháp

Nguồn yêu cầu trực tiếp: `../PROMPT_CODEX_BLOCK8_NGHIEM_THU.md`. Đã tải và đọc tài liệu [Block8](https://pub.nndkhoa9.win/web/week6/block8-deck.html#3) trong lượt audit này bằng PowerShell `Invoke-WebRequest`; bản HTML 292.241 byte, 66 section/slide, tải ngày 04/11/2026. Đã đối chiếu riêng slide 57–61. Sáu câu hỏi nguồn được tách SRC-01…06 theo prompt; bốn nhóm nghiệm thu có 8 + 7 + 7 + 6 ca, tổng cộng **34**.

Đã đọc/truy vết: `src/app.js`, `src/server.js`, `src/prisma.js`; `src/config/authPolicy.js`; toàn bộ middleware auth/CSRF; `src/routes/auth.js` và bốn router CRUD; các service crypto, OTP, CAPTCHA, rate limit, session store, mail, atomic, cleanup; EJS auth, navbar và các form CRUD có CSRF; `prisma/schema.prisma`, ba migration, seed auth; script cấu hình/DB auth; `.env.example`, `.gitignore`, `package.json`, lockfile, README, `tech-choice.md`; test auth tích hợp, fixture và test offline, test browser, evidence hiện có. Không tìm thấy `AGENTS.md` trong vùng project được khảo sát. Block7 không được sửa hoặc dùng để thay nền auth.

Phân loại chứng cứ:

| Loại | Đã làm và giá trị chứng minh | Giới hạn |
|---|---|---|
| Tài liệu/thiết kế | Đọc prompt, slide, README và tech-choice | Không tự chứng minh runtime |
| Mã nguồn | Truy vết router → service → Prisma → EJS, ghi file:dòng bên dưới | Các nhánh chưa được thực thi được ghi rõ |
| Test offline mới | `npm.cmd test`: 19 pass, 0 fail | Prisma persistence dùng fixture trong RAM; lỗi DB cũng giả lập |
| Tích hợp mới A01–A15 | HTTP đến process Node thật, middleware thật, Argon2 thật, Prisma/PostgreSQL thật, SMTP TCP local | Tài khoản và CRUD là fixture trong schema mới; không phải kiểm tra lại dữ liệu nhà hàng chính |
| Ca audit mới X01–X06 | Harness bổ sung chỉ trong thư mục tạm; cùng mã ứng dụng, DB/schema tách biệt và SMTP local | Có chuẩn bị trạng thái giới hạn/thời hạn trực tiếp trong DB test; không phải chờ đủ mọi khoảng thời gian |
| Evidence có sẵn | `docs/evidence/auth-integration.json`, `docs/evidence/pagination-browser/results.json`, ảnh PNG | Là lịch sử từ lần làm trước; không ghi đè, không coi là browser chạy mới |

Môi trường tích hợp: thư mục tạm `%TEMP%/block8-auth-audit-c528d1befc784c9aa943d6af2163b002`; junction tới mã/dependency hiện có, bản sao không đổi của `tests/auth.integration.js`. Server kiểm thử riêng `http://localhost:3108`, không khởi động lại hoặc dùng server ứng dụng cổng 3000. Mỗi suite tạo schema PostgreSQL `auth_test_<24 ký tự hex ngẫu nhiên>`; mọi ghi dữ liệu, migration và dọn schema chỉ nhắm namespace đó. SMTP chỉ nhận nội bộ `127.0.0.1`, thư giữ trong RAM, không gửi OTP tới hộp mail thật.

Lệnh chính đã chạy:

```powershell
# Từ Web-Block5: test offline không truy cập DB ứng dụng.
npm.cmd test

# Từ thư mục tạm: dotenv tự nạp cấu hình từ đường dẫn project.
# DOTENV_CONFIG_PATH chỉ trỏ tới file, không đọc/in giá trị cấu hình.
node -r dotenv/config ./tests/auth.integration.js
node -r dotenv/config ./tests/auth.audit.supplemental.js
```

Đã kiểm tra `git branch --show-current`, `git rev-parse HEAD`, `git status --short`, `git check-ignore .env`, `git ls-files -- .env`, tìm route/cấu hình bằng `rg`. `.env` được ignore và không tracked. Không xem/in nội dung `.env`, URL DB, cookie, OTP, token, CAPTCHA answer hay credential thật. Không chạy `test:db`, seed nhà hàng, `seed:auth`, `db push`, migrate/deploy vào schema ứng dụng hoặc các script tạo lại evidence trong repo. **Hash** là giá trị băm một chiều; hash file mã nguồn được dùng nội bộ để đối chiếu tính toàn vẹn, không phải sao lưu bí mật.

Không mở trình duyệt mới trong audit này. Kết luận HTTP/PostgreSQL không được gọi là kết luận trình duyệt. Không dùng security mock trong hai suite tích hợp; SMTP local là dịch vụ thử thay cho nhà cung cấp email, còn tài khoản/dữ liệu là fixture có chủ đích.

## 3. Luồng thực tế

1. **Đăng ký:** GET `/register` chuẩn bị phiên ẩn danh, CSRF và ảnh CAPTCHA → POST form kiểm tra CSRF/Origin, quota IP, CAPTCHA → chuẩn hóa email, kiểm tra password → Argon2id → transaction tạo user `pending`, ép `viewer`, lưu OTP đã băm → gửi mail bất đồng bộ → 303 `/activate`. Đăng ký lại không ghi đè password tài khoản pending. Email đã tồn tại được xử lý với thông báo chung (`src/routes/auth.js:33`, `:45`, `:51`, `:57`).
2. **Kích hoạt:** POST `/activate` kiểm tra quota IP/email rồi OTP đúng user, đúng purpose, còn hạn, chưa dùng, chưa khóa → transaction claim mã và đặt `active`, `emailVerifiedAt` → 303 `/login`. Không ghi `session.userId` ở bước này (`src/routes/auth.js:64`; `src/services/otp.js:18`). OTP là mã kích hoạt 6 chữ số, không phải mật khẩu.
3. **Đăng nhập:** POST `/login` kiểm tra khóa theo email và quota IP → nếu đủ 3 lần sai thì CAPTCHA trước verify password → verify Argon2id thật hoặc dummy hash khi email không tồn tại → yêu cầu user active → đổi SID, ghi session và cookie → 303 `/dishes` (`src/routes/auth.js:96`).
4. **CRUD/phân trang:** cookie có chữ ký → `express-session` gọi store lấy `Session` → guard kiểm tra user active, phiên còn hạn và phiên bản auth → đặt `res.locals.currentUser` → router truy vấn Prisma và render EJS. Không gắn `req.user`. URL GET vẫn giữ q/filter/sort/page/pageSize; guard nằm trước mọi router CRUD và trước CSRF CRUD (`src/app.js:60`; `src/middleware/requireLogin.js:16`).
5. **Logout:** POST có CSRF → destroy session trong DB → xóa cookie → 303 `/login`. Store không cho request cũ tạo lại SID authenticated đã bị xóa (`src/routes/auth.js:122`; `src/services/sessionStore.js:25`).
6. **Forgot/reset:** POST `/forgot` kiểm quota IP/email → nếu có tài khoản, hủy reset cũ và lưu hash token mới 15 phút → email link từ origin cấu hình → luôn 303 `/forgot/sent`. GET `/reset` chỉ kiểm tra token để dựng form. POST `/reset` mới claim token, đổi hash password, vô hiệu các reset còn lại, xóa mọi session của user, hủy phiên hiện tại và 303 `/login` (`src/routes/auth.js:129`, `:149`, `:155`).

**CSRF** là tấn công ép trình duyệt gửi thao tác từ website khác bằng cookie nạn nhân. App yêu cầu token `_csrf` gắn session cho request không an toàn và từ chối Origin khác origin cấu hình khi header có mặt. GET/HEAD/OPTIONS bỏ qua kiểm tra này (`src/middleware/csrf.js:13`). Thiếu Origin vẫn phải có token đúng. Các phản hồi auth sai thường là HTML **200** có mã lỗi, không phải API `ok=false`; thành công dùng **303**, giới hạn **429**, CSRF **403**.

## 4. Bộ quy định CAPTCHA thực tế

CAPTCHA ở đây là thử thách ảnh nhằm tăng chi phí tự động hóa; không chứng minh danh tính hay quyền truy cập.

| Nội dung | Quy định tìm thấy | Bằng chứng |
|---|---|---|
| Loại | Thư viện `svg-captcha`, ảnh SVG nhúng EJS, không reCAPTCHA bên thứ ba | `src/services/captcha.js:1`; `src/views/auth/captcha.ejs:3` |
| Hình thức | 5 ký tự, noise 2, bỏ `0oO1ilI`; màu chữ cố định, nền sáng | `src/services/captcha.js:6` |
| Áp dụng register | Luôn bắt buộc; server kiểm tra trước hash password, user và mail | `src/routes/auth.js:33`, `:38`, `:45` |
| Áp dụng login | Từ 3 lần verify password sai theo email trong cửa sổ 15 phút; bắt đầu hiển thị sau lần sai thứ ba, yêu cầu cho lần tiếp theo | `src/config/authPolicy.js:7`; `src/routes/auth.js:101`, `:110` |
| Các route khác | Không CAPTCHA riêng ở activate, resend, forgot, reset, logout; dùng các cơ chế bảo vệ tương ứng | `src/routes/auth.js:64`, `:73`, `:129`, `:155` |
| Tạo/lưu | UUID ngẫu nhiên; model `CaptchaChallenge`: id, anonId, purpose, answer, expiresAt, usedAt. Answer lowercase lưu đọc được trong DB | `src/services/captcha.js:5`; `prisma/schema.prisma:92` |
| Thời hạn/phạm vi | 5 phút; phải cùng `anonId` của session và purpose register/login | `src/config/authPolicy.js:6`; `src/services/captcha.js:15` |
| Xác minh | ID đúng UUID, answer string ≤32 ký tự; claim `usedAt` bằng update có điều kiện rồi trim/lowercase và so sánh timing-safe | `src/services/captcha.js:11`; `src/services/crypto.js:12` |
| Một lần sử dụng | Câu trả lời đúng định dạng nhưng sai cũng tiêu thụ challenge. Replay/concurrent claim không thành công. ID/answer sai kiểu, quá dài bị từ chối sớm, chưa đánh usedAt | `src/services/captcha.js:12`, `:15`; A04 |
| Đổi mã | Link GET `/captcha/new?purpose=...` trả 303 đến register/login; trang đích phát challenge mới, không fetch/JSON | `src/routes/auth.js:182`; `src/views/auth/captcha.ejs:7` |
| Giới hạn phát ảnh | 60 lần/IP/15 phút, gồm GET/đổi mã và render lại lỗi có ảnh; lần tiếp theo 429 | `src/routes/auth.js:27`; A14 |
| Sai/thiếu | HTML 200, `CAPTCHA_FAILED`, ảnh mới nếu còn quota. Không tạo user/mail ở đăng ký; không verify password login nếu đang yêu cầu CAPTCHA | `src/routes/auth.js:39`, `:102`; A04, A09 |
| Bị khóa | HTML 429, `RATE_LIMITED`; CAPTCHA đúng không bỏ khóa, không xóa counter | `src/routes/auth.js:100`; `src/views/auth/rateLimited.ejs:2`; X02 |
| Lộ đáp án | Hidden field chỉ chứa challengeId. Cookie chứa SID, ảnh chứa nét SVG. Không thấy endpoint JSON, hidden answer hoặc JS lưu đáp án; test kiểm tra answer không có trong hidden value | `src/views/auth/captcha.ejs:4`; A04, helper `tests/auth.integration.js:67` |
| Nhà cung cấp ngoài | Hostname/action/score/verify token không áp dụng vì không dùng CAPTCHA bên thứ ba | `src/services/captcha.js:1` — NOT_APPLICABLE cho câu hỏi này |
| Tiếp cận | Có label input, mô tả ảnh chung và link tải lại; chưa có âm thanh/phương án thay ảnh cho người không nhìn được. Chưa thử bằng screen reader | `src/views/auth/captcha.ejs:3` — PARTIAL về accessibility |

Server không tin ID/purpose chỉ vì browser gửi: ID phải gắn với anonId và purpose server yêu cầu. Gửi lời giải trực tiếp bằng HTTP **vẫn phải qua cùng verify**; HTTP tự nó không phải dấu hiệu gian lận. Harness đọc answer từ **DB test riêng** để thử luồng, không chứng minh bot giải ảnh được. Không thử OCR hoặc đo sức chống bot. Đổi ảnh không xóa ngay các challenge cũ chưa dùng; chúng vẫn chịu ràng buộc phiên, purpose, TTL và single-use. Không tìm thấy giới hạn “tối đa N challenge còn hiệu lực/anonId”; có quota phát theo IP.

## 5. Rate limit theo IP và email

**Rate limit** là giới hạn số request/lần sai trong một khoảng thời gian. App dùng model SQL `RateLimit`, không RAM hay Redis. **Redis** là một loại kho dữ liệu thường dùng làm session/counter; project này không cài hoặc sử dụng nó cho auth. Email dùng `trim().toLowerCase()` trước khi tạo key, tối đa 254 ký tự (`src/services/crypto.js:7`; `src/routes/auth.js:17`). IP lấy từ Express `req.ip`, không tự tin mọi header do client gửi.

Nguồn số: `src/config/authPolicy.js:3`, `src/routes/auth.js:27`, `:37`, `:46`, `:66`, `:76`, `:100`, `:107`, `:131`; thuật toán `src/services/rateLimit.js:2`. Hai bộ đếm IP và email **độc lập**, không cộng chung; có thể chặn bởi một trong hai. Các biểu thức `||` ngắn mạch nên một request không chắc tăng mọi bộ đếm nếu điều kiện trước đã chặn.

| Hành động | Khóa IP | Khóa email/tài khoản | Tối đa | Cửa sổ | Chờ/khóa | Nơi lưu | Reset | Vượt giới hạn |
|---|---|---|---|---|---|---|---|---|
| Phát CAPTCHA | `captcha:ip:<IP>` | Không có email key | 60 lần phát | 15 phút | Chờ hết cửa sổ | RateLimit | Hết window; cleanup sau | HTML 429 |
| Register | `register:ip:<IP>` | Dùng thêm `resend:minute:<email>` và `resend:hour:<email>`; OTP có sendCount riêng | 10 POST/IP/giờ; email 1/60 giây, 5/giờ cho gửi OTP | 1 giờ, cooldown 60 giây | Không có khóa IP riêng ngoài window | RateLimit + ActivationChallenge | Window hết; login không reset quota gửi | IP vượt →429; pending đăng ký lại gặp quota email có thể vẫn303 nhưng không gửi OTP, xem X06 |
| Login — IP | `login:ip:<IP>` | Theo hàng email bên dưới | 30 POST/IP | 15 phút | Hết cửa sổ | RateLimit | Login thành công **giữ** IP quota | 31st →429; email đang khóa bị chặn trước cả consume IP |
| Login — sai password | Không thay thế IP quota | `login:email:<email>` | Từ3 sai cần CAPTCHA; 10 sai khóa | 15 phút | Khóa 5 phút tại sai thứ10 | RateLimit | Thành công xóa email key; hết khóa hoặc window thì read coi count0 | Lần sai thứ10 đã429; password/CAPTCHA đúng khi khóa vẫn429 |
| Activate — request | `activate:ip:<IP>` | `activate:email:<email>` | 20 POST cho mỗi key | 15 phút | Hết window | RateLimit | Window hết | 21st →429 trước OTP |
| Activate — OTP sai | Ngoài quota IP trên | Theo `ActivationChallenge.userId` | 5 lần không hợp lệ | Gắn challenge, không có window sai15 phút riêng | Khóa 15 phút tại lần5 | ActivationChallenge.attempts/lockedUntil | Hết khóa được reset attempts khi activate tiếp; resend không reset | Lần5 và trong khóa →429 |
| Resend | `activate-resend:ip:<IP>` | `resend:minute:<email>`, `resend:hour:<email>`; thêm challenge.lastSentAt/sendCount | 20 POST/IP/15ph; 1/email/60s; 5/email/giờ | 15 phút; 60 giây; 1 giờ | Cooldown60s, hết hour window | RateLimit + ActivationChallenge | Time window; resend giữ attempts/lock OTP | 429; không phát mã mới |
| Forgot | `forgot:ip:<IP>` | `forgot:email:<email>` | 20/IP/giờ; 5/email/giờ, kể cả email không tồn tại | 1 giờ | Hết window | RateLimit | Hết window | 429, không tạo reset mới |
| GET/POST reset | **KHÔNG TÌM THẤY** limiter chuyên biệt | **KHÔNG TÌM THẤY** limiter theo user/token | Không có ngưỡng cấu hình | Không có | Token hết hạn15ph, single-use; POST có CSRF | PasswordReset để xác thực token, không phải counter | Token used/hết hạn; không phải reset counter | Token sai →HTML200 INVALID_RESET; không có429 riêng |
| Logout/CRUD | Không có limiter auth riêng tại route | Phải có session hợp lệ; unsafe request có CSRF | Không có quota auth chuyên biệt | Không có | Không có | Session | Theo vòng đời session | Guard303 hoặc CSRF403 |

“Tối đa N” của consume: N request đầu được nhận nếu chưa có khóa; request N+1 bị chặn. Riêng login sai, consume thứ10 đặt lockedUntil và route đọc lại nên **lần thứ10 trả429 ngay**. CAPTCHA thiếu/sai ở bước login không tăng email password-failure count vì chưa verify password; IP request quota vẫn tăng khi đến được bước đó. Sau khi khóa email hết5 phút, `read` coi count0 kể cả cửa sổ15 phút chưa hết; không cần chờ cả15 phút (`src/services/rateLimit.js:5`). Đây là quy tắc **thực tế**, không phải suy từ slide.

OTP sai/expired/used trên challenge đã có cũng làm tăng attempts nếu chưa khóa; user không đổi trạng thái. Reset attempts sau khóa OTP nằm trong `otp.activate`, không nằm trong resend (`src/services/otp.js:25`). Quota gửi nằm ở hai tầng; cả registration và resend dùng email budget, đồng thời OTP có metadata riêng. Hai tầng có thể có window khác nhau; X04 ghi nhận khả năng khác status theo trạng thái tài khoản khi chúng lệch nhau.

Đã thực thi: A09 gửi sai password từ count0 đến10 qua HTTP, giải CAPTCHA từ lần4, thấy count tăng và429; cookie mới vẫn bị khóa. A08 thử cooldown, resend giữ attempts/lock, chuẩn bị count/hour ở ngưỡng rồi quan sát429. A14 chuẩn bị DB test tại mép quota IP/email rồi gửi request tiếp theo. Không gọi 60/30/20 request liên tiếp vào server dữ liệu thật. X02 đối chiếu counter trước/sau **restart process test**, giữ nguyên khóa; shared DB bảo toàn counter. Nhiều instance cùng DB có thiết kế chia sẻ qua transaction Serializable, nhưng **chưa chạy thử nhiều instance đồng thời**.

`trust proxy` cấu hình tại `src/config/authPolicy.js:24`, dùng ở `src/app.js:19`; `.env.example:18` mặc định false, suite test ép false. Không đọc giá trị deployment thật. Nếu triển khai sau proxy mà cấu hình quá rộng (`true`) hoặc sai hop/IP, req.ip có thể bị xác định sai và quota IP không còn như mong muốn. **UNVERIFIED** đối với reverse proxy production.

## 6. Lưu session, restart và restore

| Thành phần | Hiện thực và chứng cứ |
|---|---|
| Cơ chế | `express-session`, cookie có chữ ký, server-side store; không JWT, không MemoryStore (`src/app.js:36`) |
| Bảng thực tế | Prisma model/table `Session`, không có `@@map`: sid khóa chính string; userId UUID nullable; data string; expiresAt DateTime; FK User cascade (`prisma/schema.prisma:114`; `prisma/migrations/202611030003_sessions/migration.sql:2`) |
| Dữ liệu | data là JSON text: cookie, csrf, anonId; khi đăng nhập thêm userId, createdAt/lastSeenAt dạng timestamp, authVersion. Phiên anonymous có thể thêm loginEmail/activationEmail/flash. `freshAuthentication` chỉ dùng lúc ghi mới và bị bỏ khỏi data lưu (`src/services/sessionStore.js:13`) |
| Bảo mật SID | SID là ngẫu nhiên do express-session sinh; cookie có chữ ký, **không mã hóa** nội dung. DB lưu sid nguyên dạng, không hash; data JSON cũng không mã hóa ở tầng app. Không có password, OTP/reset raw trong data được gán bởi auth router |
| Chống fixation | `req.session.regenerate()` trước gán userId; tạo csrf/anonId mới; save xong mới303 (`src/routes/auth.js:114`; A09 so cookie trước/sau) |
| Cookie | Tên sid; HttpOnly, SameSite=Lax, Path=/, không Domain; Secure khi NODE_ENV production. maxAge30ph và rolling true (`src/middleware/requireLogin.js:2`; `src/app.js:38`). HTTP test quan sát HttpOnly/SameSite/Path/noDomain; Secure production mới kiểm tra hàm cấu hình, chưa quan sát HTTPS thật |
| Hạn | Idle30ph, absolute8h; expiresAt khi set/touch lấy min(now+idle, createdAt+absolute). Guard kiểm tra thêm timestamp trong data và `User.updatedAt` = authVersion (`src/services/sessionStore.js:17`; `src/middleware/requireLogin.js:8`) |
| Đọc lại | Cookie được express-session kiểm chữ ký → store.get(sid) → findUnique Session → kiểm expiresAt → JSON.parse → req.session → guard đối chiếu User (`src/services/sessionStore.js:7`) |
| User trên view | Guard gán `res.locals.currentUser = {id,email}`, không có req.user; mọi trang CRUD dùng guard ở app level (`src/middleware/requireLogin.js:16`) |
| Logout | destroy/deleteMany theo sid, clearCookie; request cũ chỉ update row đang sống, không upsert lại row authenticated đã xóa (`src/services/sessionStore.js:25`, `:33`; A10) |
| Reset password | Trong transaction đổi hash, used token, xóa mọi Session theo userId; ngoài transaction destroy phiên gọi và clearCookie; guard còn có authVersion dự phòng (`src/routes/auth.js:169`; A13) |
| Dọn dữ liệu | Chạy ngay khi server start và mỗi15ph; Session expiresAt<=now bị xóa, không phải chờ cleanup mới từ chối truy cập (`src/server.js:3`; `src/services/cleanup.js:4`, `:13`) |

**“Restore lưu ở đâu?”** Không tìm thấy chức năng auth tên restore, bảng restore, file backup session, Redis key hoặc thao tác tự phục hồi toàn bộ DB trong runtime/schema/scripts đã khảo sát. “Khôi phục session sau restart” ở đây chính là **đọc lại hàng `Session` đang còn hạn từ PostgreSQL** khi request mang cookie cũ đến. Không nạp tất cả session vào RAM lúc start. Điều kiện: cùng DB/schema, secret chữ ký tương thích, hàng còn tồn tại/còn hạn, user active, authVersion và thời hạn hợp lệ. A10 dừng process test rồi chạy process mới, dùng cookie cũ GET `/dishes`200, sau logout row mất và replay303. Đây là restart thực sự, không chỉ khởi tạo lại object mock.

**Password reset khác session restore:** model `PasswordReset` lưu userId, tokenHash SHA-256, expiresAt, usedAt, createdAt (`prisma/schema.prisma:79`). Token raw 32 byte ngẫu nhiên dạng base64url xuất hiện trong email link/form của người đang cầm token; DB chỉ lưu hash. Token không dùng lại được sau claim hoặc khi gửi forgot mới. Reset làm mất các session trước đó; không phục hồi chúng.

**Backup/restore DB:** KHÔNG TÌM THẤY chức năng do ứng dụng hiện thực; NOT_APPLICABLE cho nghiệm thu một tính năng backup chưa được yêu cầu. Không chứng minh nhà cung cấp DB có/không có backup vì chưa khảo sát hệ quản trị ngoài project. Back/Forward của form phân trang là khôi phục trạng thái URL/trình duyệt, không phải session restore; browser evidence cũ xem mục14.

## 7. Kiểm tra mã nguồn — slide 57

Quy ước bảng: Axx là nhóm tích hợp chạy mới, Xxx là ca audit bổ sung; mục14 ghi tên và cách tái chạy. PASS cho hành vi luôn kèm chứng cứ chạy, không chỉ đoạn source.

| ID | Câu hỏi/kịch bản | Kết quả mong đợi | Hiện thực thực tế | Trạng thái | Bằng chứng (file:line/test) | Ghi chú/việc cần làm |
|---|---|---|---|---|---|---|
| SRC-01 | Lưu/log/response password, OTP, token | Không lưu/log bí mật raw trái mục đích; xác định nơi có thể lộ | Password Argon2id, OTP HMAC, reset hash. Mail phải mang OTP/link; form reset có raw token hợp lệ. Nhánh Ethereal log preview URL có thể mở nội dung thư | PARTIAL | `src/services/crypto.js:10`, `:18`; `src/services/mail.js:19`; `src/views/auth/reset.ejs:4`; A05/A12/A13 | Luồng DB/mail local đã chạy; không gọi Ethereal lấy preview mới. Cần kiểm soát log capability link; chưa audit log hạ tầng |
| SRC-02 | Thuật toán password | Argon2id/scrypt/bcrypt, không SHA/MD5 trực tiếp | Argon2id m64MiB, t3, p1; SHA-256 dành reset token ngẫu nhiên, không dùng password | PASS | `src/services/crypto.js:10`; A05 kiểm prefix và Argon2 verify; A09/A13 login thật | Không benchmark tải/memory production |
| SRC-03 | Pending có được phiên đăng nhập? | Không có session authenticated | Đúng password vẫn ACTIVATION_REQUIRED; có phiên anonymous cho CSRF, không userId | PASS | `src/routes/auth.js:113`; A06 đếm Session theo pending user =0 | Không đánh đồng sid anonymous với đăng nhập |
| SRC-04 | Có CRUD thiếu guard? | Mọi list/detail/new/edit/delete/write phải đăng nhập | Guard prefix dishes/admin trước router; kiểm tra cả POST override | PASS | `src/app.js:60`, `:76`; A02/A15 | Bao gồm cả đầu bếp/nguyên liệu; không có RBAC, viewer active vẫn được CRUD theo phạm vi hiện tại |
| SRC-05 | GET có đổi dữ liệu, nhất là reset? | GET không tạo tác dụng nghiệp vụ; reset chỉ xem form | GET reset không đổi PasswordReset.usedAt/password; GET register tạo Session/CaptchaChallenge/RateLimit, GET authenticated cập nhật activity/expiry | PARTIAL | `src/routes/auth.js:149`; `src/middleware/csrf.js:7`; `src/services/sessionStore.js:34`; A12/X01 | Nếu hiểu “không đổi dữ liệu” tuyệt đối thì chưa đáp ứng. Chưa tìm thấy GET đổi dữ liệu nhà hàng hoặc kích hoạt/reset password. Cần công bố ngoại lệ metadata |
| SRC-06 | Store/counter/đáp án CAPTCHA | Store server bền vững; không answer field/cookie | Session và RateLimit trong PostgreSQL; answer ở CaptchaChallenge, hidden chỉ ID, cookie signed SID | PASS | `prisma/schema.prisma:92`, `:104`, `:114`; A04/A09/A10/X02 | SVG phải thể hiện ảnh; không coi hình vẽ là lộ đáp án text. Chưa pentest toàn bộ serialization/log hạ tầng |

## 8. Đăng ký và kích hoạt — slide 58

| ID | Câu hỏi/kịch bản | Kết quả mong đợi | Hiện thực thực tế | Trạng thái | Bằng chứng (file:line/test) | Ghi chú/việc cần làm |
|---|---|---|---|---|---|---|
| ACT-01 | Pending login | Không cấp session đăng nhập | HTTP200 ACTIVATION_REQUIRED, Session.userId cho user này=0 | PASS | `src/routes/auth.js:113`; A06 | Anonymous cookie phục vụ form vẫn có |
| ACT-02 | OTP hợp lệ | Đúng user active, emailVerifiedAt có giá trị | HTTP303/login, transaction update đúng ID; verifiedAt có giá trị | PASS | `src/services/otp.js:35`; A06/A07 | DB thật, tài khoản fixture |
| ACT-03 | OTP sai/hết hạn/đã dùng | Cùng lỗi, không đổi user status | INVALID_OTP với các trường hợp dưới quota; used/replay không kích hoạt lần hai | PASS | `src/services/otp.js:30`; `src/routes/auth.js:69`; A06/A07/A08 | Hết attempts hoặc đang khóa ưu tiên429, là ngoại lệ có chủ đích; metadata attempts có thay đổi |
| ACT-04 | Resend | Mã cũ hết tác dụng, mã mới dùng được | Thay otpHash, old INVALID_OTP, new303 và active | PASS | `src/services/otp.js:12`; A07 | Test điều chỉnh metadata cooldown trong schema tạm, không chờ60s |
| ACT-05 | Quá lượt thử/gửi | Server429; resend giữ attempts | Activate/resend có429 và giữ lock; đăng ký pending lặp bị suppress OTP nhưng vẫn303 | PARTIAL | `src/routes/auth.js:53`, `:55`, `:60`, `:76`; A08/A14/X06 | Cần chốt yêu cầu429 có bao gồm đường gửi OTP qua register; không tuyên bố mọi đường gửi đều429 |
| ACT-06 | Gửi role admin | Luôn viewer | Tạo pending.viewer bất kể role body | PASS | `src/routes/auth.js:51`; A05 | Chưa có phân quyền theo role, đây là ngăn tự nâng role lúc register |
| ACT-07 | Activate xong | Chưa đăng nhập; phải login | 303/login, GETdishes sau activate vẫn303/login | PASS | `src/routes/auth.js:70`; A06 | Không chỉ dựa redirect để suy ra thiếu userId; có kiểm tra store/guard |
| ACT-08 | OTP làm password | Login từ chối | INVALID_CREDENTIALS, không cấp quyền | PASS | `src/routes/auth.js:105`; A06 | OTP 6 số không thay Argon2 password |

## 9. CAPTCHA và brute force — slide 59

Brute force là thử nhiều giá trị để đoán bí mật. Các thử nghiệm dưới đây chỉ chạy trên fixture/schema tạm, không brute force tài khoản thật.

| ID | Câu hỏi/kịch bản | Kết quả mong đợi | Hiện thực thực tế | Trạng thái | Bằng chứng (file:line/test) | Ghi chú/việc cần làm |
|---|---|---|---|---|---|---|
| CAP-01 | Register thiếu/sai CAPTCHA | Không user, không OTP | CAPTCHA_FAILED; count user/inbox không tăng | PASS | `src/routes/auth.js:38`; A04 | Đã thử missing, malformed và wrong |
| CAP-02 | CAPTCHA + đăng ký đúng | Tiếp tục user pending và mail OTP | 303/activate, pending.viewer và local SMTP nhận mail | PASS | `src/routes/auth.js:51`, `:57`; A05 | Chỉ xác nhận SMTP local, không inbox người dùng thật |
| CAP-03 | Replay/hết hạn/sai purpose | Không tiếp tục protected action | Bị từ chối kể cả khác anonymous session | PASS | `src/services/captcha.js:15`; A04 | Không thử OCR; malformed bị từ chối sớm không consume là quy tắc đã nêu |
| CAP-04 | Đủ ngưỡng rồi bỏ CAPTCHA | Chặn trước password verify | Correct password nhưng thiếu CAPTCHA vẫn CAPTCHA_FAILED, failure count giữ3; source đặt verify ở sau | PASS | `src/routes/auth.js:101`, `:105`; A09 | Không gắn spy/mock vào Argon2; thứ tự được đối chiếu source + request thật |
| CAP-05 | CAPTCHA đúng, password sai | Tiếp tục tăng email counter | Qua các lần4…10 counter tăng đúng; lần10 khóa | PASS | `src/routes/auth.js:107`; A09 | CAPTCHA không xóa lỗi password trước |
| CAP-06 | Đang khóa, password/CAPTCHA đều đúng | 429, không authenticated session | Fresh CAPTCHA còn hạn cùng phiên, correct password vẫn429; counter/lock giữ nguyên | PASS | `src/routes/auth.js:100`; X02; A09 | X02 bổ sung trường hợp cả CAPTCHA đúng mà test cũ chưa gửi ở lần retry bị khóa |
| CAP-07 | Xóa cookie/phiên browser mới | Không reset quota email | HTTP client jar mới vẫn429 cùng email; counter ở DB | PASS | `src/services/rateLimit.js:3`; A09 | Đã tạo HTTP client độc lập, không mở tab ẩn danh GUI trong audit này |

## 10. Đăng nhập, đăng xuất và CRUD — slide 60

| ID | Câu hỏi/kịch bản | Kết quả mong đợi | Hiện thực thực tế | Trạng thái | Bằng chứng (file:line/test) | Ghi chú/việc cần làm |
|---|---|---|---|---|---|---|
| SES-01 | Anonymous gọi CRUD | 303/login, nghiệp vụ không đổi | Cả ba admin area: list/new/detail/edit/delete và POST/PATCH/DELETE override đều303; các bảng CRUD vẫn rỗng | PASS | `src/app.js:60`; A02 `tests/auth.integration.js:144` | Suffix detail không tồn tại vẫn guard trước404; anonymous metadata có thể được lưu |
| SES-02 | Active login đúng | 303, Set-Cookie sid, CRUD vào được | Cookie mới, GETdishes200, CRUD tạo/sửa/xóa fixture qua HTTP303 | PASS | `src/routes/auth.js:114`; A09/A15 | HTTPS cookie Secure thực tế chưa chạy; không đồng nghĩa production pass |
| SES-03 | Email lạ/password sai | Cùng thông báo | Cả hai HTML có “Email hoặc mật khẩu không đúng”, cùng nhánh INVALID_CREDENTIALS | PASS | `src/routes/auth.js:105`, `:110`; A09 | Phân tích timing login production chưa thực hiện |
| SES-04 | SID trước/sau login | Thay mới | A09 so cookie SID trước/sau khác; code regenerate trước auth | PASS | `src/routes/auth.js:114`; `tests/auth.integration.js:286` | SID không được đưa vào báo cáo |
| SES-05 | Restart server rồi cookie cũ | Còn đăng nhập với store bền vững | Dừng process test, start process mới, GETdishes200 bằng jar cũ, row đã xác nhận trong DB | PASS | `src/services/sessionStore.js:7`; A10 `tests/auth.integration.js:294` | Cùng DB/secrets test; chưa chạy deploy nhiều instance hoặc thay secret |
| SES-06 | Logout/replay SID | Row bị xóa và sid cũ bị từ chối | Logout303; row=null; store.set stale không làm sống lại; replay303 | PASS | `src/routes/auth.js:122`; `src/services/sessionStore.js:25`; A10 | Không chỉ clear cookie phía client |
| SES-07 | Form từ website khác | CSRF từ chối | Origin lạ với token đúng403; thiếu token403; mọi form POST CRUD có field riêng | PASS | `src/middleware/csrf.js:16`; A03/A10/A15 | HTTP trực tiếp giả lập request cross-origin; chưa dựng website tấn công trong browser |

## 11. Quên mật khẩu — slide 61

| ID | Câu hỏi/kịch bản | Kết quả mong đợi | Hiện thực thực tế | Trạng thái | Bằng chứng (file:line/test) | Ghi chú/việc cần làm |
|---|---|---|---|---|---|---|
| RST-01 | Forgot email có/không | Cùng nội dung/status, xét timing | Cùng303/forgot/sent và thông báo chung; có floor1200ms, mail detached. Hai quan sát timing chưa đủ đánh giá thống kê | PARTIAL | `src/routes/auth.js:19`, `:129`, `:143`; A12/X05 | Không kết luận “constant-time” hoặc hết nguy cơ dò email; xem số đo mục14 |
| RST-02 | Vượt forgot quota | 429 tại server | Email lần6 bị429; IP tại count20 request kế tiếp429 | PASS | `src/routes/auth.js:131`; A12/A14 | Email chưa tồn tại cũng consume quota |
| RST-03 | Reset token cũ/expired/used | Từ chối, không đổi password trái phép | Forgot mới làm token cũ used; expired GET/POST INVALID_RESET; hai POST cạnh tranh chỉ một thành công, password đúng giá trị mới | PASS | `src/routes/auth.js:136`, `:158`, `:167`; A12/A13 | Test chuẩn bị expired trong DB fixture, kiểm tra hash cuối; không brute force token |
| RST-04 | GET token còn hạn | Chỉ form, usedAt không đổi | HTTP200 no-referrer; row PasswordReset trước/sau deep-equal | PASS | `src/routes/auth.js:149`; A12 `tests/auth.integration.js:337` | Toàn request vẫn có thể ghi Session metadata; không tiêu thụ reset token |
| RST-05 | Reset thành công | Không auto-login; mọi SID cũ từ chối | 303/login, tất cả session user bị xóa, hai cookie cũ GETdishes303; password mới login được | PASS | `src/routes/auth.js:169`, `:176`; A13 | Pending reset không biến active, cũng không cấp phiên |
| RST-06 | Token sang route khác | Không làm password/OTP/session | INVALID_CREDENTIALS ở login; INVALID_OTP ở activate; token gán sid không chữ ký bị303/login; token chưa bị consume bởi các request này | PASS | `src/routes/auth.js:105`; `src/services/otp.js:29`; X03/A13 | X03 kiểm cả ba mục đích; test cũ chỉ kiểm token làm password |

## 12. Các phát hiện cần xử lý

Không sửa các điểm dưới đây trong nhiệm vụ audit. “Ca quan sát PASS” ở harness nghĩa là tái hiện đúng điều đã assert; không có nghĩa hành vi quan sát được là đạt yêu cầu sản phẩm.

### F01 — Trung bình: log liên kết xem thư ở nhánh Ethereal

`src/services/mail.js:18` lấy preview URL và dòng19 in ra console; README:34 cũng mô tả cách này. Người có link có khả năng xem thư chứa OTP/reset token. Không lưu password/OTP raw trong DB là chưa đủ để khẳng định toàn luồng không làm lộ capability. Đây là kết luận từ source; audit không tạo/ghi lại link Ethereal thật, chưa chứng minh log production có bị thu thập ra ngoài.

Tái hiện an toàn đề xuất: môi trường dev cô lập, tài khoản test và log sink riêng, che hoàn toàn link trong chứng cứ; quan sát nhánh preview có được log hay không. Không chạy trên log công khai. Hướng xử lý: cấm log capability link ở môi trường dùng chung/production, hoặc chỉ cung cấp qua kênh dev hạn chế; kiểm tra quyền truy cập log và thời gian lưu. Tương ứng SRC-01 PARTIAL, chưa đủ bằng chứng tuyên bố không có bất kỳ đường lộ token nào.

### F02 — Trung bình: OTP bị giới hạn qua register vẫn trả303

`src/routes/auth.js:46` consume email budget; tại dòng53/55 bỏ qua gửi khi tài khoản pending bị hạn chế, nhưng dòng60 luôn303/activate. `/activate/resend` lại trả429 ở dòng76/82. X06 dùng cùng pending account đăng ký lặp ngay sau mail đầu, xác nhận challenge/inbox không đổi và response303.

Tác động: không vượt được quota gửi, nhưng câu “vượt số lần gửi trả429” chỉ đúng đầy đủ cho resend, chưa thống nhất mọi đường có thể kích hoạt OTP. Đây cũng có thể là lựa chọn chống dò tài khoản của thiết kế registration; cần nhóm và người nghiệm thu chốt rõ, thay vì báo tất cả đường gửi đều429. Tái hiện chỉ trên fixture schema/SMTP local như X06. Đề xuất nếu phải đổi: thiết kế response/quota đồng nhất cho email có/không tồn tại, đồng thời giữ chống enumeration; không đổi một nhánh status riêng lẻ mà tạo tín hiệu lộ tài khoản.

### F03 — Trung bình, có điều kiện: hai tầng quota resend có thể tạo khác biệt status

`RateLimit` email và `ActivationChallenge.lastSentAt/sendCount` là hai nguồn hạn chế độc lập (`src/routes/auth.js:76`, `:82`; `src/services/otp.js:9`). X04 chuẩn bị challenge pending đang cooldown nhưng generic email quota còn trống: resend email pending429, email không tồn tại303. Do cửa sổ/metadata độc lập, không được mặc định thông báo resend luôn che được tình trạng tài khoản trong mọi trạng thái.

Đây là **repro trạng thái DB được chuẩn bị trong test**, chưa chứng minh một người ngoài tạo được đúng trạng thái đó bằng chuỗi request public thông thường. Không kết luận dò được mọi email. Tác động tiềm tàng: phân biệt trạng thái account/cooldown. Đề xuất phân tích tính đồng bộ/ranh giới thời gian và dùng kết quả public nhất quán cho mọi nhóm email. Không sửa hoặc quét email thật.

### F04 — Thấp: phạm vi “GET không đổi dữ liệu” chưa được công bố rõ

X01 chứng minh GETregister tăng Session, CaptchaChallenge, RateLimit nhưng User/Dish/Chef/Ingredient không đổi. `prepare`, store.set/touch và cleanup lúc start cũng ghi metadata (`src/middleware/csrf.js:7`; `src/services/sessionStore.js:30`, `:37`). GETreset đã chứng minh không claim token, không đổi password.

Đề xuất ghi rõ tiêu chí là “GET không thay đổi nghiệp vụ/không tiêu thụ reset token”, ngoại lệ activity, CSRF/anonymous session, phát challenge và quota; nếu yêu cầu thật sự cấm mọi ghi DB bằng GET, kiến trúc hiện tại chưa đáp ứng và cần nhóm quyết định lại. Không coi việc gia hạn session bình thường là lỗ hổng CRUD.

### F05 — Hạn chế nghiệm thu: timing, mail thật và môi trường production

Floor1200ms không bảo đảm hai nhánh luôn có phân phối thời gian giống nhau; DB chậm hơn floor, queue/mail event loop và tải có thể làm khác biệt. X05 chỉ có hai mẫu, không đủ kết luận thống kê. RST-01 PARTIAL.

SMTP local xác nhận ứng dụng gọi gửi đúng thư, không xác nhận DNS/TLS/SMTP auth, spam hoặc inbox nhà cung cấp thực tế. `mail.send` tách khỏi response, không có outbox/retry bền vững trong mã (`src/services/mail.js:14`); response303 không bảo đảm thư tới. Chưa cố tình làm SMTP lỗi để kiểm retry. Đề xuất nghiệm thu provider bằng tài khoản test được phép, benchmark timing có kế hoạch và kiểm HTTPS/trust proxy/Secure cookie trong môi trường triển khai.

### F06 — Thấp, phòng vệ bổ sung: reset chưa có limiter riêng

Trong `src/routes/auth.js:149`, `:155` không thấy limiter GET/POSTreset. Token32byte ngẫu nhiên + hash, TTL và single-use giảm mạnh khả năng đoán; CSRF bảo vệ POST. Tuy nhiên lượt tra DB và hash Argon2 khi có token hợp lệ chưa có quota riêng. Đây là phát hiện từ source, không kiểm thử gây tải và không tự coi là FAIL của34 ca vì slide chỉ yêu cầu429 cho forgot. Đề xuất xem xét quota IP/token và bảo vệ hạ tầng khi triển khai.

## 13. Câu hỏi vấn đáp và trả lời ngắn

| Câu hỏi | Trả lời dựa trên project |
|---|---|
| Giữ gì từ Block5, thêm gì ở Block8? | Giữ Express/EJS, Prisma/PostgreSQL, form SSR, CRUD và phân trang. Thêm User/OTP/reset/session/counter/challenge, Argon2id, session store, CAPTCHA, mail, guard và CSRF. Không triển khai Block9. |
| Session khác cookie thế nào? | Session có userId và thời hạn ở bảng Session. Cookie sid giúp tìm hàng đó, không chứa password hoặc cả user object. |
| Cookie có được mã hóa không? | SID được ký để chống sửa; ký không phải mã hóa. HttpOnly chặn JS đọc cookie, Secure chỉ gửi qua HTTPS, SameSite giảm gửi chéo site. |
| “Restore” lưu ở đâu? | Không có bảng restore. Sau restart, store.get dùng sid đọc lại Session trong PostgreSQL. Cùng DB/secrets và còn hạn thì tiếp tục được. |
| Restart có làm mất lock email không? | Counter ở RateLimit và lock OTP ở ActivationChallenge. X02 đã restart process test và thấy login counter/lock giữ nguyên. Chưa chạy nhiều instance. |
| Tại sao pending không login được? | Chưa xác minh email; route kiểm status active trước regenerate/gán userId. Cookie anonymous không phải phiên đăng nhập. |
| OTP lưu sao, khác password sao? | OTP6số TTL10ph, lưu HMAC-SHA256 với pepper và userId; password8–128 có chữ+số được Argon2id. OTP không được đem làm password. |
| CAPTCHA ở đâu và khi nào cần? | SVG tự tạo qua svg-captcha; register luôn cần, login từ3 lần sai cần. Answer ở CaptchaChallenge server, browser nhận ảnh và challengeId. |
| CAPTCHA đúng có gỡ khóa không? | Không. Sai password vẫn tăng counter, đến10 lần khóa5ph; đang khóa thì đúng cả password/CAPTCHA vẫn429. |
| IP và email khác gì? | IP hạn chế nguồn gửi, email bảo vệ tài khoản dù đổi browser/cookie/IP. App dùng cả hai, độc lập; IP dựa req.ip và trust proxy đúng. |
| Resend có làm mất lỗi OTP không? | Không reset attempts/lockedUntil. Cooldown60s, tối đa5 lần/giờ, cộng quota request IP. |
| Vì sao password dùng hash chậm mà reset token dùng SHA256? | Password do người chọn, dễ đoán nên cần Argon2id tốn tài nguyên. Token32byte ngẫu nhiên có entropy cao, lưu hash để DB không giữ raw bearer token. |
| Forgot có nói email tồn tại không? | Dưới quota: cùng303 và thông báo chung, có floor1200ms. Chưa chứng minh chống mọi timing side-channel. |
| GETreset có dùng mất token không? | Không; chỉ hiển thị form. POSTreset mới claim usedAt và đổi password. Metadata session có thể thay đổi khi GET. |
| Reset xong có tự login không? | Không,303/login; mọi Session của user bị xóa và phiên cũ bị từ chối. |
| Vì sao cần CSRF nếu có login? | Website khác có thể ép browser gửi cookie của người đã login. Token theo session cộng kiểm Origin chặn thao tác đó. |
| Người viewer có được CRUD không? | Hiện có: Block8 này kiểm authentication, chưa triển khai RBAC. Register không cho tự chọn admin, nhưng role chưa điều khiển quyền CRUD. |
| OTP đã tới hộp mail thật chưa? | Audit chỉ chứng minh SMTP local nhận OTP/reset. Chưa kiểm hộp mail nhà cung cấp. Thiếu SMTP_HOST thì code dùng Ethereal preview, không phải inbox thật. |
| Có sao lưu/khôi phục DB không? | Không tìm thấy tính năng này trong ứng dụng. Session persistence không phải backup DB; reset password cũng không phải restore dữ liệu. |
| Tắt JS phân trang còn dùng được không? | Mã dùng form GET và liên kết HTML; có browser evidence trước đó. Audit auth lần này không chạy lại browser nên không nhận là kiểm chứng mới. |

## 14. Phụ lục bằng chứng và tổng hợp 34/34

### 14.1. Test có sẵn chạy mới

`npm.cmd test`: exit0,19 tests,19 pass,0 fail,0 skipped. Bao gồm validation INT4/scalar/relation;400/404/500; phân trang đầu/giữa/cuối, sort tie ID, search/filter, số trang, query encoding, page reset, rỗng/out-of-range303, regression CRUD. Persistence là mock Prisma; lỗi DB mô phỏng không chứng minh DB thật lỗi được xử lý trong mọi tình huống.

Bản sao `tests/auth.integration.js` được đối chiếu với nguồn, chạy nguyên nội dung từ thư mục tạm để dòng459/462 chỉ ghi evidence tạm, không ghi đè file repo. Kết thúc exit0: **15 groups PASS**, `isolatedSchemaRemoved=true`, `applicationCrudUntouched=true`. Không có security mock. Migration deploy chỉ dùng schema ngẫu nhiên mới, cleanup chỉ DROP đúng namespace đã kiểm regex trong harness (`tests/auth.integration.js:452`).

| Nhãn | Tên/nhóm test đã chạy, vị trí trong `tests/auth.integration.js` | Quan sát chính |
|---|---|---|
| A01 | mandatory secrets and cookie production policy — :135 | Thiếu secret bị từ chối; hàm cookie production có Secure |
| A02 | all unauthenticated CRUD GET/POST/override requests redirect 303 before writes — :144 | Guard303, bảng CRUD fixture không đổi |
| A03 | CSRF and Origin reject public auth submissions — :159 | Thiếu CSRF/Origin khác403 |
| A04 | register CAPTCHA missing/wrong/expired/reused/other-session/other-purpose… — :166 | Không user/mail, các challenge sai bị từ chối |
| A05 | register normalization, role whitelist, Argon2id and pending password preservation — :187 | Normalize, viewer, hash thật, không ghi đè pending |
| A06 | pending cannot login, OTP activation is atomic and does not auto-login — :203 | Pending không auth; OTP concurrent một lần, không tự login |
| A07 | resent OTP rejects old code and accepts new code through HTTP — :220 | Old invalid, new active |
| A08 | OTP resend cooldown, replacement, expiry, attempts and lock persist — :234 |429, không reset attempts/lock |
| A09 | login generic errors, server CAPTCHA threshold, persistent 10-failure lock and cookie rotation — :266 | Ngưỡng3/10, khóa, cookie mới vẫn khóa, login rotate |
| A10 | DB session survives real server restart; logout and stale store writes cannot revive sid — :294 | Restart thật giữ session; logout/replay/stale write an toàn |
| A11 | idle, absolute expiry and inactive users are rejected server-side — :311 | Guard từ chối timestamp/status không hợp lệ |
| A12 | forgot generic response, canonical reset origin, single token and read-only GET reset — :325 | Generic303, Host không điều khiển link, GET không claim, quota429 |
| A13 | reset is atomic, invalidates all sessions, cannot authenticate as token or activate pending — :348 | Reset concurrent một lần, xóa session, password/token tách biệt |
| A14 | IP budgets are enforced independently of account and cookie — :381 | Login/register/forgot/activate/email/captcha tại ngưỡng429 |
| A15 | authenticated CRUD all three entities, CSRF, override, validation and pagination — :404 | Write fixture qua auth, CSRF,400/404/303; hai list page2 total31,400badpage,303out-of-range |

### 14.2. Sáu ca bổ sung chỉ ở thư mục tạm

Harness mới nằm tại `%TEMP%/block8-auth-audit-c528d1befc784c9aa943d6af2163b002/tests/auth.audit.supplemental.js`; không thêm test vào repo. Các helper/startup/cleanup lấy từ bản sao harness có sẵn, thay phần scenario trong **file tạm**. `node --check` đã chạy cho file tạm. Mã nghiệp vụ ứng dụng được dùng nguyên trạng qua junction.

| Nhãn | Nội dung assert | Kết quả chạy |
|---|---|---|
| X01 | GETregister200 tăng Session/CaptchaChallenge/RateLimit; User/Dish/Chef/Ingredient giữ nguyên | Đã chạy, assert đạt |
| X02 | Chuẩn bị email count10/lock5ph; lấy CAPTCHA đúng còn hạn cùng phiên; restart; POST cả password/CAPTCHA đúng429; không authenticated session, lock/counter giữ nguyên | Đã chạy, assert đạt |
| X03 | Reset token còn hạn không làm password, activation OTP hoặc sid hợp lệ; hash user không đổi, reset.usedAt vẫnnull | Đã chạy, assert đạt |
| X04 | Pending challenge cooldown + generic quota trống: resend429; email không tồn tại với quota trống:303 | Đã chạy, tái hiện khác status |
| X05 | Forgot known/unknown cùng303/forgot/sent và thông báo; ghi2 mẫu thời gian, không benchmark thống kê | Đã chạy, assert status/nội dung đạt |
| X06 | Đăng ký lại pending ngay sau mail đầu: response303 nhưng OTP row/inbox giữ nguyên, thể hiện suppress thay vì429 | Đã chạy, tái hiện303 khi suppress OTP |

Suite bổ sung exit0,6 nhóm hoàn tất, `securityMocks=false`, `writesToApplicationSchema=0`, `isolatedSchemaRemoved=true`. Hai số đo X05: email tồn tại **2250ms**, email không tồn tại **1774ms** trong lần chạy này. Chỉ một mẫu mỗi nhánh, khác476ms; không đủ kết luận có/không có timing leak và không đo riêng chi phí mạng/DB. Cả hai đều vượt floor1200ms; không được mô tả floor là thời gian đáp ứng cố định.

Kết quả tạm được lưu bên ngoài repository: `docs/evidence/auth-integration.json` và `docs/evidence/auth-supplemental.json` **trong thư mục tạm nói trên**. Không nhầm chúng với đường dẫn evidence cùng tên trong repo. Các file tạm là artifact kiểm thử có thể bị hệ điều hành dọn; báo cáo này là đầu ra duy nhất được thêm vào repo. Không có sid/token/OTP/credential trong bảng kết quả công khai.

### 14.3. Evidence lịch sử, không chạy lại trong audit này

`docs/evidence/auth-integration.json` hiện có báo15 nhóm PASS, securityMocks=false, isolatedSchemaRemoved=true; không có timestamp nên không suy ra thời điểm từ nội dung. Kết quả chạy mới A01–A15 nêu trên độc lập với file này.

`docs/evidence/pagination-browser/results.json` có `completedAt=2026-11-03T07:59:38.334Z`,22 ca PASS và20 ảnh, Chrome156.0.8078.74/Playwright1.64.1 theo evidence/README. Đây là kiểm tra phân trang sau login ở1440/375px, JS on/off, keyboard/history đã ghi nhận trước. Không ghi đè hoặc tái chạy script browser trong lượt audit. Các ảnh có nhãn dữ liệu thật ở README:116; audit này không xác minh lại nội dung DB sau thời điểm chụp và không tạo ảnh mới. Trường `documentGets` của harness browser đếm cả navigation login nên không dùng như bằng chứng “100 GET thuần”.

### 14.4. Những việc chưa kiểm chứng

| Nội dung | Trạng thái | Lý do/điều kiện nghiệm thu tiếp |
|---|---|---|
| OTP/reset đến inbox thật, spam, SMTP provider/TLS/auth | UNVERIFIED | Audit chỉ dùng SMTP local, không gửi email ra ngoài |
| HTTPS, cookie Secure quan sát trên mạng, reverse proxy/trust proxy thật | UNVERIFIED | Chỉ HTTP localhost và kiểm hàm config; không đọc secret/config deployment thật |
| Nhiều instance đồng thời dùng cùng DB và secret | UNVERIFIED | Restart một process đã kiểm; không đồng nghĩa test cluster |
| Phân phối timing login/forgot chống dò tài khoản | UNVERIFIED | Hai mẫu forgot và floor không đủ chứng minh; chưa benchmark dưới tải |
| Browser auth mới, screen reader, CAPTCHA accessibility/OCR | UNVERIFIED | Chưa mở browser cho audit; ảnh CAPTCHA không có phương án audio |
| Quyền log, DB encryption at rest/backup của provider | UNVERIFIED | Ngoài runtime repo; không truy cập vận hành provider |
| Backup/restore DB do ứng dụng hiện thực | NOT_APPLICABLE | Không tìm thấy tính năng này trong phạm vi code đã khảo sát |
| CAPTCHA provider hostname/action/score | NOT_APPLICABLE | Dùng svg-captcha nội bộ |
| DB provider khác PostgreSQL | UNVERIFIED | Schema UUID/migration và harness hiện là PostgreSQL |
| Chờ tự nhiên toàn bộ10/15/30ph/8h, cleanup scheduler15ph | UNVERIFIED | Các nhánh expiry được thử bằng metadata test; chưa kiểm đồng hồ dài hạn/scheduler end-to-end |
| Lỗi SMTP và crash giữa commit challenge với gửi mail, retry bền vững | UNVERIFIED | Không fault-inject SMTP/crash trong lượt audit; không thấy outbox trong source |

Các trạng thái ngoài phạm vi34 ở bảng này không được cộng vào bảng tổng34. Một tiêu chí có thể PASS trên môi trường tích hợp tách biệt nhưng vẫn chưa được chứng minh trên production/browser.

### 14.5. Bảng tổng hợp đủ 34 tiêu chí

| Nhóm | PASS | FAIL | PARTIAL | UNVERIFIED | NOT_APPLICABLE | Tổng |
|---|---:|---:|---:|---:|---:|---:|
| SRC-01…06 |4|0|2|0|0|6|
| ACT-01…08 |7|0|1|0|0|8|
| CAP-01…07 |7|0|0|0|0|7|
| SES-01…07 |7|0|0|0|0|7|
| RST-01…06 |5|0|1|0|0|6|
| **34/34** |**30**|**0**|**4**|**0**|**0**|**34**|

Các tiêu chí PARTIAL: **SRC-01, SRC-05, ACT-05, RST-01**. Không có FAIL trong34 không có nghĩa không có rủi ro: mục12 ghi rõ phát hiện và giới hạn. Ba việc ưu tiên: kiểm soát preview link trong log; thống nhất hợp đồng quota/response OTP kể cả register và trạng thái lệch hai tầng limiter; nghiệm thu mail/HTTPS/timing trong môi trường triển khai được phép. Cần công bố ngoại lệ metadata GET khi trình bày SRC-05.

**Kiểm tra bảo toàn cuối lượt:** đã so sánh SHA-256 của136 file có sẵn trong danh sách Git tracked/untracked không bị ignore với snapshot đầu audit: **0 file thay đổi, 0 file có sẵn bị thêm/xóa ngoài báo cáo**. Metadata kích thước/mtime của `.env` giữ nguyên; không băm/đọc nội dung file này. Bản sao test tích hợp tạm có hash trùng bản gốc. Package/lockfile, schema, source, test và evidence cũ giữ nguyên so với đầu audit; duy nhất thêm `BLOCK8_AUTHENTICATION_AUDIT_REPORT.md`. `.env` không tracked và đang được ignore. Không commit/push.
