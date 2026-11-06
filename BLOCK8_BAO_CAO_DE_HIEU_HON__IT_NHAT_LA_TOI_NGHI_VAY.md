# BÁO CÁO TÌNH TRẠNG BLOCK 8 – XÁC THỰC TÀI KHOẢN

**Dự án:** Web-Block8 (phát triển từ Web-Block5)  
**Nguồn đối chiếu:** `BLOCK8_AUTHENTICATION_AUDIT_REPORT.md` trên nhánh `main` của `ChuHaiLi/Web-Block8`  
**Thời điểm của bản audit gốc:** 04/11/2026  
**Mục đích:** Giúp các thành viên hiểu dự án đã làm được gì, còn hạn chế nào và cần chuẩn bị gì để nghiệm thu.

**Cách đọc:** Tên file trong các dòng **Mã nguồn liên quan** là đường dẫn tính từ thư mục gốc của repository. Số dòng bên cạnh giúp tìm đoạn mã tương ứng; có thể nhấn vào liên kết để mở ngay trên GitHub. Các số dòng được đối chiếu với source hiện tại và có thể thay đổi khi code được sửa; đây không phải một lượt kiểm thử mới.

> Báo cáo này diễn giải lại bản audit ngày 04/11. Các số liệu audit bên dưới thuộc lần ghi nhận đó; phần hành vi và mã nguồn đã được cập nhật theo yêu cầu mới về thực đơn công khai và trang kích hoạt. Những nội dung chưa được chứng minh vẫn được ghi rõ, không tự đổi thành PASS.

## 1. Kết luận chung

**Các chức năng chính của Block 8 đã được xây dựng và vượt qua các bộ kiểm thử được báo cáo.** Website hiện có đăng ký tài khoản, CAPTCHA, kích hoạt bằng OTP qua email, đăng nhập, đăng xuất, bảo vệ các trang quản lý, giới hạn số lần đăng nhập sai và quên/đặt lại mật khẩu. Chức năng CRUD và phân trang SSR của Block 5 được giữ lại.

Người dùng cũng đã tự xác nhận thử thành công chuỗi: **đăng ký → giải CAPTCHA → nhận OTP trong email thật → kích hoạt → đăng nhập → xem danh sách món ăn**.

Tuy nhiên, **chưa thể nói đã hoàn tất 100% phần nghiệm thu/nộp bài**. Nhóm vẫn phải chuẩn bị ảnh minh chứng đúng từng tình huống và sơ đồ tự vẽ theo yêu cầu slide 63. Một vài giới hạn kỹ thuật cũng cần được giải thích trung thực.

### Kết quả kiểm thử của bản audit ngày 04/11

| Hình thức | Kết quả | Hiểu đơn giản |
|---|---:|---|
| Kiểm thử offline | **24/24 PASS** | Kiểm tra logic, xử lý lỗi và các chức năng liên quan. |
| Kiểm thử HTTP | **21/21 nhóm PASS** | Gửi tổng cộng 276 yêu cầu đến ứng dụng đang chạy để kiểm tra cách server xử lý. |
| Kiểm thử Chrome | **4/4 PASS** | Thử trên trình duyệt, có 45 ảnh ghi nhận kết quả. |
| Kiểm thử hai tiến trình server | **PASS** | Hai tiến trình cùng dùng dữ liệu Session và bộ đếm lưu trong database. |

Các bài kiểm tra offline dùng dữ liệu mô phỏng trong bộ nhớ (fixture), không kết nối database thật. Kiểm thử HTTP và Chrome dùng schema PostgreSQL thử riêng và đã dọn sau khi chạy; không ghi dữ liệu vào schema nhà hàng chính.

