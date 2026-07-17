// ─────────────────────────────────────────────────────────────────────────────
// Client Google Drive REST v3 (thuần fetch) — list/đọc/tạo/lưu/xoá file & folder
// trong kho flow. Không phụ thuộc React; token truyền vào từng hàm (việc lưu
// token do drive/token.ts + useDriveAuth.ts). Mirror pattern của github/api.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { DRIVE_API_BASE, DRIVE_UPLOAD_BASE, FOLDER_MIME } from './config';

// Metadata 1 item (file hoặc folder) — đúng các field mà UI cần.
export interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
  createdTime: string; // RFC3339 — 作成日時
  modifiedTime: string; // RFC3339 — 更新日時
  lastModifyingUser?: { displayName?: string }; // 作成者/người sửa cuối
  parents?: string[];
  // Key-value riêng của app trên item (vd appliedVersion do bot deploy ghi).
  appProperties?: Record<string, string>;
  // Mô tả tự do của item — app dùng làm GHI CHÚ của folder シナリオ (xem được cả trên web Drive).
  description?: string;
}

// Các field xin từ API (khớp DriveItem — xin đúng thứ cần cho nhẹ).
const ITEM_FIELDS = 'id,name,mimeType,createdTime,modifiedTime,lastModifyingUser(displayName),parents,appProperties,description';

export class DriveApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    // Mã ngắn để UI ánh xạ i18n (xem drive/errors.ts).
    public readonly code: 'auth' | 'notfound' | 'ratelimit' | 'network' | 'other',
  ) {
    super(message);
    this.name = 'DriveApiError';
  }
}

function codeForStatus(status: number, message: string): DriveApiError['code'] {
  if (status === 401) return 'auth';
  // 403 của Drive: hết quota tần suất (rateLimitExceeded) hoặc thiếu quyền.
  if (status === 403) return /rate ?limit/i.test(message) ? 'ratelimit' : 'auth';
  if (status === 404) return 'notfound';
  return 'other';
}

async function dFetch(token: string, url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      cache: 'no-store', // luôn lấy trạng thái mới nhất (list sau khi tạo/xoá)
      headers: {
        Authorization: `Bearer ${token}`,
        ...init?.headers,
      },
    });
  } catch {
    throw new DriveApiError('Không kết nối được Google Drive.', 0, 'network');
  }
}

async function ensureOk(res: Response): Promise<Response> {
  if (res.ok) return res;
  let detail = '';
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    detail = body.error?.message ?? '';
  } catch {
    // ignore
  }
  throw new DriveApiError(
    detail || `Google Drive API lỗi (${res.status}).`,
    res.status,
    codeForStatus(res.status, detail),
  );
}

// Escape giá trị chuỗi trong query q của Drive (tên có dấu nháy đơn).
const qEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

// Kho flow nằm trong SHARED DRIVE (共有ドライブ): Drive API mặc định chỉ nhìn
// thấy My Drive — thiếu supportsAllDrives=true là mọi item trong Shared Drive
// trả 404 dù người dùng có quyền. Kèm vô hại với My Drive nên gắn cho MỌI call;
// riêng files.list cần thêm includeItemsFromAllDrives=true.
const ALL_DRIVES = 'supportsAllDrives=true';
const ALL_DRIVES_LIST = `${ALL_DRIVES}&includeItemsFromAllDrives=true`;

export const isFolder = (it: DriveItem) => it.mimeType === FOLDER_MIME;
export const isYamlName = (name: string) => /\.ya?ml$/i.test(name);

// Liệt kê TOÀN BỘ con trực tiếp của 1 hoặc nhiều folder cha (không đệ quy).
// Gom nhiều cha vào 1 request bằng `or` (chunk 10 cha/request) + tự lật trang —
// nhờ vậy load cả cây 3 tầng chỉ tốn ~3 request thay vì N+1.
export async function listChildren(token: string, parentIds: string[]): Promise<DriveItem[]> {
  const out: DriveItem[] = [];
  for (let i = 0; i < parentIds.length; i += 10) {
    const chunk = parentIds.slice(i, i + 10);
    const q = `(${chunk.map((id) => `'${qEscape(id)}' in parents`).join(' or ')}) and trashed=false`;
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        q,
        fields: `nextPageToken,files(${ITEM_FIELDS})`,
        pageSize: '1000',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const res = await ensureOk(
        await dFetch(token, `${DRIVE_API_BASE}/files?${ALL_DRIVES_LIST}&${params.toString()}`),
      );
      const body = (await res.json()) as { files: DriveItem[]; nextPageToken?: string };
      out.push(...body.files);
      pageToken = body.nextPageToken;
    } while (pageToken);
  }
  return out;
}

// Đọc nội dung text của 1 file YAML.
export async function getFileText(token: string, fileId: string): Promise<string> {
  const res = await ensureOk(
    await dFetch(token, `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media&${ALL_DRIVES}`),
  );
  return res.text();
}

// Tìm folder con theo tên trong 1 folder cha (đúng tên, chưa xoá). null nếu chưa có.
export async function findChildFolder(
  token: string,
  parentId: string,
  name: string,
): Promise<DriveItem | null> {
  const params = new URLSearchParams({
    q: `'${qEscape(parentId)}' in parents and name='${qEscape(name)}' and mimeType='${FOLDER_MIME}' and trashed=false`,
    fields: `files(${ITEM_FIELDS})`,
    pageSize: '1',
  });
  const res = await ensureOk(
    await dFetch(token, `${DRIVE_API_BASE}/files?${ALL_DRIVES_LIST}&${params.toString()}`),
  );
  const body = (await res.json()) as { files: DriveItem[] };
  return body.files[0] ?? null;
}

