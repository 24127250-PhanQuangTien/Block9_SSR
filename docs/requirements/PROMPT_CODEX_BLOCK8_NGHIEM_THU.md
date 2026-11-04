# Prompt cho Codex: Kiểm tra và lập báo cáo nghiệm thu Block 8

Bạn đang làm việc trong **repository hiện tại** của đồ án Web. Hãy đóng vai người kiểm thử và rà soát kỹ thuật độc lập, đọc code và cấu hình thực tế trước khi kết luận.

## 1. Mục tiêu và sản phẩm bắt buộc

Hãy kiểm tra toàn bộ phần xác thực tài khoản của ứng dụng và **tạo đúng một file Markdown báo cáo** ở thư mục gốc repository:

`BLOCK8_AUTHENTICATION_AUDIT_REPORT.md`

Báo cáo phải trả lời đầy đủ:

1. Bộ quy định CAPTCHA đang áp dụng trong project.
2. Cách theo dõi và giới hạn theo **IP so với email**: tần suất, ngưỡng, thời gian, lưu trữ và quy tắc reset.
3. **Session được lưu trong database hoặc Redis như thế nào**: bảng/khóa, cấu trúc, vòng đời, cookie, thời hạn và bằng chứng tồn tại sau khi restart.
4. **"Restore lưu ở đâu?"**: xác định trong project từ `restore` thực sự chỉ việc gì, đặc biệt là khôi phục session sau khi restart, dữ liệu session được tái sử dụng ở đâu và có cơ chế backup/restore nào không. Phân biệt rõ với `password reset` (đặt lại mật khẩu). Nếu project không có chức năng tên `restore`, ghi rõ, không tự bịa ra.
5. Toàn bộ câu hỏi ở slide **"Kiểm tra mã nguồn"** và toàn bộ kịch bản ở bốn slide **"Nghiệm thu"** của Block 8, liệt kê chi tiết tại mục 5 của prompt này.

Nguồn yêu cầu: <https://pub.nndkhoa9.win/web/week6/block8-deck.html#3> (đặc biệt slide 57–61).

Đây là **nhiệm vụ kiểm tra và viết báo cáo**, không phải nhiệm vụ phát triển thêm tính năng. **Không sửa source code, schema, cấu hình, package, dữ liệu thật, hay test có sẵn.** Chỉ tạo/cập nhật file báo cáo nói trên. Không tạo thêm file báo cáo phụ. Nếu cần thực hiện kiểm thử, ưu tiên lệnh/test có sẵn và môi trường test tách biệt. Không gửi OTP/email thật hàng loạt, không thực hiện brute force trên môi trường thật, không xóa hay sửa dữ liệu production. Nếu không có môi trường kiểm thử an toàn, chỉ phân tích tĩnh và đánh dấu chưa kiểm chứng.

## 2. Quy tắc đánh giá

- **Không đoán** stack, tên route, schema, thư viện, thời hạn, số lần thử, chính sách CAPTCHA hoặc Redis/database. Phải đọc repository và `.env.example`/cấu hình hợp lệ (nếu có). Tuyệt đối không in secret thực tế từ `.env`.
- Tìm toàn bộ luồng liên quan: đăng ký, gửi/kích hoạt OTP, đăng nhập, session, middleware, đăng xuất, CAPTCHA, giới hạn số lần thử, quên mật khẩu, reset, CRUD và CSRF.
- Đọc các tệp liên quan, schema/migration, cấu hình, middleware, các hàm xử lý route, test, README. Có thể dùng `rg`, `git status --short`, lệnh test đọc/kiểm chứng phù hợp.
- Mỗi nhận xét quan trọng phải có **bằng chứng**: `đường/dẫn/file:line`, tên hàm/route, giá trị cấu hình, tên bài test, hoặc HTTP request/response đã quan sát. Khi không xác định được dòng chính xác, ít nhất dẫn tệp + tên hàm + nội dung kiểm tra.
- Phân biệt **thiết kế ghi trong tài liệu**, **code đang hiện thực**, **test tự động đã chạy**, và **kiểm thử thực tế đã quan sát**. Có code không tự động đồng nghĩa đã chạy đúng.
- Mỗi tiêu chí nhận một trong các trạng thái: `PASS`, `FAIL`, `PARTIAL`, `UNVERIFIED`, `NOT_APPLICABLE`.
  - `PASS`: có bằng chứng đủ để xác nhận.
  - `FAIL`: có bằng chứng hành vi sai hoặc thiếu yêu cầu.
  - `PARTIAL`: đã hiện thực một phần.
  - `UNVERIFIED`: chưa có đủ bằng chứng.
  - `NOT_APPLICABLE`: thật sự không áp dụng, phải giải thích lý do.
