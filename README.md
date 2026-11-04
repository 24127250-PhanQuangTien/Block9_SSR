# Restaurant SSR

**Chuyển máy/tiếp tục công việc:** đọc [docs/HANDOFF_BLOCK8.md](docs/HANDOFF_BLOCK8.md). Yêu cầu gốc được lưu tại [docs/requirements](docs/requirements/); không cần mang theo các prompt chỉ nằm ngoài repository.

Kết quả đợt bàn giao: **22/22 offline,20/20 nhóm HTTP thật,4/4 native Chrome,4/4 navbar**; schema test được dọn. Đọc [báo cáo sau khắc phục](docs/BLOCK8_FINAL_ACCEPTANCE.md) để biết32/34 tiêu chíPASS và các giới hạn còn lại. Bản audit30/34 bên dưới là lịch sử trước sửa.

**OTP không tới inbox?** Nếu thiếu SMTP_HOST, Ethereal chỉ giữ thư thử. Xem [cấu hình Gmail/SMTP thật](docs/MAIL_SETUP.md); chạy `npm.cmd run mail:configure`, `npm.cmd run mail:check` rồi restart server. Không đưa `.env` vào Git.

**Nghiệm thu bổ sung:** `npm.cmd test` có22 ca offline; `npm.cmd run test:auth` có20 nhóm HTTP/Prisma thật trong schema tạm. Thêm `-- --browser` để chạy cùng Chrome; hoặc `npm.cmd run test:auth -- --browser --browser-only` để chỉ kiểm native auth desktop/375px, JSon/off và pagination sau login trong schema tạm. Playwright ở thư mục công cụ tạm ngoài app. Kết quả mới ghi `docs/evidence/auth-final` (HTTP) và `docs/evidence/auth-browser-final` (browser-only); không nhầm với evidence cũ bên dưới. Chỉ dùng kết quả có completedAt/status/cleanup, xem trạng thái mới nhất trong HANDOFF.

Đã tìm lỗi browser reset403 do no-referrer/Origin:null, có [hồ sơ trước/sau](docs/BUG_RESET_BROWSER_403.md). Không tự sửa dữ liệu nhà hàng để kiểm thử; không dùng seed cũ hoặc dbpush khi chuyển máy.

Node.js + Express + EJS, Prisma 5 và PostgreSQL (Supabase). CRUD và authentication dùng form HTML + redirect 303 theo PRG, không fetch/AJAX/SPA. Block8 tích hợp trên `feat/backport-block7-pagination-ssr`, giữ phân trang/tìm/lọc/sort; chưa làm Block9.

## Authentication Block8

Toàn bộ `/`, `/dishes` và `/admin/*` yêu cầu session của user active; chưa đăng nhập trả **303 `/login`**, kể cả POST CRUD. Public auth: đăng ký có CAPTCHA, kích hoạt/gửi lại OTP, đăng nhập/chống brute force, quên/reset mật khẩu. CAPTCHA đổi mã bằng tải lại trang. Session Prisma bền vững, Argon2id, CSRF + Origin, rate limit DB; role chỉ default viewer, chưa dùng phân quyền.

Tài liệu: [chính sách và quyết định](docs/auth-policy.md), [lựa chọn kỹ thuật](tech-choice.md), [sơ đồ nháp](docs/flows.md), [kịch bản/kết quả kiểm chứng](docs/VERIFY.md).

## Chạy project

Yêu cầu Node.js 18+ và PostgreSQL/Supabase có thể kết nối từ máy chạy server.

```powershell
npm.cmd ci
Copy-Item .env.example .env # Chỉ khi chưa có .env; không ghi đè cấu hình nhóm
```

Điền cấu hình database trong `.env` theo `.env.example`, giữ ở máy cá nhân, không commit/gửi vào chat. Ứng dụng tự nạp bằng dotenv; không in credential. `SESSION_SECRET` và `OTP_PEPPER` phải có ít nhất 32 ký tự, thiếu thì app từ chối khởi động. `APP_BASE_URL` và `APP_ORIGIN` phải cùng origin người dùng mở app; production dùng HTTPS và TRUST_PROXY đúng reverse proxy.

