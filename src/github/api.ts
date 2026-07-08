// ─────────────────────────────────────────────────────────────────────────────
// Client GitHub Contents API (thuần fetch) để liệt kê / đọc / ghi / xoá file YAML
// trong thư mục FLOWS_DIR của repo. Không phụ thuộc React — dễ test/mock.
//
// Mọi lời gọi cần `token` (fine-grained PAT, quyền Contents: Read/Write). Token
// KHÔNG lưu trong module này — truyền vào từng hàm; việc lưu trữ do github/token.ts.
// ─────────────────────────────────────────────────────────────────────────────

import {
  FLOWS_DIR,
  GITHUB_API_BASE,
  GITHUB_BRANCH,
  GITHUB_OWNER,
  GITHUB_REPO,
} from './config';

export interface FlowFile {
  name: string; // ví dụ: sample-flow.yaml
  path: string; // ví dụ: flows/sample-flow.yaml
  sha: string; // sha blob — cần khi cập nhật/xoá
  size: number;
}

export class GithubApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    // Mã ngắn để UI ánh xạ i18n: auth (401/403), notfound (404), conflict (409/422)…
    public readonly code: 'auth' | 'notfound' | 'conflict' | 'ratelimit' | 'network' | 'other',
  ) {
    super(message);
    this.name = 'GithubApiError';
  }
}