- Nếu chỉ đọc code mà chưa chạy test, ghi **"Đã kiểm tra mã nguồn, chưa kiểm thử chạy thực tế"**, không ghi PASS cho hành vi chưa được chứng minh.
- Các ngưỡng **3 lần sai cần CAPTCHA, 10 lần sai bị khóa 5 phút, cửa sổ 15 phút** trên slide 26 là **chính sách minh họa**, không mặc nhiên là quy định của project. Báo cáo phải tìm và ghi **ngưỡng thật** của project; nếu chưa có, nêu thiếu gì.
- Không sao chép giá trị `sid`, session cookie, password, OTP, reset token, CAPTCHA token, mật khẩu seed, API key, khóa email hay secret còn hiệu lực vào báo cáo. Chỉ đưa tên biến, cấu trúc và dữ liệu giả/đã che.
- Không sửa lỗi khi phát hiện. Ghi nguyên nhân, tác động, cách tái hiện an toàn và đề xuất hướng sửa trong báo cáo để nhóm quyết định sau.

## 3. Các câu hỏi cần phân tích sâu

### A. Bộ quy định CAPTCHA

Lập bảng và giải thích bằng tiếng Việt dễ hiểu:

1. Đang dùng CAPTCHA tự tạo, thư viện ảnh, reCAPTCHA v2/v3, hay cơ chế khác? Cài ở phần nào, dùng thư viện nào?
2. CAPTCHA áp dụng cho `/register`, `/login`, `/activate`, `/activate/resend`, `/forgot` hay route nào? Khi nào luôn bắt buộc, khi nào chỉ bắt buộc sau một ngưỡng?
3. Challenge/token CAPTCHA được tạo ở đâu, xác minh ở đâu, lưu ở đâu? Nếu có `challengeId`, `purpose`, hạn dùng, `usedAt`, phiên ẩn danh, giới hạn lượt thử thì chỉ rõ.
4. Server có xác minh CAPTCHA **trước** khi băm mật khẩu, tạo user, gửi email và kiểm tra mật khẩu khi cần không?
5. Có chống dùng lại CAPTCHA, dùng quá hạn, gửi sai mục đích, refresh challenge và gửi câu trả lời trực tiếp bằng HTTP không?
6. Với CAPTCHA bên thứ ba, backend có xác minh token với nhà cung cấp, kiểm tra hostname/action/score theo loại tích hợp không? Có trường nào do browser tự gửi mà server tin vô điều kiện không?
7. Câu trả lời CAPTCHA có lộ trong JSON response, hidden field, cookie, JavaScript phía trình duyệt hoặc log không?
8. CAPTCHA đúng có làm mất bộ đếm sai, bỏ thời gian khóa hoặc cho phép vượt rate limit không?
9. Khi sai/thiếu CAPTCHA và khi bị khóa, server trả HTTP status, mã lỗi, giao diện ra sao?
10. Biện pháp tiếp cận và hạn chế của CAPTCHA đang dùng là gì? Không coi CAPTCHA là bằng chứng về danh tính người dùng.

### B. Theo dõi IP so với email: tần suất và thời gian

