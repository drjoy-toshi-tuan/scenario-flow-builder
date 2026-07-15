import { useEffect, useRef } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { useAuth } from '../auth/useAuth';
import {
  useDriveToken,
  validDriveToken,
  hasDriveConsent,
  markDriveConsent,
  driveAuthFlight,
} from './token';
import { DRIVE_SCOPE } from './config';

// ─────────────────────────────────────────────────────────────────────────────
// Tự GIA HẠN access token Drive để người dùng chỉ phải chấp thuận quyền 1 LẦN:
//
// - Consent thì Google đã nhớ sẵn — vấn đề chỉ là access token sống ~1 giờ và
//   việc xin token mới cần mở popup GIS (popup tự đóng ngay, không cần bấm gì).
// - Trình duyệt chỉ cho mở popup trong USER GESTURE, nên chiến lược ở đây:
//   1) Token sắp hết hạn (< REFRESH_AHEAD_MS) -> "cưỡi" lên pointerdown kế tiếp
//      của người dùng để gọi login() ngay trong gesture — luôn được phép.
//   2) Token đã mất hẳn (mở tab mới, để máy qua đêm…) -> thử xin im lặng 1 lần;
//      một số trình duyệt chặn popup ngoài gesture thì rơi tiếp về (1): chạm
//      chuột phát đầu tiên là có token lại, panel kết nối không kịp làm phiền.
// - Chỉ chạy khi tài khoản này ĐÃ TỪNG chấp thuận (cờ localStorage) — người mới
//   vẫn đi qua nút "Kết nối Google Drive" (useDriveAuth) như cũ.
//
// Mount 1 lần ở App (khi đã đăng nhập, không phải chế độ demo).
// ─────────────────────────────────────────────────────────────────────────────

// Xin token mới khi còn dưới ngưỡng này (đủ xa để không chết giữa thao tác lưu).
const REFRESH_AHEAD_MS = 5 * 60_000;

// Nhịp kiểm tra trạng thái token (rẻ — chỉ so sánh số).
const CHECK_INTERVAL_MS = 15_000;

export function DriveTokenKeeper() {
  const { user } = useAuth();
  const setToken = useDriveToken((s) => s.setToken);

  // Chống lặp: mỗi "đợt mất token" (định danh bằng expiresAt) chỉ thử im lặng 1 lần.
  const silentTriedFor = useRef<number | null>(null);

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

    // Gesture kế tiếp của người dùng -> xin token trong gesture (không bị chặn popup).
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
      if (!hasDriveConsent(email) || driveAuthFlight.busy) return;
      const state = useDriveToken.getState();
      const valid = validDriveToken(state);
      if (valid && state.expiresAt - Date.now() > REFRESH_AHEAD_MS) {
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

    tick();
    const interval = window.setInterval(tick, CHECK_INTERVAL_MS);
    return () => {
      window.clearInterval(interval);
      disarm();
    };
    // token/expiresAt đọc tươi qua getState() trong tick — deps chỉ cần user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return null;
}
