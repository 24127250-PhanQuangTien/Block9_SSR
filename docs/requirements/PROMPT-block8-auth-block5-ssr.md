# PROMPT CHO CODING AGENT — Block 8: Xác thực tài khoản trên SSR (nền Restaurant App Block 5)

> Bạn là coding agent. Đọc TOÀN BỘ file này rồi **thực thi một mạch, không hỏi lại**. Khi có điểm chưa rõ, chọn phương án an toàn nhất và ghi quyết định vào `docs/auth-policy.md`. Chỉ dừng hỏi nếu thiếu thứ không thể tự quyết (ví dụ credential SMTP thật).

---

## 0. Bối cảnh & kiến trúc

Dự án hiện tại là **Restaurant App Block 5**: ứng dụng **SSR** (server render HTML, form POST, Post/Redirect/Get), Node.js/JS + Prisma, có CRUD (món ăn, …) sẵn.

**Nhiệm vụ Block 8:** thêm hệ thống **xác thực tài khoản theo mô hình SSR bằng session + cookie** lên chính project này, và **bắt buộc đăng nhập cho toàn bộ cụm CRUD của Block 5**.

**Kiến trúc:** toàn bộ ứng dụng là **SSR**. Mọi luồng auth (đăng ký, kích hoạt OTP, đăng nhập, đăng xuất, quên/đặt lại mật khẩu) là **trang HTML render ở server + form POST + `303 See Other`**. **Không** viết SPA, **không** dùng `fetch`/JSON/JWT cho các luồng này, **không** thêm REST API.

Không dựng project mới. Không làm hỏng CRUD Block 5. Phân quyền (RBAC/ABAC), MFA, JWT thuộc Block 9: **không làm**; `role` chỉ là cột mặc định `viewer`, chưa dùng để chặn gì.

---

## 1. BƯỚC 0 — Khảo sát trước khi code (bắt buộc)

1. Đọc cấu trúc repo, `package.json`, `.env*`, `prisma/schema.prisma`, file server chính, view engine và layout hiện có, cách định nghĩa route CRUD, cách xử lý form (method-override nếu có).
2. Ghi kết quả khảo sát ngắn (5–10 dòng) ở đầu `docs/auth-policy.md`: framework, view engine, DB (provider Prisma), danh sách route CRUD hiện có, cách chạy dev.
3. **Giữ stack hiện có:** nếu project dùng công nghệ khác mục 2 cho cùng vai trò (view engine khác ejs, DB khác PostgreSQL…), **GIỮ cái đang có**, chỉ thêm phần mới theo cùng phong cách, và ghi chú sự khác biệt trong `tech-choice.md`. Chỉ thêm thư viện cho phần chưa có.
4. **Mã phải chạy được trên mọi DB mà Prisma hỗ trợ:** dùng Prisma Client (`updateMany` có điều kiện, `$transaction`), **không viết SQL thô riêng cho một loại DB**.
5. Chạy thử app hiện tại để chắc CRUD Block 5 đang hoạt động trước khi sửa.

---

## 2. Technical stack (cho phần mới)

| Vai trò | Lựa chọn |
|---|---|
| Runtime / server | Node.js + Express (giữ nguyên) |
| ORM / DB | Prisma + DB hiện có của project (giữ nguyên) |
| Session | `express-session` + **session store tự viết dùng Prisma** (bảng `Session`, có cột `userId` để hủy hàng loạt), lưu trong DB nên **bền vững** |
| Hash password | `argon2` (Argon2id) |
| CAPTCHA | `svg-captcha` + bảng thử thách ở server (tự quản lý xác minh) |
| Email | `nodemailer` (SMTP qua `.env`; chưa cấu hình SMTP thì dùng Ethereal, chỉ log **link xem trước email**, không log OTP/token) |
| Giao diện | Giữ view engine hiện có của Block 5 (mặc định `ejs`) cho các trang: đăng ký, kích hoạt, đăng nhập, quên/đặt lại mật khẩu, 429 |
| Validate email | `validator` (`isEmail`), không tự viết regex |
| CSRF | Tự viết middleware synchronizer token (token trong session, hidden field `_csrf`) + kiểm tra `Origin` |
| Rate limit / brute force | Tự viết helper dùng bảng `RateLimit` trong DB (đếm ở server, bền vững) |
| Cấu hình | `dotenv`; mọi secret trong `.env`, có `.env.example`, **không commit `.env`** |

