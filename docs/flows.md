# Sơ đồ tham khảo luồng SSR Block8

Các sơ đồ là bản tham khảo đúng luồng mã để nhóm tự vẽ lại và giải thích theo slide62–63; không tuyên bố bản agent vẽ là sản phẩm nhóm tự vẽ. Tất cả màn hình là EJS, mọi ghi nghiệp vụ từ người dùng là POST có CSRF và kiểm Origin/Fetch Metadata như auth-policy.

```mermaid
flowchart TD
 A[GET register: CAPTCHA + CSRF] --> B[POST register]
 B --> C{IP quota?}
 C -- hết --> R[HTML 429]
 C -- còn --> D{Tiêu thụ CAPTCHA đúng phiên/purpose?}
 D -- sai --> E[HTML 200 CAPTCHA_FAILED, mã mới, giữ email, bỏ password]
 D -- đúng --> F{Email/password hợp lệ?}
 F -- sai --> G[HTML 200 VALIDATION_FAILED]
 F -- đúng --> H[Argon2id, normalize email]
 H --> I{Tài khoản}
 I -- mới --> J[Transaction: pending viewer + OTP hash]
 I -- pending --> K[Giữ password; resend nếu còn quota]
 I -- active --> L[Không tạo, không gửi OTP]
 J --> M[Mail async]
 K --> Q{Có phát OTP mới?}
 Q -- có --> M
 Q -- không --> N
 L --> N[303 activate, cùng thông báo chung]
 M --> N
```

```mermaid
sequenceDiagram
 participant B as Browser
 participant E as Express session middleware
 participant S as PrismaSessionStore
 participant D as PostgreSQL
 B->>E: Cookie sid có chữ ký
 E->>S: get(sid)
 S->>D: Session.findUnique
 D-->>S: data JSON và expiresAt
 S-->>E: Session còn hạn
 E->>D: User active + authVersion + idle/absolute
 E-->>B: EJS CRUD/phân trang
 Note over E,D: Restart không xóa Session/RateLimit trong DB
 B->>E: POST logout + CSRF
 E->>S: destroy(sid)
 S->>D: deleteMany sid
 E-->>B: Clear cookie +303 login
```

Vấn đáp ngắn: cookie chỉ giữ SID có chữ ký, DB mới giữ session; xóa cookie không tự xóa row DB. CAPTCHA tăng chi phí bot nhưng không thay counter/khóa. Pending bị chặn trước regenerate ở login và ở guard. Reset token chỉ lưu hash; POST reset xóa mọi session user. GET reset không claim token; POST native với no-referrer dùng ngoại lệ Origin:null + same-origin Fetch Metadata + CSRF. Public chỉ các trang auth/static; toàn CRUD phải login. Chi tiết bằng chứng tại VERIFY và HANDOFF.

```mermaid
flowchart TD
 A[POST activate / email + OTP] --> B{IP/email quota và lock?}
 B -- vượt --> C[429 RATE_LIMITED]
 B -- còn --> D{Pending + chưa dùng + còn hạn + hash đúng?}
 D -- sai --> E[Tăng attempts; khóa sau 5; INVALID_OTP hoặc 429]
 D -- đúng --> F[Transaction: conditional claim usedAt, user active + verifiedAt]
 F --> G[303 login; không tự đăng nhập]
 H[POST resend] --> I{60s / 5 mỗi giờ?}
 I -- vượt --> C
 I -- còn --> J[Thay hash và hạn; không reset attempts/lock; mail async]
 J --> K[303 activate, thông báo chung]
```

```mermaid
flowchart TD
 A[POST login] --> B{Lock email / IP quota?}
 B -- bị chặn --> C[429]
 B -- còn --> D{Fail email từ 3?}
 D -- có --> E{CAPTCHA một lần đúng?}
 E -- sai --> F[200 CAPTCHA_FAILED, không verify password]
 E -- đúng --> G[Argon2 verify]
 D -- chưa --> G
 G --> H{Password đúng?}
 H -- sai --> I[Tăng email fail; IP đã đếm request; từ 10 khóa 5 phút]
 H -- đúng --> J{Active?}
 J -- pending --> K[200 cần kích hoạt; không session authenticated]
 J -- active --> L[Regenerate sid; userId + createdAt; DB store]
 L --> M[Xóa counter email, giữ IP; 303 dishes]
 N[POST logout + CSRF] --> O[Destroy session DB]
 O --> P[Clear sid; 303 login]
```

```mermaid
flowchart TD
 A[POST forgot] --> B{IP/email quota?}
 B -- vượt --> C[429]
 B -- còn --> D[Account có thì vô hiệu token cũ và tạo token hash mới]
 D --> E[Mail async với APP_BASE_URL, không Host header]
 E --> F[303 forgot/sent, cùng nội dung cho mọi email]
 G[GET reset token] --> H{Hash còn hạn, chưa dùng?}
 H -- sai --> I[HTML link không dùng được]
 H -- đúng --> J[Form POST; no-referrer; không tiêu thụ token]
 J --> K[POST reset + CSRF + password policy]
 K --> L[Transaction conditional usedAt + hash mới + thu hồi token/session user]
 L --> M[Mail báo đổi password; 303 login; không tự đăng nhập]
```