**Phải báo cáo con số thực tế, không chỉ nêu lý thuyết.** Lập bảng cho mỗi hành động liên quan (`register`, `login`, `activate`, `resend`, `forgot`, `reset`, và những route khác nếu có):

| Hành động | Khóa theo IP | Khóa theo email/tài khoản | Số yêu cầu/lần sai tối đa | Cửa sổ đếm | Thời gian chờ/khóa | Nơi lưu bộ đếm | Khi nào reset | Kết quả khi vượt |
|---|---|---|---|---|---|---|---|---|

Giải thích rõ:

1. IP và email được đếm riêng hay cộng chung? Email có được chuẩn hóa trước khi làm khóa không?
2. Server lấy IP từ đâu, có cấu hình `trust proxy`/reverse proxy không, có nguy cơ đọc sai IP từ header không đáng tin không?
3. Giới hạn áp dụng cho mỗi lần gửi yêu cầu hay chỉ lần nhập sai? Theo từng email, từng IP, kết hợp cả hai hay theo phiên?
4. Đến ngưỡng nào bắt đầu cần CAPTCHA? Đến ngưỡng nào khóa tạm? Chính xác bao nhiêu giây/phút, cửa sổ đếm bao lâu?
5. Đăng nhập thành công có xóa bộ đếm theo email không? Có giữ giới hạn theo IP không? CAPTCHA đúng có giữ nguyên bộ đếm không?
6. Gửi lại OTP có làm `attempts` về 0 không? Mở ẩn danh, xóa cookie, thay browser có vượt được giới hạn theo email không?
7. Bộ đếm được giữ trong RAM, database, Redis hay nơi khác? Restart server có xóa bộ đếm không? Nhiều instance có dùng chung bộ đếm không?
8. Khi vượt giới hạn, có trả `429` và không tạo session/không xử lý hành động nhạy cảm không?

Nếu không thấy ngưỡng hoặc cấu hình, ghi `KHÔNG TÌM THẤY` và `UNVERIFIED/FAIL` phù hợp. Đưa file và vị trí đã tìm.

### C. Session lưu trong database/Redis thế nào?

Trả lời chi tiết:

1. Ứng dụng dùng session-cookie ở server hay JWT hoặc cách khác? Công cụ/thư viện nào quản lý session?
2. Nơi lưu session thực tế: SQL table nào, Redis key nào, ORM/model/migration nào, hay đang dùng RAM? Cung cấp tên chính xác theo code.
3. Dữ liệu session chứa những trường gì: `sid`, `userId`, `expiresAt`, thời điểm tạo, dữ liệu khác? Có mã hóa/băm `sid` ở nơi lưu không nếu có?
4. Khi đăng nhập, session được tạo và ghi như thế nào? `sid` có được đổi mới, ngẫu nhiên, khó đoán không?
5. Cookie mang những gì, có `HttpOnly`, `Secure`, `SameSite`, `Path`, `Domain`, `Max-Age`/`Expires` như thế nào?
6. Khi gửi request tiếp theo, middleware đọc cookie, tra store, kiểm tra hết hạn/trạng thái `active`, rồi gắn thông tin user vào request thế nào?
7. Khi đăng xuất, session bị xóa/vô hiệu hóa phía server thế nào, cookie bị xóa thế nào? `sid` cũ có còn dùng được không?
8. Khi restart server hoặc chạy nhiều instance, session còn hạn có được tra lại không? Đưa bằng chứng test hoặc đánh dấu chưa kiểm chứng.
9. Session hết hạn được kiểm tra khi truy cập và được dọn dẹp ra sao? Nếu reset password, session cũ có bị vô hiệu hóa không?
10. Nếu có `restore`, giải thích **nguồn dữ liệu**, **vị trí lưu**, **thời điểm nạp lại**, **điều kiện khôi phục**. Nếu không có cơ chế `restore` riêng, nêu rằng session được tìm lại từ persistent store theo `sid`, không bịa ra một bảng `restore`.

