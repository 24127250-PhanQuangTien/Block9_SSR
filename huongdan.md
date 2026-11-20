# Hướng dẫn demo MFA và DevTools trên macOS

Tài liệu này dành cho phần thuyết trình chức năng bật MFA bằng ứng dụng Authenticator, sau đó yêu cầu TOTP khi đăng nhập. Nên dùng Chrome để có cả tab **Network** và **Application**; Safari có các chức năng tương đương nhưng đặt tên khác.

## 1. Chuẩn bị trước khi demo

1. Dùng một tài khoản demo riêng, không dùng tài khoản cá nhân hoặc production. Đảm bảo tài khoản đang ở trạng thái đăng nhập và có quyền mở trang bảo mật tài khoản.
2. Chạy ứng dụng theo hướng dẫn trong [README.md](README.md), thường là `npm run dev`, rồi mở đúng URL của ứng dụng, ví dụ `http://localhost:3000`.
3. Cài một ứng dụng Authenticator trên điện thoại. Chuẩn bị sẵn để quét QR, nhưng chỉ quét khi đang demo bật MFA.
4. Đóng các tab/cửa sổ không liên quan và tắt chia sẻ màn hình trước khi nhập mật khẩu, TOTP hoặc mã khôi phục.
5. Nếu tài khoản đã bật MFA, cần có ứng dụng Authenticator hoặc một mã khôi phục còn dùng được để đăng nhập. Không xóa tài khoản để “reset” MFA trên database đang dùng.

> **Cảnh báo thông tin nhạy cảm:** Network có thể hiển thị mật khẩu và mã TOTP trong request body. Response của trang thiết lập MFA còn chứa QR và secret dùng để tạo mã. Tab Application có thể hiển thị giá trị cookie. Không chiếu, chụp, xuất HAR hoặc gửi các giá trị này. Dùng tài khoản demo và chỉ trình bày URL, method, status, redirect cùng các thuộc tính cookie đã che giá trị.

## 2. Mở DevTools trên MacBook

### Chrome (khuyến nghị)

- Mở DevTools: nhấn **⌥ Option + ⌘ Command + I**.
- Hoặc vào menu **View → Developer → Developer Tools**.
- Chọn **Network** để xem request/response.
- Chọn **Application → Storage → Cookies → origin của ứng dụng** để xem cookie.

Trong Network, bật **Preserve log** để giữ các redirect sau khi trang chuyển hướng. Có thể bật **Disable cache** trong lúc demo. Chọn **All** hoặc **Doc** để thấy các form gửi HTML; ứng dụng render SSR nên request thường không xuất hiện trong bộ lọc **Fetch/XHR**. Xóa danh sách request cũ trước khi demo bằng nút Clear.

### Safari (nếu dùng Safari)

1. Mở **Safari → Settings → Advanced** và bật **Show features for web developers**. Ở phiên bản Safari cũ, tùy chọn có thể tên là **Show Develop menu in menu bar**.
2. Chọn **Develop → Show Web Inspector** hoặc nhấn **⌥ Option + ⌘ Command + I**.
3. Dùng tab **Network** để xem request.
4. Dùng tab **Storage** để xem Cookies/Local Storage. Tên tab và cách trình bày có thể khác Chrome.

Nếu cần trình bày cụ thể tab **Application**, hãy dùng Chrome.

## 3. Kịch bản demo đề xuất

### A. Bật MFA

1. Đăng nhập bằng tài khoản demo chưa bật MFA.
2. Mở trang **Bảo mật tài khoản** và chọn thiết lập/bật MFA.
3. Trang hiển thị QR; quét bằng Authenticator. Secret nhập thủ công cũng được hiển thị để hỗ trợ thiết bị không quét được QR.
4. Nhập mã 6 số đang hiện trên ứng dụng Authenticator và xác nhận.
5. Trang hiển thị 10 mã khôi phục. Lưu chúng an toàn và chỉ một lần; không đưa mã thật lên màn chiếu.
6. Trong Network, có thể chỉ ra:
   - `GET /account/security/setup` trả trang thiết lập.
   - `POST /account/security/setup/confirm` gửi xác nhận; khi đúng, server trả trang mã khôi phục.
   - Request là **Document/form**, không phải API Fetch/XHR.

