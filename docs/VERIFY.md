# Kiểm chứng Block8 và phân trang SSR

## Đợt hoàn thiện sau audit, ưu tiên slide48–63

`npm.cmd test`:22 ca offline sau bổ sung guard production mail và redaction/CSRF Origin:null. `npm.cmd run test:auth`:20 nhóm server/Prisma/PostgreSQL/SMTP local, thêm malformed CAPTCHA one-use, resend status privacy, correct CAPTCHA+password khi locked qua restart, reset token sai ba mục đích,8 cặp timing mô tả. Snapshot DB và request log allowlist được ghi tại `docs/evidence/auth-final/http-results.json`; không raw HTML/payload/HAR/storageState.

`npm.cmd run test:auth -- --browser --browser-only`: Chrome riêng,1440/375px, JSon/off, native register/pending/OTP/login/forgot/reset/logout, keyboard focus/Enter, cả hai list có filter/sort/pageSize/history sau login; dữ liệu thật trong schema fixture riêng, không DB nhà hàng. Artifact: `docs/evidence/auth-browser-final/browser-results.json`, ảnh `auth-*.png`. Để chạy cả20 nhóm + browser observer: `npm.cmd run test:auth -- --browser`, tạo bảng HTML và ảnh UI/Network/Cookies/DB theo nhóm ở auth-final.

Các ảnh bảng Network/Cookies/DB là **dữ liệu quan sát thật đã che từ HTTP/Playwright/Prisma**, không phải ảnh cửa sổ DevTools. Slide63 nếu giáo viên cần đúng tab Network/Application trong Chrome, nhóm chụp thủ công theo bảng phía dưới, che mọi cookie/token/OTP/secret. Không gọi ảnh bảng tổng hợp là ảnh DevTools. UI của observer là trạng thái cuối nhóm; request log trong cùng nhóm chứa các trường hợp chi tiết, không giả định một ảnh UI chứng minh mọi bước.

Bằng chứng lỗi agent trước/sau: `docs/BUG_RESET_BROWSER_403.md`, ảnh trước sửa trong `docs/evidence/auth-reset-before/`; JSON FAIL trước sửa phải được giữ nhãn lịch sử, không gộp thành PASS của mã cuối. Kết quả cuối cùng xem HANDOFF; không kết luận pass từ file ảnh lẻ khi suite chưa kết thúc.

## Phân biệt môi trường

- **Ứng dụng thật:** `npm start`, `http://localhost:3000`, database nhóm có 1.018 món/11 đầu bếp/60 nguyên liệu. Chỉ seed tài khoản auth mới và thao tác login/session; không ghi dữ liệu CRUD. Snapshot CRUD trước/sau migration trùng hoàn toàn.
- **Auth tích hợp thật:** `npm run test:auth`. Tạo schema PG ngẫu nhiên `auth_test_<24 hex>`, chạy migration trong schema đó, server riêng port 3108, Prisma/Argon2/session/CSRF/CAPTCHA/rate limit thật; SMTP TCP cục bộ nhận email thật của Nodemailer. Không mock quyết định bảo mật. Chỉ dữ liệu test trong schema này được tạo/sửa/xóa và schema được dọn sau khi chạy.
- **Offline:** `npm test`. Lớp persistence là fixture, nhưng vẫn đăng nhập qua route thật, verify Argon2 thật và đi qua session/CSRF/guard. Không dùng kết quả offline để khẳng định kết nối hay lưu trữ DB thật.
- **Browser thật:** `node tests/pagination.browser.js <đường-dẫn-module-playwright>`. Chrome headless mới, profile/context riêng; desktop 1440×900 và 375×900, JavaScript bật/tắt. Đăng nhập bằng credential tự nạp từ .env, không log; screenshot che email và trường credential. Chỉ POST `/login` và GET danh sách, không POST CRUD/logout.

Không chạy `npm run test:db` cũ trong lần này: script cũ gọi seed nhà hàng ở schema tạm và chưa mô tả đầy đủ auth. Suite `test:auth` thay thế phần nghiệm thu tích hợp Block8, có CRUD sau login và CSRF.