**Kiểm thử sau cập nhật ngày 06/11:** offline **25/25 PASS**; [HTTP](https://github.com/ChuHaiLi/Web-Block8/blob/main/docs/evidence/auth-public-menu-http-verified/http-results.json) **22/22 nhóm PASS, 292 request**; [Chrome](https://github.com/ChuHaiLi/Web-Block8/blob/main/docs/evidence/auth-public-menu-browser/browser-results.json) **4/4 PASS, 49 ảnh**. Các schema thử đã được dọn; không ghi dữ liệu vào schema nhà hàng. Các kết quả này không tự chấm lại ma trận audit ngày 04/11.

**Đánh giá theo 34 tiêu chí do bản audit ngày 04/11 tổng hợp từ slide 57–61:** 33 PASS, 0 FAIL, 1 PARTIAL.
**Nếu tính thêm yêu cầu về timing do nhóm bổ sung:** 32 PASS, 0 FAIL, 2 PARTIAL.

Hai cách đếm khác nhau vì **slide của thầy không bắt buộc chứng minh thời gian phản hồi Forgot Password là tương đương**. Không nên coi kết quả 33/34 là “đã hoàn thành 97% toàn bộ bài”, bởi đây không phải bảng điểm chính thức của thầy và còn hồ sơ nghiệm thu ngoài 34 tiêu chí này.

## 2. Các chức năng đã làm

### 2.1. Đăng ký và kích hoạt tài khoản

**Mã nguồn liên quan:** [`src/routes/auth.js`](https://github.com/ChuHaiLi/Web-Block8/blob/main/src/routes/auth.js#L40-L101) (dòng 40–101) · [`src/services/otp.js`](https://github.com/ChuHaiLi/Web-Block8/blob/main/src/services/otp.js#L6-L45) (dòng 6–45) · [`src/services/crypto.js`](https://github.com/ChuHaiLi/Web-Block8/blob/main/src/services/crypto.js#L7-L18) (dòng 7–18) · [`prisma/schema.prisma`](https://github.com/ChuHaiLi/Web-Block8/blob/main/prisma/schema.prisma#L47-L77) (dòng 47–77) · [`src/views/auth/activate.ejs`](https://github.com/ChuHaiLi/Web-Block8/blob/main/src/views/auth/activate.ejs#L2-L23) (dòng 2–23)


Khi đăng ký, người dùng điền thông tin và giải CAPTCHA. Server kiểm tra dữ liệu, băm mật khẩu rồi tạo tài khoản ở trạng thái **Pending (chờ kích hoạt)**. Hệ thống gửi OTP qua email; nhập đúng OTP thì tài khoản chuyển thành **Active (đã kích hoạt)**.

**Chuẩn hóa email là gì?** Là đưa email về một cách viết thống nhất trước khi lưu và so sánh. Project xóa khoảng trắng ở đầu và cuối bằng `trim()`, rồi chuyển toàn bộ email thành chữ thường bằng `toLowerCase()`.

Ví dụ: `"  NguyenVanA@Example.com  "` được chuẩn hóa thành `"nguyenvana@example.com"`. Nhờ vậy, viết hoa hoặc thừa khoảng trắng ở đầu/cuối không làm cùng một email bị hiểu thành hai tài khoản khác nhau. Bản nhập ban đầu được giữ ở `emailRaw`, còn email đã chuẩn hóa được lưu ở `email`.

Trang kích hoạt dùng lại email đã đăng ký trong phiên và chỉ hiển thị email đó một lần dưới dạng văn bản. Người dùng chỉ cần nhập OTP hoặc bấm gửi lại mã, không phải nhập email thêm lần nữa. Nếu phiên chưa có email cần kích hoạt, trang hướng dẫn quay lại đăng ký hoặc đăng nhập tài khoản chưa kích hoạt.

Các điểm quan trọng:

- Mật khẩu được lưu dưới dạng hash bằng **Argon2id**, không lưu nguyên mật khẩu.
- OTP gồm **6 chữ số**; nhập sai, dùng lại hoặc hết hạn đều bị kiểm tra và từ chối theo chính sách.
- Đăng ký lại không được tự ý ghi đè mật khẩu của tài khoản đang chờ kích hoạt.
- Người dùng không thể tự gửi `role=admin` để được quyền admin; tài khoản đăng ký được gán `viewer`.
- Kích hoạt xong **không tự động đăng nhập**; người dùng phải đăng nhập bình thường.

**Trạng thái:** Đã có kiểm thử đạt. Luồng nhận OTP qua email thật cũng đã được người dùng xác nhận.

### 2.2. CAPTCHA chống đăng ký tự động

**Mã nguồn liên quan:** [`src/services/captcha.js`](https://github.com/ChuHaiLi/Web-Block8/blob/main/src/services/captcha.js#L5-L21) (dòng 5–21) · [`src/config/authPolicy.js`](https://github.com/ChuHaiLi/Web-Block8/blob/main/src/config/authPolicy.js#L6-L7) (dòng 6–7) · [`src/routes/auth.js`](https://github.com/ChuHaiLi/Web-Block8/blob/main/src/routes/auth.js#L25-L40) (dòng 25–40 và [110–124](https://github.com/ChuHaiLi/Web-Block8/blob/main/src/routes/auth.js#L110-L124)) · [`prisma/schema.prisma`](https://github.com/ChuHaiLi/Web-Block8/blob/main/prisma/schema.prisma#L92-L102) (dòng 92–102)


Website sử dụng CAPTCHA dạng ảnh gồm **5 ký tự**. Việc yêu cầu người dùng nhập lại nội dung trong ảnh giúp hạn chế thao tác tự động đơn giản bằng cách tăng chi phí vượt qua form.

- **Trang đăng ký:** luôn yêu cầu CAPTCHA.
- **Trang đăng nhập:** bắt đầu yêu cầu CAPTCHA sau **3 lần nhập sai mật khẩu** của email trong khoảng theo dõi.
- CAPTCHA có hiệu lực **5 phút** và chỉ dùng được **một lần**.
- Đáp án được giữ ở database phía server để kiểm tra, không đặt sẵn trong ô ẩn ở trình duyệt.
- Đổi mã hoặc dùng sai CAPTCHA không được phép vượt qua các giới hạn chống thử liên tục.

**Trạng thái:** Các tình huống sai mã, thiếu mã, dùng lại mã, hết hạn và dùng mã của phiên khác đều đã được kiểm thử đạt. Chưa có lựa chọn CAPTCHA âm thanh dành cho người không nhìn được ảnh.

### 2.3. Đăng nhập và chống đoán mật khẩu

**Mã nguồn liên quan:** [`src/routes/auth.js`](https://github.com/ChuHaiLi/Web-Block8/blob/main/src/routes/auth.js#L103-L139) (dòng 103–139) · [`src/services/rateLimit.js`](https://github.com/ChuHaiLi/Web-Block8/blob/main/src/services/rateLimit.js#L2-L19) (dòng 2–19) · [`src/config/authPolicy.js`](https://github.com/ChuHaiLi/Web-Block8/blob/main/src/config/authPolicy.js#L7-L8) (dòng 7–8)


Khi người dùng đăng nhập, server kiểm tra email, mật khẩu, trạng thái Active và các giới hạn bảo mật.

- Sau **3 lần sai mật khẩu** trong vòng 15 phút, lần thử tiếp theo phải giải CAPTCHA.
- Tới **10 lần sai**, tài khoản bị khóa đăng nhập tạm thời **5 phút** theo cơ chế của dự án.
- CAPTCHA đúng không xóa lượt sai và không tự gỡ khóa.
- Mở tab mới, xóa Cookie hay khởi động lại server không tự làm mất bộ đếm sai theo email.
- Email không tồn tại và mật khẩu sai sử dụng chung thông báo lỗi để hạn chế việc dò tài khoản.

**Trạng thái:** Đã kiểm thử đạt, bao gồm cả tình huống đang bị khóa nhưng nhập đúng mật khẩu.

### 2.4. Session và Cookie: ghi nhớ người đã đăng nhập

**Mã nguồn liên quan:** [`src/app.js`](https://github.com/ChuHaiLi/Web-Block8/blob/main/src/app.js#L36-L40) (dòng 36–40) · [`src/services/sessionStore.js`](https://github.com/ChuHaiLi/Web-Block8/blob/main/src/services/sessionStore.js#L5-L39) (dòng 5–39) · [`src/middleware/requireLogin.js`](https://github.com/ChuHaiLi/Web-Block8/blob/main/src/middleware/requireLogin.js#L2-L28) (dòng 2–28) · [`prisma/schema.prisma`](https://github.com/ChuHaiLi/Web-Block8/blob/main/prisma/schema.prisma#L114-L123) (dòng 114–123)


Có thể hiểu **Cookie là tấm thẻ mang mã số**, còn **Session là hồ sơ đăng nhập được server lưu trong database**.

Sau khi đăng nhập thành công, trình duyệt giữ Cookie chứa mã `sid`. Trong những lần mở trang tiếp theo, server dựa vào mã đó để tìm Session và xác nhận người dùng.

- Session lưu trong **PostgreSQL**, nên không bị mất chỉ vì tiến trình server khởi động lại.
- Session tự hết hạn nếu **30 phút không hoạt động**, đồng thời có giới hạn tối đa **8 giờ**.
- Khi đăng nhập, hệ thống cấp mã Session mới để giảm nguy cơ sử dụng mã phiên cũ.
- Khi đăng xuất, server **hủy Session trong database**, không chỉ xóa Cookie trên máy người dùng.
- Sau khi đặt lại mật khẩu, các Session đăng nhập cũ của tài khoản bị vô hiệu hóa.

**“Restore Session” là gì?** Không có chức năng khôi phục riêng tên Restore. Sau khi server khởi động lại, trình duyệt gửi lại Cookie cũ và server đọc Session còn hạn từ database. Đây là lý do người dùng có thể vẫn đăng nhập sau khi restart.

**Trạng thái:** Đã kiểm thử khởi động lại server, đăng xuất và không cho dùng lại Session cũ. Việc hai tiến trình server cùng dùng Session cũng đã được kiểm thử trên môi trường HTTP cục bộ.

### 2.5. Quên mật khẩu và đặt lại mật khẩu

**Mã nguồn liên quan:** [`src/routes/auth.js`](https://github.com/ChuHaiLi/Web-Block8/blob/main/src/routes/auth.js#L147-L198) (dòng 147–198) · [`src/services/crypto.js`](https://github.com/ChuHaiLi/Web-Block8/blob/main/src/services/crypto.js#L5-L11) (dòng 5–11) · [`src/services/mail.js`](https://github.com/ChuHaiLi/Web-Block8/blob/main/src/services/mail.js#L14-L28) (dòng 14–28) · [`prisma/schema.prisma`](https://github.com/ChuHaiLi/Web-Block8/blob/main/prisma/schema.prisma#L79-L90) (dòng 79–90)


Người dùng nhập email ở trang **Forgot Password**. Nếu tài khoản tồn tại, hệ thống tạo một liên kết đặt lại mật khẩu và gửi qua email. Liên kết có chứa một mã bí mật (reset token) chỉ được dùng một lần, có hiệu lực **15 phút**.

- Khi mở liên kết, website chỉ hiển thị form nhập mật khẩu mới; **chưa sử dụng mất token**.
- Khi người dùng gửi mật khẩu mới hợp lệ, server mới đổi hash mật khẩu và đánh dấu token đã dùng.
- Token cũ, hết hạn hoặc đã dùng lại đều bị từ chối.
- Đặt lại mật khẩu thành công **không tự đăng nhập** và làm các Session cũ hết hiệu lực.
- Khi chưa vượt giới hạn yêu cầu, dù email có tồn tại hay không, trang Forgot Password đều trả về cùng thông báo và HTTP status theo yêu cầu slide. Khi vượt giới hạn, server trả về HTTP **429**.

**Trạng thái:** Các trường hợp chính đạt kiểm thử bằng SMTP thử nghiệm. **Chưa có xác nhận nhận được email reset và email thông báo đổi mật khẩu trong hộp thư thật.**

### 2.6. Bảo vệ các trang quản lý nhà hàng

**Mã nguồn liên quan:** [`src/app.js`](https://github.com/ChuHaiLi/Web-Block8/blob/main/src/app.js#L57-L64) (dòng 57–64) · [`src/middleware/requireLogin.js`](https://github.com/ChuHaiLi/Web-Block8/blob/main/src/middleware/requireLogin.js#L3-L28) (dòng 3–28) · [`src/middleware/csrf.js`](https://github.com/ChuHaiLi/Web-Block8/blob/main/src/middleware/csrf.js#L13-L24) (dòng 13–24)


Trang thực đơn `/dishes` và trang chi tiết món ăn `/dishes/:id` được xem công khai, không cần đăng nhập. Tìm kiếm và phân trang SSR ở trang khách vẫn hoạt động bình thường.

Các trang xem/thêm/sửa/xóa trong khu vực quản trị `/admin/*` mới yêu cầu đăng nhập. Nếu chưa đăng nhập mà truy cập URL quản trị hoặc gửi yêu cầu tạo/sửa/xóa trực tiếp, server chuyển về `/login`. Đây là phạm vi được điều chỉnh theo yêu cầu mới của người dùng.

Hệ thống còn kiểm tra **CSRF**: mã bảo vệ để tránh việc một website khác lừa trình duyệt của người đang đăng nhập thực hiện thao tác ngoài ý muốn.

**Trạng thái:** Đã kiểm thử đạt. CRUD và phân trang SSR của Block 5 tiếp tục hoạt động. Block 8 **chưa triển khai phân quyền riêng theo vai trò**; một tài khoản `viewer` đã kích hoạt vẫn có thể dùng CRUD theo phạm vi hiện tại. Phân quyền là nội dung của Block 9.

## 3. Các giới hạn số lần quan trọng cần nhớ

**Mã nguồn liên quan:** [`src/config/authPolicy.js`](https://github.com/ChuHaiLi/Web-Block8/blob/main/src/config/authPolicy.js#L2-L11) (dòng 2–11) · [`src/services/rateLimit.js`](https://github.com/ChuHaiLi/Web-Block8/blob/main/src/services/rateLimit.js#L2-L19) (dòng 2–19) · [`src/services/otp.js`](https://github.com/ChuHaiLi/Web-Block8/blob/main/src/services/otp.js#L6-L37) (dòng 6–37)


Đây là **cấu hình thực tế của dự án trong báo cáo audit**, không phải các con số bắt buộc áp dụng cho mọi website.

| Hành động | Giới hạn hiện tại |
|---|---|
| Phát CAPTCHA | Tối đa **60 lần/IP/15 phút** |
| Gửi yêu cầu đăng ký | Tối đa **10 lần/IP/giờ** |
| Gửi OTP tới một email | Chờ **60 giây** giữa các lần; tối đa **5 lần/giờ** |
| Gửi yêu cầu đăng nhập | Tối đa **30 lần/IP/15 phút** |
| Nhập sai mật khẩu | Từ **3 lần** cần CAPTCHA; tới **10 lần** khóa **5 phút** |
| Yêu cầu kích hoạt | Tối đa **20 lần/IP** và **20 lần/email** trong 15 phút |
| Nhập OTP sai | **5 lần** thì khóa thử OTP **15 phút** |
| Yêu cầu quên mật khẩu | Tối đa **20 lần/IP/giờ** và **5 lần/email/giờ** |
| Session | Hết hạn sau **30 phút không hoạt động**, tối đa **8 giờ** |
| Reset token | Có hiệu lực **15 phút**, dùng một lần |

Các bộ đếm nằm trong database, không chỉ lưu ở trình duyệt. Điều này giúp hạn chế cách né giới hạn bằng việc xóa Cookie hoặc mở tab mới.

## 4. Hai điểm PARTIAL cần hiểu đúng

### 4.1. GET có ghi metadata bảo mật

**Mã nguồn liên quan:** [`src/routes/auth.js`](https://github.com/ChuHaiLi/Web-Block8/blob/main/src/routes/auth.js#L25-L40) (dòng 25–40 và [168–173](https://github.com/ChuHaiLi/Web-Block8/blob/main/src/routes/auth.js#L168-L173)) · [`src/services/captcha.js`](https://github.com/ChuHaiLi/Web-Block8/blob/main/src/services/captcha.js#L5-L10) (dòng 5–10) · [`src/services/sessionStore.js`](https://github.com/ChuHaiLi/Web-Block8/blob/main/src/services/sessionStore.js#L13-L38) (dòng 13–38) · [`src/middleware/csrf.js`](https://github.com/ChuHaiLi/Web-Block8/blob/main/src/middleware/csrf.js#L3-L12) (dòng 3–12)


Theo cách hiểu thông thường, **GET dùng để xem dữ liệu**, không phải để thực hiện các thao tác thay đổi nghiệp vụ.

Tuy nhiên, khi mở trang đăng ký, server cần tạo CAPTCHA và có thể lưu Session, thời hạn truy cập hoặc bộ đếm phát CAPTCHA vào database. Vì vậy, GET ở dự án **vẫn ghi một số dữ liệu phụ phục vụ bảo mật**.

Điều cần phân biệt:

- **Không xảy ra:** Tự ý thêm/xóa món ăn, đổi mật khẩu, kích hoạt tài khoản hoặc sử dụng mất reset token chỉ vì mở trang.
- **Có xảy ra:** Ghi thông tin Session, CAPTCHA và metadata liên quan.

Đây là lý do mục GET được đánh dấu **PARTIAL** nếu hiểu yêu cầu “mọi GET không được ghi dữ liệu” theo nghĩa tuyệt đối. Không thể kết luận GET này làm hỏng dữ liệu nghiệp vụ.

### 4.2. Timing của Forgot Password còn chênh lệch

**Mã nguồn liên quan:** [`src/routes/auth.js`](https://github.com/ChuHaiLi/Web-Block8/blob/main/src/routes/auth.js#L20) (dòng 20 và [148–164](https://github.com/ChuHaiLi/Web-Block8/blob/main/src/routes/auth.js#L148-L164)) · [`src/services/mail.js`](https://github.com/ChuHaiLi/Web-Block8/blob/main/src/services/mail.js#L14-L28) (dòng 14–28)


Khi nhập email đã có tài khoản, server phải xử lý tạo mã đặt lại mật khẩu; email chưa đăng ký không cần những bước giống hệt. Do đó, **thời gian phản hồi có thể khác nhau** dù người dùng nhìn thấy cùng thông báo.

Theo 8 cặp đo trong bản audit:

| Trường hợp | Thời gian phản hồi trung bình |
|---|---:|
| Email đã đăng ký | **1.981 ms** (khoảng 1,98 giây) |
| Email chưa đăng ký | **1.786 ms** (khoảng 1,79 giây) |
| Chênh lệch | **195 ms** |

Sự khác biệt có thể khiến kẻ xấu *suy đoán* email nào đã đăng ký, nhưng đây mới là kết quả đo trong môi trường kiểm thử, **chưa phải bằng chứng về khả năng khai thác trên production**.

Dự án đã gửi email theo cách **bất đồng bộ** (không chờ gửi xong mới phản hồi), nhưng việc này **không bảo đảm hai trường hợp có thời gian giống nhau**.

**Điểm quan trọng khi trao đổi với nhóm:** Theo bản audit, slide 61 của thầy yêu cầu **cùng nội dung thông báo và HTTP status** cho email có/không tồn tại khi chưa vượt giới hạn; phần đó đã PASS. Slide cũng yêu cầu trả 429 khi vượt giới hạn. Yêu cầu chống phân biệt qua **timing** là yêu cầu thêm từ prompt của nhóm, nên vẫn được ghi nhận là giới hạn bảo mật chưa bảo đảm, chứ không tự coi là thiếu tính năng theo slide.

## 5. Những gì chưa được kiểm chứng đầy đủ

Ngoài hai điểm trên, báo cáo Codex còn ghi nhận một số giới hạn:

- Chưa kiểm tra toàn bộ hệ thống trên môi trường triển khai **HTTPS/reverse proxy thật**; kiểm tra hai tiến trình cục bộ không thay thế cho việc này.
- Chưa xác nhận email **reset mật khẩu** và **thông báo đổi mật khẩu** đi tới hộp thư thật; mới có xác nhận OTP kích hoạt thật.
- CAPTCHA chưa có phương án âm thanh và chưa đánh giá khả năng dùng với phần mềm đọc màn hình.
- Chưa có giới hạn tần suất chuyên biệt cho đường dẫn reset token. Đây là điểm tăng cường bảo mật được nêu trong audit, không được tự tính thành FAIL của slide.
- Chưa kiểm chứng các điều kiện vận hành thực tế như tải lớn hoặc nhà cung cấp database khác PostgreSQL.

Những hạn chế này **không có nghĩa các chức năng đang thất bại**; chúng là các việc chưa đủ bằng chứng hoặc thuộc phạm vi triển khai rộng hơn bài tập.

## 6. Nhóm cần làm gì trước khi nghiệm thu?

**Việc quan trọng nhất bây giờ không phải bổ sung hàng loạt test mới, mà là hoàn thiện minh chứng và chuẩn bị giải thích.**

1. **Tự chạy các luồng trên Chrome ở môi trường test cách ly:** đăng ký, sai CAPTCHA, OTP đúng/sai, đăng nhập, khóa khi thử sai, logout, CRUD, forgot/reset. Dùng tài khoản và dữ liệu thử riêng; không tạo/sửa/xóa dữ liệu nhà hàng hoặc thử khóa/reset tài khoản đang được sử dụng.
2. **Chụp ảnh minh chứng theo slide 63:** giao diện, tab Network, Application (Cookie), trạng thái liên quan trong database. Che email cá nhân, OTP, Session ID, reset token và các bí mật khác.
3. **Tự vẽ sơ đồ và hiểu luồng:** đăng ký/kích hoạt, đăng nhập/chống brute force, Session/logout, quên/đặt lại mật khẩu. Có thể dùng `docs/flows.md` để tham khảo nhưng không nên nhận sơ đồ do công cụ tạo là sơ đồ nhóm tự vẽ.
4. **Kiểm thử thủ công email quên mật khẩu:** dùng hộp thư thử nghiệm do nhóm kiểm soát; ghi nhận rõ kết quả thực tế nếu thực hiện.
5. **Ôn phần giải thích:** vì sao dùng hash, khác nhau giữa Cookie và Session, vì sao CAPTCHA không thay thế giới hạn lượt thử, tại sao logout phải xóa Session ở server, GET reset khác POST reset ra sao.
6. **Đối chiếu checklist nộp bài:** xem `docs/VERIFY.md` và slide 62–63 để bảo đảm đủ yêu cầu về hình ảnh, sơ đồ và cách trình bày.

## 7. Kết luận cuối

**Block 8 đã đạt các kiểm thử được báo cáo đối với những chức năng xác thực chính.** Luồng nhận OTP qua email thật, kích hoạt, đăng nhập và vào danh sách món ăn cũng đã được người dùng tự xác nhận.

**Về 34 tiêu chí do bản audit ngày 04/11 tổng hợp từ slide 57–61:** 33 đạt, 1 đạt một phần do GET vẫn ghi metadata bảo mật. Nếu xét thêm yêu cầu chống dò email qua thời gian phản hồi của nhóm, kết quả vẫn tính trên 34 tiêu chí: 32 đạt và 2 đạt một phần.

**Về việc nộp bài:** Chưa nên nói “xong hết 100%” vì nhóm còn cần hoàn thiện bằng chứng DevTools cho từng tình huống, sơ đồ tự vẽ và tự kiểm tra những luồng chưa trải nghiệm thực tế. Nên ưu tiên các việc này trước khi tiếp tục chỉnh sửa mã không cần thiết.

## 8. Tìm nhanh mã nguồn và bằng chứng kiểm thử

Nếu cần giải thích với thầy hoặc tự đọc code, có thể bắt đầu từ các file sau:

| Muốn tìm hiểu | Mở file nào? |
|---|---|
| Luồng đăng ký, kích hoạt, đăng nhập, logout, forgot/reset | [`src/routes/auth.js`](https://github.com/ChuHaiLi/Web-Block8/blob/main/src/routes/auth.js) |
| Cấu hình các giới hạn thời gian, số lượt thử và Cookie | [`src/config/authPolicy.js`](https://github.com/ChuHaiLi/Web-Block8/blob/main/src/config/authPolicy.js) |
| Tạo và xác minh CAPTCHA | [`src/services/captcha.js`](https://github.com/ChuHaiLi/Web-Block8/blob/main/src/services/captcha.js) |
| Tạo, gửi lại và xác minh OTP | [`src/services/otp.js`](https://github.com/ChuHaiLi/Web-Block8/blob/main/src/services/otp.js) |
| Hash mật khẩu, xử lý token | [`src/services/crypto.js`](https://github.com/ChuHaiLi/Web-Block8/blob/main/src/services/crypto.js) |
| Đếm và khóa khi thử quá nhiều lần | [`src/services/rateLimit.js`](https://github.com/ChuHaiLi/Web-Block8/blob/main/src/services/rateLimit.js) |
| Session được đọc, ghi, gia hạn, xóa trong DB thế nào | [`src/services/sessionStore.js`](https://github.com/ChuHaiLi/Web-Block8/blob/main/src/services/sessionStore.js) |
| Kiểm tra đăng nhập trước khi vào CRUD | [`src/middleware/requireLogin.js`](https://github.com/ChuHaiLi/Web-Block8/blob/main/src/middleware/requireLogin.js) |
| Bảo vệ form khỏi CSRF | [`src/middleware/csrf.js`](https://github.com/ChuHaiLi/Web-Block8/blob/main/src/middleware/csrf.js) |
| Gắn Middleware và Router vào Express | [`src/app.js`](https://github.com/ChuHaiLi/Web-Block8/blob/main/src/app.js) |
| Các bảng User, OTP, Session, CAPTCHA, RateLimit, Reset | [`prisma/schema.prisma`](https://github.com/ChuHaiLi/Web-Block8/blob/main/prisma/schema.prisma) |
| Gửi email và chẩn đoán lỗi mail | [`src/services/mail.js`](https://github.com/ChuHaiLi/Web-Block8/blob/main/src/services/mail.js) và [`src/services/mailDiagnostics.js`](https://github.com/ChuHaiLi/Web-Block8/blob/main/src/services/mailDiagnostics.js) |
| Kiểm thử tích hợp | [`tests/auth.integration.js`](https://github.com/ChuHaiLi/Web-Block8/blob/main/tests/auth.integration.js) |
| Kết quả HTTP và Chrome của audit 04/11 | [`docs/evidence/auth-release-http/http-results.json`](https://github.com/ChuHaiLi/Web-Block8/blob/main/docs/evidence/auth-release-http/http-results.json) và [`docs/evidence/auth-release-browser/browser-results.json`](https://github.com/ChuHaiLi/Web-Block8/blob/main/docs/evidence/auth-release-browser/browser-results.json) |
| Hướng dẫn tự nghiệm thu và sơ đồ tham khảo | [`docs/VERIFY.md`](https://github.com/ChuHaiLi/Web-Block8/blob/main/docs/VERIFY.md) và [`docs/flows.md`](https://github.com/ChuHaiLi/Web-Block8/blob/main/docs/flows.md) |

*Lưu ý:* Những đường dẫn trên giúp lần theo code và bằng chứng; bản Markdown này ưu tiên giải thích hành vi, chỉ kèm số dòng ở phần Mã nguồn liên quan để tiện tra cứu, không chép lại toàn bộ chi tiết các test case.

---

**Tài liệu gốc để đối chiếu:**

- [Báo cáo audit hiện tại trên GitHub](https://github.com/ChuHaiLi/Web-Block8/blob/main/BLOCK8_AUTHENTICATION_AUDIT_REPORT.md)
- [Báo cáo nghiệm thu cuối của Codex](https://github.com/ChuHaiLi/Web-Block8/blob/main/docs/BLOCK8_FINAL_ACCEPTANCE.md)
- [Slide Block 8 của thầy](https://pub.nndkhoa9.win/web/week6/block8-deck.html)
