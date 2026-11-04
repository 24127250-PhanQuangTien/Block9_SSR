// Only publish fixed labels and SMTP status numbers, never provider replies,
// exception messages, connection options, recipient addresses or credentials.
const connectionCodes = new Set([
  "ESOCKET", "ECONNECTION", "ETIMEDOUT", "EDNS", "ECONNREFUSED",
  "ENOTFOUND", "EAI_AGAIN", "ECONNRESET", "EACCES", "EPERM",
  "EHOSTUNREACH", "ENETUNREACH",
]);
const tlsCodes = new Set([
  "ETLS", "CERT_HAS_EXPIRED", "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "ERR_TLS_CERT_ALTNAME_INVALID",
]);

function mailDiagnostic(error)
{
  const code = error?.code;
  const responseCode = Number.isInteger(error?.responseCode) && error.responseCode >= 400 && error.responseCode <= 599
    ? error.responseCode : null;
  if (code === "EAUTH")
  {
    return {
      category: "authentication", code, responseCode,
      hint: "SMTP từ chối đăng nhập. Với Gmail, nhập đúng email gửi và mật khẩu ứng dụng mới được tạo cho chính tài khoản đó; không dùng mật khẩu Gmail thường.",
    };
  }
  if (tlsCodes.has(code))
  {
    return {
      category: "tls", code, responseCode,
      hint: "Không xác minh được kết nối TLS. Kiểm tra ngày giờ máy và cấu hình chứng chỉ/mạng; không tắt kiểm tra chứng chỉ.",
    };
  }
  if (connectionCodes.has(code))
  {
    return {
      category: "connection", code, responseCode,
      hint: "Không kết nối được SMTP. Kiểm tra mạng, DNS, firewall và cặp host/port của nhà cung cấp.",
    };
  }
  return {
    category: "other", code: "OTHER", responseCode,
    hint: "Chưa phân loại được lỗi SMTP; không công khai error.message hoặc SMTP reply vì có thể chứa thông tin nhạy cảm.",
  };
}

module.exports = { mailDiagnostic };