Thư viện được thêm: `express-session`, `argon2`, `svg-captcha`, `nodemailer`, `validator`, `dotenv`, `cookie-parser` (nếu cần), `ejs` (chỉ khi project chưa có view engine). Thêm thư viện ngoài danh sách phải ghi lý do vào `tech-choice.md`.

---

## 3. Chính sách (hằng số tập trung trong `config/authPolicy.js`, có thể đọc từ env)

| Hạng mục | Giá trị |
|---|---|
| Email | `trim()` + chuyển **toàn bộ về chữ thường**; lưu `emailRaw` (bản nhập) và `email` (bản chuẩn hóa, **unique**) |
| Password | 8–128 ký tự, có chữ và số |
| OTP kích hoạt | 6 chữ số (`crypto.randomInt`), hạn **10 phút**, tối đa **5 lần thử sai**, sau đó khóa **15 phút** |
| Gửi lại OTP | cách nhau tối thiểu **60 giây**, tối đa **5 lần / giờ / tài khoản**; `attempts` **không** reset khi gửi lại |
| CAPTCHA | hạn **5 phút**, dùng **một lần** (kể cả trả lời sai), gắn **phiên ẩn danh** + `purpose` (`register` / `login`) |
| Đăng nhập sai | cửa sổ đếm **15 phút**; từ **3** lần sai (theo email chuẩn hóa) → bắt buộc CAPTCHA; đủ **10** lần sai → khóa **5 phút** (trả 429 dù CAPTCHA/password đúng) |
| Giới hạn theo IP | đăng nhập **30**/15 phút; đăng ký **10**/giờ; `/forgot` **20**/giờ/IP và **5**/giờ/email; `/activate` **20**/15 phút |
| Reset token | 32 byte ngẫu nhiên (base64url), lưu **SHA-256 hash**, hạn **15 phút**, dùng **một lần**, mỗi user một token còn hiệu lực |
| Session | cookie `sid`; hạn **không hoạt động 30 phút** (rolling) và hạn **tuyệt đối 8 giờ** (kiểm tra ở server bằng `createdAt` trong session) |
| Cookie `sid` | `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` khi `NODE_ENV=production`, không đặt `Domain` |

Ghi toàn bộ bảng này kèm lý do ngắn vào `docs/auth-policy.md` (đây là chính sách “công bố”).

---

## 4. Mô hình dữ liệu cần thêm (migration không đụng bảng CRUD hiện có)

```
User
  id (PK), emailRaw, email (unique, chuẩn hóa), passwordHash,
  role (default 'viewer'), status ('pending' | 'active', default 'pending'),
  emailVerifiedAt (nullable), createdAt, updatedAt

ActivationChallenge            -- 1 dòng / tài khoản pending
  id, userId (unique, FK User), purpose ('activation'), otpHash,
  expiresAt, attempts (default 0), lockedUntil (nullable),
  lastSentAt, sendCount, sendWindowStart, usedAt (nullable)

PasswordReset
  id, userId (FK User), tokenHash (unique), expiresAt, usedAt (nullable), createdAt

CaptchaChallenge
  id (challengeId, ngẫu nhiên), anonId, purpose ('register'|'login'),
  answer, expiresAt, usedAt (nullable)

RateLimit
  key (PK, ví dụ 'login:email:abc@x.com', 'login:ip:1.2.3.4'),
  count, windowStart, lockedUntil (nullable)

Session
  sid (PK), userId (nullable, index), data (JSON dạng text), expiresAt (index)
```