**Không mở hoặc chiếu Response/Preview của `GET /account/security/setup`:** nội dung trang có QR và secret. Không mở Payload của request xác nhận vì có TOTP.

### B. Chứng minh MFA được yêu cầu khi đăng nhập

1. Đăng xuất qua giao diện.
2. Đăng nhập lại bằng cùng tài khoản demo.
3. Network sẽ cho thấy luồng chính:
   - `POST /login` → **303** chuyển hướng tới `/mfa`.
   - `GET /mfa` → trang nhập mã xác minh.
   - `POST /mfa` với TOTP hợp lệ → **303** chuyển hướng tới `/dishes`.
4. Chỉ vào trang quản trị sau khi đã hoàn tất bước MFA.

Ở màn hình nhập mã, có thể giải thích rằng sau bước mật khẩu ứng dụng mới lưu trạng thái xác minh tạm thời; trạng thái này **chưa phải session đăng nhập đầy đủ**. Nếu thử mở `/admin` khi đang ở bước nhập MFA, middleware yêu cầu đăng nhập đầy đủ và chuyển về `/login`.

Không cố tình nhập sai nhiều lần trong lúc demo. Theo chính sách hiện tại, mã MFA có 6 chữ số, TOTP đổi theo chu kỳ 30 giây; server chấp nhận cửa sổ một bước trước/sau. Sau 5 lần xác minh sai, tài khoản bị giới hạn MFA trong 15 phút.

### C. Tab Application/Cookies

Trong Chrome mở **Application → Storage → Cookies → origin ứng dụng**. Có thể trình bày:

- Cookie phiên có tên `sid`.
- Các thuộc tính `HttpOnly`, `SameSite=Lax`, `Path=/`.
- `Secure` được bật ở production; khi demo HTTP localhost, thuộc tính này có thể không bật. Không kết luận rằng localhost đang dùng Secure cookie.
- Thời hạn phiên do server kiểm tra: idle 30 phút và tối đa 8 giờ.
- Session được lưu phía server trong PostgreSQL; cookie chỉ dùng để tham chiếu phiên.

**Không chiếu cột Value của cookie.** `HttpOnly` ngăn JavaScript đọc cookie, nhưng DevTools vẫn có thể hiển thị giá trị. Cũng không xuất cookie/storage state hoặc HAR.

Trong Application, có thể kiểm tra Local Storage/Session Storage để trả lời câu hỏi “có lưu token đăng nhập ở browser không”. Không kết luận về session database chỉ dựa vào việc Local Storage trống.

## 4. Network có thể chứng minh điều gì?

| Có thể trình bày từ Network | Cần lưu ý |
|---|---|
| Đường dẫn, method và thứ tự request: `/login`, `/mfa`, `/logout`, `/account/security/setup` | Che query string nếu có thông tin nhạy cảm. |
| HTTP status và redirect: 303 sang `/mfa`, sau xác minh thành công 303 sang `/dishes` | Có thể bật Preserve log để giữ các bước chuyển trang. |
| Trang `/mfa` được tải sau khi mật khẩu đúng và MFA đang bật | Network chứng minh luồng HTTP quan sát được, không tự chứng minh trạng thái nội bộ của database. |
| Header phản hồi như `Cache-Control: no-store`, `Referrer-Policy`, `X-Content-Type-Options` | Chọn request phù hợp rồi xem Headers; không chia sẻ toàn bộ header nếu có cookie. |
| CSRF được gửi cùng form qua trường `_csrf` | Chỉ nêu tên trường, không để lộ giá trị token trong Payload. |
| Cookie phiên có các cờ bảo vệ | Chỉ trình bày tên và thuộc tính; che Value và `Set-Cookie` value. |
| Request xác minh TOTP là form POST SSR | Không mở/chiếu Payload vì chứa mã 6 số. |

### Những điều Network không chứng minh một mình

- Mật khẩu được băm bằng Argon2id thay vì lưu plaintext.
- Secret MFA được mã hóa trong database.
- TOTP/recovery code được tiêu thụ một lần, hoặc TOTP cũ bị chống phát lại.
- Session, bộ đếm giới hạn và trạng thái tài khoản được lưu/kiểm tra chính xác trong database.
- Các route được bảo vệ đúng cho mọi role, hoặc mã nguồn không có lỗ hổng.