```powershell
# Dừng server trước khi cập nhật Prisma Client trên Windows.
npm.cmd run auth:configure # Chỉ append khóa local còn thiếu; không ghi đè/in giá trị
npx.cmd prisma generate
npm.cmd run db:auth       # Baseline an toàn cho DB CRUD hiện có + migration auth
npm.cmd run seed:auth     # Chỉ tạo active viewer nếu chưa có; không gọi seed nhà hàng
npm.cmd run dev
# Hoặc: npm.cmd start
```

Mở `http://localhost:3000/login`, dùng tài khoản `SEED_USER_EMAIL/SEED_USER_PASSWORD` đã cấu hình cục bộ. `auth:configure` có thể sinh credential local ngẫu nhiên khi thiếu, không in ra đầu ra; không đổi giá trị đã có. `seed:auth` không đổi password/tài khoản đã tồn tại. Sau login có `/dishes`, `/dishes?q=phở`, `/dishes/:id`, `/admin/dishes`, `/admin/chefs`, `/admin/ingredients`; chi tiết quản trị `/admin/dishes/:id`.

Thiếu SMTP_HOST thì mail dùng Ethereal, chỉ log link preview riêng tư; có SMTP thì điền từ nhà cung cấp vào .env. Không đưa OTP/token/password/đáp án CAPTCHA/sid hoặc link preview vào ảnh/log công khai. Đăng xuất là form POST có CSRF trong layout chung.

## Phân trang SSR cho món ăn

Hai danh sách `/dishes` và `/admin/dishes` dùng phân trang số qua URL, form GET và liên kết HTML. Form tìm/lọc/đổi số món luôn gửi `page=1`; chọn số món rồi bấm **Tìm Kiếm** hoặc **Lọc Dữ Liệu**. Không cần JavaScript cho các thao tác này.

- Mặc định `page=1`, `pageSize=10`. Giao diện có 10/20/50; server nhận mọi số nguyên từ 1 đến 100 cho `pageSize`. Kích thước hợp lệ khác được giữ bằng một option đang chọn khi mở URL trực tiếp.
- `page` phải là số nguyên dương an toàn trong JavaScript; `(page - 1) * pageSize` phải an toàn và không vượt `2147483647` (giới hạn Int của Prisma `skip`). Chỉ nhận chuỗi chữ số thập phân; thiếu tham số mới dùng mặc định. Tham số rỗng, lặp (kể cả cùng giá trị), dạng mảng/object, số âm, phân số, `2abc`, `1e2`, số quá lớn trả **HTML 400** trước truy vấn database.
- `/dishes` giữ tìm theo **tên**, không phân biệt hoa/thường, thứ tự ID tăng dần. `/admin/dishes` giữ tìm theo **tên hoặc mô tả**, lọc `category`/`status`, sort mặc định ID, `price_asc`, `price_desc`, `name`, `newest`. Các sort theo giá/tên/ngày tạo thêm ID tăng dần để xử lý giá trị bằng nhau. Không chuyển fuzzy/full-text search từ Block7.
- `count({ where })` tính tổng kết quả theo đúng bộ lọc; `findMany({ where, skip, take, include })` chỉ lấy trang hiện tại kèm đầu bếp/nguyên liệu. Truy vấn danh mục riêng chỉ chọn các danh mục khác nhau để giữ đủ lựa chọn bộ lọc. Danh sách đầu bếp/nguyên liệu trong form CRUD vẫn đầy đủ.
- EJS hiển thị riêng tổng kết quả, số món đang xem, Trước/Sau, tối đa 5 số quanh trang hiện tại cộng trang đầu/cuối và dấu `…`. Trang hiện tại có `aria-current="page"`; mục không khả dụng là `span`, không có `href`. CSS cho thanh phân trang xuống dòng trên màn hình hẹp; bảng quản trị giữ vùng cuộn ngang riêng.
- Link chỉ giữ `q`, và ở quản trị thêm `category`, `status`, `sort`, cùng `pageSize`/`page`; dùng `URLSearchParams` và EJS escaping cho tiếng Việt/ký tự đặc biệt. Các query ngoài phạm vi như `mode`, `view`, `_method` không được đưa vào link.
- Trang vượt phạm vi redirect **303** về trang cuối, hoặc trang 1 nếu tổng bằng 0, giữ điều kiện và không dựng liên kết phân trang khi rỗng. Lỗi database vẫn là **HTML 500**, không đổi thành kết quả rỗng hoặc hợp đồng API `200 + ok=false`.

