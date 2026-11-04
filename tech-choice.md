# Lựa chọn kỹ thuật Block8

| Vai trò | Chọn/giữ | Lý do và đánh đổi |
|---|---|---|
| Runtime/server | Giữ Node.js + Express 4 | Router/middleware hiện có; không dựng app mới |
| View | Giữ EJS | SSR, HTML form, PRG 303; hoạt động khi tắt JavaScript |
| DB/ORM | Giữ PostgreSQL + Prisma 5 | Giữ bảng/quan hệ CRUD và phân trang skip/take; auth dùng Client, transaction và conditional updates |
| Session | Thêm express-session + PrismaSessionStore tự viết | Bền vững, userId để thu hồi mọi phiên; phải kiểm tra TTL/race trong store, không dùng MemoryStore |
| Password | Thêm argon2, Argon2id | Băm chậm có memory cost; cần binary tương thích Node trên máy triển khai |
| CAPTCHA | Thêm svg-captcha | SVG nhúng SSR, đáp án chỉ ở DB; đổi mã bằng link tải lại, không cần JS/fetch |
| Mail | Thêm nodemailer | SMTP thật khi cấu hình, Ethereal khi chưa có SMTP; gửi tách response; SMTP ngoài mạng vẫn cần nghiệm thu deployment |
| Email validation | Thêm validator/isEmail | Tránh regex tự chế; normalize toàn bộ lowercase theo chính sách nhóm |
| CSRF | Node crypto + synchronizer token + Origin | Không thêm thư viện; token gắn DB session, mọi form POST; cần giữ đúng middleware order |
| Brute force | Helper RateLimit dùng Prisma | Bền vững qua restart và đổi cookie; transaction Serializable có retry hữu hạn, chi phí DB cao hơn memory |
| Config | Giữ dotenv | Secret chỉ ở .env, .env.example là placeholder; không log giá trị |
| Cookie parser | Không thêm | express-session tự đọc/kiểm tra signed cookie; tránh hai parser/secret không đồng nhất |
| Browser acceptance | Playwright ở thư mục công cụ tạm, Chrome có sẵn | Không thêm dependency/lockfile browser vào ứng dụng; profile riêng, ảnh che email/input; auth ghi chỉ trong schema fixture riêng, không ghi CRUD dữ liệu nhóm |

Mã auth không sử dụng SQL riêng PostgreSQL. Schema thực tế có cột UUID nên Prisma mapping giữ `@db.Uuid`; đổi DB cần đổi mapping/migration, không hứa migration PG chạy nguyên trên provider khác. SQL được Prisma sinh trong migration; SQL dọn schema chỉ thuộc test harness cô lập. Đây là sai khác cần biết khi đọc yêu cầu đa DB.

Tài liệu chính thức tham khảo: [express-session](https://github.com/expressjs/session), [node-argon2](https://github.com/ranisalt/node-argon2), [Nodemailer testing](https://nodemailer.com/smtp/testing/). Giữ Prisma 5/API `$transaction` của project; không nâng ORM theo tài liệu phiên bản mới.