Ràng buộc:
- Store session tự viết: kế thừa `express-session` `Store`, cài `get/set/destroy/touch`; `set` ghi `userId` (nếu có) vào cột riêng để **xóa mọi session của một user** bằng `deleteMany({ where: { userId } })`. Session hết hạn (`expiresAt`) coi như không tồn tại.
- OTP hash: `HMAC-SHA256(OTP_PEPPER, userId + ':' + otp)`; so sánh bằng `crypto.timingSafeEqual`.
- Dọn định kỳ (khi khởi động và `setInterval`): xóa session, CaptchaChallenge, OTP/reset token hết hạn.
- Script `seed:auth` (không đụng seed dữ liệu Block 5): tạo **ít nhất 1 tài khoản `active`**, email/password từ `SEED_USER_EMAIL` / `SEED_USER_PASSWORD` trong `.env`.

---

## 5. Route & hành vi

### Route công khai (không cần đăng nhập)
`GET/POST /register`, `GET/POST /activate`, `POST /activate/resend`, `GET/POST /login`, `GET/POST /forgot`, `GET/POST /reset`, `GET /captcha/new`, tài nguyên tĩnh của trang auth (CSS/JS cần thiết).

### Route bảo vệ (bắt buộc đăng nhập — middleware `requireLogin`)
`POST /logout` và **toàn bộ route CRUD của Block 5**: trang danh sách, chi tiết, form tạo, form sửa, và mọi POST tạo/sửa/xóa (**cả GET**). Trang chủ `/` cũng yêu cầu đăng nhập (trừ khi Block 5 vốn có trang giới thiệu công khai: khi đó ghi rõ ở `docs/auth-policy.md` route nào công khai và lý do).

`requireLogin`: chưa có session hợp lệ → **`303` tới `/login`**. Session phải còn hạn (idle + tuyệt đối) **và** user `status === 'active'`. Gọi trực tiếp bằng công cụ HTTP không cookie cũng bị chặn như vậy. Đặt middleware **ở server** (áp cho cả router CRUD), không dựa vào việc ẩn nút ở giao diện.

### 5.1 `POST /register`
Thứ tự: rate limit IP → verify CAPTCHA (`purpose=register`, đúng phiên ẩn danh, dùng một lần; thiếu/sai → render lại form, giữ email, bỏ password, mã `CAPTCHA_FAILED`, **chưa** băm password, **chưa** tạo user, **chưa** gửi mail) → validate (sai → status 200, mã `VALIDATION_FAILED`) → chuẩn hóa email → xử lý:
- Email **chưa có**: băm password (Argon2id) → tạo User `pending`, role `viewer` (**bỏ qua mọi `role` trong body**) → sinh OTP → lưu `otpHash` + hạn → gửi mail (bất đồng bộ).
- Email **đã `active`**: không tạo gì thêm, không gửi OTP.
- Email **đang `pending`**: **không ghi đè password**; coi như yêu cầu gửi lại OTP (tôn trọng thời gian chờ).
- **Mọi nhánh hợp lệ** trả cùng một kết quả: lưu `activationEmail` vào session ẩn danh, `303` tới `GET /activate`, trang hiển thị thông báo chung *“Nếu email hợp lệ, chúng tôi đã gửi mã kích hoạt.”* Nội dung, status và thời gian phản hồi không phân biệt được các nhánh (gửi mail không chặn response).

### 5.2 `POST /activate`
Rate limit theo IP và theo email. Với email + OTP: kiểm tra giới hạn thử/khóa **trước** khi so hash. Thành công khi đồng thời: user `pending`, `purpose=activation`, chưa hết hạn, `usedAt` rỗng, chưa vượt giới hạn thử, hash khớp. Mọi lý do thất bại (kể cả email không tồn tại) → cùng thông báo `INVALID_OTP` (status 200), tăng `attempts` nếu có challenge. Thành công → **một thao tác nguyên tử** (`updateMany` có điều kiện + `$transaction`): `usedAt=now`, user → `active`, `emailVerifiedAt=now`; **hai request đồng thời chỉ một thắng**. **Không tự đăng nhập**; `303` tới `/login` kèm thông báo “đã kích hoạt, hãy đăng nhập”. Vượt giới hạn → trang `429` (mã `RATE_LIMITED`).