Ví dụ: `/dishes?q=ph%E1%BB%9F&pageSize=20&page=2` và `/admin/dishes?status=available&sort=newest&pageSize=10&page=2`.

Luồng xử lý: URL/form GET → middleware kiểm tra phân trang → Express giữ logic lọc hiện có → Prisma count → redirect nếu vượt phạm vi, nếu không thì Prisma skip/take → EJS dựng HTML và URL chuyển trang. Count và lấy trang là các truy vấn đọc riêng; đảm bảo thứ tự ổn định trên tập dữ liệu không đổi, không hứa giữ snapshot giữa các request khi có ghi đồng thời. Offset lớn có thể chậm dù đã bị giới hạn; chưa thêm index/schema hoặc cursor ngoài phạm vi bài này.

Nguồn tham khảo chỉ đọc: Block7, nhánh `feat/block7-skeleton-vietnamese-search`, commit `4d39436492f050cb1f0c106760e8950a2c760dd0`. Nền đích: `main`, commit `2220580234324fd75becd06c612ee5c40a627252`. Chỉ chuyển ý tưởng phân trang database, tổng kết quả và cửa sổ số trang sang Express/EJS, không merge/cherry-pick hay đưa React/fetch, skeleton, popup lựa chọn, tải thêm/cuộn vô hạn sang đích. Ba URL slide Block5/8/9 được cung cấp không truy cập được qua công cụ web trong lần triển khai này; phần yêu cầu SSR/không AJAX/redirect 303 dựa trên phạm vi người giao việc đã chốt, không phải xác nhận đã đọc lại slide.

## Migration và bảo toàn dữ liệu

Block8 thêm model auth nhưng không đổi model Dish/Chef/Ingredient. DB nhóm đã có năm bảng auth UUID và bảng `session` cũ; script đối chiếu/tiếp nhận baseline, giữ nguyên bảng cũ và chỉ tạo bảng `Session` cần cho store mới. Snapshot CRUD trước/sau migration giống hoàn toàn: **1.018 món, 11 đầu bếp, 60 nguyên liệu**. Nếu cần sinh lại migration từ schema đã rà: `npm run db:auth:generate`; không dùng db push/reset để né xung đột.

**Không chạy `npm run seed` cũ trên dữ liệu cần giữ:** script đó xóa/nạp lại dữ liệu nhà hàng. `seed:auth` là script riêng, không gọi script seed cũ và không truy cập bảng nhà hàng. Lần triển khai này không seed/reset/db push dữ liệu nhà hàng và không commit/push.

## Kiểm tra

```powershell
npm.cmd test
npx.cmd prisma validate
```

`npm test` chạy validation, HTTP/HTML và `tests/pagination.test.js` với Prisma thay thế để kiểm tra độc lập mạng, không xác minh dữ liệu PostgreSQL thật. Bộ fixture có 137 món với giá/tên/ngày tạo trùng nhau để kiểm tra phân trang và ID phụ qua mọi trang. Test kiểm tra tham số, cùng điều kiện count/findMany, skip/take, quan hệ, bộ lọc, sort, link/encoding, form reset trang, trang rỗng, redirect và hồi quy form/CRUD/method override/400/404/500/303. Việc slice trong fixture chỉ mô phỏng database; code ứng dụng lấy trang tại Prisma.

