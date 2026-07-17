import { useEffect, useRef } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { useAuth } from '../auth/useAuth';
import { getStoredIdToken } from '../auth/session';
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
import { DRIVE_SCOPE, DRIVE_CODE_SCOPE } from './config';
import {
  exchangeDriveCode,
  refreshDriveToken,
  isDriveTokenProxyConfigured,
  DriveTokenProxyError,
} from './tokenProxy';

// ─────────────────────────────────────────────────────────────────────────────
// Tự GIA HẠN access token Drive để người dùng chỉ phải chấp thuận quyền 1 LẦN.
// Các nhánh, ưu tiên theo thứ tự:
//
// A) CÓ refresh_blob + token proxy (đường auth-code, xem useDriveAuth.ts):
//    token sắp hết hạn / đã mất -> fetch NGẦM tới proxy đổi blob lấy token mới.
//    Không popup, không cần user gesture, không đụng gì tới UI. Blob chết hẳn
//    (thu hồi quyền) -> xoá blob, rơi về panel kết nối.
//
// A') CÓ proxy nhưng CHƯA có blob (tài khoản kết nối từ thời implicit cũ —
//    chỉ có cờ consent): nâng cấp 1 LẦN sang auth-code flow để lấy blob.
//    Popup cần user gesture nên "cưỡi" pointerdown kế tiếp; đã consent sẵn
//    nên popup tự đóng gần như ngay. Có blob rồi thì mãi mãi đi nhánh A.
//    TUYỆT ĐỐI không tự bật popup implicit mỗi giờ nữa (đó chính là hiện
//    tượng "popup tự nảy lên rồi tự tắt" bị người dùng báo).
//
// B) Fallback implicit (KHÔNG có proxy): xin token mới cần mở popup GIS, mà
//    trình duyệt chỉ cho mở popup trong USER GESTURE, nên:
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
  // Nhánh A': mỗi phiên chỉ thử nâng cấp auth-code 1 lần (user đóng popup thì thôi,
  // không dí tiếp — implicit gesture vẫn là lưới đỡ ở tick sau).
  const upgradeTriedThisSession = useRef(false);

  // Nhánh A': auth-code flow — đổi code qua proxy lấy access token + refresh_blob.
  const emailRef = useRef<string | undefined>(user?.email);
  emailRef.current = user?.email;
  const codeUpgrade = useGoogleLogin({
    flow: 'auth-code',
    scope: DRIVE_CODE_SCOPE,
    hint: user?.email,
    onSuccess: (res) => {
      void (async () => {
        try {
          const idToken = getStoredIdToken();
          if (!idToken) return;
          const grant = await exchangeDriveCode(res.code, idToken);
          setToken(grant.accessToken, grant.expiresInSec);
          const email = emailRef.current;
          if (email) {
            saveDriveRefreshBlob(email, grant.refreshBlob);
            markDriveConsent(email);
          }
        } catch {
          // Đổi code thất bại — giữ nguyên trạng thái, tick sau còn implicit gesture đỡ.
        } finally {
          driveAuthFlight.busy = false;
        }
      })();
    },
    onError: () => {
      driveAuthFlight.busy = false;
    },
    onNonOAuthError: () => {
      driveAuthFlight.busy = false;
    },
  });

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
  const codeUpgradeRef = useRef(codeUpgrade);
  codeUpgradeRef.current = codeUpgrade;

  useEffect(() => {
    if (!user?.email || user.demo) return;
    const email = user.email;

    const tryLogin = () => {
      if (driveAuthFlight.busy) return;
      driveAuthFlight.busy = true;
      loginRef.current();
    };

    const tryCodeUpgrade = () => {
      if (driveAuthFlight.busy) return;
      driveAuthFlight.busy = true;
      upgradeTriedThisSession.current = true;
      codeUpgradeRef.current();
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

    // Gesture chung cho A'/B: chờ pointerdown kế tiếp để mở popup GIS hợp lệ.
    // { once: true } tự gỡ; capture để chạy trước mọi handler khác (vd chính nút Kết nối
    // — driveAuthFlight ngăn nút đó mở popup thứ 2).
    let armed: 'implicit' | 'upgrade' | null = null;
    const onGesture = () => {
      const mode = armed;
      armed = null;
      if (mode === 'upgrade') tryCodeUpgrade();
      else tryLogin();
    };
    const arm = (mode: 'implicit' | 'upgrade') => {
      if (armed === mode) return;
      if (armed) window.removeEventListener('pointerdown', onGesture, { capture: true });
      armed = mode;
      window.addEventListener('pointerdown', onGesture, { once: true, capture: true });
    };
    const disarm = () => {
      if (!armed) return;
      armed = null;
      window.removeEventListener('pointerdown', onGesture, { capture: true });
    };

    const tick = () => {
      if (driveAuthFlight.busy) return;
      const state = useDriveToken.getState();
      const valid = validDriveToken(state);
      const farFromExpiry = valid !== null && state.expiresAt - Date.now() > REFRESH_AHEAD_MS;
      const proxied = isDriveTokenProxyConfigured();

      // Nhánh A trước: có blob + proxy thì mọi thứ ngầm, không cần gesture.
      const blob = proxied ? loadDriveRefreshBlob(email) : null;
      if (blob) {
        disarm();
        if (!farFromExpiry) tryProxyRefresh(blob);
        return;
      }

      if (!hasDriveConsent(email)) return;
      if (farFromExpiry) {
        // Còn xa hạn — không cần làm gì.
        disarm();
        return;
      }

      // Nhánh A': có proxy nhưng thiếu blob -> nâng cấp auth-code 1 lần trên
      // gesture kế tiếp; KHÔNG bật popup implicit tự động (hết cảnh popup nảy
      // lên mỗi giờ). Nếu lượt nâng cấp trong phiên đã dùng (user đóng popup)
      // thì rơi xuống implicit gesture như cũ để không kẹt không có token.
      if (proxied && !upgradeTriedThisSession.current) {
        arm('upgrade');
        return;
      }

      // Nhánh B: implicit + gesture (giữ nguyên hành vi cũ khi không có proxy).
      arm('implicit');
      // Mất token hẳn thì thử thêm 1 lượt im lặng (được thì panel không kịp hiện)
      // — chỉ ở fallback KHÔNG proxy; có proxy thì không tự bật popup nữa.
      if (!proxied && !valid && silentTriedFor.current !== state.expiresAt) {
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
