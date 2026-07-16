import { DRIVE_TOKEN_PROXY_URL } from './config';

// ─────────────────────────────────────────────────────────────────────────────
// Client gọi endpoint cấp/gia hạn token Drive trên proxy Vercel (thuần fetch,
// không React) — xem proxy-vercel/api/drive-token.js cho mô hình đầy đủ.
//
// - exchangeDriveCode: đổi authorization code (popup GIS auth-code flow, 1 lần
//   mỗi tài khoản) lấy access token + refresh_blob. Cần ID token app để proxy
//   chặn người ngoài domain.
// - refreshDriveToken: gửi refresh_blob -> access token mới + blob mới. KHÔNG
//   cần ID token, KHÔNG cần popup — đây là cái cho phép gia hạn ngầm vô hạn.
//
// refresh_blob là refresh token đã bị proxy MÃ HOÁ (AES-256-GCM, key chỉ ở
// server) — client giữ hộ chứ không đọc được; mất blob = phải bấm kết nối lại.
// ─────────────────────────────────────────────────────────────────────────────

export interface DriveTokenGrant {
  accessToken: string;
  expiresInSec: number;
  refreshBlob: string;
}

// Mã lỗi ngắn để UI ánh xạ i18n (gdErrorKey) + code phân nhánh xử lý:
// 'revoked' = blob chết hẳn (thu hồi quyền/hết hạn) -> xoá blob, quay về nút kết nối.
export class DriveTokenProxyError extends Error {
  constructor(
    message: string,
    public readonly code: 'auth' | 'revoked' | 'mismatch' | 'network' | 'other',
  ) {
    super(message);
    this.name = 'DriveTokenProxyError';
  }
}

export function isDriveTokenProxyConfigured(): boolean {
  return DRIVE_TOKEN_PROXY_URL.length > 0;
}

async function callTokenProxy(body: Record<string, string>, idToken?: string): Promise<DriveTokenGrant> {
  let res: Response;
  try {
    res = await fetch(DRIVE_TOKEN_PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new DriveTokenProxyError('Không kết nối được token proxy.', 'network');
  }

  if (!res.ok) {
    let code = '';
    let message = '';
    try {
      const err = (await res.json()) as { error?: { code?: string; message?: string } };
      code = err.error?.code ?? '';
      message = err.error?.message ?? '';
    } catch {
      // body không phải JSON — giữ code rỗng, rơi về 'other'.
    }
    if (code === 'revoked') throw new DriveTokenProxyError(message || 'Revoked', 'revoked');
    if (code === 'mismatch') throw new DriveTokenProxyError(message || 'Account mismatch', 'mismatch');
    if (res.status === 401) throw new DriveTokenProxyError(message || 'Unauthorized', 'auth');
    throw new DriveTokenProxyError(message || `Token proxy lỗi (${res.status}).`, 'other');
  }

  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    refresh_blob?: string;
  };
  if (!data.access_token || !data.refresh_blob) {
    throw new DriveTokenProxyError('Token proxy trả dữ liệu thiếu.', 'other');
  }
  return {
    accessToken: data.access_token,
    // Google trả 3599s; phòng thiếu field thì coi như 1h.
    expiresInSec: typeof data.expires_in === 'number' ? data.expires_in : 3600,
    refreshBlob: data.refresh_blob,
  };
}

export function exchangeDriveCode(code: string, idToken: string): Promise<DriveTokenGrant> {
  return callTokenProxy({ code }, idToken);
}

export function refreshDriveToken(refreshBlob: string): Promise<DriveTokenGrant> {
  return callTokenProxy({ refresh_blob: refreshBlob });
}
