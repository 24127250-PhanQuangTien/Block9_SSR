# Kết quả nghiệm thu Block8

> **Cập nhật phạm vi theo yêu cầu mới:** `/dishes` và `/dishes/:id` được xem công khai; toàn bộ `/admin/*` và logout vẫn cần session hợp lệ. Trang kích hoạt dùng lại email từ phiên, hiển thị một lần thay cho hai ô nhập. Các số liệu và ma trận audit cũ bên dưới thuộc lượt ghi nhận trước thay đổi này; không dùng chúng để tự kết luận đã tái kiểm source mới. Phạm vi public menu là điều chỉnh có chủ đích so với prompt gốc.

**Kiểm thử sau cập nhật ngày 06/11:** offline **25/25 PASS**; [HTTP](evidence/auth-public-menu-http-verified/http-results.json) **22/22 nhóm PASS, 292 request**; [Chrome](evidence/auth-public-menu-browser/browser-results.json) **4/4 PASS, 49 ảnh**. Các schema thử đã được dọn; không ghi dữ liệu vào schema nhà hàng. Các kết quả này không tự chấm lại ma trận audit ngày 04/11.


Đối chiếu [slide Block8](https://pub.nndkhoa9.win/web/week6/block8-deck.html), đặc biệt48–63, và [prompt nhóm trưởng](requirements/PROMPT-block8-auth-block5-ssr.md). Bản audit chi tiết, source và34 tiêu chí: [BLOCK8_AUTHENTICATION_AUDIT_REPORT](../BLOCK8_AUTHENTICATION_AUDIT_REPORT.md).

## Kết luận

Chức năng chính đã triển khai và các suite đã chạy đạt trong phạm vi ghi dưới đây. Người dùng xác nhận đăng ký → CAPTCHA → nhận OTP qua email thật → kích hoạt → đăng nhập → mở `/dishes?pageSize=10&page=1` thành công. Không giữ email/OTP/cookie trong báo cáo; đây là xác nhận của người dùng, không phải ảnh/test tự động do agent thu.

**Chưa tuyên bố hoàn thành100% hồ sơ bài tập/nghiệm thu.** Phần ảnh DevTools theo từng kịch bản và sơ đồ do nhóm tự vẽ của slide63 chưa đủ; GET vẫn ghi metadata bảo mật và timing chống dò email chưa được bảo đảm. Push source không biến các mục này thành PASS.

## Kết quả đã chạy

| Kiểm tra | Kết quả | Bằng chứng/phạm vi |
|---|---|---|
| Offline |24/24PASS|`npm.cmd test`: validation/SSR/pagination/auth security, gồm mail diagnostics redaction và browser-only guard|
| HTTP/Prisma/SMTP local |21/21 nhóm PASS,276 request|[HTTP JSON](evidence/auth-release-http/http-results.json); isolatedSchemaRemoved=true, không ghi schema nhà hàng|
| Hai server process |PASS|A21 dùng chung Session/RateLimit, logout/reset thu hồi xuyên process; HTTP local, không load balancer production|
| Chrome native |4/4PASS,45 ảnh|[Browser JSON](evidence/auth-release-browser/browser-results.json),1440/375px × JSon/off; [cleanup](evidence/auth-release-browser/http-results.json)|
| Navbar auth |4/4PASS đợt trước|[JSON](evidence/auth-navbar-final/results.json); nền đặc và không tràn ngang|
| OTP email thật |Người dùng xác nhận thành công|Register/kích hoạt/login/list; reset và email thông báo đổi password ngoài SMTP local chưa xác nhận|
| Cleanup đường lỗi setup |PASS|[cleanup-results](evidence/auth-cleanup-smoke/cleanup-results.json); HTTP FAIL cùng thư mục là đúng dự kiến khi module browser thiếu, không phải nghiệm thu auth FAIL|

Đã chạy lại source cuối có mailDiagnostics: HTTP hoàn tất 2026-11-04T15:48:33.647Z; Chrome156.0.8078.80 hoàn tất 2026-11-04T15:45:29.306Z. Cả hai schema test đã dọn. Các thư mục auth-final, auth-browser-final, auth-reset-before và auth-observer-before-reset-fix là bằng chứng lịch sử có nhãn; không coi lượt FAIL trước sửa là kết quả source cuối.

## Ma trận và yêu cầu ngoài ma trận

| Phạm vi | Kết quả | Giải thích |
|---|---|---|
|34 mục slide57–61|33PASS/0FAIL/1PARTIAL|SRC-05 PARTIAL vì metadata GET; forgot cùng nội dung/status đạt RST-01 theo slide61|
|Cùng34 ID khi thêm timing của prompt|32PASS/0FAIL/2PARTIAL|SRC-05 và RST-01 timing chưa đạt bảo đảm; không sửa policy chỉ để làm đẹp số đo|
|Slide62, câu hỏi trình bày|Có tài liệu tham khảo|Audit mục9 và flows; chưa chứng minh thành viên nhóm đã tự trình bày|
|Slide63, bằng chứng cho từng ca|PARTIAL|Có UI screenshot, request/cookie flags và DB snapshot đã che; chưa đủ ảnh đúng tab Network/Application cho từng kịch bản|
|Slide63, sơ đồ do nhóm vẽ|Chưa xác nhận|Có Mermaid tham khảo trong flows; không tuyên bố agent thay nhóm tự vẽ|
|Slide63, lỗi do agent và sau sửa|Có hồ sơ|[Reset native403](BUG_RESET_BROWSER_403.md), ảnh/JSON trước sửa, regression native browser sau sửa|

Số nhóm test không phải tỷ lệ hoàn thành bài tập. Audit có đủ34 dòng source/test và giải thích sự khác nhau giữa hai phạm vi.

## Giới hạn cần giữ rõ

- GET không ghi bảng nhà hàng hoặc đổi user/password/usedAt reset; vẫn ghi Session/TTL/CAPTCHA/counter phát ảnh. Đây là sai khác so với câu cấm mọi ghi GET tuyệt đối.
- A20 lượt cuối276 request:8 cặp forgot, known trung bình1981ms, unknown1786ms; hai khoảng1930–2172 và1737–1859ms không chồng lấn. Floor1200ms và mail async chưa chứng minh chống dò timing; không benchmark production.
- Dev preview Ethereal được prompt cho phép nhưng phải giữ riêng; production không fallback/log preview. Lỗi535 của cấu hình mail trước đó là lịch sử sau khi người dùng xác nhận OTP thật thành công.
- Chưa quan sát HTTPS/proxy/Secure cookie trên deployment, load balancer/race xuyên instance, DB provider khác, screen reader hoặc OCR. Runtime Prisma không SQL riêng vendor, nhưng schema/migration UUID hiện PostgreSQL.
- Không seed/reset/dbpush/migrate schema nhà hàng khi kiểm thử. Credential chỉ tự nạp trong RAM; ảnh/JSON không chứa raw secret. Không thu lại OTP thật hoặc gửi mail ngoài để có thêm bằng chứng.

## Trước khi nộp

Nhóm đối chiếu checklist trong [VERIFY](VERIFY.md), tự chụp ảnh UI/Network/Application và request trực tiếp cho các tình huống còn thiếu, che credential/token/cookie/email. Tự vẽ và giải thích sơ đồ từ [flows](flows.md). Không đánh dấu đã làm thay nhóm; các giới hạn source/prompt ở trên vẫn phải được công bố khi trình bày.