### D. "Restore lưu ở đâu?" và đặt lại mật khẩu

Vì câu hỏi có thể dùng từ `restore` theo nhiều nghĩa, hãy kiểm tra repository và làm rõ từng trường hợp:

- **Session restoration**: sau khi server restart, session cũ được đọc lại từ database/Redis ở đâu?
- **Password reset**: reset token được lưu ở bảng/khóa nào, dưới dạng hash hay plaintext; `userId`, `expiresAt`, `usedAt` ở đâu?
- **Backup/restore dữ liệu**: có chức năng sao lưu/phục hồi database hay không? Nếu không có, nói rõ.
- Nếu UI có state restoration khác, chỉ nhắc nếu thực sự liên quan và phân biệt với xác thực tài khoản.

Không đánh đồng reset mật khẩu với restore session.

## 4. Định dạng báo cáo phải tạo

Tạo duy nhất file `BLOCK8_AUTHENTICATION_AUDIT_REPORT.md` với cấu trúc:

1. **Tóm tắt điều hành**: project/stack, ngày kiểm tra, commit/branch (nếu có), mức độ sẵn sàng nghiệm thu, số tiêu chí PASS/FAIL/PARTIAL/UNVERIFIED.
2. **Phạm vi và phương pháp**: các thư mục/file đã đọc, lệnh test đã chạy, môi trường kiểm tra, giới hạn chứng cứ.
3. **Sơ đồ/diễn giải luồng thực tế**: đăng ký → CAPTCHA → OTP → active; đăng nhập → session/cookie → CRUD; logout; forgot/reset. Dùng Markdown đơn giản hoặc Mermaid chỉ khi hữu ích.
4. **Bộ quy định CAPTCHA thực tế**: bảng cấu hình, route, cơ chế, ngưỡng và bằng chứng.
5. **Rate limit theo IP và email**: bảng số liệu, ví dụ chạy qua ngưỡng và xử lý reset bộ đếm.
6. **Lưu session, restart và restore**: schema/store, cookie, vòng đời, tác động của restart, logout và reset password.
7. **Kiểm tra mã nguồn – slide 57**: trả lời từng câu ở mục 5.1.
8. **Nghiệm thu đăng ký và kích hoạt – slide 58**: từng kịch bản ở mục 5.2.
9. **Nghiệm thu CAPTCHA và brute force – slide 59**: từng kịch bản ở mục 5.3.
10. **Nghiệm thu đăng nhập, đăng xuất và CRUD – slide 60**: từng kịch bản ở mục 5.4.
11. **Nghiệm thu quên mật khẩu – slide 61**: từng kịch bản ở mục 5.5.
12. **Các phát hiện cần xử lý**: mức độ nghiêm trọng, mô tả lỗi, nguyên nhân, vị trí code, cách tái hiện an toàn, đề xuất sửa. Không tự sửa.
13. **Câu hỏi vấn đáp và câu trả lời ngắn**: giải thích để thành viên nhóm có thể trình bày trước thầy, bao gồm session/cookie, CAPTCHA, IP/email, pending, OTP, reset, CSRF và restore.
14. **Phụ lục bằng chứng**: đường dẫn file:dòng, tên test, kết quả test, HTTP status, vị trí dữ liệu đã che; danh sách nội dung chưa kiểm chứng.

Trong mỗi bảng kiểm tra, dùng tối thiểu các cột:

`ID | Câu hỏi/kịch bản | Kết quả mong đợi | Hiện thực thực tế | Trạng thái | Bằng chứng (file:line/test) | Ghi chú/việc cần làm`

Viết bằng **tiếng Việt rõ ràng, dễ hiểu cho sinh viên mới học Web**. Thuật ngữ như session, cookie, Redis, CSRF, hash, rate limit phải có giải thích ngắn ở lần xuất hiện đầu tiên. Không viết kết luận mơ hồ như "đã có xử lý bảo mật" nếu chưa chỉ ra cơ chế và vị trí code. Không dùng số liệu từ slide thay cho số liệu project.

