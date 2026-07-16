import type { TKey } from '../ui/i18n';
import { DriveApiError } from './api';

// Ánh xạ lỗi Drive (DriveApiError hoặc mã ngắn) -> key i18n (mirror github/errors.ts).
export function gdErrorKey(input: unknown): TKey {
  const code = input instanceof DriveApiError ? input.code : String(input);
  switch (code) {
    case 'auth':
      return 'gdErrAuth';
    case 'notfound':
      return 'gdErrNotFound';
    case 'network':
      return 'gdErrNetwork';
    case 'ratelimit':
      return 'gdErrRateLimit';
    case 'popup':
      return 'gdErrPopup';
    // Đường token proxy (tokenProxy.ts): 'revoked' = quyền bị thu hồi -> mời kết
    // nối lại (thông điệp gdErrAuth khớp); 'mismatch' = chọn nhầm tài khoản trong popup.
    case 'revoked':
      return 'gdErrAuth';
    case 'mismatch':
      return 'gdErrMismatch';
    default:
      return 'gdErrOther';
  }
}
