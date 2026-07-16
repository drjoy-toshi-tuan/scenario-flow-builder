import { useEffect, useRef, useState } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { useAuth } from '../auth/useAuth';
import { getStoredIdToken } from '../auth/session';
import {
  useDriveToken,
  validDriveToken,
  markDriveConsent,
  driveAuthFlight,
  saveDriveRefreshBlob,
  loadDriveRefreshBlob,
  clearDriveRefreshBlob,
} from './token';
import { DRIVE_SCOPE, DRIVE_CODE_SCOPE, DRIVE_ROOT_FOLDER_ID } from './config';
import { verifyDriveAccess } from './api';
import {
  exchangeDriveCode,
  refreshDriveToken,
  isDriveTokenProxyConfigured,
  DriveTokenProxyError,
  type DriveTokenGrant,
} from './tokenProxy';

// ─────────────────────────────────────────────────────────────────────────────
// Xin access token Google Drive. Hai đường, chọn theo cấu hình:
//
// 1) CÓ token proxy (DRIVE_TOKEN_PROXY_URL — mặc định khi đã đặt VITE_AI_PROXY_URL):
//    auth-code flow. Popup consent hiện đúng 1 LẦN mỗi tài khoản; proxy đổi code
//    lấy refresh token (niêm phong thành refresh_blob cho client giữ). Từ đó về
//    sau DriveTokenKeeper GIA HẠN NGẦM bằng fetch — không popup, không cần click.
//
// 2) KHÔNG có proxy: implicit flow như cũ — token sống ~1h, mỗi lần hết hạn phải
//    mở lại popup GIS trong user gesture (keeper "cưỡi" pointerdown hộ).
//
// LƯU Ý: requestAccess phải được gọi từ user gesture (click) để popup không bị
// trình duyệt chặn — vì vậy màn quản lý hiện panel "Kết nối Google Drive" với 1
// nút bấm thay vì tự bật popup lúc mount.
// ─────────────────────────────────────────────────────────────────────────────

// Rút mã lỗi ngắn ('auth' | 'popup' | 'mismatch'…) — UI ánh xạ i18n qua gdErrorKey.
function errorCode(e: unknown): string {
  return e instanceof Error && 'code' in e ? String((e as { code: unknown }).code) : 'other';
}

export function useDriveAuth() {
  const { user } = useAuth();
  const store = useDriveToken();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const proxied = isDriveTokenProxyConfigured();

  const acceptGrant = (grant: DriveTokenGrant) => {
    store.setToken(grant.accessToken, grant.expiresInSec);
    if (user?.email) saveDriveRefreshBlob(user.email, grant.refreshBlob);
  };

  // ── Đường 1: auth-code flow qua proxy (consent 1 lần, refresh ngầm mãi) ──
  const codeLogin = useGoogleLogin({
    flow: 'auth-code',
    scope: DRIVE_CODE_SCOPE,
    hint: user?.email,
    onSuccess: (res) => {
      void (async () => {
        try {
          const idToken = getStoredIdToken();
          if (!idToken) throw new DriveTokenProxyError('Chưa có ID token.', 'auth');
          const grant = await exchangeDriveCode(res.code, idToken);
          // Xác nhận token với tới folder gốc (bắt sớm lỗi chưa được share).
          await verifyDriveAccess(grant.accessToken, DRIVE_ROOT_FOLDER_ID);
          acceptGrant(grant);
          setError(null);
        } catch (e) {
          setError(errorCode(e));
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

  // ── Đường 2 (fallback không proxy): implicit flow như trước ──
  const implicitLogin = useGoogleLogin({
    flow: 'implicit',
    scope: DRIVE_SCOPE,
    hint: user?.email,
    // '' = chỉ hỏi màn consent lần đầu; đã chấp thuận rồi thì popup tự đóng ngay.
    prompt: '',
    onSuccess: (res) => {
      void (async () => {
        try {
          await verifyDriveAccess(res.access_token, DRIVE_ROOT_FOLDER_ID);
          store.setToken(res.access_token, res.expires_in);
          // Ghi nhớ "đã chấp thuận" để DriveTokenKeeper (nhánh gesture) tự gia hạn.
          if (user?.email) markDriveConsent(user.email);
          setError(null);
        } catch (e) {
          setError(errorCode(e));
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
    if (proxied) codeLogin();
    else implicitLogin();
  };

  // ── Khôi phục ngầm lúc mount: có refresh_blob mà token đã hết (tab mới, qua
  // đêm…) -> fetch gia hạn ngay, panel kết nối chỉ hiện spinner thoáng qua thay
  // vì bắt bấm nút. Chạy 1 lần; keeper lo phần định kỳ về sau. ──
  const restoredOnce = useRef(false);
  useEffect(() => {
    if (restoredOnce.current || !proxied || !user?.email) return;
    restoredOnce.current = true;
    if (validDriveToken(useDriveToken.getState())) return;
    const blob = loadDriveRefreshBlob(user.email);
    if (!blob || driveAuthFlight.busy) return;
    driveAuthFlight.busy = true;
    setConnecting(true);
    void refreshDriveToken(blob)
      .then((grant) => {
        acceptGrant(grant);
        setError(null);
      })
      .catch((e: unknown) => {
        // Blob chết hẳn (thu hồi quyền / quá hạn) -> dọn để quay về nút kết nối.
        // Lỗi mạng thoáng qua thì im lặng — panel hiện, keeper sẽ thử lại sau.
        if (e instanceof DriveTokenProxyError && (e.code === 'revoked' || e.code === 'mismatch')) {
          clearDriveRefreshBlob();
        }
      })
      .finally(() => {
        driveAuthFlight.busy = false;
        setConnecting(false);
      });
    // acceptGrant/user ổn định trong phiên; chạy đúng 1 lần theo restoredOnce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proxied, user?.email]);

  return {
    token: validDriveToken(store),
    connecting,
    error,
    requestAccess,
    // Chỉ bỏ access token trong phiên (giữ refresh_blob): DriveManagerScreen gọi
    // khi Drive API trả 401 — keeper sẽ tự gia hạn ngầm ngay sau đó.
    disconnect: store.clear,
  };
}