### 5.3 `POST /activate/resend`
Cùng phản hồi dù email có hay không có tài khoản pending. Thời gian chờ 60 giây, tối đa 5 lần/giờ (quá → `429`). OTP mới **ghi đè** `otpHash`/`expiresAt` (mã cũ hết hiệu lực), cập nhật `lastSentAt`, **không reset `attempts` và `lockedUntil`**.

### 5.4 `POST /login`
Thứ tự **bắt buộc**:
1. **Rate limit / khóa tạm** (theo email chuẩn hóa và theo IP) → đang khóa: trang `429`, kể cả CAPTCHA/password đúng.
2. Nếu số lần sai của email ≥ 3 trong cửa sổ: **xác minh CAPTCHA** (`purpose=login`); thiếu/sai → render lại form kèm CAPTCHA mới, giữ email, bỏ password, **không** kiểm tra password. Backend tự quyết định có cần CAPTCHA; xóa trường CAPTCHA trong HTML hay gọi `POST /login` trực tiếp **không** được bỏ qua bước này.
3. Kiểm tra password bằng `argon2.verify`. **Email không tồn tại và password sai dùng cùng một thông báo chung** (cùng chi phí thời gian: nếu không có user, vẫn chạy một lần verify với hash giả).
4. Password sai → tăng bộ đếm theo email **và** IP (kể cả email không tồn tại); giải đúng CAPTCHA **không** reset bộ đếm.
5. Password đúng nhưng user `pending` → **không tạo session**, hiện thông báo cần kích hoạt kèm link `/activate`.
6. Password đúng và `active` → `req.session.regenerate()` (**đổi `sid`** chống session fixation) → lưu `userId`, `createdAt` vào session → xóa bộ đếm sai theo email (**không** xóa giới hạn IP) → `303` tới trang chính. Response có `Set-Cookie: sid=...`.

OTP kích hoạt và reset token **không** được chấp nhận làm password ở `/login`.

### 5.5 `POST /logout`
Chỉ POST (kiểm tra CSRF). Hủy session ở server (`req.session.destroy`) **trước**, rồi `clearCookie('sid')` đúng thuộc tính, `303` tới `/login`. Dùng lại `sid` cũ → bị từ chối. Thêm vào **layout chung** của Block 5 một thanh điều hướng hiển thị email đang đăng nhập và **nút Logout là một `<form method="POST" action="/logout">`** có hidden `_csrf`.

### 5.6 `POST /forgot`
Rate limit theo email và IP. Luôn trả cùng nội dung/status *“Nếu email đã đăng ký, hướng dẫn đã được gửi.”* cho email có và không có (gửi mail bất đồng bộ để thời gian tương đương). Nếu user tồn tại: vô hiệu hóa các reset token chưa dùng, tạo token mới, lưu hash + hạn, gửi link `APP_BASE_URL/reset?token=...` (**lấy từ cấu hình server, không dùng header `Host`**).

### 5.7 `GET /reset?token=...` và `POST /reset`
- `GET`: chỉ **kiểm tra** (hash token, còn hạn, chưa dùng) rồi hiện form; **không đổi dữ liệu**. Token sai/hết hạn/đã dùng → cùng một thông báo “link không dùng được”. Trang đặt header `Referrer-Policy: no-referrer`.
- `POST`: token (hidden field) + password mới (đúng policy). Kiểm tra và đánh dấu `usedAt` là **một thao tác nguyên tử**. Sau đó: cập nhật `passwordHash`, vô hiệu các reset token còn lại của user, **xóa mọi session của user** (`deleteMany({ where: { userId } })`), gửi email báo mật khẩu đã đổi (không chứa mật khẩu), `303` tới `/login`. **Không tự đăng nhập.** Reset **không** kích hoạt tài khoản pending. Reset token **không** dùng được ở route khác.

### 5.8 CAPTCHA
- Trang SSR nhúng sẵn SVG + hidden `challengeId`; `GET /captcha/new?purpose=...` trả `{ challengeId, svg }` để nút “đổi mã” (một đoạn JS nhỏ trên trang auth) làm mới, **hoặc** nút “đổi mã” là link tải lại trang. Chọn cách đơn giản hơn.
- **Không bao giờ** gửi đáp án (`text`) cho client (hidden field, cookie đọc được, JSON, alt text).
- Xác minh: tiêu thụ thử thách nguyên tử (`updateMany` where `usedAt` rỗng, `expiresAt` chưa qua, đúng `purpose` và `anonId`; `count === 1` mới so đáp án; không phân biệt hoa/thường). Giới hạn tần suất endpoint cấp CAPTCHA theo IP. Có `aria-label` và phương án thay thế tối thiểu (link đổi mã).