Fixture 137 món chỉ dùng cho test offline. `tests/preview-pagination.js` là preview lịch sử trước Block8, không phải server/auth thật và không dùng để nghiệm thu hiện tại. Mở ứng dụng thật và **đăng nhập trước** khi làm các bước sau:

1. Với DB đã kiểm tra 1.018 món, mở trang đầu/giữa/cuối (`?page=1`, `?page=51`, `?page=102`); đối chiếu tổng 1.018 với 10/10/8 món đang hiển thị. Thử 20/50 món và cửa sổ số trang.
2. Ở quản trị, tìm theo mô tả, chọn phân loại/trạng thái/sort; chuyển trang và kiểm tra URL giữ điều kiện. Ở khách chỉ tìm theo tên. Thử từ khóa `Phở & "chanh" + / ? #` và phân loại có ký tự đặc biệt; xem input, link và URL vẫn đúng.
3. Từ trang 2 trở đi, đổi từ khóa/bộ lọc/số món rồi bấm nút gửi: URL có `page=1`. Dùng Back/Forward để kiểm tra điều kiện được dựng lại từ URL.
4. Thử `?q=absent`, `?q=absent&page=99`, `?page=999`, `?page=2abc`, `?page=1&page=2`, `?pageSize[x]=10`. Xem status trong Network: 200 rỗng, 303 về trang hợp lệ, hoặc HTML 400. Liên kết trang trước/sau bị vô hiệu không được bấm và trang hiện tại có `aria-current`.
5. Tắt JavaScript trong DevTools, reload rồi thực hiện lại tìm/lọc/chọn số món/chuyển trang ở cả hai màn hình. Thử responsive 375px và chiều ngang, bàn phím Tab/Enter, focus và thanh phân trang xuống dòng. Bảng quản trị cuộn ngang trong vùng bảng.

Nghiệm thu **chỉ đọc với database hiện có**, dùng server thật thay vì preview:

```powershell
# Terminal 1, trong Web-Block5:
npm.cmd start
# Terminal 2, cũng trong Web-Block5:
node tests/verify-pagination-readonly.js --smoke
# Kiểm tra ngắn sau login, không lặp lại 101 GET. Bỏ --smoke nếu muốn bộ đầy đủ.
# Có thể truyền origin localhost khác nếu PORT của ứng dụng khác 3000.
```

`src/server.js` gọi `dotenv.config()` trước app/Prisma. Script nghiệm thu tự nạp cùng cơ chế, xác nhận hai list chưa login trả 303 rồi POST login thật bằng credential cục bộ. Sau đó chỉ HTTP GET và Prisma `Dish.count/findMany`; không ghi dữ liệu nhà hàng hoặc in message/stack/credential. Session/CSRF/rate limit auth là metadata do ứng dụng tự quản lý.

Kết quả HTTP/Prisma ngày 03/11/2026 **trước tích hợp auth**: pass **101 GET**, gồm **53 trang** đối chiếu Prisma thật, **9 redirect 303**, **22 tham số sai trả HTML 400**, **4 lần gửi GET từ form HTML**. Không chạy lại toàn bộ 101 GET chỉ để coi là nghiệm thu browser. Tổng dữ liệu: **1.018 món**.

| pageSize | Số trang | Trang đầu/giữa/cuối đã kiểm tra | Số món tương ứng |
| --- | --- | --- | --- |
| 10 | 102 | 1 / 51 / 102 | 10 / 10 / 8 |
| 20 | 51 | 1 / 26 / 51 | 20 / 20 / 18 |
| 50 | 21 | 1 / 11 / 21 | 50 / 50 / 18 |

