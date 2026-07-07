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
