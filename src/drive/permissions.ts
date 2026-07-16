// ─────────────────────────────────────────────────────────────────────────────
// Phân quyền app (owner / admin / user) — TOÀN BỘ lưu trên Drive:
//
// - File `access-log.json` trong DRIVE_LOG_FOLDER giữ CẢ danh sách admin lẫn
//   nhật ký truy cập: mỗi lần vào màn quản lý, app tự upsert email + thời điểm
//   của người dùng; owner gạt quyền Admin/User trong modal 権限管理 sẽ ghi đè
//   field `admins` của cùng file này.
// - Chỉ owner/admin mới thấy nút Xoá trên màn quản lý flow. App là static site
//   không backend nên đây là cổng UX, không phải hàng rào bảo mật tuyệt đối.
// ─────────────────────────────────────────────────────────────────────────────

import { findChildFile, getFileText, createJsonFile, updateFileContent } from './api';

// Tài khoản owner của app (cố định theo yêu cầu vận hành).
export const OWNER_EMAIL = 'tuan.nguyen4@drjoy.jp';

// Folder + tên file phân quyền/nhật ký truy cập trên Drive.
const DRIVE_LOG_FOLDER = '18BNSBl_wMneoUdwYevmtnAoHbDdAlqn6';
const ACCESS_LOG_FILE = 'access-log.json';

export type PermRole = 'owner' | 'admin' | 'user';

// Bộ phận của thành viên — quyết định MÀN HÌNH làm việc (CS: diagram đơn giản,
// TS: cấu hình chi tiết). Trục độc lập với PermRole (quyền thao tác); owner đổi
// được trong modal 権限管理 khi nhân sự chuyển bộ phận.
export type Department = 'cs' | 'ts';

export interface PermMember {
  email: string;
  name: string;
  picture?: string; // URL ảnh đại diện Google (nếu có) — modal 権限管理 hiển thị ảnh tròn
  department?: Department; // chưa gán -> owner gạt trong modal 権限管理
  lastAccessAt: string; // ISO 8601 — UI tự format theo múi giờ máy
}

// Dữ liệu cho UI (modal 権限管理) — đọc/ghi nguyên khối từ access-log.json.
export interface PermissionsData {
  admins: string[];
  members: PermMember[];
}

export interface AccessLog extends PermissionsData {
  fileId: string;
}

const normEmail = (e: string) => e.trim().toLowerCase();

// Parse an toàn: file bị sửa tay/hỏng -> coi như rỗng thay vì crash màn quản lý.
function parseLog(text: string): PermissionsData {
  try {
    const raw = JSON.parse(text) as { admins?: unknown; members?: unknown };
    return {
      admins: Array.isArray(raw.admins)
        ? raw.admins.filter((x): x is string => typeof x === 'string')
        : [],
      members: Array.isArray(raw.members)
        ? raw.members
            .filter(
              (m): m is PermMember =>
                !!m && typeof m === 'object' && typeof (m as PermMember).email === 'string',
            )
            // department bị sửa tay thành giá trị lạ -> coi như chưa gán.
            .map((m) =>
              m.department === 'cs' || m.department === 'ts'
                ? m
                : { ...m, department: undefined },
            )
        : [],
    };
  } catch {
    return { admins: [], members: [] };
  }
}

export function resolveRole(
  email: string | undefined,
  data: Pick<PermissionsData, 'admins'> | null,
): PermRole {
  if (!email) return 'user';
  const e = normEmail(email);
  if (e === OWNER_EMAIL) return 'owner';
  return data?.admins.some((a) => normEmail(a) === e) ? 'admin' : 'user';
}

const serialize = (data: PermissionsData) =>
  JSON.stringify({ admins: data.admins, members: data.members }, null, 2);

// Đọc file phân quyền; chưa có thì tạo file rỗng để các lần ghi sau chỉ cần PATCH.
export async function loadAccessLog(token: string): Promise<AccessLog> {
  const existing = await findChildFile(token, DRIVE_LOG_FOLDER, ACCESS_LOG_FILE);
  if (existing) {
    return { fileId: existing.id, ...parseLog(await getFileText(token, existing.id)) };
  }
  const created = await createJsonFile(
    token,
    DRIVE_LOG_FOLDER,
    ACCESS_LOG_FILE,
    serialize({ admins: [], members: [] }),
  );
  return { fileId: created.id, admins: [], members: [] };
}

// Ghi nhận "tài khoản này vừa truy cập app": upsert vào members + cập nhật
// lastAccessAt, rồi lưu lại (giữ nguyên admins). Trả về bản mới nhất để UI dùng luôn.
export async function recordAccess(
  token: string,
  user: { email: string; name?: string; picture?: string },
): Promise<AccessLog> {
  const log = await loadAccessLog(token);
  const email = normEmail(user.email);
  const prev = log.members.find((m) => normEmail(m.email) === email);
  const rest = log.members.filter((m) => normEmail(m.email) !== email);
  const members = [
    ...rest,
    {
      email,
      name: user.name ?? '',
      ...(user.picture ? { picture: user.picture } : {}),
      // Giữ bộ phận đã gán — upsert lượt truy cập không được làm mất.
      ...(prev?.department ? { department: prev.department } : {}),
      lastAccessAt: new Date().toISOString(),
    },
  ];
  const next: AccessLog = { ...log, members };
  await updateFileContent(token, log.fileId, serialize(next), 'application/json');
  return next;
}

// Owner gạt quyền Admin/User -> ghi đè danh sách admin. Đọc lại file ngay trước
// khi ghi để không đè mất lượt truy cập vừa được người khác upsert.
export async function saveAdmins(token: string, admins: string[]): Promise<AccessLog> {
  const log = await loadAccessLog(token);
  const next: AccessLog = { ...log, admins };
  await updateFileContent(token, log.fileId, serialize(next), 'application/json');
  return next;
}

// Owner gạt bộ phận (CS/TS) cho 1 thành viên trong modal 権限管理. Đọc lại file
// ngay trước khi ghi (giống saveAdmins) để không đè mất thay đổi song song.
export async function saveDepartment(
  token: string,
  email: string,
  department: Department,
): Promise<AccessLog> {
  const log = await loadAccessLog(token);
  const e = normEmail(email);
  let members = log.members.map((m) => (normEmail(m.email) === e ? { ...m, department } : m));
  // Thành viên chưa từng truy cập (vd owner gán trước) -> tạo entry tối thiểu.
  if (!members.some((m) => normEmail(m.email) === e)) {
    members = [...members, { email: e, name: '', lastAccessAt: '', department }];
  }
  const next: AccessLog = { ...log, members };
  await updateFileContent(token, log.fileId, serialize(next), 'application/json');
  return next;
}
