# Chính sách authentication Block8

## Khảo sát trước triển khai

- Nền tích hợp ban đầu: `feat/backport-block7-pagination-ssr`, commit nền `2220580234324fd75becd06c612ee5c40a627252`. Source hiện được duy trì trên main, giữ CRUD/phân trang SSR; kết quả hiện tại xem FINAL_ACCEPTANCE và audit.
- Express 4, Node.js CommonJS, EJS; không React/SPA, API JSON hoặc Block9.
- Prisma 5, provider PostgreSQL, cấu hình do `dotenv` tự nạp trong server; không mở/in `.env` hay credential.
- CRUD đang có: `/dishes`, `/dishes/:id`; `/admin/dishes`, `/admin/chefs`, `/admin/ingredients` với new/edit/delete và POST/PATCH/DELETE.
- Ghi CRUD dùng form POST và method override `?_method=PATCH|DELETE`, validation HTML 400/404/500, thành công redirect 303.
- Phân trang món dùng Prisma count/skip/take; khách tìm theo tên, quản trị tìm tên/mô tả và lọc/sort; giữ nguyên các nghĩa này.
- Trước auth, server thật đã chạy qua `npm start`, đọc 1.018 món; HTTP/Prisma phân trang đã pass.
- Database thực tế có sẵn năm bảng auth dùng UUID cùng bảng `session` cũ, chưa có model tương ứng trong repo. Đã đối chiếu metadata và tiếp nhận; bảng cũ `session` được giữ nguyên, bảng mới `Session` phục vụ store Prisma.
- Sau migration, snapshot đầy đủ các trường CRUD và quan hệ không thay đổi: 1.018 món, 11 đầu bếp, 60 nguyên liệu.
- Dev: `npm run dev`; lần đầu cấu hình/migration/seed auth theo README, không gọi seed nhà hàng.

## Chính sách công bố

Các giá trị tập trung tại `src/config/authPolicy.js`.

| Hạng mục | Chính sách | Lý do |
|---|---|---|
| Email | trim + chuyển toàn bộ về chữ thường; email unique; emailRaw giữ bản nhập | Tránh tài khoản trùng do hoa/thường/khoảng trắng |
| Password | 8–128 ký tự, có chữ và số; Argon2id, 64 MiB, 3 vòng, parallelism 1 | Không lưu plaintext; giới hạn chi phí đầu vào |
| OTP | 6 số crypto.randomInt; HMAC-SHA256 với OTP_PEPPER và userId; hạn 10 phút | Không lưu mã có thể dùng lại khi lộ DB |
| Thử OTP | 5 lần sai, khóa 15 phút | Giới hạn đoán mã; kiểm tra khóa trước so hash |
| Gửi lại OTP | Tối thiểu 60 giây; tối đa 5 lần/giờ/tài khoản; không reset attempts/lockedUntil | Không dùng resend để né brute force |
| CAPTCHA | Hạn 5 phút; một lần kể cả sai; ràng buộc anonId + purpose register/login | Ngăn tái sử dụng, đổi phiên và đổi mục đích |
| Đăng nhập sai | Cửa sổ 15 phút; từ 3 lần cần CAPTCHA; 10 lần khóa 5 phút | Không thể né bằng xóa cookie hoặc sửa HTML |
| IP đăng nhập | 30 request/15 phút | Ngăn đoán nhiều tài khoản từ một IP |
| IP đăng ký | 10 request/giờ | Hạn chế tạo tài khoản/gửi mail hàng loạt |
| Forgot | 20/giờ/IP, 5/giờ/email | Giới hạn cả tài khoản tồn tại và không tồn tại |
| Activate | 20/15 phút/IP và email | Bổ sung giới hạn ngoài challenge |
| Cấp CAPTCHA | 60/15 phút/IP | Tránh tạo challenge không giới hạn qua tải lại |
| Reset | 32 byte random base64url; SHA-256 tokenHash; 15 phút; một lần; chỉ một token chưa dùng/user | Token URL có entropy cao, không lưu token gốc |
| Session | Cookie sid, rolling idle 30 phút; absolute 8 giờ kiểm tra server | Cookie mới không kéo dài vô hạn phiên đăng nhập |
| Cookie | HttpOnly, SameSite=Lax, Path=/, Secure ở production; không Domain | Giới hạn đọc cookie và phạm vi gửi |