## Lệnh đã dùng

```powershell
npm.cmd install express-session argon2 svg-captcha nodemailer validator
npm.cmd run auth:configure
npm.cmd run db:auth:generate
npm.cmd run db:auth
npm.cmd run seed:auth
npm.cmd start
npm.cmd test
npm.cmd run test:auth
node tests/mail-smoke.js
node tests/pagination.browser.js C:/Users/PC/AppData/Local/Temp/ssr-pagination-playwright/node_modules/playwright
```

Playwright được cài vào thư mục công cụ tạm bằng `npm install --prefix <thư-mục-tạm> playwright`; không nằm trong dependency hoặc lockfile của app. `auth:configure` chỉ bổ sung khóa còn thiếu và không in giá trị. `db:auth` đã tiếp nhận năm bảng auth hiện hữu, giữ nguyên bảng `session` cũ và tạo bảng `Session` mới. Có một lỗi tạo trùng bảng P3018 ban đầu; đã đối chiếu metadata, đánh dấu lần thất bại rolled back rồi áp dụng/adopt đúng migration. Không reset hoặc chạy seed dữ liệu nhà hàng.

Kết quả máy đọc: `docs/evidence/auth-integration.json`, `docs/evidence/pagination-browser/results.json`. Các JSON không chứa credential, OTP, token hoặc cookie. Kết quả trước sửa có thể được ghi đè bởi vòng chạy cuối; chỉ dùng trường status và completedAt của kết quả cuối khi nghiệm thu.

## Curl an toàn với cookie jar

Chỉ dùng trên database test cho trường hợp có ghi tài khoản hoặc CRUD. Không dùng `-v`/`-i`, không in cookie jar/header/body mật khẩu; lưu artifact nhạy cảm trong thư mục tạm ngoài Git và xóa sau kiểm tra. Đây là mẫu lệnh, không phải credential thực tế.

```powershell
$authJar = Join-Path $env:TEMP 'block8-cookie-jar.txt'
$authHtml = Join-Path $env:TEMP 'block8-form.html'
curl.exe -s -c $authJar -o $authHtml http://localhost:3000/login
$csrf = [regex]::Match([IO.File]::ReadAllText($authHtml), 'name="_csrf" value="([^"]+)"').Groups[1].Value
# SEED_USER_* phải có trong môi trường terminal riêng; không echo các biến.
curl.exe -s -b $authJar -c $authJar -o $authHtml -w '%{http_code}' -H 'Origin: http://localhost:3000' --data-urlencode "_csrf=$csrf" --data-urlencode "email=$env:SEED_USER_EMAIL" --data-urlencode "password=$env:SEED_USER_PASSWORD" http://localhost:3000/login
# Mong đợi 303, sau đó GET với cùng jar; không -L khi đang quan sát PRG.
curl.exe -s -b $authJar -c $authJar -o $authHtml -w '%{http_code}' 'http://localhost:3000/admin/dishes?page=2&pageSize=10'
# Mong đợi 200. Luôn lấy lại _csrf từ form mới sau login vì sid/token đã đổi.
```

Với route khác: GET form → lấy `_csrf` và `challengeId` từ HTML (không đáp án), POST cùng jar + Origin. Người kiểm tra đọc CAPTCHA/OTP/email trực tiếp ở môi trường test; không đưa đáp án hoặc token vào lệnh chụp ảnh/báo cáo. Bỏ `_csrf` hoặc đổi Origin phải 403; bỏ cookie khi gọi CRUD phải 303 `/login`.

## Kịch bản từng nhóm yêu cầu

Tất cả dòng “tích hợp” dưới đây được thực hiện trong schema test riêng, không trên dữ liệu nhà hàng hiện hữu. Các test tự chuẩn bị metadata hết hạn/đếm ở ngưỡng trong schema riêng để không chờ 5/15/60 phút; không đổi chính sách server hoặc bỏ kiểm tra bảo mật.