// Tạo folder con.
export async function createFolder(token: string, parentId: string, name: string): Promise<DriveItem> {
  const res = await ensureOk(
    await dFetch(token, `${DRIVE_API_BASE}/files?${ALL_DRIVES}&fields=${encodeURIComponent(ITEM_FIELDS)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
    }),
  );
  return (await res.json()) as DriveItem;
}

// Tìm folder theo tên, chưa có thì tạo — dùng khi "Tạo flow mới" dựng cây
// 施設名/シナリオ名 tự động từ thông tin nhập vào.
export async function ensureFolder(token: string, parentId: string, name: string): Promise<DriveItem> {
  return (await findChildFolder(token, parentId, name)) ?? createFolder(token, parentId, name);
}

// Tìm FILE con theo tên trong 1 folder cha (đúng tên, không phải folder, chưa xoá).
// null nếu chưa có — dùng cho file phân quyền permissions.json ở folder gốc.
export async function findChildFile(
  token: string,
  parentId: string,
  name: string,
): Promise<DriveItem | null> {
  const params = new URLSearchParams({
    q: `'${qEscape(parentId)}' in parents and name='${qEscape(name)}' and mimeType!='${FOLDER_MIME}' and trashed=false`,
    fields: `files(${ITEM_FIELDS})`,
    pageSize: '1',
  });
  const res = await ensureOk(
    await dFetch(token, `${DRIVE_API_BASE}/files?${ALL_DRIVES_LIST}&${params.toString()}`),
  );
  const body = (await res.json()) as { files: DriveItem[] };
  return body.files[0] ?? null;
}

// Tạo file mới (multipart: metadata + nội dung trong 1 request) với MIME chỉ định.
// appProperties: key-value riêng của app gắn lên file (vd csEnvironment của CS).
async function createFileMultipart(
  token: string,
  parentId: string,
  name: string,
  content: string,
  mime: string,
  appProperties?: Record<string, string>,
): Promise<DriveItem> {
  const boundary = 'bk-flow-builder-314159';
  const metadata: Record<string, unknown> = { name, parents: [parentId], mimeType: mime };
  if (appProperties && Object.keys(appProperties).length > 0) metadata.appProperties = appProperties;
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    `Content-Type: ${mime}; charset=UTF-8`,
    '',
    content,
    `--${boundary}--`,
    '',
  ].join('\r\n');
  const res = await ensureOk(
    await dFetch(
      token,
      `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&${ALL_DRIVES}&fields=${encodeURIComponent(ITEM_FIELDS)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body,
      },
    ),
  );
  return (await res.json()) as DriveItem;
}

export const createYamlFile = (
  token: string,
  parentId: string,
  name: string,
  content: string,
  appProperties?: Record<string, string>,
) => createFileMultipart(token, parentId, name, content, 'application/x-yaml', appProperties);

export const createJsonFile = (token: string, parentId: string, name: string, content: string) =>
  createFileMultipart(token, parentId, name, content, 'application/json');

// Ghi đè NỘI DUNG file (lưu thường) — modifiedTime (更新日時) tự nhảy, createdTime
// (作成日時) giữ nguyên, fileId không đổi (an toàn hơn xoá-tạo-lại: không có
// khoảnh khắc nào file biến mất, lỗi giữa chừng thì bản cũ vẫn nguyên).
export async function updateFileContent(
  token: string,
  fileId: string,
  content: string,
  mime = 'application/x-yaml',
): Promise<void> {
  await ensureOk(
    await dFetch(
      token,
      `${DRIVE_UPLOAD_BASE}/files/${encodeURIComponent(fileId)}?uploadType=media&${ALL_DRIVES}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': `${mime}; charset=UTF-8` },
        body: content,
      },
    ),
  );
}

export const updateYamlContent = (token: string, fileId: string, content: string) =>
  updateFileContent(token, fileId, content, 'application/x-yaml');

// Cập nhật MÔ TẢ (description) của item — app dùng làm ghi chú của folder シナリオ.
export async function updateItemDescription(token: string, id: string, description: string): Promise<void> {
  await ensureOk(
    await dFetch(token, `${DRIVE_API_BASE}/files/${encodeURIComponent(id)}?${ALL_DRIVES}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description }),
    }),
  );
}

// Cập nhật appProperties của item (merge — key=null xoá key đó). App dùng để sửa
// môi trường (csEnvironment) của 1 バージョン trên màn quản lý CS.
export async function updateItemAppProperties(
  token: string,
  id: string,
  appProperties: Record<string, string | null>,
): Promise<void> {
  await ensureOk(
    await dFetch(token, `${DRIVE_API_BASE}/files/${encodeURIComponent(id)}?${ALL_DRIVES}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appProperties }),
    }),
  );
}

// Đổi TÊN file/folder (giữ nguyên id, nội dung, cây con) — dùng cho nút Sửa tên
// folder 病院/シナリオ trên màn quản lý.
export async function renameItem(token: string, id: string, name: string): Promise<void> {
  await ensureOk(
    await dFetch(token, `${DRIVE_API_BASE}/files/${encodeURIComponent(id)}?${ALL_DRIVES}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }),
  );
}

// Đưa file/folder vào Thùng rác (khôi phục được ~30 ngày; folder trash cả cây con).
export async function trashItem(token: string, id: string): Promise<void> {
  await ensureOk(
    await dFetch(token, `${DRIVE_API_BASE}/files/${encodeURIComponent(id)}?${ALL_DRIVES}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true }),
    }),
  );
}

// Xác thực nhanh token + quyền trên folder gốc (gọi khi kết nối).
export async function verifyDriveAccess(token: string, rootId: string): Promise<void> {
  await ensureOk(
    await dFetch(token, `${DRIVE_API_BASE}/files/${encodeURIComponent(rootId)}?fields=id,name&${ALL_DRIVES}`),
  );
}
