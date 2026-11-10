# Lựa chọn kỹ thuật Block9

| Vai trò | Chọn/giữ | Lý do và đánh đổi |
|---|---|---|
| Runtime/server | Giữ Node.js + Express 4 | Tái sử dụng SSR router/middleware Block 8; không dựng app mới. |
| View | Giữ EJS | Form SSR, PRG 303, hoạt động khi tắt JavaScript. |
| DB/ORM | Giữ PostgreSQL + Prisma 5 | Tái sử dụng transaction, conditional update và session store. Thêm cột RBAC/MFA và bảng RecoveryCode. |
| Session | Giữ express-session + PrismaSessionStore tự viết | Session đầy đủ vẫn là userId trong DB. MFA pending chỉ lưu mfaPending, không đi qua requireLogin. |
| Password | Giữ argon2 Argon2id | Không thay đổi cơ chế băm/kiểm tra password của Block 8. |
| CAPTCHA | Giữ svg-captcha | Không ảnh hưởng login flow hiện có; MFA xảy ra sau password/CAPTCHA/rate limit. |
| Mail | Giữ nodemailer | Activation/reset vẫn không tạo session; MFA không gửi secret/OTP qua mail. |
| Email validation | Giữ validator/isEmail | Không thay đổi chính sách normalize email. |
| CSRF | Giữ Node crypto synchronizer token + Origin | Tất cả POST MFA/security đều đi qua middleware CSRF; pending session cũng có token. |
| Brute force | Giữ helper RateLimit dùng Prisma | MFA giới hạn 5 lần/15 phút theo user, khóa tạm 15 phút; đổi lại là thêm truy vấn/ghi DB. |
| Config | Giữ dotenv | MFA_ENCRYPTION_KEY là base64 đúng 32 bytes, chỉ nằm trong .env; .env.example chỉ có placeholder. |
| Cookie parser | Không thêm | express-session đã xử lý cookie sid; tránh hai cơ chế cookie. |
| Phân quyền | Module src/config/authorization.js tự viết | Một bảng RBAC duy nhất và hàm ABAC tập trung; không thêm CASL/policy engine. Role/chefId đọc lại từ DB mỗi request. |
| TOTP | otplib 12.0.1, authenticator | Giữ API 12.x theo prompt; RFC 6238, 30 giây, 6 chữ số, SHA-1, window: 1. |
| QR | qrcode 1.5.4, toString({ type: svg }) | QR render server-side dưới dạng SVG inline, không cần JS/CSP img-src. |
| Mã hóa mfaSecret | Node crypto, AES-256-GCM | Secret phải giải mã lại nên không thể hash một chiều. Mỗi lần mã hóa dùng IV ngẫu nhiên 12 byte; lưu iv.tag.ciphertext. |
| Hash recovery code | Node crypto SHA-256 + randomBytes qua helper random | Mỗi code có entropy 80 bit, DB chỉ lưu hash và usedAt; mã gốc chỉ hiển thị một lần. |
| Chống dùng lại mã | mfaLastStep + conditional update | TOTP step đã dùng bị từ chối; cập nhật nguyên tử với điều kiện step cũ để chống hai request đồng thời. Recovery code dùng usedAt IS NULL trong updateMany. |
| Browser acceptance | Playwright ở thư mục công cụ tạm | Không thêm browser dependency/lockfile vào app; fixture auth tách khỏi dữ liệu CRUD. |

Các thay đổi thực tế của Block9:

- RBAC: viewer chỉ read; editor thêm create/update; admin thêm delete.
- ABAC: editor chỉ sửa món draft có chefId trùng user.chefId; admin được sửa mọi món.
- Món cũ được backfill published trong migration; menu công khai chỉ hiển thị published. Seed auth chỉ bảo đảm Bếp A/B và tài khoản RBAC, không cập nhật/xóa/gán lại món hoặc đầu bếp đã có và không tạo món mẫu trong database thật.
- Tài khoản đăng ký mới luôn là viewer, không nhận role/chefId từ form.
- MFA chỉ bắt buộc với tài khoản đã bật MFA; sau password đúng, session đầy đủ chưa được cấp cho đến khi TOTP/recovery code hợp lệ.
- MFA pending hết hạn sau 5 phút; giới hạn thử 5 lần trong 15 phút và khóa tạm 15 phút. Đây là lựa chọn vận hành của nhóm.
- Thiết lập, tắt, đổi thiết bị và tạo lại recovery code đều là POST; các thao tác sau khi MFA đã bật yêu cầu password + TOTP/recovery code. Sau các cập nhật MFA, session authVersion được lưu lại theo updatedAt mới để không làm mất phiên hợp lệ.
- JWT, /api, CSR, passkey/WebAuthn, social login, ACL/ReBAC và policy engine không thuộc Bài 2.

Tài liệu tham khảo:

- [otplib](https://www.npmjs.com/package/otplib)
- [qrcode](https://www.npmjs.com/package/qrcode)
- [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238)
- [OWASP Multifactor Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html)
