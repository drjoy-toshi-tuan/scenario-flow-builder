import { useEffect, useRef } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { useAuth } from '../auth/useAuth';
import {
  useDriveToken,
  validDriveToken,
  hasDriveConsent,
  markDriveConsent,
  driveAuthFlight,
  loadDriveRefreshBlob,
  saveDriveRefreshBlob,
  clearDriveRefreshBlob,
} from './token';
import { DRIVE_SCOPE } from './config';
import { refreshDriveToken, isDriveTokenProxyConfigured, DriveTokenProxyError } from './tokenProxy';

// ─────────────────────────────────────────────────────────────────────────────
// Tự GIA HẠN access token Drive để người dùng chỉ phải chấp thuận quyền 1 LẦN.
// Hai nhánh, ưu tiên theo thứ tự:
//
// A) CÓ refresh_blob + token proxy (đường auth-code, xem useDriveAuth.ts):
//    token sắp hết hạn / đã mất -> fetch NGẦM tới proxy đổi blob lấy token mới.
//    Không popup, không cần user gesture, không đụng gì tới UI. Blob chết hẳn
//    (thu hồi quyền) -> xoá blob, rơi về panel kết nối.
//
// B) Fallback implicit (không proxy / chưa có blob): xin token mới cần mở popup
//    GIS, mà trình duyệt chỉ cho mở popup trong USER GESTURE, nên:
//    1) Token sắp hết hạn -> "cưỡi" lên pointerdown kế tiếp để gọi login()
//       ngay trong gesture — luôn được phép.
//    2) Token mất hẳn -> thử xin im lặng 1 lần; bị chặn popup thì rơi về (1).
//    Chỉ chạy khi tài khoản ĐÃ TỪNG chấp thuận (cờ consent trong localStorage).
//
// Mount 1 lần ở App (khi đã đăng nhập, không phải chế độ demo).
// ─────────────────────────────────────────────────────────────────────────────

// Xin token mới khi còn dưới ngưỡng này (đủ xa để không chết giữa thao tác lưu).
const REFRESH_AHEAD_MS = 5 * 60_000;

// Nhịp kiểm tra trạng thái token (rẻ — chỉ so sánh số).
const CHECK_INTERVAL_MS = 15_000;

// Nhánh proxy: giãn cách tối thiểu giữa 2 lần gọi refresh (chống dội khi lỗi mạng).
const PROXY_RETRY_MS = 60_000;

export function DriveTokenKeeper() {
  const { user } = useAuth();
  const setToken = useDriveToken((s) => s.setToken);

  // Chống lặp: mỗi "đợt mất token" (định danh bằng expiresAt) chỉ thử im lặng 1 lần.
  const silentTriedFor = useRef<number | null>(null);
  // Nhánh proxy: mốc lần gọi refresh gần nhất (backoff khi thất bại).
  const lastProxyAttempt = useRef(0);

  const login = useGoogleLogin({
    flow: 'implicit',
    scope: DRIVE_SCOPE,
    hint: user?.email,
    // '' = chỉ hỏi lần đầu chưa consent; đã consent thì popup tự đóng ngay.
    prompt: '',
    onSuccess: (res) => {
      driveAuthFlight.busy = false;
      setToken(res.access_token, res.expires_in);
      if (user?.email) markDriveConsent(user.email);
    },
    // Thất bại thì im lặng (không phá UI) — panel kết nối vẫn là fallback cuối.
    onError: () => {
      driveAuthFlight.busy = false;
    },
    onNonOAuthError: () => {
      driveAuthFlight.busy = false;
    },
  });
  // login đổi identity mỗi render — giữ qua ref để interval/listener luôn gọi bản mới.
  const loginRef = useRef(login);
  loginRef.current = login;

  useEffect(() => {
    if (!user?.email || user.demo) return;
    const email = user.email;

    const tryLogin = () => {
      if (driveAuthFlight.busy) return;
      driveAuthFlight.busy = true;
      loginRef.current();
    };

    // Nhánh A: gia hạn ngầm qua proxy bằng refresh_blob (fetch thường, không popup).
    const tryProxyRefresh = (blob: string) => {
      if (driveAuthFlight.busy) return;
      if (Date.now() - lastProxyAttempt.current < PROXY_RETRY_MS) return;
      lastProxyAttempt.current = Date.now();
      driveAuthFlight.busy = true;
      void refreshDriveToken(blob)
        .then((grant) => {
          setToken(grant.accessToken, grant.expiresInSec);
          // Proxy niêm phong lại blob mỗi lần (iat trượt; Google có thể phát
          // refresh token mới) — luôn lưu bản mới nhất.
          saveDriveRefreshBlob(email, grant.refreshBlob);
        })
        .catch((e: unknown) => {
          // Chết hẳn (thu hồi quyền / blob quá hạn) -> bỏ blob, quay về panel
          // kết nối. Lỗi mạng / 5xx thoáng qua -> giữ blob, tick sau thử lại.
          if (e instanceof DriveTokenProxyError && (e.code === 'revoked' || e.code === 'mismatch')) {
            clearDriveRefreshBlob();
          }
        })
        .finally(() => {
          driveAuthFlight.busy = false;
        });
    };

    // Nhánh B (gesture): chờ pointerdown kế tiếp để mở popup GIS hợp lệ.
    // { once: true } tự gỡ; capture để chạy trước mọi handler khác (vd chính nút Kết nối
    // — driveAuthFlight ngăn nút đó mở popup thứ 2).
    let armed = false;
    const onGesture = () => {
      armed = false;
      tryLogin();
    };
    const arm = () => {
      if (armed) return;
      armed = true;
      window.addEventListener('pointerdown', onGesture, { once: true, capture: true });
    };
    const disarm = () => {
      if (!armed) return;
      armed = false;
      window.removeEventListener('pointerdown', onGesture, { capture: true });
    };

    const tick = () => {
      if (driveAuthFlight.busy) return;
      const state = useDriveToken.getState();
      const valid = validDriveToken(state);
      const farFromExpiry = valid !== null && state.expiresAt - Date.now() > REFRESH_AHEAD_MS;

      // Nhánh A trước: có blob + proxy thì mọi thứ ngầm, không cần gesture.
      const blob = isDriveTokenProxyConfigured() ? loadDriveRefreshBlob(email) : null;
      if (blob) {
        disarm();
        if (!farFromExpiry) tryProxyRefresh(blob);
        return;
      }

      // Nhánh B: implicit + gesture (giữ nguyên hành vi cũ).
      if (!hasDriveConsent(email)) return;
      if (farFromExpiry) {
        // Còn xa hạn — không cần làm gì.
        disarm();
        return;
      }
      // Sắp hết hạn hoặc đã mất token -> chờ gesture kế tiếp để xin lại.
      arm();
      // Mất token hẳn thì thử thêm 1 lượt im lặng (được thì panel không kịp hiện).
      if (!valid && silentTriedFor.current !== state.expiresAt) {
        silentTriedFor.current = state.expiresAt;
        tryLogin();
      }
    };

    // Tab quay lại foreground (interval bị throttle khi ở nền) -> kiểm tra ngay,
    // token thường được gia hạn xong trước khi người dùng kịp thao tác.
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };

    tick();
    const interval = window.setInterval(tick, CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      disarm();
    };
    // token/expiresAt đọc tươi qua getState() trong tick — deps chỉ cần user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return null;
}
