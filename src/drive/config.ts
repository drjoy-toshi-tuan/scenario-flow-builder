// ─────────────────────────────────────────────────────────────────────────────
// Cấu hình kho Google Drive chứa flow YAML theo cấu trúc 3 tầng:
//   ROOT › <施設名>/ › <シナリオ名>/ › <シナリオ名>_V{N}.yaml
//
// App gọi thẳng Drive REST API từ browser bằng access token OAuth của người
// dùng (scope drive) — giống mô hình GitHub Contents API + PAT hiện có, nhưng
// token do Google cấp qua popup consent (1 lần đầu) thay vì người dùng tự dán.
// KHÔNG có client secret trong bundle (token flow). Xem drive/useDriveAuth.ts.
// ─────────────────────────────────────────────────────────────────────────────

// Folder gốc trên Drive (share quyền Editor cho team). Override qua env khi đổi kho.
// Dùng || (không phải ??): trên CI, secret/variable chưa đặt vẫn sinh ra biến env
// CHUỖI RỖNG — rỗng thì phải rơi về mặc định, nếu không mọi URL Drive sẽ thiếu ID.
export const DRIVE_ROOT_FOLDER_ID =
  (import.meta.env.VITE_DRIVE_ROOT_FOLDER_ID as string | undefined) ||
  '1Fk0B99UkzyJok4So-xFjO5ywfCn57vI2';

// Kho RIÊNG của bộ phận CS — chứa シナリオ設計書 (Flow Diagram do CS vẽ), TÁCH khỏi
// kho TS ở trên. Cùng cấu trúc 3 tầng 施設 › シナリオ › _V{N}.yaml. Override qua env.
export const CS_DRIVE_ROOT_FOLDER_ID =
  (import.meta.env.VITE_CS_DRIVE_ROOT_FOLDER_ID as string | undefined) ||
  '1wBWvjwCPq7UAwZdlhC_lUJrL-PazMa1T';

// Folder gốc theo bộ phận đang làm việc (CS dùng kho riêng, còn lại dùng kho TS).
export function driveRootFolderId(csMode: boolean): string {
  return csMode ? CS_DRIVE_ROOT_FOLDER_ID : DRIVE_ROOT_FOLDER_ID;
}

// ── Endpoint cấp/gia hạn token Drive trên proxy Vercel (xem proxy-vercel/api/drive-token.js) ──
// Có URL này => dùng auth-code flow + refresh ngầm (KHÔNG popup mỗi giờ).
// Không có => rơi về implicit flow cũ (popup GIS mỗi lần token hết hạn).
// Ưu tiên VITE_DRIVE_TOKEN_URL; không đặt thì suy ra từ VITE_AI_PROXY_URL
// (cùng project Vercel: .../api/chat -> .../api/drive-token).
export const DRIVE_TOKEN_PROXY_URL = (() => {
  const explicit = (import.meta.env.VITE_DRIVE_TOKEN_URL as string | undefined)?.trim();
  if (explicit) return explicit;
  const ai = (import.meta.env.VITE_AI_PROXY_URL as string | undefined)?.trim() || '';
  return /\/api\/chat\/?$/.test(ai) ? ai.replace(/\/api\/chat\/?$/, '/api/drive-token') : '';
})();

export const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
export const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

// Scope đầy đủ (consent screen Internal nên không cần Google verification).
// Cần full `drive` (không phải drive.file) vì folder gốc tạo tay ngoài app.
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';

// Scope cho auth-code flow (kết nối qua proxy): thêm openid+email để bước đổi
// code trên server nhận được id_token — dùng đối chiếu "tài khoản chọn trong
// popup Drive = tài khoản đang đăng nhập app" (xem proxy-vercel/api/drive-token.js).
export const DRIVE_CODE_SCOPE = `openid email ${DRIVE_SCOPE}`;

export const FOLDER_MIME = 'application/vnd.google-apps.folder';

// Tên file version theo quy ước [シナリオ名]_V{N}.yaml.
export const versionFileName = (scenario: string, v: number) => `${scenario}_V${v}.yaml`;

// Đọc số version từ tên file; null nếu không theo quy ước _V{N}.yaml.
export function parseVersionFromName(name: string): number | null {
  const m = name.match(/_[vV](\d+)\.ya?ml$/);
  return m ? Number(m[1]) : null;
}

// URL mở folder gốc trên web Drive (đối chiếu nhanh).
export function driveBrowseUrl(): string {
  return `https://drive.google.com/drive/folders/${DRIVE_ROOT_FOLDER_ID}`;
}
