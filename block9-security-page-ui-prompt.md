# Prompt sửa UI: trang "Bảo mật tài khoản" (MFA đang bật), Block 9 Bài 2 SSR

## 0. Bối cảnh và phạm vi

Restaurant App SSR (Node.js + Express 4 + EJS + Prisma 5) đã có trang **Bảo mật tài khoản** (ví dụ `/account/security`). Khi tài khoản đã bật MFA, trang hiện: dòng trạng thái "MFA hiện đang bật." và **3 biểu mẫu** (Tạo lại mã khôi phục, Thiết lập lại ứng dụng/Đổi thiết bị MFA, Tắt MFA), mỗi biểu mẫu có ô "Mật khẩu hiện tại", ô "Mã TOTP hoặc recovery code" và một nút.

Giao diện hiện tại **xấu và khó dùng**:

- Ba biểu mẫu nằm sát nhau như cùng một khối, tiêu đề mỗi khối dính vào đường kẻ/nút của khối trên, không có khoảng thở.
- Không phân biệt mức độ: hai nút cam giống hệt nhau, nút "Tắt MFA" là thao tác giảm bảo mật nhưng không được tách riêng.
- Dòng trạng thái "MFA hiện đang bật." chỉ là chữ thường, không nổi bật.
- Ô nhập chỉ có placeholder, không có nhãn hiển thị rõ.

**Chỉ sửa phần giao diện (EJS + CSS) của trang này.** Không đụng vào logic.

Tất cả quy tắc của các prompt trước vẫn áp dụng: không thêm dependency, không thêm JavaScript phía client (trang phải hoạt động khi tắt JS), không log secret/OTP/recovery code.

## 1. Không được thay đổi

- **Route, phương thức, `action`, tên trường (`name`), trường ẩn CSRF, `_method`**, thứ tự middleware, handler, validation, Prisma/migration, `tech-choice.md`.
- Hành vi nghiệp vụ: mỗi biểu mẫu vẫn gửi đúng như cũ (mật khẩu hiện tại + mã TOTP hoặc recovery code).
- Giao diện các trang khác (menu công khai, `/admin`, đăng nhập...). Đặt style của trang này trong một **class/namespace riêng** (ví dụ `.security-page ...`) để không ảnh hưởng chỗ khác. Chỉ chỉnh chỗ dùng chung nếu thật sự cần và ghi rõ trong báo cáo.

## 2. Yêu cầu thiết kế

Giữ **bảng màu, font chữ, bo góc, đổ bóng và phong cách hiện có của site** (nhà hàng: nền kem, cam hổ phách, đỏ rượu đậm, font serif cho tiêu đề). **Tái sử dụng biến CSS/class màu có sẵn** trong stylesheet; không bịa màu mới nếu đã có màu tương ứng, không thêm font mới.

### 2.1 Khối tiêu đề trang

- Tiêu đề "Bảo Mật Tài Khoản" và dòng mô tả giữ nguyên nội dung, có khoảng cách hợp lý với phần dưới.

### 2.2 Khối trạng thái "MFA đang bật" (nổi bật)

- Đặt thành **một khối trạng thái riêng ở đầu trang** (dạng thẻ hoặc huy hiệu lớn), tách khỏi các biểu mẫu.
- Chữ **"MFA đang bật"** hiển thị **in đậm, màu xanh lá đậm của site** (màu xanh lá giống như ô đang phục vụ của các món ăn), cỡ chữ lớn hơn chữ thường, có thể kèm một biểu tượng khiên bằng **SVG inline** (không dùng emoji, không thư viện icon, không ảnh ngoài).
- Thêm một dòng phụ ngắn, đúng sự thật với hệ thống: "Tài khoản được bảo vệ bằng ứng dụng xác thực (mã TOTP)." Không thêm thông tin mà hệ thống không có (ví dụ số mã dự phòng còn lại).
- Màu chữ và nền khối phải đạt **độ tương phản tối thiểu 4.5:1** (WCAG AA).
- Văn bản không đổi ý nghĩa, vẫn dùng đúng cụm "MFA đang bật".

### 2.3 Ba khu vực chức năng, tách rõ

Mỗi chức năng là **một thẻ (card) riêng**: có viền hoặc nền phân biệt, bo góc, đệm trong thoải mái, **khoảng cách giữa các thẻ khoảng 24px trở lên**, không còn đường kẻ dính nút. Thứ tự giữ nguyên. Mỗi thẻ gồm: **tiêu đề**, **một đến hai câu mô tả hậu quả** của hành động, hai ô nhập có nhãn, và nút.

| Thẻ | Mức độ | Mô tả ngắn (hiển thị trong thẻ) | Kiểu nút |
|---|---|---|---|
| **Tạo lại mã khôi phục** | Thường | "Tạo 10 mã mới. Nhóm mã cũ bị vô hiệu. Mỗi mã chỉ dùng được một lần." | Nút chính (cam, đặc), nút "Tạo nhóm mã mới" |
| **Thiết lập lại ứng dụng** | Thường, hơi thận trọng | "Dùng khi đổi điện thoại hoặc cài lại ứng dụng xác thực. Bạn sẽ quét mã QR mới; mục cũ trong ứng dụng sẽ không còn dùng được." | Nút phụ (viền cam, nền trong), "Đổi thiết bị MFA" |
| **Tắt MFA** | **Nguy hiểm** | "Tài khoản sẽ chỉ còn mật khẩu để đăng nhập. Mã khôi phục sẽ bị xóa." | Nút nguy hiểm (viền và chữ đỏ rượu, hover nền đỏ nhạt), "Tắt MFA" |

