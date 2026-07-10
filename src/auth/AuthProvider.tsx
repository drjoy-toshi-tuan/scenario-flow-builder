import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthContext, type AuthUser } from './context';
import { GOOGLE_CLIENT_ID, SESSION_IDLE_TIMEOUT_MS } from './config';

const STORAGE_KEY = 'brekeke-flow-builder.auth';

// Các sự kiện coi là "người dùng đang thao tác" — mỗi lần xảy ra thì gia hạn phiên.
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

// Chu kỳ (ms) kiểm tra idle + ghi lại hạn phiên xuống storage. Nhỏ hơn nhiều so với
// SESSION_IDLE_TIMEOUT_MS nên phát hiện hết hạn gần như tức thời mà không tốn tài nguyên.
const CHECK_INTERVAL_MS = 30_000;

// Session còn hợp lệ không? Phiên app tính theo `sessionExpiresAt` (cửa sổ idle trượt),
// KHÔNG theo exp ~1 giờ của ID token Google — tránh đá người dùng ra khi vẫn đang dùng.
function isStillValid(user: AuthUser): boolean {
  if (user.demo) return true; // chế độ demo không hết hạn.
  if (typeof user.sessionExpiresAt === 'number') {
    return user.sessionExpiresAt > Date.now();
  }
  // Phiên cũ (trước khi có sessionExpiresAt): fallback về exp token nếu có.
  if (typeof user.exp !== 'number') return true;
  return user.exp * 1000 > Date.now();
}

function loadStoredUser(): AuthUser | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const user = JSON.parse(raw) as AuthUser;
    // Phiên hết hạn -> bỏ, buộc đăng nhập lại.
    if (!isStillValid(user)) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return user;
  } catch {
    return null;
  }
}

function persistUser(user: AuthUser): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } catch {
    // sessionStorage không khả dụng — bỏ qua, giữ state trong bộ nhớ.
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AuthProvider bao toàn app. Nếu có GOOGLE_CLIENT_ID -> bọc thêm GoogleOAuthProvider
// để dùng nút đăng nhập Google. Nếu không -> vẫn chạy (chế độ demo, xem LoginScreen).
// ─────────────────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(loadStoredUser);

  const authenticate = useCallback((next: AuthUser) => {
    // Đóng dấu hạn phiên ban đầu = bây giờ + cửa sổ idle. Sẽ được gia hạn khi có thao tác.
    const stamped: AuthUser = next.demo
      ? next
      : { ...next, sessionExpiresAt: Date.now() + SESSION_IDLE_TIMEOUT_MS };
    setUser(stamped);
    persistUser(stamped);
  }, []);

  const signOut = useCallback(() => {
    setUser(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  // ── Cửa sổ idle trượt: gia hạn phiên theo thao tác, tự đăng xuất khi idle quá lâu ──
  // Dùng ref cho hạn phiên để KHÔNG re-render mỗi lần người dùng động vào (rẻ). Chỉ
  // ghi xuống storage định kỳ để reload trang cũng giữ đúng hạn.
  const expiresAtRef = useRef<number>(0);
  useEffect(() => {
    if (!user || user.demo) return; // demo không hết hạn.

    expiresAtRef.current = user.sessionExpiresAt ?? Date.now() + SESSION_IDLE_TIMEOUT_MS;

    // Mỗi thao tác đẩy hạn phiên xa thêm một cửa sổ idle (chỉ sửa ref — không re-render).
    const bump = () => {
      expiresAtRef.current = Date.now() + SESSION_IDLE_TIMEOUT_MS;
    };
    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, bump, { passive: true });
    }

    const tick = () => {
      if (Date.now() >= expiresAtRef.current) {
        signOut();
        return;
      }
      // Lưu lại hạn mới để reload/tab khác thấy đúng trạng thái.
      persistUser({ ...user, sessionExpiresAt: expiresAtRef.current });
    };
    const interval = window.setInterval(tick, CHECK_INTERVAL_MS);

    return () => {
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, bump);
      }
      window.clearInterval(interval);
    };
  }, [user, signOut]);

  const value = useMemo(
    () => ({ user, authenticate, signOut }),
    [user, authenticate, signOut],
  );

  const tree = <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;

  if (GOOGLE_CLIENT_ID) {
    return <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>{tree}</GoogleOAuthProvider>;
  }
  return tree;
}