| Kịch bản | Cách kiểm tra | Mong đợi | Bằng chứng và chỗ cần che |
|---|---|---|---|
| Pending login đúng password | POST login cùng jar/CSRF | HTML 200 ACTIVATION_REQUIRED, không Session.userId | Tích hợp; Network; che password/sid |
| OTP đúng | POST activate email + mã từ mail test | 303 login, active + verifiedAt, chưa đăng nhập | Tích hợp; DB chỉ chụp status/verifiedAt, che OTP/hash |
| OTP sai/hết hạn/đã dùng | Gửi lại với mã sai/metadata hết hạn | INVALID_OTP, không kích hoạt sai | Tích hợp; che payload và hash |
| Resend đổi mã | Cho cooldown qua, POST resend, thử mã cũ/mới | Cũ INVALID_OTP, mới kích hoạt được | Tích hợp; mail SMTP được giữ RAM, không chụp OTP |
| Resend/thử OTP vượt ngưỡng | 5 thử sai hoặc quota gửi lại 5/giờ; thử trước 60s | 429, resend giữ attempts/lockedUntil | Tích hợp; chụp counter/time, không code/hash |
| role admin từ body | Register với role admin và CAPTCHA đúng | DB role viewer | Tích hợp; chỉ chụp role/status |
| Kích hoạt không auto-login | GET dishes sau activate | 303 login | Tích hợp; Network |
| OTP dùng làm password | POST login với OTP thay password | INVALID_CREDENTIALS | Tích hợp; che OTP |
| Activate đồng thời | Hai POST cùng OTP | Chỉ một 303 thành công | Tích hợp; không chụp body OTP |
| Register thiếu/sai CAPTCHA | POST register không/ sai mã | CAPTCHA_FAILED, không user/mail | Tích hợp; counter user/mail; che nội dung mã |
| CAPTCHA dùng lại/quá hạn/khác phiên/purpose | Giữ challenge, đổi jar/purpose hoặc tiêu thụ lại | CAPTCHA_FAILED | Tích hợp; che answer/challenge session metadata |
| CAPTCHA không phân biệt hoa/thường | Gửi đáp án chữ hoa từ mã server | CAPTCHA đúng được chấp nhận | Tích hợp; không log đáp án |
| Login bỏ CAPTCHA sau 3 sai | Gửi password đúng, thiếu CAPTCHA | CAPTCHA_FAILED trước nhánh verify password | Tích hợp + đọc thứ tự code; fail counter vẫn 3 |
| CAPTCHA đúng, password sai | Giải mã mới cho từng lần sai tiếp | Counter tăng, không reset | Tích hợp; che mã/password |
| 10 lần sai, gửi đúng | Gửi đủ 10; sau đó gửi đúng password | 429 dù đổi jar/cookie | Tích hợp; DB RateLimit.lockedUntil |
| IP quota độc lập | Chuẩn bị row ở ngưỡng trong schema riêng | login/register/forgot/activate/cấp CAPTCHA bị 429 | Tích hợp; che email trong key khi chụp |
| Mọi CRUD chưa login | Curl GET/new/edit/delete/POST/override không cookie | 303 /login; không đổi dữ liệu CRUD | Tích hợp; browser cũng kiểm tra cả 2 list |
| Login active đúng | GET login, POST với CSRF + password | 303 dishes; Set-Cookie sid mới; vào CRUD | Tích hợp + browser; che toàn bộ giá trị sid và password |
| Sai email / password | POST cả hai nhánh | Cùng thông báo chung INVALID_CREDENTIALS | Tích hợp; chỉ chụp thông báo |
| Session fixation | So sid trước/sau login trong RAM | Khác nhau | Tích hợp; không chụp hai giá trị |
| Restart server | Giữ jar, tắt/bật server test thật rồi GET dishes | Vẫn 200 qua DB store | Tích hợp; không dùng MemoryStore |
| Logout và replay sid | POST logout + CSRF, dùng jar cũ | Row session xóa, replay 303; stale set không hồi sinh | Tích hợp; che cookie |
| CSRF/Origin auth/CRUD/logout | POST thiếu token hoặc Origin khác | 403 khi đã có session hợp lệ | Tích hợp; không chụp token |
| Cookie flags | Quan sát Set-Cookie đã che trong Network/Application | HttpOnly, SameSite Lax, Path=/, không Domain | HTTP thật trong suite; Secure production được kiểm tra cấu hình, chưa nghiệm thu TLS/reverse proxy thật |
| Idle/absolute/status | Dữ liệu session test quá hạn, user không active | 303 ở server | Tích hợp; che serialized session |
| Forgot email có/không | POST forgot, so status/thông báo | Cùng 303 /forgot/sent và nội dung | Tích hợp; không chụp email thật |
| Forgot vượt quota | Counter email/IP vượt ngưỡng | 429 | Tích hợp |
| Reset token cũ/hết hạn/đã dùng | Tạo hai yêu cầu forgot; thử token cũ/hết hạn/used | INVALID_RESET; password không bị thay bằng token lỗi | Tích hợp; che URL token và body |
| GET reset hợp lệ | GET link rồi đọc row trước/sau | Form hiện, usedAt vẫn null, no-referrer | Tích hợp; che URL/hidden token |
| Reset thành công | POST token + password mới | 303 login, hash đổi, mọi Session.userId xóa | Tích hợp; che password/hash/token |
| Reset pending / token sai route | Reset pending; dùng token ở login | Không active/auto-login; token không thành password | Tích hợp; che payload |
| Reset đồng thời | Hai POST cùng token | Chỉ một thành công; mail không chứa password | Tích hợp; SMTP message chỉ ở RAM |
| CRUD sau login | Tạo/sửa/xem/xác nhận/xóa ba thực thể trong schema test | PRG 303, validation 400, missing 404, relation guard giữ nguyên | Tích hợp; không chạy ghi trên data thật |
| Phân trang sau login | GET list/filter/sort/pageSize, browser native forms | Giữ đúng page/filter/sort; invalid 400, vượt trang 303 | Tích hợp + browser thật; ảnh dùng database nhóm |