## 5. Danh mục câu hỏi và nghiệm thu bắt buộc, không được bỏ sót

### 5.1. Slide 57 – Kiểm tra mã nguồn

- [ ] **SRC-01.** Password, token, OTP hoặc reset token có bị lưu, ghi log hay trả về response ở dạng đọc được không? Xác định từng nơi có thể lộ.
- [ ] **SRC-02.** Password được băm bằng Argon2id, scrypt hoặc bcrypt không? Có dùng MD5 hay SHA-256 trực tiếp cho password không?
- [ ] **SRC-03.** Tài khoản `pending` có nhận được session trong bước đăng nhập không?
- [ ] **SRC-04.** Có route CRUD nào thiếu kiểm tra đăng nhập không? Kiểm tra toàn bộ danh sách, chi tiết, tạo, sửa, xóa.
- [ ] **SRC-05.** Có HTTP GET nào làm thay đổi dữ liệu không, đặc biệt `GET /reset`?
- [ ] **SRC-06.** Session đang lưu ở đâu, bộ đếm đăng nhập sai ở đâu? Đáp án CAPTCHA có nằm trong response, hidden field hoặc cookie đọc được không?

### 5.2. Slide 58 – Nghiệm thu: đăng ký và kích hoạt

- [ ] **ACT-01.** Tài khoản `pending` thử đăng nhập → không được cấp session.
- [ ] **ACT-02.** OTP hợp lệ → kích hoạt đúng user, `emailVerifiedAt` có giá trị.
- [ ] **ACT-03.** OTP sai, hết hạn hoặc đã dùng → cùng thông báo lỗi, tài khoản không đổi trạng thái.
- [ ] **ACT-04.** Gửi lại OTP → mã cũ bị từ chối, mã mới dùng được.
- [ ] **ACT-05.** Vượt giới hạn số lần nhập OTP hoặc số lần gửi → trả trang/status `429` tại server; gửi lại không đặt lại số lần thử.
- [ ] **ACT-06.** Gửi đăng ký kèm `role: admin` → user vẫn có `role: viewer`.
- [ ] **ACT-07.** Kích hoạt thành công → chưa có session, người dùng phải đăng nhập riêng.
- [ ] **ACT-08.** Dùng OTP kích hoạt làm password ở `/login` → bị từ chối.

### 5.3. Slide 59 – Nghiệm thu: CAPTCHA và brute force

- [ ] **CAP-01.** Đăng ký thiếu hoặc sai CAPTCHA → không tạo user, không gửi OTP.
- [ ] **CAP-02.** CAPTCHA hợp lệ + dữ liệu đăng ký hợp lệ → tiếp tục đăng ký và gửi OTP.
- [ ] **CAP-03.** Dùng lại CAPTCHA, dùng quá hạn hoặc dùng sai mục đích → bị từ chối, không được tiếp tục hành động được bảo vệ.
- [ ] **CAP-04.** Đăng nhập sai đến ngưỡng rồi bỏ trường CAPTCHA → bị chặn trước bước kiểm tra password.
- [ ] **CAP-05.** Giải CAPTCHA đúng nhưng password sai → bộ đếm số lần sai tiếp tục tăng.
- [ ] **CAP-06.** Đạt giới hạn, sau đó gửi password và CAPTCHA đúng → vẫn nhận `429`, không được cấp session.
- [ ] **CAP-07.** Xóa cookie hoặc mở phiên ẩn danh mới → không đặt lại bộ đếm theo email.

### 5.4. Slide 60 – Nghiệm thu: đăng nhập, đăng xuất và CRUD