## Luồng và ràng buộc

- Register kiểm tra rate IP → tiêu thụ CAPTCHA → validate → hash → transaction user/challenge. Bỏ qua `role` gửi lên. Đăng ký lại pending không đổi password. New/pending/active hợp lệ đều 303 `/activate`, cùng thông báo. Mọi nhánh hợp lệ trả chi phí hash Argon2id; có sàn phản hồi 1.200 ms, mail không chặn response. Đây không phải cam kết thời gian mạng hằng số.
- Activate và reset dùng transaction Serializable + `updateMany` có điều kiện; một request được quyền tiêu thụ. Retry xung đột P2034/P2002 hữu hạn. OTP so sánh timingSafeEqual; resend thay hash/hạn nhưng giữ attempts/lock. Sau khi khóa OTP hết 15 phút, cửa sổ thử được mở lại; mã hết hạn vẫn bị từ chối.
- Login kiểm tra khóa/rate trước CAPTCHA và trước password. Hash giả được chuẩn bị để email không tồn tại vẫn qua Argon2 verify. Đúng CAPTCHA không reset fail count. Chỉ active được regenerate sid; thành công xóa counter email, không xóa counter IP.
- Session store kế thừa Store, có get/set/destroy/touch và cột userId. Hết expiresAt coi như không tồn tại. Chỉ sid vừa regenerate ở login được tạo phiên authenticated mới; request cũ chỉ update row còn tồn tại, không thể hồi sinh sid sau logout. authVersion đối chiếu User.updatedAt ngăn request cũ tạo lại phiên sau đổi password.
- Reset giữ status pending/active hiện có, xóa tất cả session user và invalid token chưa dùng trong transaction; không tự đăng nhập. GET reset chỉ kiểm tra token, không cập nhật usedAt/password và đặt Referrer-Policy=no-referrer.
- CSRF synchronizer token trong session, timingSafeEqual và Origin đúng APP_ORIGIN khi có. Mọi form POST auth/CRUD/logout có `_csrf`; GET tìm kiếm không mang CSRF vào URL. requireLogin đứng trước CSRF của CRUD: khách chưa đăng nhập luôn 303 `/login`, kể cả POST không token.
- Ngoại lệ browser reset: `no-referrer` làm Chrome gửi Origin:null khi submit native form. Chỉ POST `/reset` có `Sec-Fetch-Site:same-origin` và token CSRF đúng được chấp nhận; null ở route khác, thiếu metadata/cross-site hoặc token sai vẫn403. Không bỏ CSRF/đổi no-referrer; đây là sai khác có chủ đích so với kiểm Origin tuyệt đối. Xem `docs/BUG_RESET_BROWSER_403.md`.
- Role chỉ có default viewer, chưa phân quyền. Không MFA/JWT/Block9.
- Dọn dữ liệu auth tạm khi khởi động và 15 phút/lần; không xóa challenge có lockedUntil còn hiệu lực. Timer không chạm bảng nhà hàng hoặc bảng session cũ.
- SMTP cấu hình dùng Nodemailer; thiếu host dùng Ethereal. Chỉ log preview URL riêng tư, không log nội dung mail/OTP/reset token/password/cookie/CAPTCHA. Preview URL cũng cần giữ kín.
- Production không fallback Ethereal khi thiếu SMTP_HOST, không log preview link. Development vẫn có preview đúng prompt; không công khai log đó. Gmail/App Password cấu hình qua `npm run mail:configure`; `mail:check` chỉ verify, không bảo đảm inbox delivery.
- Người dùng đã xác nhận đăng ký/CAPTCHA/OTP qua email thật/kích hoạt/login và vào list thành công. Không thu credential hoặc OTP vào repo. Lỗi SMTP535 trước đó là lịch sử, không phải trạng thái mới của luồng này. Reset/thông báo đổi password qua inbox ngoài chưa xác nhận. Mail diagnostics chỉ log mã/status cho phép và hint cố định, không raw SMTP reply/error.message.
- Resend: limiter public IP/email áp dụng cả email có/không tồn tại và trả429 khi hết quota. Backstop trên ActivationChallenge chỉ suppress mail, không làm lộ account qua status khi các window hai tầng lệch nhau. Register hợp lệ vẫn303 ở mọi nhánh như mục5.1 prompt; không coi đây là lỗi cần đổi riêng pending thành429.

