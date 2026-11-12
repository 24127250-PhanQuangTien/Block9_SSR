# Restaurant SSR — Block 5, 8 và 9

Ứng dụng quản lý nhà hàng render giao diện ở server, xây dựng bằng Node.js, Express 4, EJS, Prisma 5 và PostgreSQL. Dự án phát triển từ CRUD/phân trang SSR (Block 5), bổ sung xác thực tài khoản (Block 8), rồi phân quyền RBAC/ABAC và MFA (Block 9). Các thao tác chính dùng form HTML và redirect; không cần SPA hay JavaScript phía client để sử dụng các luồng này.

## Chức năng

- Thực đơn công khai: xem và phân trang món đã xuất bản tại `/dishes`.
- Quản trị SSR: quản lý món ăn, đầu bếp và nguyên liệu tại `/admin`.
- Tài khoản: đăng ký với CAPTCHA, kích hoạt bằng OTP email, đăng nhập, đăng xuất, quên và đặt lại mật khẩu.
- Bảo mật phiên: session lưu trong PostgreSQL; form ghi được bảo vệ CSRF; có giới hạn thử và cookie bảo mật.
- RBAC: `viewer` chỉ xem; `editor` được tạo và cập nhật; `admin` được tạo, cập nhật và xóa.
- ABAC: editor chỉ cập nhật món `draft` được gán cho đầu bếp của mình; admin có thể cập nhật mọi món.
- MFA tùy chọn cho tài khoản: TOTP qua ứng dụng xác thực, mã khôi phục dùng một lần, bật/tắt và cấu hình lại từ trang bảo mật tài khoản.

Người đăng ký mới luôn nhận role `viewer`; role và `chefId` không được lấy từ form đăng ký. Tài khoản đã bật MFA phải xác minh yếu tố thứ hai trước khi nhận session đăng nhập đầy đủ.

## Yêu cầu

- Node.js tương thích với các dependency trong `package-lock.json`.
- PostgreSQL có thể truy cập từ máy chạy ứng dụng.
- npm.

## Cài đặt và khởi chạy

```sh
npm ci
cp .env.example .env
```

Trên Windows PowerShell, dùng `Copy-Item .env.example .env` thay cho lệnh `cp`. Chỉnh `.env` cục bộ với thông tin database và URL phù hợp (`APP_BASE_URL`, `APP_ORIGIN`); không commit hoặc chia sẻ file này.

Tiếp theo, sinh các khóa auth còn thiếu, tạo Prisma Client và áp dụng migration:

```sh
npm run auth:configure
npx prisma generate
npm run db:auth
npm start
```

Mở URL theo `APP_BASE_URL` (mặc định `http://localhost:3000`). Trong lúc phát triển có thể dùng `npm run dev` để tự khởi động lại server khi source thay đổi. `TRUST_PROXY` chỉ nên cấu hình theo đúng proxy tin cậy của deployment.

`npm run db:auth` triển khai migration PostgreSQL. Sao lưu database và kiểm tra môi trường đích trước khi chạy migration. Không dùng `db:push`, reset hoặc seed nhà hàng như cách triển khai auth trên database có dữ liệu cần giữ.

### Tài khoản thử nghiệm RBAC

Có thể tạo bốn tài khoản fixture cho môi trường development/test bằng cách điền các biến `SEED_VIEWER_*`, `SEED_EDITOR_A_*`, `SEED_EDITOR_B_*`, `SEED_ADMIN_*` trong `.env`, rồi chạy:

```sh
npm run seed:auth
```

Lệnh này tạo/cập nhật bốn tài khoản fixture và bảo đảm có đầu bếp `Bếp A`/`Bếp B`. Nếu email fixture đã tồn tại, thuộc tính tài khoản tương ứng sẽ được cập nhật theo cấu hình. Chỉ chạy trên database phù hợp; không dùng tài khoản production làm fixture. Script không in credential.

## Email

Thiết lập SMTP từ terminal riêng:

```sh
npm run mail:configure
npm run mail:check
```

`mail:check` kiểm tra kết nối/xác thực SMTP, không gửi email và không chứng minh thư đã tới inbox. Thiếu SMTP trong development, ứng dụng dùng Ethereal; preview chỉ dùng để kiểm tra cục bộ và cần được giữ riêng. Production yêu cầu SMTP, không dùng fallback Ethereal. Hướng dẫn chi tiết ở [docs/MAIL_SETUP.md](docs/MAIL_SETUP.md).

## Phân trang

Hai trang danh sách món `/dishes` và `/admin/dishes` dùng query string, form GET và liên kết HTML, hoạt động khi tắt JavaScript. Mặc định là trang 1, 10 món/trang; UI cung cấp 10/20/50, backend chấp nhận page size từ 1 đến 100 và kiểm tra input trước khi truy vấn. Trang công khai tìm theo tên; trang quản trị hỗ trợ tìm kiếm, lọc và sắp xếp. Ví dụ:

```text
/dishes?q=pho&pageSize=20&page=2
/admin/dishes?status=available&sort=newest&pageSize=10&page=2
```

## Kiểm thử

```sh
npm test
```

Các script chuyên biệt được khai báo trong `package.json`:

```sh
npm run test:db
npm run test:auth
npm run test:browser
npm run test:pagination:real
```

Một số kiểm thử cần PostgreSQL, cấu hình môi trường hoặc browser đã cài riêng. Đọc hướng dẫn trong từng test và dùng database test riêng; không chạy fixture/kiểm thử lên dữ liệu nhà hàng cần giữ. `npm run seed` là seed dữ liệu ứng dụng cũ, không phải seed auth.

## Tài liệu

- [Lựa chọn kỹ thuật Block 9](tech-choice.md)
- [Chính sách auth và RBAC/MFA](docs/auth-policy.md)
- [Thiết lập email](docs/MAIL_SETUP.md)
- [Các luồng ứng dụng](docs/flows.md)
- [Lịch sử thay đổi](docs/CHANGES.md)
- [Kết quả nghiệm thu và giới hạn đã ghi nhận](docs/BLOCK8_FINAL_ACCEPTANCE.md)
- [Kiểm chứng authentication](docs/VERIFY.md)
- [Migration PostgreSQL](prisma/migrations/)
