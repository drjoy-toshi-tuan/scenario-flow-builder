// Chỉ tài khoản Google thuộc domain này mới vào được app (client-side gating).
// Dễ đổi ở một chỗ duy nhất.
export const ALLOWED_DOMAIN = 'drjoy.jp';

// OAuth Client ID (Web) — KHÔNG phải secret. Lấy từ Google Cloud Console.
// Có Client ID => màn login hiện nút "Đăng nhập bằng Google" (BẮT BUỘC đăng nhập).
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

// Chế độ demo (bỏ qua đăng nhập) — CHỈ để test UI khi CHƯA có Client ID.
// Mặc định: bật khi chạy dev (npm run dev) để dev tiện thử UI; TẮT ở bản build
// production (deploy) để luôn bắt đăng nhập Google. Muốn bật demo trên bản build
// (hiếm khi cần) thì đặt VITE_ALLOW_DEMO=true.
export const ALLOW_DEMO = import.meta.env.DEV || import.meta.env.VITE_ALLOW_DEMO === 'true';

// Issuer hợp lệ của ID token do Google phát hành. Phải khớp claim `iss`.
export const ALLOWED_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'] as const;

// Độ lệch đồng hồ cho phép (giây) khi kiểm tra exp/iat — tránh loại nhầm token
// hợp lệ do lệch giờ nhẹ giữa client và Google.
export const CLOCK_SKEW_SECONDS = 60;

// ─────────────────────────────────────────────────────────────────────────────
// Thời hạn PHIÊN của app (tách khỏi exp ~1 giờ của ID token Google).
//
// ID token Google chỉ sống ~1 giờ; nếu buộc đăng xuất đúng lúc token hết hạn thì
// người dùng bị đá ra sau ~1 giờ dù vẫn đang dùng bình thường. Vì gating domain ở
// client CHỈ là cổng UX (không có backend, không quyết định bảo mật — xem README
// §Bảo mật), ta duy trì phiên theo một "cửa sổ idle trượt" riêng: mỗi lần có thao
// tác thì gia hạn thêm, chỉ đăng xuất khi KHÔNG thao tác suốt quá thời hạn này.
//
// Đổi qua env `VITE_SESSION_IDLE_MINUTES` (phút). Mặc định 12 giờ ~ đủ một ngày làm việc.
const DEFAULT_SESSION_IDLE_MINUTES = 12 * 60;

function readIdleMinutes(): number {
  const raw = import.meta.env.VITE_SESSION_IDLE_MINUTES;
  const parsed = typeof raw === 'string' ? Number.parseFloat(raw) : NaN;
  // Chỉ nhận số dương hợp lệ; ngược lại dùng mặc định.
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SESSION_IDLE_MINUTES;
}

export const SESSION_IDLE_TIMEOUT_MS = readIdleMinutes() * 60 * 1000;
