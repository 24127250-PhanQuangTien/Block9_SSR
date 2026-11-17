# Chuyển UI từ Block9 sang Block9_SSR

Nguồn tham chiếu: `Block9/web`. Giao diện React được chuyển sang EJS và JavaScript thuần.

- Sao chép stylesheet gốc, ảnh hero, ảnh món ăn và font Noto Sans kèm giấy phép.
- Chuyển hero, thẻ món ăn, navbar desktop/mobile, menu tài khoản, footer và giao diện các trang xác thực.
- Dùng chung stylesheet cho trang danh sách, chi tiết, thêm/sửa và xác nhận xóa trong quản trị.
- Thanh tìm kiếm và bộ lọc tiếp tục dùng form GET; lưu/xóa/đăng xuất tiếp tục dùng form SSR và CSRF. Các hành động tiếp tục chịu kiểm tra quyền của server.
- Giữ phân trang SSR. Các chế độ tải thêm/cuộn vô hạn và những bộ lọc chỉ có ở API React không được thêm thành nút giả trong bản EJS.
- `spa.css` và `style.css` giữ nội dung của bản tham chiếu; `ssr.css` giữ CSS auth/phân trang đặc thù SSR; `ui-adapter.css` xử lý bố cục EJS và responsive, gồm xuống dòng nhãn để tránh cắt nút chi tiết.

## Kiểm chứng

- 61 kiểm tra Chrome headless với dữ liệu giả: 20 màn hình ở 375, 844 và 1440px; thêm kiểm tra phân trang và điều hướng khi tắt JavaScript. Kiểm tra tràn ngang, lỗi JavaScript, mở/đóng menu bằng bàn phím và render HTTP.
- 12 kiểm tra HTTP, validation và bảo mật đạt.
- Ảnh chụp và báo cáo: `docs/evidence/ui-copy/`.
- Bộ test phân trang cũ chưa đạt: fixture chưa có `status: published`, nên `/dishes?page=2` trả 303 thay vì 200. Test cũ cũng còn dùng trạng thái available/unavailable thay vì draft/published. Không chỉnh logic phân quyền hoặc dữ liệu fixture cũ trong lần chuyển UI này.

Chạy kiểm tra UI bằng Playwright được cài riêng:

```powershell
$env:PLAYWRIGHT_MODULE = '<đường dẫn package playwright>'
node tests/ui-copy.browser.cjs
```

Kiểm tra môi trường thật theo `.env`:

```powershell
node tests/ui-copy-real.cjs
```

Đạt 6 trường hợp với database thật: thực đơn trang 1, trang 2 và trang đăng nhập, ở 375 và 1440px. Báo cáo ở `docs/evidence/ui-copy/real-results.json`. Môi trường chạy cần đầy đủ schema SSR, bao gồm bảng `Session`. Việc sửa schema database được xử lý riêng với thay đổi UI.
