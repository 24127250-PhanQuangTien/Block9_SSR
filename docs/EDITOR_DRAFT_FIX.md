# Editor sửa món nháp của mình

## Lỗi và thay đổi

Editor có `chefId` trùng với món `draft` thấy nút Sửa nhưng GET mở form và PATCH lưu đều nhận 403. `requirePermission('dish:update')` gọi hàm kiểm tra cả RBAC và ABAC khi middleware chưa tải món ăn, nên kiểm tra quyền sở hữu luôn thất bại.

Middleware nay chỉ kiểm tra quyền theo role bằng `hasPermission`. Handler GET tiếp tục tải món từ database và gọi `authorize`; handler PATCH tiếp tục đọc lại món trong transaction, kiểm tra ABAC và cập nhật với điều kiện `id`, `chefId`, `status: draft` đối với Editor. `can` trong template vẫn kiểm tra đầy đủ điều kiện để hiển thị nút.

Không thay đổi điều kiện sở hữu/trạng thái, CSRF hoặc cách xác thực tài khoản. Viewer không được sửa; Editor không được sửa món của đầu bếp khác, món đã xuất bản hoặc xóa món; Admin vẫn sửa được món của mọi đầu bếp.

## Kiểm chứng hồi quy

```powershell
npm run test:authorization
```

Kiểm thử dùng Express, EJS, đăng nhập, session và CSRF thật với database giả trong bộ nhớ; không tải `.env`, không sửa database ứng dụng.

- Editor mở và lưu món nháp thuộc mình; role/chefId/status giả mạo không tăng quyền.
- GET và PATCH bị chặn khi Viewer, Editor khác đầu bếp, món published hoặc tài khoản không có chefId; dữ liệu không đổi.
- Quyền, chủ sở hữu và trạng thái được kiểm tra lại khi PATCH sau khi đã mở form.
- PATCH trực tiếp không mở form tuân theo cùng quy tắc.
- Admin vẫn sửa được món published của đầu bếp khác.
- Editor vẫn không được xóa và yêu cầu thiếu CSRF bị chặn.

Trước bản sửa, kiểm thử tái hiện lỗi 403 khi Editor mở món nháp của mình. Sau bản sửa, toàn bộ các trường hợp trên đạt.