Cả hai màn hình pass các trường hợp trong bảng. Tìm theo một từ lấy từ dữ liệu thật cho 127 kết quả ở khách và 130 ở quản trị (tên hoặc mô tả). Quản trị pass sort `price_asc`, `price_desc`, `name`, `newest` trên trang đầu/giữa/cuối; lọc đang phục vụ 682 món, tạm hết 336 món; phân loại mẫu 131 món và bộ lọc kết hợp 87 món. Link chuyển trang giữ điều kiện; kiểm tra round-trip tiếng Việt/ký tự đặc biệt trong form và redirect cũng pass. Không phát hiện lỗi ứng dụng cần sửa qua các kiểm tra này.

## Kết quả Block8 và browser sau đăng nhập thật

```powershell
npm.cmd test
npm.cmd run test:auth
# Playwright nằm ngoài app; truyền đường dẫn module đã cài trong thư mục công cụ tạm:
node tests/pagination.browser.js C:/Users/PC/AppData/Local/Temp/ssr-pagination-playwright/node_modules/playwright
node tests/mail-smoke.js
```

- **Offline 19/19 pass:** persistence fixture; route login, Argon2, CSRF và guard thật. Bao gồm phân trang, CRUD validation/override/400/404/500/303, dữ liệu rỗng và ranh giới offset. Lỗi DB giả lập vẫn chỉ là bằng chứng mock.
- **Auth tích hợp 15 nhóm pass:** Prisma/database thật ở schema ngẫu nhiên riêng, server process thật, SMTP TCP cục bộ. Đăng ký/CAPTCHA/OTP/resend/lock/login/sid/restart/logout/idle/absolute/forgot/reset/CSRF/Origin và CRUD cả ba thực thể sau login. Mỗi form POST được kiểm tra token riêng, gồm sửa/xóa; schema test được dọn, không ghi dữ liệu CRUD ứng dụng.
- **Playwright 22/22 pass:** Chrome **156.0.8078.74**, Playwright **1.64.1**, phiên test riêng. Cả hai màn hình ở 1440×900 và 375×900, JS bật/tắt; không tràn ngang document/body, admin table cuộn trong container. Native GET no-JS tìm/lọc/sort/đổi size/chuyển trang giữ điều kiện, reset page 1. Tab/focus/Enter, disabled controls và Back/Forward khớp URL/dữ liệu/form đều pass. Có 8 lần kiểm tra 303 khi chưa login và 20 ảnh từ **DB thật**, che email/credential.
- **Sửa nhỏ qua browser:** autocomplete off trên hai form GET để history không phục hồi giá trị bộ lọc sai URL; scroll-margin và reduced-motion để focus không bị cắt; nền navbar authenticated hiện rõ cả khi tắt JS.
- **Mail:** Nodemailer gửi OTP/reset/thông báo qua SMTP cục bộ trong suite thật; kết nối Ethereal fallback verify pass, smoke không gửi email ngoài. Chưa nghiệm thu inbox SMTP nhóm, HTTPS/reverse proxy production và DB provider khác; chưa benchmark timing trên mạng.

Bằng chứng: [auth integration](docs/evidence/auth-integration.json), [browser results](docs/evidence/pagination-browser/results.json), [desktop quản trị](docs/evidence/pagination-browser/admin-dishes-1440-js-real-form.png), [375px/no-JS khách](docs/evidence/pagination-browser/dishes-375-nojs-real-form.png), [375px/no-JS phân trang quản trị](docs/evidence/pagination-browser/admin-dishes-375-nojs-real-pagination.png). Toàn bộ ảnh form/pagination/keyboard nằm trong cùng thư mục; ảnh không dùng preview/mock. Hướng dẫn curl, checklist từng yêu cầu và phần cần che ở [docs/VERIFY.md](docs/VERIFY.md).

`test:db`/seed nhà hàng cũ được giữ nguyên nhưng không dùng cho nghiệm thu Block8; dùng `test:auth` thay thế. `.env` được ignore, không tracked/staged; không commit/push.