// ── Base64 <-> UTF-8 (an toàn cho ký tự nhiều byte: tiếng Nhật/Việt) ──
export function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function base64ToUtf8(base64: string): string {
  // GitHub trả base64 có xuống dòng — bỏ khoảng trắng trước khi decode.
  const clean = base64.replace(/\s/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function codeForStatus(status: number): GithubApiError['code'] {
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'notfound';
  if (status === 409 || status === 422) return 'conflict';
  return 'other';
}

async function ghFetch(token: string, path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${GITHUB_API_BASE}${path}`, {
      ...init,
      // GitHub API trả `Cache-Control: private, max-age=60` cho request đọc — nếu để
      // trình duyệt cache thì sau khi tạo/upload/xoá file, danh sách `flows/` sẽ còn
      // hiện bản CŨ tới 60s. `no-store` buộc luôn lấy dữ liệu mới → file mới hiện ngay.
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new GithubApiError('Không kết nối được GitHub.', 0, 'network');
  }
  return res;
}

async function ensureOk(res: Response): Promise<Response> {
  if (res.ok) return res;
  // Rate limit của GitHub trả 403 kèm header — tách riêng để báo rõ hơn.
  if (res.status === 403 && res.headers.get('X-RateLimit-Remaining') === '0') {
    throw new GithubApiError('Đã chạm giới hạn tần suất GitHub.', 403, 'ratelimit');
  }
  let detail = '';
  try {
    const body = (await res.json()) as { message?: string };
    detail = body.message ?? '';
  } catch {
    // ignore
  }
  throw new GithubApiError(detail || `GitHub API lỗi (${res.status}).`, res.status, codeForStatus(res.status));
}

const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/');

const isYaml = (name: string) => /\.ya?ml$/i.test(name);

// Xác thực token nhanh + kiểm tra có quyền trên repo (GET repo metadata).
export async function verifyToken(token: string): Promise<{ login: string }> {
  const res = await ensureOk(await ghFetch(token, '/user'));
  const user = (await res.json()) as { login: string };
  // Đảm bảo token với tới đúng repo (nếu không sẽ ném notfound/auth).
  await ensureOk(await ghFetch(token, `/repos/${GITHUB_OWNER}/${GITHUB_REPO}`));
  return { login: user.login };
}

// Liệt kê file YAML trong thư mục FLOWS_DIR. Thư mục chưa tồn tại -> trả [].
export async function listFlows(token: string): Promise<FlowFile[]> {
  const res = await ghFetch(
    token,
    `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodePath(FLOWS_DIR)}?ref=${encodeURIComponent(GITHUB_BRANCH)}`,
  );
  if (res.status === 404) return []; // thư mục chưa được tạo.
  await ensureOk(res);
  const items = (await res.json()) as Array<{
    type: string;
    name: string;
    path: string;
    sha: string;
    size: number;
  }>;
  return items
    .filter((it) => it.type === 'file' && isYaml(it.name))
    .map((it) => ({ name: it.name, path: it.path, sha: it.sha, size: it.size }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Đọc nội dung 1 file (text) + sha (để cập nhật sau).
export async function getFlow(token: string, path: string): Promise<{ content: string; sha: string }> {
  const res = await ensureOk(
    await ghFetch(
      token,
      `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodePath(path)}?ref=${encodeURIComponent(GITHUB_BRANCH)}`,
    ),
  );
  const body = (await res.json()) as { content?: string; sha: string; encoding?: string };
  const content = body.content ? base64ToUtf8(body.content) : '';
  return { content, sha: body.sha };
}

// Tạo mới / cập nhật 1 file. Có `sha` -> cập nhật; không -> tạo mới.
// Trả sha mới để lần lưu tiếp theo dùng đúng phiên bản.
export async function putFlow(
  token: string,
  path: string,
  content: string,
  message: string,
  sha?: string,
): Promise<{ sha: string }> {
  const res = await ensureOk(
    await ghFetch(token, `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodePath(path)}`, {
      method: 'PUT',
      body: JSON.stringify({
        message,
        content: utf8ToBase64(content),
        branch: GITHUB_BRANCH,
        ...(sha ? { sha } : {}),
      }),
    }),
  );
  const body = (await res.json()) as { content: { sha: string } };
  return { sha: body.content.sha };
}

// Xoá 1 file (cần sha hiện tại).
export async function deleteFlow(token: string, path: string, sha: string, message: string): Promise<void> {
  await ensureOk(
    await ghFetch(token, `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodePath(path)}`, {
      method: 'DELETE',
      body: JSON.stringify({ message, sha, branch: GITHUB_BRANCH }),
    }),
  );
}

// Chuẩn hoá tên file người dùng nhập/upload thành tên hợp lệ, luôn có đuôi .yaml/.yml.
// Giữ chữ/số MỌI ngôn ngữ (kể cả tiếng Nhật) + . _ - ; loại bỏ ký tự nguy hiểm cho
// path (dấu phân tách, ký tự điều khiển…). Chống path traversal, không mở đầu bằng '.'/'-'.
export function sanitizeFileName(raw: string): string {
  let name = raw.trim().replace(/\s+/g, '-');
  // Chỉ giữ ký tự chữ (\p{L}) / số (\p{N}) của mọi bảng chữ, và . _ - ; bỏ phần còn lại.
  name = name.replace(/[^\p{L}\p{N}._-]/gu, '');
  name = name.replace(/^[.-]+/u, ''); // không mở đầu bằng . hoặc -

  // Giữ .yml nếu người dùng đã dùng, còn lại mặc định .yaml.
  const ext = /\.yml$/i.test(name) ? '.yml' : '.yaml';
  let base = name.replace(/\.ya?ml$/i, '').replace(/\.+$/, '').replace(/^[.-]+/u, '');
  if (!base) base = 'flow';
  return `${base}${ext}`;
}

// Tạo tên file duy nhất trong tập tên đã có (thêm -2, -3… trước đuôi) — dùng khi
// tạo flow mới để không ghi đè file trùng tên.
export function uniqueFileName(desired: string, taken: Set<string>): string {
  if (!taken.has(desired)) return desired;
  const m = desired.match(/^(.*?)(\.ya?ml)$/i);
  const base = m ? m[1] : desired;
  const ext = m ? m[2] : '.yaml';
  let i = 2;
  while (taken.has(`${base}-${i}${ext}`)) i++;
  return `${base}-${i}${ext}`;
}

export { isYaml };
