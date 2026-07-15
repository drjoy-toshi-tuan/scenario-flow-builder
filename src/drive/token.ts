import { create } from 'zustand';

// ─────────────────────────────────────────────────────────────────────────────
// Giữ access token Google Drive (sống ~1 giờ). Lưu localStorage để đóng tab /
// mở lại trình duyệt trong vòng 1 giờ vẫn dùng được ngay (token tự hết hạn nên
// rủi ro thấp; hết hạn là bị loại khi load). Việc XIN token nằm ở
// useDriveAuth.ts (nút bấm lần đầu) + DriveTokenKeeper.tsx (tự gia hạn nền).
// ─────────────────────────────────────────────────────────────────────────────

const KEY = 'brekeke-flow-builder.drive.token';

// Cờ "tài khoản này đã từng chấp thuận quyền Drive" (localStorage). Có cờ này
// thì keeper mới dám tự xin token im lặng — người dùng mới vẫn phải bấm nút
// kết nối lần đầu (popup consent cần user gesture).
const CONSENT_KEY = 'brekeke-flow-builder.drive.consented';

// Biên an toàn: coi token là hết hạn sớm 60s để không chết giữa thao tác lưu.
const EXPIRY_MARGIN_MS = 60_000;

// Khoá chống mở 2 popup GIS cùng lúc (nút kết nối + keeper chạy nền dùng chung).
// Singleton cấp module — cả 2 phía đều check/set trước khi gọi login().
export const driveAuthFlight = { busy: false };

interface Stored {
  token: string;
  expiresAt: number; // epoch ms
}

function load(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Stored;
    if (!data.token || data.expiresAt <= Date.now() + EXPIRY_MARGIN_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

interface DriveTokenState {
  token: string | null;
  expiresAt: number;
  setToken: (token: string, expiresInSec: number) => void;
  clear: () => void;
}

export const useDriveToken = create<DriveTokenState>((set) => {
  const stored = load();
  return {
    token: stored?.token ?? null,
    expiresAt: stored?.expiresAt ?? 0,

    setToken: (token, expiresInSec) => {
      const expiresAt = Date.now() + expiresInSec * 1000;
      try {
        localStorage.setItem(KEY, JSON.stringify({ token, expiresAt } satisfies Stored));
      } catch {
        // localStorage không khả dụng — vẫn giữ trong bộ nhớ.
      }
      set({ token, expiresAt });
    },

    clear: () => {
      try {
        localStorage.removeItem(KEY);
      } catch {
        // ignore
      }
      set({ token: null, expiresAt: 0 });
    },
  };
});

// Token còn hạn dùng được không (kèm biên an toàn) — selector thuần cho cả
// component React lẫn code ngoài React (useDriveToken.getState()).
export function validDriveToken(state: { token: string | null; expiresAt: number }): string | null {
  return state.token && state.expiresAt > Date.now() + EXPIRY_MARGIN_MS ? state.token : null;
}

// ── Cờ consent theo email (đổi tài khoản thì phải chấp thuận lại) ──

export function markDriveConsent(email: string): void {
  try {
    localStorage.setItem(CONSENT_KEY, email.trim().toLowerCase());
  } catch {
    // ignore
  }
}

export function hasDriveConsent(email: string | undefined): boolean {
  if (!email) return false;
  try {
    return localStorage.getItem(CONSENT_KEY) === email.trim().toLowerCase();
  } catch {
    return false;
  }
}