## Nghiệm thu browser và ảnh

Các ảnh `*-real-*.png` trong `docs/evidence/pagination-browser/` đều dùng database ứng dụng thật; tên “B7 Seed ...” có thể là dữ liệu đã có trong DB nhóm, **không phải mock của script preview**. Ảnh che email bằng ô màu; không ghi storageState/cookie/trace chứa credential.

- Desktop/375px, JS bật/tắt: form/list/navigation trong viewport; document/body không tràn ngang. Admin table có scrollWidth lớn hơn clientWidth và scrollLeft thay đổi trong container, window.scrollX vẫn 0.
- Native no-JS: tìm, bộ lọc quản trị, sort, pageSize, next; link giữ điều kiện; tìm mới/đổi size về trang 1.
- Bàn phím: Tab tới input/select/submit/pageLink; focus-visible có outline/shadow, focus trong viewport; Enter thực hiện tìm/gửi form/link. Disabled là span, không href/tabindex.
- Back/Forward: hai bước Back và hai bước Forward, so URL + IDs dữ liệu + tổng + form fields. Đã sửa autocomplete off để browser không đưa giá trị form đã nhập vào URL cũ; CSS scroll-margin/reduced-motion giữ focus nhìn thấy.
- Mỗi layout có ảnh `*-form.png` và `*-pagination.png`; keyboard có `*-keyboard.png`. Kết luận cuối và phiên bản Chrome/Playwright nằm trong results.json.

## Chưa xác minh ngoài môi trường test

- TLS/reverse proxy/secure cookie trên deployment production thật; cần nghiệm thu với APP_ORIGIN HTTPS và TRUST_PROXY đúng hạ tầng.
- Giao nhận email tới inbox SMTP của nhóm: luồng email được kiểm tra qua SMTP TCP cục bộ; kết nối Ethereal fallback đã verify thành công nhưng không gửi email thật trong smoke check.
- Không benchmark chứng minh timing không thể phân biệt trên mạng; đã rà chi phí Argon2, hash giả, floor phản hồi và mail không chặn.
- Race/expiry dùng transaction và metadata test trên PostgreSQL; chưa chạy trên provider DB khác.
