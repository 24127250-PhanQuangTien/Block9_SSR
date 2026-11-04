# Gửi OTP/reset tới inbox thật

Trạng thái hiện tại: người dùng đã xác nhận nhận OTP qua email thật, kích hoạt và đăng nhập thành công. Không thu lại email/OTP hoặc credential vào repo; chưa xác nhận inbox reset/thông báo đổi mật khẩu ngoài SMTP local. Phần EAUTH535 phía dưới là hướng dẫn xử lý lỗi đã gặp trước đó, không phải kết luận SMTP hiện vẫn lỗi.

Nếu không có `SMTP_HOST`, ứng dụng ở development dùng **Ethereal**: thư chỉ vào hộp thư thử, không tới Gmail/Outlook người nhận. Link preview chỉ phục vụ dev cục bộ, không chụp/chia sẻ hoặc đưa vào Git. Production bắt buộc SMTP, không fallback Ethereal.

Với đồ án chạy local, dùng tài khoản Gmail riêng của nhóm và mật khẩu ứng dụng. Không dùng mật khẩu Gmail chính. Theo [Google](https://support.google.com/accounts/answer/185833/sign-in-with-app-passwords), phải bật xác minh hai bước; tài khoản tổ chức hoặc chính sách bảo mật có thể không cho tạo mật khẩu ứng dụng. Nếu không có tùy chọn đó, dùng SMTP của nhà cung cấp được phép, không tắt bảo mật tài khoản.

## Gmail

1. Chủ tài khoản tự bật xác minh hai bước và tạo mật khẩu ứng dụng tại [Google App Passwords](https://myaccount.google.com/apppasswords), đặt tên ví dụ `Restaurant Block8`.
2. Mở PowerShell riêng tại **Web-Block5** (thư mục có package.json), chạy:

   ```powershell
   npm.cmd run mail:configure
   npm.cmd run mail:check
   ```

   Wizard đặt host `smtp.gmail.com`, port587; hỏi email gửi và mật khẩu ứng dụng bằng input không echo, ghi riêng các khóa SMTP vào `.env`, giữ các cấu hình DB/session đang có. Không truyền credential trên dòng lệnh, trong ảnh, issue hoặc chat. Không chạy wizard qua terminal được chia sẻ/ghi hình. `mail:check` chỉ kiểm tra kết nối/xác thực, không gửi thư và không in host/user/password.
3. Khi `mail:check` PASS, dừng server đang chạy bằng Ctrl+C và chạy lại `npm.cmd start`/`npm.cmd run dev` để dotenv nạp cấu hình mới. Server đang chạy không tự đổi SMTP chỉ vì file `.env` được sửa.
4. Đăng ký bằng một email nhận mà bạn kiểm soát, đọc OTP trong inbox/spam. Nếu tài khoản đã active thì đăng ký lại **không gửi OTP** theo hợp đồng; dùng tài khoản mới hoặc forgot để thử nhận reset. Pending có thể dùng resend sau60 giây; không reset/seed/xóa DB để thử lại.
5. Không bấm resend liên tục: quota1/60s,5/giờ/email, còn quotaIP. Kiểm tra cả Spam/Quảng cáo. Sau reset/login, mã cũ không dùng lại được.

Gmail SMTP tham khảo chính thức: [Nodemailer — Using Gmail](https://nodemailer.com/usage/using-gmail/). Tài khoản gửi phải hợp lệ với SMTP_FROM; wizard đặt FROM cùng SMTP_USER. Không cần tài khoản Gmail của người nhận để cấu hình server.

## SMTP khác

Chạy `npm.cmd run mail:configure -- --smtp`, nhập host/port465 hoặc587, email gửi và mật khẩu do nhà cung cấp cấp. Không dùng credential minh họa trong README. Với thiết lập OAuth/API đặc thù, cần cấu hình theo nhà cung cấp thay vì giả định mật khẩu SMTP dùng được.

## Ý nghĩa kết quả

### Nếu `mail:check` trả `EAUTH` / `535`

Chẩn đoán lịch sử trước khi người dùng xác nhận thành công: đã kết nối đến SMTP, nhưng Gmail từ chối bước xác thực (`category: authentication`, `code: EAUTH`, `responseCode: 535`), chưa gửi thư. Nếu gặp lại lỗi này, đây là lỗi xác thực trước giao inbox/spam. Wizard báo lưu thành công chỉ có nghĩa dữ liệu nhập đúng định dạng và đã ghi file, không chứng minh Google chấp nhận tài khoản/mật khẩu. Password dài16 ký tự cũng chưa chứng minh là App Password hợp lệ.

1. Đăng nhập **đúng tài khoản Gmail dùng làm người gửi**, bật xác minh hai bước, tạo mật khẩu ứng dụng mới tại [Google App Passwords](https://myaccount.google.com/apppasswords). Không dùng mật khẩu Gmail thường, mã OTP xác minh hai bước hoặc mật khẩu ứng dụng của tài khoản khác. Google thu hồi App Password khi đổi mật khẩu tài khoản; xem [hướng dẫn chính thức](https://support.google.com/accounts/answer/185833).
2. Chạy `npm.cmd run mail:configure`, nhập lại đầy đủ email người gửi và mật khẩu ứng dụng mới trong terminal riêng. Bấm Enter trống sẽ **giữ giá trị cũ**, nên không sửa được credential đã bị từ chối. Không gửi mật khẩu hoặc `.env` vào chat.
3. Chạy `npm.cmd run mail:check`. Chỉ khi PASS mới dừng server bằng Ctrl+C và chạy lại `npm.cmd start`. Nếu vẫn535 với App Password mới, kiểm tra cảnh báo bảo mật Google và chính sách tài khoản tổ chức; không tắt bảo mật tài khoản/TLS.
4. Với tài khoản ứng dụng pending, chờ đủ60 giây rồi gửi lại OTP. Tài khoản đã active không nhận OTP khi đăng ký lại; forgot là luồng khác. Không seed/xóa/sửa DB để ép gửi mail.

`mail:check` và log gửi thư hiện chỉ in category/code/responseCode từ danh sách cho phép cùng hướng dẫn cố định; không in `error.message`, SMTP reply, email, password, OTP hoặc token. `category: connection` gợi ý mạng/DNS/firewall; `category: tls` gợi ý xác minh TLS. Không lấy lỗi EAUTH535 để kết luận cổng mạng đang bị chặn. Các bài `npm test` offline không xác thực credential SMTP thật.

- `mail:check PASS`: kết nối SMTP/xác thực thành công; **chưa chứng minh giao thư vào inbox**.
- Suite auth tích hợp dùng SMTP TCP nội bộ: chứng minh ứng dụng gửi đúng OTP/reset, không chứng minh nhà cung cấp ngoài hoạt động.
- Chỉ ghi “inbox thật đã xác minh” sau khi người nhận thực sự thấy thư. Báo cáo/ảnh chỉ ghi loại thư, thời gian, kết quả đã che; không giữ OTP/link/token/previewURL.
- Nếu lỗi, script chỉ trả trạng thái/mã lỗi an toàn; không đưa nội dung `.env`, SMTP reply có credential hoặc mail gốc vào báo cáo.
