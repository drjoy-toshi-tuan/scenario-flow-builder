// ─────────────────────────────────────────────────────────────────────────────
// Truy cập phiên đăng nhập đã lưu — file THUẦN (không React) để cả AuthProvider
// (React) lẫn ai/openai.ts (không React) dùng chung, không kéo React vào tầng ai/.
//
// Ghi chú: KEY vẫn giữ chuỗi cũ 'brekeke-flow-builder.auth' (KHÔNG đổi theo tên
// repo mới) để không làm đăng xuất người dùng đang có phiên.
// ─────────────────────────────────────────────────────────────────────────────

export const AUTH_STORAGE_KEY = 'brekeke-flow-builder.auth';

// Lấy ID token Google thô (JWT) đã lưu — dùng gắn Authorization khi gọi AI proxy.
// Trả null nếu chưa đăng nhập / chế độ demo / phiên không có token.
export function getStoredIdToken(): string | null {
  try {
    const raw = sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { credential?: unknown };
    return typeof parsed.credential === 'string' ? parsed.credential : null;
  } catch {
    return null;
  }
}