- [ ] **SES-01.** Chưa đăng nhập, gọi bất kỳ route CRUD nào → chuyển `303` tới `/login`, dữ liệu không đổi.
- [ ] **SES-02.** Đăng nhập đúng bằng tài khoản `active` → chuyển `303`, có `Set-Cookie: sid`, vào được CRUD.
- [ ] **SES-03.** Email không tồn tại và password sai → cùng một thông báo, tránh tiết lộ tài khoản tồn tại.
- [ ] **SES-04.** So sánh `sid` trước và sau đăng nhập → `sid` đã được thay mới.
- [ ] **SES-05.** Restart server, dùng lại cookie của session chưa hết hạn → vẫn đăng nhập được, bản ghi còn trong persistent store.
- [ ] **SES-06.** Logout rồi gửi lại `sid` cũ → bị từ chối, bản ghi session đã được hủy/vô hiệu.
- [ ] **SES-07.** Gửi form thay đổi dữ liệu từ website khác → bị từ chối bởi biện pháp CSRF mà nhóm công bố.

### 5.5. Slide 61 – Nghiệm thu: quên mật khẩu

- [ ] **RST-01.** Nhập email có và không có tài khoản ở `/forgot` → cùng nội dung và HTTP status; xem xét nguy cơ khác biệt thời gian phản hồi.
- [ ] **RST-02.** Gửi `/forgot` vượt giới hạn → nhận `429` do server áp dụng.
- [ ] **RST-03.** Dùng reset token cũ, hết hạn hoặc đã dùng → bị từ chối, password không đổi.
- [ ] **RST-04.** `GET /reset` với token hợp lệ → chỉ hiển thị form, `usedAt` vẫn rỗng.
- [ ] **RST-05.** Reset password thành công → không tự đăng nhập; `sid` cũ bị từ chối.
- [ ] **RST-06.** Mang reset token sang route khác → bị từ chối, không được dùng như mật khẩu, OTP hay session.

## 6. Hướng kiểm chứng và cách trình bày kết quả

Với từng tiêu chí trên:

1. Tìm code xử lý chính xác và đối chiếu với yêu cầu trong slide.
2. Kiểm tra test có sẵn; chỉ chạy test phù hợp trong môi trường an toàn. Không phá dữ liệu thật.
3. Nếu có test pass, ghi tên test và kết quả; nếu có request HTTP trực tiếp, ghi method, route, mã status và kết quả **đã che bí mật**.
4. Nếu test không chạy vì thiếu dịch vụ, cấu hình, biến môi trường, mạng hoặc công cụ, ghi rõ giới hạn và đánh dấu `UNVERIFIED` cho phần chưa thể chứng minh.
5. Khi phát hiện lỗi, ghi minh bạch `FAIL` hoặc `PARTIAL`; không nâng điểm để làm đẹp báo cáo.
6. Kiểm tra lại bảng số lượng: **6 tiêu chí kiểm tra mã nguồn + 8 đăng ký/OTP + 7 CAPTCHA/brute force + 7 đăng nhập/logout/CRUD + 6 quên mật khẩu = 34 tiêu chí**, bên cạnh 4 nhóm câu hỏi phân tích sâu.
7. Cuối báo cáo có **bảng tổng hợp 34/34 tiêu chí**, đếm kết quả theo từng trạng thái và danh sách vấn đề ưu tiên sửa trước khi nghiệm thu.

Sau khi hoàn tất, phản hồi trong chat thật ngắn:

- Đường dẫn file `BLOCK8_AUTHENTICATION_AUDIT_REPORT.md` vừa tạo.
- Tổng số `PASS / FAIL / PARTIAL / UNVERIFIED / NOT_APPLICABLE`.
- Ba vấn đề quan trọng nhất (nếu có).
- Những bước bạn **không thể kiểm chứng thực tế**.

**Chỉ kết luận dựa trên bằng chứng từ repository và những test thật sự chạy được. Không giả lập kết quả hoặc tự khẳng định hệ thống đạt yêu cầu chỉ vì code có vẻ đúng.**
