# Lỗi agent: reset password qua form Chrome bị403

## Lỗi thực tế đã quan sát trước sửa

Mã CSRF do agent triển khai chỉ chấp nhận Origin đúng APP_ORIGIN. Trang reset đồng thời bắt buộc `Referrer-Policy: no-referrer`. Chrome gửi **Origin:null** khi submit form HTML từ trang đó, kể cả POST cùng origin; middleware cũ từ chối403 trước khi kiểm tra reset token. Người dùng không đặt lại được password qua form SSR.

Đã quan sát bằng Chrome thật, DB PostgreSQL/schema test riêng, token/CSRF hợp lệ. Đây không phải lỗi cố ý tạo để đáp ứng bài tập. [Ảnh UI trước sửa](evidence/auth-reset-before/reset-403.png), [kết quả browser trước sửa](evidence/auth-reset-before/browser-results.json), [HTTP và trạng thái suite trước sửa](evidence/auth-reset-before/http-results.json). Các ảnh/token đã che; không dùng dữ liệu nhà hàng production.

Trong lượt trước sửa,20 nhóm HTTP/assertion đã hoàn tất nhưng bước native browser dừng ở reset403. Client HTTP của test tự gửi `Origin=base`, nên không tái hiện đặc điểm referrer policy của browser. Vì vậy HTTP pass không có nghĩa form browser đã pass.

## Cách tái hiện an toàn

1. Trên schema test, tạo account active, login, gửi forgot tới SMTP local.
2. Mở link reset còn hạn bằng Chrome; không thay header no-referrer, không sử dụng fetch/JS để gửi form.
3. Điền password mới hợp lệ và submit native form. Trước sửa: POSTreset403; password không đổi. URL/token/password/cookie không xuất hiện trong ảnh/report.
4. Repro tách biệt không DB: một HTTP server tạm trả no-referrer và form POSTreset, Chrome gửi `{origin:"null",fetchSite:"same-origin"}`. Đã thực thi repro này, không chỉ suy từ tài liệu. Xem [MDN Referrer-Policy — ảnh hưởng lên Origin](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy#effect_on_the_origin_header).

## Sửa và ràng buộc bảo mật

`src/middleware/csrf.js`: cho phép Origin:null **chỉ** với POST `/reset` + `Sec-Fetch-Site:same-origin` + synchronizer token đúng session. Không mở cho mọi Origin:null, không bỏ CSRF, không đổi no-referrer và không thêm fetch. Origin khác thật, null thiếu metadata/cross-site/same-site, null ở login hoặc token sai vẫn403.

Đây là ngoại lệ có chủ đích cho câu “Origin nếu có phải trùng” trong prompt: Fetch Metadata thay kiểm tra Origin cho đúng trường hợp browser bảo vệ quyền riêng tư. Công bố tại auth-policy; không che giấu sai khác.

## Bằng chứng sau sửa

- `tests/auth.security.test.js`: test trực tiếp middleware thật với trường hợp hợp lệ và6 biến thể bị từ chối; bộ offline22/22 đã chạy đạt.
- `tests/auth.browser.js`: POSTreset native ở1440/375px, JSon/off; phải303login, không auto-login, toàn bộ session user bị thu hồi và token đã dùng không dùng lại được.
- Kết quả cuối đọc tại [browser-results](evidence/auth-browser-final/browser-results.json); ảnh dự kiến `auth-*-reset-success-login.png`, còn ảnh used token `auth-*-reset-used.png`. **Chỉ coi sau sửa đạt khi JSON có statusPASS và suite cleanup thành công**, không dựa tên file/ảnh có sẵn.

Hồ sơ này đáp ứng phần mô tả lỗi/tái hiện/sửa bằng chứng của slide63. Các bảng Network/Cookies/DB trong evidence là quan sát đã che từ API kiểm thử, không giả làm ảnh giao diện DevTools.