Để trả lời các câu hỏi này, kết hợp Network với phần mã nguồn liên quan: [src/services/crypto.js](src/services/crypto.js), [src/services/mfa.js](src/services/mfa.js), [src/routes/auth.js](src/routes/auth.js), [src/services/sessionStore.js](src/services/sessionStore.js), [src/middleware/requireLogin.js](src/middleware/requireLogin.js), [src/middleware/csrf.js](src/middleware/csrf.js), [src/config/authPolicy.js](src/config/authPolicy.js). Bộ kiểm thử browser có kịch bản thiết lập MFA rồi đăng nhập qua bước MFA tại [tests/block9-fix.browser.js](tests/block9-fix.browser.js).

## 5. Câu hỏi giảng viên có thể hỏi

**“Tại sao đăng nhập xong chưa vào trang chủ mà chuyển tới `/mfa`?”**  
Vì mật khẩu mới là yếu tố thứ nhất. Khi tài khoản bật MFA, server tạo trạng thái chờ xác minh và chỉ hoàn tất đăng nhập sau khi xác minh TOTP hoặc mã khôi phục hợp lệ.

**“MFA có bỏ qua được bằng cách mở thẳng `/admin` không?”**  
Không theo luồng ứng dụng: bước chờ MFA chưa có `userId` trong session đăng nhập đầy đủ. Route quản trị yêu cầu session hợp lệ; nếu chưa hoàn tất MFA, request bị chuyển về `/login`.

**“QR chứa gì? Có thể chụp lại để dùng không?”**  
QR chứa thông tin provisioning, gồm secret dùng để sinh TOTP. Ai có secret có thể tạo mã, vì vậy chỉ quét bằng Authenticator của tài khoản demo và không chia sẻ ảnh QR/secret.

**“Mã 6 số có hiệu lực bao lâu?”**  
TOTP dùng bước 30 giây và ứng dụng cho phép sai lệch tối đa một bước trước/sau để chịu lệch đồng hồ. Không dùng lại mã của cùng bước thời gian.

**“Nếu mất điện thoại thì sao?”**  
Dùng một mã khôi phục chưa sử dụng. Các mã khôi phục chỉ được hiển thị một lần lúc bật MFA; giữ chúng ở nơi an toàn. Không trình diễn mã khôi phục thật trước lớp.

**“Cookie `HttpOnly` có nghĩa là không ai thấy được cookie?”**  
Không. `HttpOnly` ngăn JavaScript truy cập cookie; DevTools vẫn có thể xem nó. Vì vậy phải che giá trị cookie khi thuyết trình.

**“Sao không thấy request trong Fetch/XHR?”**  
Các form được gửi theo kiểu SSR bằng điều hướng tài liệu HTML, không nhất thiết dùng `fetch`/XHR. Chuyển bộ lọc Network sang **All** hoặc **Doc**.

**“Có thể chứng minh password không lưu plaintext bằng Network không?”**  
Không. Network có thể cho thấy browser gửi password trong body của form; hash được tạo ở server. Cần giải thích bằng mã nguồn và cách lưu trong database, không mở payload password để trình bày.

**“Tại sao có trường `_csrf`?”**  
Đây là token chống CSRF cho form POST. Server xác thực token và Origin trước khi xử lý thao tác; có thể chỉ tên trường và phản hồi 403 khi thiếu/sai token trong môi trường kiểm thử, không chiếu giá trị token.

**“Có thể chứng minh TOTP chỉ dùng một lần từ Network không?”**  
Không đủ. Network cho thấy request/response; việc chặn phát lại được xử lý ở server/database. Giải thích thêm bằng [src/services/mfa.js](src/services/mfa.js) và [src/routes/auth.js](src/routes/auth.js), không phát lại request chứa mã thật.

## 6. Dọn DevTools sau khi demo

1. Dừng chia sẻ màn hình trước khi quay lại tab có thông tin xác thực.
2. Xóa danh sách Network và đóng tab thiết lập MFA.
3. Không lưu HAR, screenshot, video, Console output hay file xuất từ Application khi chúng có thể chứa password, TOTP, QR/secret, mã khôi phục, CSRF hoặc cookie.
4. Đăng xuất tài khoản demo. Nếu thiết bị Authenticator dùng cho demo không còn cần thiết, tắt MFA bằng luồng bảo mật của ứng dụng và xác thực theo yêu cầu; không sửa/xóa trực tiếp dữ liệu tài khoản production.
