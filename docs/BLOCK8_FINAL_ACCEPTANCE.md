# Kết quả hoàn thiện Block8 và bàn giao

Đối chiếu [prompt nhóm trưởng](requirements/PROMPT-block8-auth-block5-ssr.md) và [slide Block8](https://pub.nndkhoa9.win/web/week6/block8-deck.html), đã tải/đọc66 slide, tập trung48–63. Đây là đợt khắc phục sau audit3622041, ngày04/11/2026. Giữ Express/EJS SSR, Prisma/PostgreSQL, CRUD và phân trang; không Block9. Không reset/seed/dbpush/migrate DB nhà hàng để kiểm thử. Không đổi dependency/lockfile để cài browser.

## Những gì đã thực hiện và kiểm chứng

| Kiểm tra | Kết quả chạy mới | Bằng chứng |
|---|---|---|
| Offline/HTTP fixture + guard mail/redaction/CSRF unit | **22/22PASS**, exit0 | `npm.cmd test`; test mới `tests/auth.security.test.js` |
| HTTP/server/Prisma/Argon2/session/SMTP local | **20/20 nhóm PASS**,251 request; schema test đã xóa, không ghi schema ứng dụng | [http-results](evidence/auth-final/http-results.json), hoàn tất2026-11-04T11:46:46.519Z |
| Chrome native auth và phân trang sau login | **4/4PASS**,1440/375px × JSon/off;45 ảnh; Chrome156.0.8078.80; schema test đã xóa | [browser-results](evidence/auth-browser-final/browser-results.json), hoàn tất2026-11-04T11:43:55.764Z; [cleanup](evidence/auth-browser-final/http-results.json) |
| Navbar auth tương phản nền, không tràn ngang | **4/4PASS**,1440/375px × JSon/off,4 ảnh; đã xem ảnh375/noJS | [navbar results](evidence/auth-navbar-final/results.json) |
| SMTP/inbox thực tế của người dùng | **Chưa xác minh**; khi kiểm tra cờ cấu hình, chưa có SMTP, đang Ethereal | [MAIL_SETUP](MAIL_SETUP.md). Không có credential được đọc/in ra |

Browser-only có `checks:0` trong file harness HTTP vì bỏ20 nhóm HTTP; bốn ca native thật nằm trong browser-results, không được đọc số0 thành “không chạy browser”. Test gọi đúng middleware/crypto/store, không mock quyết định bảo mật; dữ liệu là fixture trong schema PostgreSQL tách biệt, mail nhận bởi SMTP TCP local. Không lấy mock pass để chứng minh inbox/production.

Các ca browser đã submit native form register, pending login, OTP sai/đúng, login bằng Tab/Enter, forgot, reset, logout; kiểm sid rotate, session qua restart, thu hồi session sau reset/logout. Hai list có q/filter/sort/pageSize/link/history sau đăng nhập, không tràn ngang375px. Ảnh chụp che input, CAPTCHA và email; không HAR/trace/storageState hoặc payload chứa bí mật.

## Sửa lỗi và đính chính hợp đồng

- **Lỗi thật do agent:** Chrome native reset403 vì no-referrer làm Origin:null. Sửa ngoại lệ hẹp POSTreset+same-origin Fetch Metadata+CSRF đúng, giữ các biến thể cross-site/null khác403. [Hồ sơ trước/sau](BUG_RESET_BROWSER_403.md) có ảnh và JSON lỗi trước sửa; sau sửa cả4 context native reset303login. Trong JSON `network.fetchSite` có thể null vì API `request.headers()` không cung cấp header này; không dùng trường null đó để khẳng định browser không gửi header. Repro HTTP server tạm đã quan sát trực tiếp same-origin; middleware bắt buộc nó mới cho qua Origin:null.
- Resend không tiết lộ pending qua429/303 khi quota public và challenge lệch nhau. Quota public áp dụng mọi email, internal backstop chỉ suppress mail. Có regression thật nhóm17.
- CAPTCHA ID hợp lệ được consume dù answer thiếu/sai kiểu/quá dài; OTP kiểm attempts trước hash;404 không phản chiếu querytoken.
- Production không tạo Ethereal mailbox hoặc log preview. Dev vẫn cho preview theo yêu cầu prompt; link vẫn phải giữ riêng.
- **Đính chính ACT-05 cũ:** mục5.1 prompt yêu cầu register hợp lệ mọi nhánh đều303. Không đổi riêng pending thành429.429 ở activate/resend do quota vẫn được thực thi/kiểm chứng.

## Ma trận34 tiêu chí sau khắc phục

A01…A20 là thứ tự các nhóm `checks` trong http-results mới; B là4 context browser, U là bộ unit22 ca. Không đồng nhất số nhóm test với phần trăm hoàn thành bài.

| ID | Kết quả | Chứng cứ/giới hạn |
|---|---|---|
| SRC-01 | PASS | A05/A12/A13 kiểm hash; U chặn Ethereal production. Raw OTP/link chỉ đi qua mail/form đúng mục đích; dev preview được prompt cho phép, không log rawsecret |
| SRC-02 | PASS | A05/A09/A13, Argon2id thật |
| SRC-03 | PASS | A06/B pending không Session.userId |
| SRC-04 | PASS | A02/A15, guard mọi CRUD method/list/detail/form |
| SRC-05 | PARTIAL | A12/B GETreset không đổi usedAt/password; GET auth vẫn ghi metadata Session/CAPTCHA/counter. Câu cấm mọi ghi GET tuyệt đối chưa khớp |
| SRC-06 | PASS | A04/A09/A10/A18: store/counterDB, no hidden answer/cookie payload |
| ACT-01 | PASS | A06/B pending denied |
| ACT-02 | PASS | A06/A07/B active đúng user, verifiedAt |
| ACT-03 | PASS | A06/A07/A08/B cùng INVALID_OTP dưới quota; khóa/quá lượt ưu tiên429 |
| ACT-04 | PASS | A07/A08 old rejected/new accepted |
| ACT-05 | PASS | A08/A14,429 cho activate/resend, attempts/lock không reset; register uniform303 đúng mục5.1 prompt |
| ACT-06 | PASS | A05 roleadmin body bị bỏ qua, viewer |
| ACT-07 | PASS | A06/B activated chưa login |
| ACT-08 | PASS | A06 OTP không làm password |
| CAP-01 | PASS | A04 không user/mail |
| CAP-02 | PASS | A05/B SMTP local nhận OTP |
| CAP-03 | PASS | A04/A16 replay/expired/purpose/anon/malformed |
| CAP-04 | PASS | A09 correctpassword thiếuCAPTCHA denied trướcverify; đối chiếu thứ tự source |
| CAP-05 | PASS | A09 count tăng4…10 dù CAPTCHA đúng |
| CAP-06 | PASS | A18 đúng cảCAPTCHA/password khi khóa qua restart vẫn429 |
| CAP-07 | PASS | A09 clientjar mới không né emailcounter |
| SES-01 | PASS | A02/B anonymous303, nghiệp vụ không ghi |
| SES-02 | PASS | A09/A15/B303,sid,CRUD; SecureHTTPS production chưa quan sát thực |
| SES-03 | PASS | A09 cùng thông báo missingemail/wrongpassword |
| SES-04 | PASS | A09/Bsid rotate |
| SES-05 | PASS | A10/B restart process thật giữ cookie/session |
| SES-06 | PASS | A10/Blogout rowgone,replaydenied,stale set không hồi sinh |
| SES-07 | PASS | A03/A15/U/B thiếuCSRF/Originngoài403; ngoại lệ reset được giới hạn |
| RST-01 | PARTIAL | A12/A20/B cùngstatus/content. Có8 cặp timing mô tả, chưa đủ chứng minh không thể dò bằngtiming |
| RST-02 | PASS | A12/A14forgotquota429 |
| RST-03 | PASS | A12/A13/Btokenold/expired/usedrejected,atomicclaim |
| RST-04 | PASS | A12/BGETreset không claim |
| RST-05 | PASS | A13/Bnoautologin,oldsessiondenied |
| RST-06 | PASS | A19token không thaypassword/OTP/signedsid |
| **Tổng34** | **32PASS /0FAIL /2PARTIAL /0UNVERIFIED /0NOT_APPLICABLE** | Những hạng mục ngoài34 chưa nghiệm thu được liệt kê riêng dưới đây |

Timing A20 chỉ đo POSTforgot, luân phiên thứ tự known/unknown,8 cặp: trung bình2080/1864ms; known1973–2483ms, unknown1776–2359ms. Chênh trung bình216ms, các khoảng chồng lấn. Không suy ra constant-time hoặc không có side-channel từ16 quan sát; không coi floor1200ms là thời gian cố định. Không benchmark production.

## Hồ sơ slide62–63 và giới hạn còn lại

- [Sơ đồ luồng](flows.md), [vấn đáp audit gốc](../BLOCK8_AUTHENTICATION_AUDIT_REPORT.md), [VERIFY](VERIFY.md) và [hồ sơ lỗi agent](BUG_RESET_BROWSER_403.md) đã có. Prompt yêu cầu agent cung cấp bản tham khảo; nhóm vẫn phải **tự vẽ và giải thích** khi nộp, không được tuyên bố agent đã thay nhóm thực hiện phần trình bày.
-45 ảnh auth thật từ schema test trong [auth-browser-final](evidence/auth-browser-final/);4 ảnh navbar cuối trong [auth-navbar-final](evidence/auth-navbar-final/). Các20 nhóm HTTP có request/redirect/Set-Cookieflags và snapshotDB đã che trong JSON mới.
- Bảng HTML/ảnh tổng hợp UI/Network/Cookies/DB của lượt observer **trước sửa reset** được tách tại [auth-observer-before-reset-fix/index.html](evidence/auth-observer-before-reset-fix/index.html); đây là lịch sử, không coi UI trước sửa là ảnh cuối. Ảnh lỗi rõ ràng trong auth-reset-before. Bảng tổng hợp thu dữ liệu thật bằng API, **không phải ảnh tab DevTools**; nếu giáo viên yêu cầu đúng DevTools/Application, nhóm chụp theo VERIFY và che credential. Chưa có bộ ảnh DevTools cho riêng từng34 tình huống.
- Literal “mọi GET không ghi bất cứ metadata nào” xung đột với CAPTCHA SSR cấp challengeDB và rollingDBsession. Đã công bố ngoại lệ; chưa loại mọi metadatawrite.
- Runtime auth không SQL riêng vendor, nhưng schema UUID/migration và test hiệnPostgreSQL. Không thay schema đang phục vụ dữ liệu nhóm để đánh dấu yêu cầu đaDB đạt. Chưa nghiệm thu provider khác.
- Chưa xác minh inbox SMTP thật, HTTPS/proxy/Securecookie trên deployment, nhiềuinstance, screenreader/OCR hay phân tích timing production. Những điều này không trở thành PASS chỉ vì code được push.

## Chạy trên máy mới

Đọc [HANDOFF](HANDOFF_BLOCK8.md). Clone main chứa commit mới, vào đúng Web-Block5 chạy npmci rồi npxprismagenerate; tự cấu hình.env ngoàiGit, không migrate/seed/reset DB có sẵn khi chỉ đổi máy. Browser/tool/process đang chạy không di chuyển cùngGit. Có thể bắt đầu chat Codex mới bằng câu nhắn trong HANDOFF. Không cần chuyển cookie hoặc secret Codex để giữ ngữ cảnh dự án.