### 5.9 CSRF
- Token ngẫu nhiên lưu trong session (kể cả phiên ẩn danh), chèn hidden `_csrf` vào **mọi form** của app (form auth **và form CRUD Block 5: tạo, sửa, xóa**). Mọi request không phải GET/HEAD/OPTIONS phải có token đúng, so sánh bằng `timingSafeEqual`. Thêm kiểm tra `Origin` (nếu có) phải trùng `APP_ORIGIN`.
- **Mọi `GET` tuyệt đối không đổi dữ liệu.** Nếu Block 5 có link GET dạng `/xoa/:id`, **đổi thành form POST**.

### 5.10 Cấu hình bảo mật chung
- `app.disable('x-powered-by')`; `trust proxy` qua env; `SESSION_SECRET`, `OTP_PEPPER` bắt buộc có (thiếu thì khởi động báo lỗi rõ).
- Không log password, `passwordHash`, OTP, reset token, đáp án CAPTCHA, giá trị `sid`.
- Mã lỗi nội bộ (`VALIDATION_FAILED`, `INVALID_OTP`, `RATE_LIMITED`, `CAPTCHA_FAILED`) đặt trong thuộc tính `data-error-code` của phần tử lỗi để dễ kiểm chứng.

---

## 6. Hồi quy Block 5

Sau khi tích hợp, đăng nhập bằng tài khoản seed rồi chạy lại mọi chức năng CRUD của Block 5 (danh sách, chi tiết, tạo, sửa, xóa — mọi thực thể hiện có). Phải hoạt động y như trước, chỉ khác là cần đăng nhập và mọi form có `_csrf`. Ghi kết quả vào `docs/VERIFY.md`.

---

## 7. Sản phẩm bàn giao

| File | Nội dung |
|---|---|
| Mã nguồn | Theo cấu trúc hiện có; tách module rõ: `routes/auth`, `middleware/{requireLogin,csrf}`, `services/{mail,otp,captcha,rateLimit,sessionStore}`, `views/auth/*` |
| `.env.example` | `PORT`, `NODE_ENV`, `DATABASE_URL` (và `DIRECT_URL` nếu Prisma dùng), `SESSION_SECRET`, `OTP_PEPPER`, `APP_BASE_URL`, `APP_ORIGIN` (cùng origin người dùng mở app), `TRUST_PROXY`, `SMTP_HOST/PORT/USER/PASS/FROM`, `SEED_USER_EMAIL`, `SEED_USER_PASSWORD`, kèm chú thích cách lấy từng giá trị |
| `tech-choice.md` | Lý do chọn **từng** công nghệ ở mục 2 (giữ nguyên hay thêm mới, đánh đổi), tiếng Việt |
| `docs/auth-policy.md` | Khảo sát (Bước 0) + bảng chính sách mục 3 + danh sách route công khai/bảo vệ + “Sai khác so với đề” (nếu có) |
| `docs/flows.md` | **Bản nháp** sơ đồ Mermaid: đăng ký có CAPTCHA, kích hoạt OTP, đăng nhập có chống brute force, đăng xuất, quên mật khẩu (tôi sẽ tự vẽ lại và giải thích) |
| `docs/VERIFY.md` | Kịch bản kiểm chứng cho **từng dòng** mục 8: lệnh `curl` (cookie jar `-c/-b`; lấy `_csrf` từ HTML), kết quả mong đợi, chỗ cần chụp **Network/Application (Cookies)/bản ghi DB**, và chỗ phải **che** (`Set-Cookie`, OTP, token) |
| Script | `npm run seed:auth`, `npm run dev`, lệnh migration |

---

## 8. Kịch bản nghiệm thu mã phải thỏa (agent tự kiểm tra trước khi kết thúc)

