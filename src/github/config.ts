// ─────────────────────────────────────────────────────────────────────────────
// Cấu hình kho GitHub chứa các file YAML flow. Có thể override qua biến môi trường
// (VITE_*) nếu fork sang repo khác; mặc định trỏ về repo hiện tại.
//
// App là static site (GitHub Pages) — không có backend. Để GHI file vào repo,
// trình duyệt gọi thẳng GitHub Contents API bằng một fine-grained token do người
// dùng cung cấp (xem github/token.ts). Token chỉ cần quyền Contents: Read/Write
// trên đúng repo này.
// ─────────────────────────────────────────────────────────────────────────────

export const GITHUB_OWNER = import.meta.env.VITE_GITHUB_OWNER ?? 'drjoy-toshi-tuan';
export const GITHUB_REPO = import.meta.env.VITE_GITHUB_REPO ?? 'scenario-flow-builder';
// Nhánh để đọc/ghi file YAML. Mặc định 'main'.
export const GITHUB_BRANCH = import.meta.env.VITE_FLOWS_BRANCH ?? 'main';
// Thư mục chứa các file YAML (upload + tạo ra) trong repo.
export const FLOWS_DIR = (import.meta.env.VITE_FLOWS_DIR ?? 'flows').replace(/^\/+|\/+$/g, '');

export const GITHUB_API_BASE = 'https://api.github.com';

// URL xem thư mục flows trên GitHub (mở tab mới cho tiện đối chiếu).
export function flowsBrowseUrl(): string {
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/tree/${GITHUB_BRANCH}/${FLOWS_DIR}`;
}
