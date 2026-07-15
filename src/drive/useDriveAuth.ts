import { useState } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { useAuth } from '../auth/useAuth';
import { useDriveToken, validDriveToken, markDriveConsent, driveAuthFlight } from './token';
import { DRIVE_SCOPE, DRIVE_ROOT_FOLDER_ID } from './config';
import { verifyDriveAccess } from './api';

// ─────────────────────────────────────────────────────────────────────────────
// Xin access token Google Drive bằng GIS token flow (implicit) — KHÔNG có client
// secret, hợp static site. Popup consent chỉ hiện LẦN ĐẦU mỗi tài khoản; các lần
// sau (token hết hạn ~1h) DriveTokenKeeper tự gia hạn nền — panel kết nối với
// nút bấm ở đây chỉ dành cho lần đầu / khi bị thu hồi quyền.
//
// LƯU Ý: requestAccess phải được gọi từ user gesture (click) để popup không bị
// trình duyệt chặn — vì vậy màn quản lý hiện panel "Kết nối Google Drive" với 1
// nút bấm thay vì tự bật popup lúc mount.
// ─────────────────────────────────────────────────────────────────────────────

export function useDriveAuth() {
  const { user } = useAuth();
  const store = useDriveToken();
  const [connecting, setConnecting] = useState(false);
  // Mã lỗi ngắn ('auth' | 'popup' | 'other'…) — UI ánh xạ i18n qua gdErrorKey.
  const [error, setError] = useState<string | null>(null);

  const login = useGoogleLogin({
    flow: 'implicit',
    scope: DRIVE_SCOPE,
    hint: user?.email,
    // '' = chỉ hỏi màn consent lần đầu; đã chấp thuận rồi thì popup tự đóng ngay.
    prompt: '',
    onSuccess: (res) => {
      void (async () => {
        try {
          // Xác nhận token với tới folder gốc (bắt sớm lỗi chưa được share).
          await verifyDriveAccess(res.access_token, DRIVE_ROOT_FOLDER_ID);
          store.setToken(res.access_token, res.expires_in);
          // Ghi nhớ "đã chấp thuận" để DriveTokenKeeper tự gia hạn từ nay về sau.
          if (user?.email) markDriveConsent(user.email);
          setError(null);
        } catch (e) {
          setError(e instanceof Error && 'code' in e ? String((e as { code: unknown }).code) : 'other');
        } finally {
          driveAuthFlight.busy = false;
          setConnecting(false);
        }
      })();
    },
    onError: () => {
      driveAuthFlight.busy = false;
      setConnecting(false);
      setError('auth');
    },
    onNonOAuthError: () => {
      // Popup bị chặn / người dùng đóng popup giữa chừng.
      driveAuthFlight.busy = false;
      setConnecting(false);
      setError('popup');
    },
  });

  const requestAccess = () => {
    // driveAuthFlight: keeper có thể vừa mở popup trong cùng cú click (pointerdown
    // tới trước onClick) — đừng mở popup thứ 2 chồng lên.
    if (connecting || driveAuthFlight.busy) return;
    driveAuthFlight.busy = true;
    setConnecting(true);
    setError(null);
    login();
  };

  return {
    token: validDriveToken(store),
    connecting,
    error,
    requestAccess,
    disconnect: store.clear,
  };
}
