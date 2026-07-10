import { createContext } from 'react';

export interface AuthUser {
  name: string;
  email: string;
  picture?: string;
  hd?: string;
  // sub (subject) — định danh ổn định của tài khoản Google.
  sub?: string;
  // exp của ID token (epoch giây) — giữ lại để tham khảo/verify claim.
  exp?: number;
  // Thời điểm hết hạn PHIÊN app (epoch mili-giây). Tách khỏi exp token Google:
  // gia hạn theo thao tác người dùng (cửa sổ idle trượt) — xem AuthProvider.
  sessionExpiresAt?: number;
  // true nếu vào bằng "chế độ demo" (chưa cấu hình Google Client ID).
  demo?: boolean;
}

export interface AuthContextValue {
  user: AuthUser | null;
  authenticate: (user: AuthUser) => void;
  signOut: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