**Đăng ký / kích hoạt:** pending đăng nhập đúng password → không có session · OTP đúng kích hoạt đúng user + có `emailVerifiedAt` · OTP sai/hết hạn/đã dùng → cùng thông báo, trạng thái không đổi · gửi lại OTP → mã cũ bị từ chối, mã mới dùng được · vượt giới hạn thử/gửi → `429` ở server, gửi lại **không** reset số lần thử · body có `role: admin` → vẫn `viewer` · kích hoạt xong không có session · dùng OTP làm password ở `/login` → bị từ chối · hai request kích hoạt đồng thời → chỉ một thắng.

**CAPTCHA / brute force:** đăng ký thiếu/sai CAPTCHA → không tạo user, không gửi OTP · CAPTCHA dùng lại/quá hạn/khác phiên/sai `purpose` → bị từ chối · đăng nhập sai đến ngưỡng rồi bỏ trường CAPTCHA → bị chặn trước bước kiểm tra password · giải đúng CAPTCHA nhưng sai password → bộ đếm vẫn tăng · đủ 10 lần sai, gửi password + CAPTCHA đúng → `429`, không có session · xóa cookie / mở phiên ẩn danh mới → **không** reset bộ đếm theo email.

**Đăng nhập / đăng xuất / CRUD:** chưa đăng nhập gọi **mọi** route CRUD (GET/POST) → `303 /login`, dữ liệu không đổi · đăng nhập đúng + `active` → `303` + `Set-Cookie: sid` + vào được CRUD · sai email hoặc sai password → cùng một thông báo · `sid` trước/sau đăng nhập **khác nhau** · khởi động lại server thật rồi dùng lại cookie → vẫn đăng nhập · logout rồi dùng `sid` cũ → bị từ chối, bản ghi session đã xóa · gửi form CRUD/logout thiếu `_csrf` hoặc từ origin khác → bị từ chối · cờ cookie: `HttpOnly`, `SameSite=Lax`, `Secure` ở production.

**Quên mật khẩu:** email có/không có → cùng nội dung + status · vượt giới hạn `/forgot` → `429` · token cũ/hết hạn/đã dùng → bị từ chối, password không đổi · `GET /reset` token hợp lệ → chỉ hiện form, `usedAt` vẫn rỗng · reset thành công → không tự đăng nhập; `sid` cũ bị từ chối · dùng reset token ở route khác → bị từ chối.

**Hồi quy Block 5:** mọi chức năng CRUD vẫn hoạt động sau khi đăng nhập.

---

## 9. Quy tắc làm việc

- Thứ tự: khảo sát → schema/migration → services → route + view auth → `requireLogin` + CSRF áp lên CRUD → layout (email + Logout) → seed → tài liệu → tự kiểm tra.
- Không tắt, không mock, không “tạm bỏ qua” bất kỳ kiểm tra bảo mật nào; không để secret trong mã.
- Không dùng MD5/SHA-256 trực tiếp cho password; không lưu session trong bộ nhớ tiến trình; không có `GET` nào đổi dữ liệu (kể cả `GET /reset`).
- Không tạo lỗi cố ý và không tự ý đơn giản hóa hợp đồng ở trên; nếu buộc phải lệch, ghi rõ trong `docs/auth-policy.md` mục “Sai khác so với đề”.

## 10. Báo cáo cuối cùng (in ra khi xong)

1. Danh sách file đã tạo/sửa (một dòng mô tả mỗi file).
2. Cách chạy: cài đặt, migration, `seed:auth`, `dev`.
3. Kết quả tự kiểm tra từng nhóm ở mục 8 (đạt / không đạt / chưa kiểm tra được và vì sao).
4. **5 điểm rủi ro bảo mật tôi nên tự đọc kỹ trong diff** (nêu file và đoạn mã cụ thể: nơi đọc cookie, nơi tra session, nơi chặn request chưa đăng nhập, nơi lưu session/bộ đếm, nơi xử lý đáp án CAPTCHA).
5. Mọi giả định đã tự quyết và mọi chỗ lệch khỏi đề.