- Thẻ **Tắt MFA** đặt trong một **vùng nguy hiểm** rõ ràng: viền đỏ nhạt, nền đỏ rất nhạt, có tiêu đề nhóm kiểu "Vùng nguy hiểm" hoặc cách ly bằng khoảng cách lớn hơn, để người dùng không bấm nhầm.
- Hai nút cam không được trông giống hệt nhau: một chính (đặc), một phụ (viền).

### 2.4 Biểu mẫu

- Mỗi ô nhập có **nhãn hiển thị** (`<label for>`/`id` khớp; không chỉ dựa vào placeholder): "Mật khẩu hiện tại", "Mã TOTP hoặc recovery code". Giữ placeholder hiện có nếu muốn, nhưng nhãn là bắt buộc.
- Dưới ô mã: dòng gợi ý nhỏ "Mã 6 số trong ứng dụng xác thực, hoặc một recovery code chưa dùng."
- Thuộc tính HTML hợp lý (không đổi `name`): `autocomplete="current-password"` cho mật khẩu, `autocomplete="one-time-code"` cho ô mã; `autocapitalize="off"`, `spellcheck="false"` cho ô mã. **Không** thêm `inputmode="numeric"` vì ô còn nhận recovery code.
- Ba cặp ô có `id` **khác nhau** giữa các biểu mẫu (tránh trùng `id` làm hỏng nhãn).
- Nút full-width trong thẻ ở màn hình hẹp; trên màn hình rộng, nút có thể căn phải hoặc full-width, chọn một kiểu và dùng nhất quán.
- Trạng thái `:focus-visible` rõ ràng (đủ tương phản) cho mọi ô nhập và nút; không bỏ viền focus.

### 2.5 Thông báo (flash/lỗi/thành công)

- Nếu trang có hiển thị thông báo sau khi gửi biểu mẫu (mã sai, sai mật khẩu, bị khóa tạm, thành công), hiển thị ở **đầu trang, ngay dưới tiêu đề**, kiểu hộp thông báo (lỗi: đỏ nhạt, thành công: xanh/cam nhạt theo bảng màu site), có `role="alert"` hoặc `aria-live`. Giữ nguyên nội dung thông báo từ server.
- Nếu hiện tại thông báo có lỗi theo từng biểu mẫu, hiển thị lỗi **ngay trong thẻ tương ứng** để người dùng biết lỗi của chức năng nào.

### 2.6 Bố cục và responsive

- Khung nội dung rộng tối đa khoảng 640 đến 720px, căn giữa; các thẻ xếp dọc.
- Kiểm tra ở 1440px, 768px và 375px: không tràn ngang, không chồng chữ, nút và ô nhập không bị cắt, chữ đủ lớn để đọc.

### 2.7 Trang liên quan

Từ trang này người dùng đi tới trang quét QR (đổi thiết bị) hoặc trang hiện recovery code. **Chỉ sửa các trang đó nếu chúng dùng chung class bị ảnh hưởng hoặc cùng lỗi giao diện** (ví dụ tiêu đề dính đường kẻ); nếu không thì không đụng và ghi rõ trong báo cáo. Tuyệt đối không đổi hành vi (QR hiển thị thế nào, recovery code hiện một lần, `Cache-Control: no-store`).

## 3. Nghiệm thu

Dùng Playwright trong thư mục công cụ tạm như Block 8 (không thêm vào dependency của app, auth ghi chỉ trong schema fixture riêng), đăng nhập bằng tài khoản đã bật MFA trong fixture.

| Kiểm tra | Kết quả cần |
|---|---|
| Chụp trang ở 1440, 768, 375 (trước và sau) | Có ảnh trước/sau; không tràn ngang (`scrollWidth <= clientWidth`) |
| Khối "MFA đang bật" | Hiển thị đầu trang; `font-weight >= 700`; màu chữ là đỏ rượu của site; tương đối tương phản >= 4.5:1 so với nền (báo số đo) |
| Khoảng cách giữa 3 thẻ | >= 24px (đo bằng `getBoundingClientRect`), không có phần tử dính nhau |
| Thẻ "Tắt MFA" | Nằm trong vùng nguy hiểm, nút kiểu nguy hiểm khác với hai nút cam |
| Nhãn | Mỗi ô nhập có `<label for>` khớp `id`; **không trùng `id` trong trang** |
| Tab bằng bàn phím | Thấy viền focus ở mọi ô và nút, thứ tự tab hợp lý |
| Tắt JavaScript | Trang vẫn hiển thị đúng và gửi được biểu mẫu |
| **Biểu mẫu không đổi** | So sánh trước/sau: mỗi `<form>` giữ nguyên `action`, `method`, mọi `name` và trường ẩn CSRF/`_method` (đưa bảng đối chiếu) |
| **Chức năng không hỏng** | Chạy lại kịch bản hồi quy MFA đã có: tạo lại mã khôi phục, đổi thiết bị (tới trang QR), tắt MFA đều chạy đúng như trước, kể cả khi gửi thiếu mật khẩu/mã thì bị từ chối như trước |
| Các trang khác | Ảnh chụp trang menu công khai, `/admin`, đăng nhập không thay đổi so với trước |

## 4. Báo cáo cuối

1. Danh sách **file đã sửa** (EJS, CSS) và một dòng lý do cho từng file.
2. **Ảnh trước/sau** ở 3 độ rộng và các số đo trong bảng nghiệm thu.
3. Bảng đối chiếu `<form>` trước/sau (action, method, name).
4. Các quyết định và giả định bạn tự đưa ra (màu dùng, class, cách xử lý thông báo lỗi) để tôi duyệt.
5. Những trang khác có dùng chung class/CSS bị ảnh hưởng (nếu có).