## Route

Public: GET/POST `/register`, `/activate`, `/login`, `/forgot`, `/reset`; POST `/activate/resend`; GET `/forgot/sent`, `/captcha/new`; static assets. `/captcha/new` chỉ redirect về trang SSR để đổi mã, không JSON.

Protected: `/`, `/admin` và toàn bộ router `/dishes`, `/admin/dishes`, `/admin/chefs`, `/admin/ingredients`, mọi method; POST `/logout`. Không có trang giới thiệu public trong nền Block5.

## Quyết định và sai khác cần đọc

1. **GET không ghi dữ liệu nghiệp vụ:** GET không tạo/sửa/xóa nhà hàng, User, OTP activation hoặc password/reset-usedAt. GET auth phải cấp CAPTCHA và CSRF; session rolling/TTL, challenge và counter cấp CAPTCHA là metadata bảo mật lưu DB. Hiểu “mọi GET không đổi dữ liệu” tuyệt đối cả metadata sẽ xung đột với yêu cầu CAPTCHA SSR + DB sessions rolling; ngoại lệ metadata này được nêu rõ, không ẩn một thao tác ghi nghiệp vụ trong GET.
2. Schema có `@db.Uuid` để khớp năm bảng auth PostgreSQL hiện hữu, dùng UUID mới thay cuid không tương thích cột cũ. Runtime auth không có SQL thô và dùng Prisma Client. Khi chuyển provider cần migration/schema tương ứng, không thể dùng nguyên migration PostgreSQL cho mọi provider. Test harness có SQL DROP SCHEMA chỉ để dọn schema PostgreSQL ngẫu nhiên đã tự tạo, không thuộc runtime.
3. Dùng ba migration: baseline CRUD chỉ đánh dấu applied trên DB hiện hữu; baseline auth tiếp nhận bảng có sẵn; migration cuối chỉ tạo Session + index/FK. Không chạy lại CREATE bảng đã có, không đổi bảng `session` cũ. Migration tạo trùng ban đầu thất bại P3018 đã được đánh dấu rolled back trước khi tiếp nhận đúng baseline; không reset DB.
4. `auth:configure` là lệnh cấp cấu hình local rõ ràng: chỉ append khóa còn thiếu, sinh secret/password bằng crypto; không ghi đè giá trị cũ và không in credential. Ứng dụng vẫn từ chối khởi động nếu thiếu/secret dưới 32 ký tự. `seed:auth` không đổi tài khoản đã có, không gọi seed cũ.
5. Với forgot dùng PRG 303 `/forgot/sent`, nội dung chung cho email tồn tại/không tồn tại. Các lỗi auth validate nghiệp vụ là HTML 200 + data-error-code; rate 429, CSRF 403; không đổi status CRUD 400/404/500/303.
6. Bộ test offline chỉ thay lớp persistence, vẫn gọi login/Argon2/CSRF/store/guard thật; không coi nó là bằng chứng DB. Suite auth tích hợp dùng DB schema riêng và SMTP TCP thật cục bộ, không mock quyết định bảo mật. Browser phân trang đăng nhập bằng seed thật của database ứng dụng, chỉ POST login và GET danh sách.
7. Lượt tiếp tục sau83a2bc7 bổ sung A21: hai process Node thật dùng cùng schema riêng/secret cấu hình. Session và email fail counter được chia sẻ, logout/reset thu hồi cookie cũ xuyên process. Đây là HTTP local, gửi Origin cấu hình chung để mô phỏng hai backend; chưa phải nghiệm thu load balancer/TLS hoặc race xuyên instance. Bằng chứng ở `docs/evidence/auth-release-http/http-results.json`.
8. Harness không cho `--browser-only` chạy riêng thiếu `--browser`, tránh báo PASS0 không có browser. Mọi server con được theo dõi để dọn, lỗi browser/server không ngăn bước xóa schema test; migration thất bại vẫn được thử cleanup với tên schema ngẫu nhiên có kiểm tra định dạng. Không áp dụng thao tác dọn này lên schema nhà hàng.
