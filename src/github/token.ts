import { create } from 'zustand';
import { verifyToken } from './api';

// ─────────────────────────────────────────────────────────────────────────────
// Lưu GitHub fine-grained token để ghi file YAML vào repo.
//
// Token lưu ở localStorage → NHỚ qua các phiên: thêm 1 lần, lần sau tự dùng cho
// tới khi token hết hạn (theo ngày đặt lúc tạo trên GitHub) hoặc người dùng bấm
// "Ngắt kết nối". Đánh đổi: token nằm trên máy lâu hơn — KHÔNG nên dùng trên máy
// công cộng/dùng chung (khi đó hãy nhớ "Ngắt kết nối" trước khi rời máy).
// Token vẫn là bí mật của người dùng; hãy cấp quyền tối thiểu (Contents: Read/Write
// đúng repo). (Đăng nhập Google vẫn theo sessionStorage — xem auth/AuthProvider.)
// ─────────────────────────────────────────────────────────────────────────────

const TOKEN_KEY = 'brekeke-flow-builder.github.token';
const LOGIN_KEY = 'brekeke-flow-builder.github.login';

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

interface GithubTokenState {
  token: string | null;
  login: string | null; // tên đăng nhập GitHub (hiển thị khi đã kết nối).
  connecting: boolean;
  error: string | null;
  // Token đã lưu bị GitHub từ chối (hết hạn / thu hồi / mất quyền) trong lúc dùng.
  // Bật cờ này để màn hình đưa người dùng về ô nhập token kèm cảnh báo dễ hiểu.
  expired: boolean;
  // Xác thực token rồi lưu nếu hợp lệ. Trả true nếu kết nối thành công.
  connect: (token: string) => Promise<boolean>;
  disconnect: () => void;
  invalidate: () => void;
  clearError: () => void;
}

export const useGithubToken = create<GithubTokenState>((set) => ({
  token: load(TOKEN_KEY),
  login: load(LOGIN_KEY),
  connecting: false,
  error: null,
  expired: false,

  connect: async (raw) => {
    const token = raw.trim();
    if (!token) {
      set({ error: 'empty' });
      return false;
    }
    set({ connecting: true, error: null });
    try {
      const { login } = await verifyToken(token);
      try {
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(LOGIN_KEY, login);
      } catch {
        // localStorage không khả dụng — vẫn giữ trong bộ nhớ phiên này.
      }
      set({ token, login, connecting: false, error: null, expired: false });
      return true;
    } catch (e) {
      // Ánh xạ lỗi API -> mã ngắn cho UI (auth/notfound/network…).
      const code =
        typeof e === 'object' && e && 'code' in e ? String((e as { code: unknown }).code) : 'other';
      set({ connecting: false, error: code });
      return false;
    }
  },

  disconnect: () => {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(LOGIN_KEY);
    } catch {
      // ignore
    }
    set({ token: null, login: null, error: null, expired: false });
  },

  // Token bị từ chối (401/403) khi đang thao tác: xoá khỏi máy và bật cờ `expired`.
  // Nhờ `token = null`, màn quản lý file quay về ô nhập token; `expired` để panel
  // hiển thị cảnh báo "token hết hạn/bị thu hồi, hãy nhập lại".
  invalidate: () => {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(LOGIN_KEY);
    } catch {
      // ignore
    }
    set({ token: null, login: null, connecting: false, error: null, expired: true });
  },

  clearError: () => set({ error: null }),
}));
