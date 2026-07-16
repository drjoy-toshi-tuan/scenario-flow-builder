import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileManagerMenu } from './FileManagerMenu';
import { DriveConnectPanel } from './DriveConnectPanel';
import { buildBlankFlow, FlowStructureBadge, isValidFlowYaml } from './flowShared';
import { useT, type TKey } from '../ui/i18n';
import { Icon } from '../ui/icons';
import { BrandLockup } from '../ui/BrandLockup';
import { useToast } from '../ui/toast';
import { useAuth } from '../auth/useAuth';
import { GOOGLE_CLIENT_ID } from '../auth/config';
import { useFlowStore } from '../store/flowStore';
import { useFileStore } from '../store/fileStore';
import { useDriveAuth } from '../drive/useDriveAuth';
import {
  listChildren,
  getFileText,
  createYamlFile,
  ensureFolder,
  renameItem,
  trashItem,
  updateItemDescription,
  isFolder,
  isYamlName,
  DriveApiError,
  type DriveItem,
} from '../drive/api';
import {
  loadAccessLog,
  recordAccess,
  resolveRole,
  saveAdmins,
  type PermMember,
  type PermissionsData,
} from '../drive/permissions';
import { PermissionsModal } from './PermissionsModal';
import { HoverLabelButton } from '../components/HoverTip';
import { gdErrorKey } from '../drive/errors';
import { DRIVE_ROOT_FOLDER_ID, parseVersionFromName, versionFileName } from '../drive/config';
import { parseFlowMeta, updateFlowMeta } from '../ir/flowMeta';
import { formatDateTime } from '../ir/ivrProperty';

// ─────────────────────────────────────────────────────────────────────────────
// Màn quản lý flow PHÂN CẤP theo cấu trúc Google Drive:
//   病院 (grandparent folder) › シナリオ (parent folder) › バージョン (_V{N}.yaml)
//
// - Có GOOGLE_CLIENT_ID  -> chạy THẬT: xin access token Drive (1 click lần đầu),
//   load cả cây bằng ~3 request (list con theo lô), mở/tạo/khôi phục/xoá thật.
// - Không có (demo dev)  -> hiện MOCK DATA để review UI (badge プレビュー).
//
// Điều hướng: click BẤT KỲ chỗ nào trên dòng (trừ cụm nút thao tác) — tầng 病院
// vào danh sách kịch bản, tầng シナリオ vào danh sách phiên bản, tầng バージョン
// mở file lên canvas. Không còn nút "Mở" riêng.
//
// Cột デプロイバージョン đọc từ appProperties trên folder シナリオ — phần chờ cho
// phase deploy (bot Selenium sẽ ghi sau khi deploy thành công): mỗi môi trường 1 key
//   appliedVersionMaster (本番) / appliedVersionDemo (デモ)
// key cũ appliedVersion (1 môi trường) vẫn đọc được — coi là bản deploy MASTER.
// ─────────────────────────────────────────────────────────────────────────────

export interface VersionNode {
  fileId: string;
  v: number;
  createdAt: string; // yyyy-MM-dd HH:mm — Drive createdTime
  updatedAt: string; // yyyy-MM-dd HH:mm — Drive modifiedTime (lưu đè -> tự nhảy)
  author: string; // lastModifyingUser
  // Số Sub Flow của bản này (đọc từ nội dung YAML — lazy khi vào tầng flow,
  // vì mỗi version có thể khác nhau). undefined = chưa đọc xong.
  subflowCount?: number;
  // Ghi chú tự do của BẢN NÀY (description của file version trên Drive).
  note?: string;
}

export interface ScenarioNode {
  id: string;
  name: string;
  createdAt?: string; // createdTime của folder シナリオ (作成日時)
  // Version đang chạy trên từng môi trường AI電話 (null = môi trường đó chưa deploy).
  appliedMaster: number | null; // 本番
  appliedDemo: number | null; // デモ
  versions: VersionNode[]; // sắp DESC theo v (mới nhất trước)
}

export interface FacilityNode {
  id: string;
  name: string;
  createdAt?: string; // createdTime của folder 病院 (作成日時)
  scenarios: ScenarioNode[];
}

// Mục tiêu xoá (đã qua modal xác nhận) — dùng chung cho cả 3 tầng.
interface DeleteTarget {
  kind: 'facility' | 'scenario' | 'version';
  id: string;
  label: string;
}

// Các hành động màn hình gọi ra ngoài — bản mock không truyền -> nút bị disable.
interface DriveActions {
  onRefresh?: () => void;
  onOpenVersion?: (f: FacilityNode, s: ScenarioNode, v: VersionNode) => void;
  onDuplicate?: (f: FacilityNode, s: ScenarioNode, v: VersionNode) => void;
  // Đổi tên folder 病院/シナリオ (chỉ tên folder, không đụng nội dung bên trong).
  onRename?: (id: string, name: string) => void;
  onDelete?: (target: DeleteTarget) => void;
  onCreateFlow?: (facility: string, scenario: string) => void;
  onImport?: (facility: string, scenario: string, content: string) => void;
  // Lưu ghi chú của 1 VERSION (ghi vào description file version; rỗng = xoá ghi chú).
  onSaveNote?: (versionFileId: string, note: string) => void;
  // Đọc subflowCount cho các version của 1 kịch bản (gọi khi vào tầng flow).
  onLoadVersionDetails?: (facilityId: string, scenarioId: string) => void;
}

// ── Helpers dẫn xuất ──
const latestOf = (s: ScenarioNode) => s.versions[0]?.v ?? 0;
const latestVersionOf = (s: ScenarioNode): VersionNode | undefined => s.versions[0];
const facilityUpdatedAt = (f: FacilityNode) => {
  const all = f.scenarios.flatMap((s) => s.versions.map((v) => v.updatedAt));
  return all.length ? all.reduce((a, b) => (a > b ? a : b)) : undefined;
};

// Chuẩn hoá chuỗi tìm kiếm (đồng bộ FileManagerScreen).
const normalizeSearch = (s: string) => s.normalize('NFKC').toLowerCase().trim();

// Các mức số dòng mỗi trang (đồng bộ FileManagerScreen).
const PAGE_SIZES = [20, 50] as const;

// Giá trị select "tạo mới" trong modal import (không đụng id thật của Drive).
const NEW_OPTION = '__new__';

// Style input/select trong modal (dùng chung nhiều field).
const FIELD_CLS =
  'w-full rounded-lg border border-[var(--bk-border)] bg-[var(--bk-bg)] px-3 py-2 text-sm text-[var(--bk-text)] outline-none focus:border-[var(--bk-accent)]';

// ── Sort dùng chung cho cả 3 tầng ──
type SortDir = 'asc' | 'desc';
type SortState = { key: string; dir: SortDir } | null;

// So sánh 2 giá trị ô: số so số, chuỗi so theo locale; thiếu giá trị dồn cuối.
function compareCells(
  a: string | number | undefined,
  b: string | number | undefined,
  dir: SortDir,
): number {
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  const sign = dir === 'asc' ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return sign * (a - b);
  return sign * String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock data — chỉ dùng ở chế độ demo (chưa cấu hình GOOGLE_CLIENT_ID) để review UI.
// ─────────────────────────────────────────────────────────────────────────────

const pad2 = (n: number) => String(n).padStart(2, '0');
function mockDate(day: number, hm: string): string {
  const d = new Date(2026, 4, 1 + day);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${hm}`;
}

// 24 version cho 1 kịch bản — đủ nhiều để xem phân trang ở tầng バージョン.
const MANY_VERSIONS: VersionNode[] = Array.from({ length: 24 }, (_, i) => {
  const v = 24 - i; // DESC: mới nhất trước
  const authors = ['佐藤 健', 'Tuan Nguyen', '田中 花子'];
  return {
    fileId: `mock-v${v}`,
    v,
    createdAt: mockDate(v * 3, '09:30'),
    updatedAt: mockDate(v * 3 + (v % 3), v % 2 ? '16:45' : '09:30'),
    author: authors[v % 3],
    subflowCount: v % 4,
  };
});

const MOCK_FACILITIES: FacilityNode[] = [
  {
    id: 'f1',
    name: '国立成育医療研究センター',
    createdAt: '2026-07-01 09:00',
    scenarios: [
      {
        id: 's1',
        name: '診療予約',
        createdAt: '2026-07-02 14:00',
        appliedMaster: 2,
        appliedDemo: 3,
        versions: [
          { fileId: 'm1', v: 3, createdAt: '2026-07-14 18:22', updatedAt: '2026-07-15 10:05', author: 'Tuan Nguyen', subflowCount: 3, note: 'Đang chỉnh lại nhánh xác nhận ngày sinh — CHƯA deploy bản này.' },
          { fileId: 'm2', v: 2, createdAt: '2026-07-10 09:41', updatedAt: '2026-07-12 14:20', author: 'Tuan Nguyen', subflowCount: 2, note: 'V2 đang chạy thật trên tổng đài. Trước khi deploy bản mới cần xác nhận lại giờ tiếp nhận với bệnh viện.' },
          { fileId: 'm3', v: 1, createdAt: '2026-07-02 14:05', updatedAt: '2026-07-02 14:05', author: '田中 花子', subflowCount: 0 },
        ],
      },
      {
        id: 's2',
        name: '予約変更・キャンセル',
        createdAt: '2026-07-08 11:20',
        appliedMaster: 1,
        appliedDemo: null,
        versions: [
          { fileId: 'm4', v: 1, createdAt: '2026-07-08 11:30', updatedAt: '2026-07-08 11:30', author: '田中 花子', subflowCount: 1 },
        ],
      },
      {
        id: 's3',
        name: '休診日案内',
        createdAt: '2026-07-12 16:40',
        appliedMaster: null,
        appliedDemo: null,
        versions: [
          { fileId: 'm5', v: 2, createdAt: '2026-07-15 08:12', updatedAt: '2026-07-15 08:12', author: 'Tuan Nguyen', subflowCount: 0 },
          { fileId: 'm6', v: 1, createdAt: '2026-07-12 16:48', updatedAt: '2026-07-13 09:02', author: '佐藤 健', subflowCount: 0 },
        ],
      },
    ],
  },
  {
    id: 'f2',
    name: '聖路加国際病院',
    createdAt: '2026-05-02 10:15',
    scenarios: [
      { id: 's4', name: '診療予約', createdAt: '2026-05-04 09:00', appliedMaster: 22, appliedDemo: 24, versions: MANY_VERSIONS },
      {
        id: 's5',
        name: '検査結果案内',
        createdAt: '2026-07-11 17:00',
        appliedMaster: null,
        appliedDemo: null,
        versions: [
          { fileId: 'm7', v: 1, createdAt: '2026-07-11 17:19', updatedAt: '2026-07-11 17:19', author: '田中 花子', subflowCount: 2 },
        ],
      },
    ],
  },
  {
    id: 'f3',
    name: '東京慈恵会医科大学附属病院',
    createdAt: '2026-06-20 08:45',
    scenarios: [
      {
        id: 's6',
        name: '診療時間案内',
        createdAt: '2026-07-06 10:30',
        appliedMaster: 1,
        appliedDemo: 2,
        versions: [
          { fileId: 'm8', v: 2, createdAt: '2026-07-14 19:55', updatedAt: '2026-07-14 19:55', author: '田中 花子', subflowCount: 1 },
          { fileId: 'm9', v: 1, createdAt: '2026-07-06 10:33', updatedAt: '2026-07-07 15:41', author: '田中 花子', subflowCount: 0 },
        ],
      },
    ],
  },
  { id: 'f4', name: '大阪母子医療センター', createdAt: '2026-07-10 13:05', scenarios: [] },
];

// Dữ liệu phân quyền mẫu cho chế độ mock (review UI modal 権限管理).
const MOCK_PERMISSIONS: PermissionsData = {
  admins: ['ha.pham@drjoy.jp'],
  members: [
    {
      email: 'tuan.nguyen4@drjoy.jp',
      name: 'Tuan Nguyen',
      // Ảnh đại diện mẫu (SVG inline, không gọi mạng) — review UI ảnh tròn ở modal.
      picture:
        'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="%230ea5e9"/><circle cx="32" cy="24" r="12" fill="white"/><path d="M8 62c0-13 11-20 24-20s24 7 24 20z" fill="white"/></svg>',
      lastAccessAt: '2026-07-15T09:12:00+09:00',
    },
    { email: 'ha.pham@drjoy.jp', name: 'Ha Pham', lastAccessAt: '2026-07-14T18:40:00+09:00' },
    { email: 'hanako.tanaka@drjoy.jp', name: '田中 花子', lastAccessAt: '2026-07-13T10:05:00+09:00' },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Entry: có Client ID -> bản thật (OAuth + Drive API); không -> mock để review UI.
// ─────────────────────────────────────────────────────────────────────────────

export function DriveManagerScreen() {
  if (!GOOGLE_CLIENT_ID) {
    return (
      <DriveInner
        facilities={MOCK_FACILITIES}
        mock
        loading={false}
        busy={false}
        listErrorKey={null}
        actionError={null}
        actions={{}}
        canDelete
        permissions={{ data: MOCK_PERMISSIONS }}
      />
    );
  }
  return <DriveReal />;
}

// ── Bản thật: cổng token -> load cây -> hành động thật ──

function DriveReal() {
  const { token, connecting, error, requestAccess, disconnect } = useDriveAuth();

  if (!token) {
    // Chưa có access token trong phiên -> panel kết nối (1 click; lần đầu mỗi
    // tài khoản mới phải chấp thuận, về sau popup tự đóng).
    return (
      <div className="relative flex h-full flex-col bg-[var(--bk-bg)]">
        <header className="flex items-center justify-between border-b border-[var(--bk-border)] bg-[var(--bk-surface)] px-4 py-2.5">
          <BrandLockup logoClass="h-8 w-8" textClass="text-xl" />
          <FileManagerMenu />
        </header>
        <div className="relative flex flex-1 items-center justify-center overflow-hidden p-6">
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 h-[460px] w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--bk-accent)] opacity-[0.08] blur-[100px]"
          />
          <DriveConnectPanel connecting={connecting} error={error} onConnect={requestAccess} />
        </div>
      </div>
    );
  }
  return <DriveLoaded token={token} onAuthInvalid={disconnect} />;
}

// Đổi RFC3339 của Drive -> 'yyyy-MM-dd HH:mm' (múi giờ máy người dùng).
const fmtTime = (rfc3339: string) => formatDateTime(new Date(rfc3339));

// Cache số Sub Flow theo `fileId:updatedAt` (nội dung đổi -> modifiedTime đổi ->
// key đổi). Nhờ vậy Làm mới không phải tải lại nội dung file không đổi — cùng
// pattern với metaCache của FileManagerScreen. Sống ở cấp module để giữ qua mount.
const subflowCountCache = new Map<string, number>();

// Ghép 3 danh sách phẳng (folder 施設 / folder シナリオ / file version) thành cây.
function buildTree(fac: DriveItem[], scen: DriveItem[], files: DriveItem[]): FacilityNode[] {
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

  const versByParent = new Map<string, VersionNode[]>();
  for (const f of files) {
    const parent = f.parents?.[0];
    const v = isYamlName(f.name) ? parseVersionFromName(f.name) : null;
    // File không theo quy ước _V{N}.yaml (thả tay vào folder) -> bỏ qua.
    if (!parent || v == null) continue;
    const node: VersionNode = {
      fileId: f.id,
      v,
      createdAt: fmtTime(f.createdTime),
      updatedAt: fmtTime(f.modifiedTime),
      author: f.lastModifyingUser?.displayName ?? '',
      note: f.description?.trim() ? f.description : undefined,
    };
    versByParent.set(parent, [...(versByParent.get(parent) ?? []), node]);
  }

  // Đọc số version deploy từ appProperties (chuỗi) — không hợp lệ/<=0 coi như chưa deploy.
  const readApplied = (raw: string | undefined): number | null => {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const scenByParent = new Map<string, ScenarioNode[]>();
  for (const s of scen) {
    const parent = s.parents?.[0];
    if (!parent) continue;
    const props = s.appProperties ?? {};
    const node: ScenarioNode = {
      id: s.id,
      name: s.name,
      createdAt: fmtTime(s.createdTime),
      // Key cũ appliedVersion (1 môi trường) -> coi là bản deploy MASTER (本番).
      appliedMaster: readApplied(props.appliedVersionMaster) ?? readApplied(props.appliedVersion),
      appliedDemo: readApplied(props.appliedVersionDemo),
      versions: (versByParent.get(s.id) ?? []).sort((a, b) => b.v - a.v),
    };
    scenByParent.set(parent, [...(scenByParent.get(parent) ?? []), node]);
  }

  return fac
    .map((f) => ({
      id: f.id,
      name: f.name,
      createdAt: fmtTime(f.createdTime),
      scenarios: (scenByParent.get(f.id) ?? []).sort(byName),
    }))
    .sort(byName);
}

function DriveLoaded({ token, onAuthInvalid }: { token: string; onAuthInvalid: () => void }) {
  const t = useT();
  const { user } = useAuth();
  const showToast = useToast((s) => s.show);
  const loadYaml = useFlowStore((s) => s.loadYaml);
  const openFile = useFileStore((s) => s.openFile);

  const [facilities, setFacilities] = useState<FacilityNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [listErrorKey, setListErrorKey] = useState<TKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // Phân quyền lưu TRÊN DRIVE (access-log.json): admins + nhật ký truy cập cùng file.
  const [admins, setAdmins] = useState<string[]>([]);
  const [members, setMembers] = useState<PermMember[]>([]);
  // Lỗi khi đổi quyền (hiện trong modal 権限管理, không dùng banner chung vì bị modal che).
  const [permError, setPermError] = useState<string | null>(null);
  // Owner nhận diện qua email cố định nên KHÔNG phụ thuộc file quyền đọc được hay chưa.
  const role = resolveRole(user?.email, { admins });

  // Token bị Drive từ chối giữa chừng (hết hạn/thu quyền) -> về panel kết nối.
  const handledAsExpired = (e: unknown): boolean => {
    if (e instanceof DriveApiError && e.code === 'auth') {
      onAuthInvalid();
      return true;
    }
    return false;
  };

  // Load CẢ CÂY 3 tầng bằng 3 lượt list theo lô (mỗi lượt gom nhiều folder cha).
  const load = useCallback(async () => {
    setLoading(true);
    setListErrorKey(null);
    try {
      const facFolders = (await listChildren(token, [DRIVE_ROOT_FOLDER_ID])).filter(isFolder);
      const scenFolders = facFolders.length
        ? (await listChildren(token, facFolders.map((x) => x.id))).filter(isFolder)
        : [];
      const files = scenFolders.length
        ? await listChildren(token, scenFolders.map((x) => x.id))
        : [];
      const tree = buildTree(facFolders, scenFolders, files);

      // Điền lại subflowCount từ cache (file chưa đổi nội dung) — phần còn thiếu
      // sẽ được đọc lazy khi vào tầng flow (xem loadVersionDetails). Đồng thời dọn
      // cache: chỉ giữ key còn trong danh sách hiện tại (tránh phình vô hạn).
      const alive = new Set<string>();
      for (const f of tree) {
        for (const s of f.scenarios) {
          for (const v of s.versions) {
            const key = `${v.fileId}:${v.updatedAt}`;
            alive.add(key);
            const cached = subflowCountCache.get(key);
            if (cached !== undefined) v.subflowCount = cached;
          }
        }
      }
      for (const key of subflowCountCache.keys()) {
        if (!alive.has(key)) subflowCountCache.delete(key);
      }

      setFacilities(tree);
    } catch (e) {
      if (!handledAsExpired(e)) setListErrorKey(gdErrorKey(e));
    } finally {
      setLoading(false);
    }
    // onAuthInvalid là action zustand ổn định — giữ deps [token] (xem FileManagerScreen).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  // Ghi nhận "tài khoản này vừa truy cập app" vào access-log.json trên Drive —
  // file này cũng là nguồn danh sách admin. Lỗi ở đây KHÔNG chặn màn hình:
  // role rơi về mặc định (owner vẫn nhận diện qua email).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const log = user?.email
          ? await recordAccess(token, { email: user.email, name: user.name, picture: user.picture })
          : await loadAccessLog(token);
        if (!cancelled) {
          setMembers(log.members);
          setAdmins(log.admins);
        }
      } catch {
        // bỏ qua — phân quyền là tiện ích, không phải điều kiện dùng app
      }
    })();
    return () => {
      cancelled = true;
    };
    // Chỉ chạy lại khi đổi token (user đi kèm phiên đăng nhập, ổn định trong phiên).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Lưu ghi chú của 1 version = PATCH description của file version (rỗng = xoá ghi chú).
  const saveNote = async (versionFileId: string, note: string) => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await updateItemDescription(token, versionFileId, note);
      showToast(t('dmNoteSaved'));
      await load();
    } catch (e) {
      if (!handledAsExpired(e)) setActionError(t(gdErrorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  // Owner cấp/thu quyền Admin cho 1 email trong modal 権限管理 — ghi vào
  // access-log.json trên Drive bằng chính access token Drive đang dùng.
  const changeRole = async (email: string, makeAdmin: boolean) => {
    if (busy) return;
    setBusy(true);
    setPermError(null);
    try {
      const e = email.trim().toLowerCase();
      const next = admins.filter((a) => a.trim().toLowerCase() !== e);
      if (makeAdmin) next.push(e);
      const log = await saveAdmins(token, next);
      setAdmins(log.admins);
      setMembers(log.members);
      showToast(t('pmSaved'));
    } catch (err) {
      if (handledAsExpired(err)) return;
      setPermError(t(gdErrorKey(err)));
    } finally {
      setBusy(false);
    }
  };

  // Đọc subflowCount cho các version của 1 kịch bản khi người dùng vào tầng flow
  // (mỗi version có thể khác nhau nên phải đọc từng file — lazy + cache để không
  // tải cả kho khi load danh sách). Chạy nền, không khoá UI.
  const loadVersionDetails = async (facilityId: string, scenarioId: string) => {
    const scen = facilities
      .find((f) => f.id === facilityId)
      ?.scenarios.find((s) => s.id === scenarioId);
    if (!scen) return;
    const targets = scen.versions.filter((v) => v.subflowCount === undefined);
    if (!targets.length) return;
    const counts = new Map<string, number>();
    await Promise.all(
      targets.map(async (v) => {
        const key = `${v.fileId}:${v.updatedAt}`;
        const cached = subflowCountCache.get(key);
        if (cached !== undefined) {
          counts.set(v.fileId, cached);
          return;
        }
        try {
          const count = parseFlowMeta(await getFileText(token, v.fileId)).subflowCount ?? 0;
          subflowCountCache.set(key, count);
          counts.set(v.fileId, count);
        } catch (e) {
          if (handledAsExpired(e)) return;
          // lỗi đọc 1 file -> bỏ qua, không hiện badge cho bản đó
        }
      }),
    );
    if (!counts.size) return;
    setFacilities((prev) =>
      prev.map((f) =>
        f.id !== facilityId
          ? f
          : {
              ...f,
              scenarios: f.scenarios.map((s) =>
                s.id !== scenarioId
                  ? s
                  : {
                      ...s,
                      versions: s.versions.map((v) =>
                        counts.has(v.fileId) ? { ...v, subflowCount: counts.get(v.fileId) } : v,
                      ),
                    },
              ),
            },
      ),
    );
  };

  // Mở 1 version lên canvas. Giữ busy=true khi thành công (đang điều hướng đi).
  const openVersion = async (f: FacilityNode, s: ScenarioNode, ver: VersionNode) => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const text = await getFileText(token, ver.fileId);
      await loadYaml(text);
      openFile({
        path: `${f.name}/${s.name}`,
        name: versionFileName(s.name, ver.v),
        driveFileId: ver.fileId,
        driveFolderId: s.id,
        version: ver.v,
      });
    } catch (e) {
      setBusy(false);
      if (handledAsExpired(e)) return;
      setActionError(e instanceof DriveApiError ? t(gdErrorKey(e)) : t('fmUploadInvalid'));
    }
  };

  // Duplicate = tạo version MỚI (V{max+1}) với nội dung bản được chọn — không sửa
  // lịch sử (cũng là cách "khôi phục" một bản cũ).
  const duplicateVersion = async (s: ScenarioNode, ver: VersionNode) => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const text = await getFileText(token, ver.fileId);
      const nextV = latestOf(s) + 1;
      await createYamlFile(token, s.id, versionFileName(s.name, nextV), text);
      showToast(t('dmDuplicated', { n: nextV }));
      await load();
    } catch (e) {
      if (!handledAsExpired(e)) setActionError(t(gdErrorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  // Đổi tên folder 病院/シナリオ. File version bên trong giữ nguyên (không đổi tên
  // hàng loạt); version mới tạo sau đó sẽ theo tên mới.
  const rename = async (id: string, name: string) => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await renameItem(token, id, name);
      await load();
    } catch (e) {
      if (!handledAsExpired(e)) setActionError(t(gdErrorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  // Xoá (đã xác nhận ở modal) = đưa vào Thùng rác Drive (khôi phục được ~30 ngày).
  const remove = async (target: DeleteTarget) => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await trashItem(token, target.id);
      await load();
    } catch (e) {
      if (!handledAsExpired(e)) setActionError(t(gdErrorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  // Tạo flow mới: tự dựng cây 施設名/シナリオ名 (tìm-hoặc-tạo folder) rồi ghi V1
  // (folder シナリオ đã tồn tại thì ghi V{max+1}) và mở luôn lên canvas.
  const createFlow = async (facility: string, scenario: string) => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const fac = await ensureFolder(token, DRIVE_ROOT_FOLDER_ID, facility);
      const scen = await ensureFolder(token, fac.id, scenario);
      const existing = await listChildren(token, [scen.id]);
      const maxV = existing.reduce((m, x) => Math.max(m, parseVersionFromName(x.name) ?? 0), 0);
      const now = formatDateTime(new Date());
      const content = buildBlankFlow({
        facility,
        name: scenario,
        author: user?.name ?? user?.email ?? '',
        createdAt: now,
      });
      const file = await createYamlFile(token, scen.id, versionFileName(scenario, maxV + 1), content);
      await loadYaml(content);
      openFile({
        path: `${facility}/${scenario}`,
        name: file.name,
        driveFileId: file.id,
        driveFolderId: scen.id,
        version: maxV + 1,
      });
    } catch (e) {
      setBusy(false);
      if (handledAsExpired(e)) return;
      setActionError(t(gdErrorKey(e)));
    }
  };

  // Import file YAML vào folder bệnh viện/kịch bản đã chọn (tạo mới nếu chưa có),
  // ghi thành V{max+1} (V1 với kịch bản mới). Đồng bộ metadata facility/name theo
  // đích đến để danh sách hiển thị nhất quán với cây folder.
  const importFlow = async (facility: string, scenario: string, content: string) => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const fac = await ensureFolder(token, DRIVE_ROOT_FOLDER_ID, facility);
      const scen = await ensureFolder(token, fac.id, scenario);
      const existing = await listChildren(token, [scen.id]);
      const maxV = existing.reduce((m, x) => Math.max(m, parseVersionFromName(x.name) ?? 0), 0);
      const next = updateFlowMeta(content, { facility, name: scenario });
      await createYamlFile(token, scen.id, versionFileName(scenario, maxV + 1), next);
      showToast(t('dmImported', { n: maxV + 1 }));
      await load();
    } catch (e) {
      if (!handledAsExpired(e)) setActionError(t(gdErrorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DriveInner
      facilities={facilities}
      mock={false}
      loading={loading}
      busy={busy}
      listErrorKey={listErrorKey}
      actionError={actionError}
      actions={{
        onRefresh: () => void load(),
        onOpenVersion: (f, s, v) => void openVersion(f, s, v),
        onDuplicate: (_f, s, v) => void duplicateVersion(s, v),
        onRename: (id, name) => void rename(id, name),
        onDelete: (target) => void remove(target),
        onCreateFlow: (facility, scenario) => void createFlow(facility, scenario),
        onImport: (facility, scenario, content) => void importFlow(facility, scenario, content),
        onSaveNote: (versionFileId, note) => void saveNote(versionFileId, note),
        onLoadVersionDetails: (facilityId, scenarioId) => void loadVersionDetails(facilityId, scenarioId),
      }}
      canDelete={role !== 'user'}
      permissions={
        role === 'owner'
          ? {
              data: { admins, members },
              onChangeRole: (email, makeAdmin) => void changeRole(email, makeAdmin),
              error: permError,
            }
          : null
      }
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Phần trình bày dùng chung (real + mock): drill-down, sort, tìm kiếm, phân trang,
// modal tạo mới / import / xác nhận xoá.
// ─────────────────────────────────────────────────────────────────────────────

function DriveInner({
  facilities,
  mock,
  loading,
  busy,
  listErrorKey,
  actionError,
  actions,
  canDelete,
  permissions,
}: {
  facilities: FacilityNode[];
  mock: boolean;
  loading: boolean;
  busy: boolean;
  listErrorKey: TKey | null;
  actionError: string | null;
  actions: DriveActions;
  // Chỉ owner/admin mới thấy nút Xoá (phân quyền qua permissions.json trên Drive).
  canDelete: boolean;
  // != null khi người dùng là OWNER -> menu có mục "Quản lý quyền" + modal phân quyền.
  permissions?: {
    data: PermissionsData;
    onChangeRole?: (email: string, makeAdmin: boolean) => void;
    error?: string | null; // lỗi khi đổi quyền (hiện trong modal)
  } | null;
}) {
  const t = useT();

  // Vị trí đang đứng trong cây: rỗng = tầng 病院; có facility = tầng シナリオ;
  // có cả scenario = tầng バージョン.
  const [path, setPath] = useState<{ facilityId?: string; scenarioId?: string }>({});
  const facility = facilities.find((f) => f.id === path.facilityId) ?? null;
  const scenario = facility?.scenarios.find((s) => s.id === path.scenarioId) ?? null;
  const level: 1 | 2 | 3 = scenario ? 3 : facility ? 2 : 1;

  // Tìm kiếm (ẩn sau nút kính lúp — đồng bộ FileManagerScreen) + sort + phân trang
  // áp cho tầng hiện tại; đổi tầng thì reset từ khoá.
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortState>(null);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);
  const [page, setPage] = useState(1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setQuery('');
    setSort(null);
    setPage(1);
  }, [path]);
  useEffect(() => {
    setPage(1);
  }, [query, sort, pageSize]);

  // Mở ô tìm kiếm -> focus; đóng -> xoá từ khoá (đồng bộ FileManagerScreen).
  const toggleSearch = () => {
    setSearchOpen((open) => {
      if (open) setQuery('');
      return !open;
    });
  };
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  // Vào tầng flow -> đọc subflowCount cho các version của kịch bản đó (lazy).
  // Phụ thuộc `scenario` (object) để refetch phần thiếu sau khi Làm mới;
  // loadVersionDetails không setState khi không còn gì thiếu nên không lặp.
  useEffect(() => {
    if (facility && scenario) actions.onLoadVersionDetails?.(facility.id, scenario.id);
    // actions được tạo lại mỗi render nhưng hành vi ổn định — không đưa vào deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facility, scenario]);

  // Modal tạo flow mới (chọn/tạo folder như modal import) / xác nhận xoá / đổi tên folder.
  const [showNew, setShowNew] = useState(false);
  const [newFacSel, setNewFacSel] = useState<string>(NEW_OPTION);
  const [newFacName, setNewFacName] = useState('');
  const [newScenSel, setNewScenSel] = useState<string>(NEW_OPTION);
  const [newScenName, setNewScenName] = useState('');
  const [createErrorKey, setCreateErrorKey] = useState<TKey | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ kind: 'facility' | 'scenario'; id: string; name: string } | null>(null);
  const [renameName, setRenameName] = useState('');
  // Modal ghi chú theo VERSION (mở từ nút trên dòng ở màn flow) + modal 権限管理 (chỉ owner).
  const [noteTarget, setNoteTarget] = useState<VersionNode | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [showPermissions, setShowPermissions] = useState(false);

  // Dòng đang hover — dùng làm `key` cho icon line-md trong cụm nút để REMOUNT
  // khi nút hiện ra (animation SMIL của line-md chỉ chạy 1 lần lúc <svg> mount).
  const [hoverRow, setHoverRow] = useState<string | null>(null);
  const rowHoverProps = (id: string) => ({
    onMouseEnter: () => setHoverRow(id),
    onMouseLeave: () => setHoverRow((cur) => (cur === id ? null : cur)),
  });
  const iconKey = (id: string) => (hoverRow === id ? 'play' : 'idle');

  const openRenameModal = (kind: 'facility' | 'scenario', id: string, name: string) => {
    setRenameTarget({ kind, id, name });
    setRenameName(name);
  };

  const handleRename = () => {
    if (!renameTarget) return;
    const name = renameName.trim();
    if (!name) return;
    const target = renameTarget;
    setRenameTarget(null);
    // Tên không đổi -> khỏi gọi API.
    if (name !== target.name) actions.onRename?.(target.id, name);
  };

  // ── Import: đọc file YAML -> modal chọn/tạo folder bệnh viện + kịch bản ──
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importContent, setImportContent] = useState<string | null>(null); // != null -> modal mở
  const [impFacSel, setImpFacSel] = useState<string>(NEW_OPTION); // id folder hoặc NEW_OPTION
  const [impFacName, setImpFacName] = useState('');
  const [impScenSel, setImpScenSel] = useState<string>(NEW_OPTION);
  const [impScenName, setImpScenName] = useState('');
  const [importErrorKey, setImportErrorKey] = useState<TKey | null>(null);
  // Lỗi file không hợp lệ (hiện ở banner chung với lỗi hành động).
  const [uploadErrorKey, setUploadErrorKey] = useState<TKey | null>(null);

  const impFacility = impFacSel === NEW_OPTION ? null : facilities.find((f) => f.id === impFacSel) ?? null;

  const handleImportFile = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (fileInputRef.current) fileInputRef.current.value = ''; // cho phép chọn lại cùng file
    if (!file) return;
    setUploadErrorKey(null);
    let content: string;
    try {
      content = await file.text();
    } catch {
      setUploadErrorKey('fmUploadInvalid');
      return;
    }
    if (!isValidFlowYaml(content)) {
      setUploadErrorKey('fmUploadInvalid');
      return;
    }
    // Tầng flow: đích đến đã xác định (bệnh viện + kịch bản hiện tại) -> import
    // thẳng, tự đánh version V{max+1}, không cần modal.
    if (facility && scenario) {
      actions.onImport?.(facility.name, scenario.name, content);
      return;
    }
    // Tầng bệnh viện / kịch bản: mở modal chọn đích đến. Prefill: đang đứng trong
    // bệnh viện -> cố định bệnh viện đó; ngoài ra thử khớp metadata trong file với
    // folder có sẵn; không khớp -> chế độ "tạo mới" với tên lấy từ metadata.
    const meta = parseFlowMeta(content);
    const metaFac = facilities.find((f) => f.name === meta.facility) ?? null;
    const fac = facility ?? metaFac;
    setImpFacSel(fac?.id ?? NEW_OPTION);
    setImpFacName(meta.facility ?? '');
    const metaScen = fac?.scenarios.find((s) => s.name === meta.name) ?? null;
    setImpScenSel(metaScen?.id ?? NEW_OPTION);
    setImpScenName(meta.name ?? '');
    setImportErrorKey(null);
    setImportContent(content);
  };

  const handleImportConfirm = () => {
    const fac = impFacSel === NEW_OPTION ? impFacName.trim() : impFacility?.name ?? '';
    const scen =
      impScenSel === NEW_OPTION
        ? impScenName.trim()
        : impFacility?.scenarios.find((s) => s.id === impScenSel)?.name ?? '';
    if (!fac) {
      setImportErrorKey('fmFacilityRequired');
      return;
    }
    if (!scen) {
      setImportErrorKey('fmScenarioRequired');
      return;
    }
    const content = importContent;
    setImportContent(null);
    if (content) actions.onImport?.(fac, scen, content);
  };

  // Bệnh viện đang chọn trong modal tạo mới (khi không đứng sẵn trong 1 bệnh viện).
  const newFacility = newFacSel === NEW_OPTION ? null : facilities.find((f) => f.id === newFacSel) ?? null;

  const openNewModal = () => {
    setCreateErrorKey(null);
    // Đang đứng trong bệnh viện/kịch bản -> prefill đúng vị trí; ngoài ra về chế độ "tạo mới".
    setNewFacSel(facility?.id ?? NEW_OPTION);
    setNewFacName('');
    setNewScenSel(scenario?.id ?? NEW_OPTION);
    setNewScenName('');
    setShowNew(true);
  };

  const handleCreate = () => {
    const facNode = facility ?? newFacility;
    const fac = facNode ? facNode.name : newFacName.trim();
    const scen =
      newScenSel === NEW_OPTION
        ? newScenName.trim()
        : facNode?.scenarios.find((s) => s.id === newScenSel)?.name ?? '';
    if (!fac) {
      setCreateErrorKey('fmFacilityRequired');
      return;
    }
    if (!scen) {
      setCreateErrorKey('fmScenarioRequired');
      return;
    }
    setShowNew(false);
    actions.onCreateFlow?.(fac, scen);
  };

  // Mở modal ghi chú của 1 version — prefill nội dung hiện có.
  const openNoteModal = (ver: VersionNode) => {
    setNoteDraft(ver.note ?? '');
    setNoteTarget(ver);
  };

  const handleSaveNote = () => {
    if (!noteTarget) return;
    const note = noteDraft.trim();
    const target = noteTarget;
    setNoteTarget(null);
    // Nội dung không đổi -> khỏi gọi API.
    if (note !== (target.note ?? '')) actions.onSaveNote?.(target.fileId, note);
  };

  const toggleSort = (key: string) =>
    setSort((s) =>
      !s || s.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null,
    );

  const cell = 'px-4 py-3 text-sm text-[var(--bk-text)]';
  const th = 'px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-[var(--bk-text-faint)]';

  // Tiêu đề cột sort được (đồng bộ hành vi với FileManagerScreen).
  const renderSortTh = (key: string, label: TKey, extraClass = '') => {
    const dir = sort && sort.key === key ? sort.dir : null;
    return (
      <th
        className={`${th} ${extraClass}`}
        aria-sort={dir ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <button
          type="button"
          onClick={() => toggleSort(key)}
          className={`group inline-flex items-center gap-1 uppercase tracking-wide transition hover:text-[var(--bk-accent)] ${
            dir ? 'text-[var(--bk-accent)]' : ''
          }`}
        >
          {t(label)}
          <Icon
            icon={dir === 'desc' ? 'lucide:arrow-down' : 'lucide:arrow-up'}
            width={12}
            height={12}
            className={dir ? '' : 'opacity-0 transition group-hover:opacity-50'}
          />
        </button>
      </th>
    );
  };

  const iconBtn =
    'flex h-8 w-8 items-center justify-center rounded-lg text-[var(--bk-text-faint)] transition hover:bg-[var(--bk-accent-soft)] hover:text-[var(--bk-accent)] disabled:pointer-events-none disabled:opacity-40';
  // Nút thao tác nằm trong ô trống cố định cuối dòng (không tiêu đề cột, đủ chỗ
  // 2 nút) — chỉ hiện khi hover dòng (hoặc focus bàn phím). Nút chỉ có icon,
  // không viền/nền; hover từng nút đổi màu theo hành động (xoá đỏ, duplicate xanh).
  const rowActions =
    'flex items-center justify-end gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100';
  const rowBtn =
    'flex h-8 w-8 items-center justify-center text-[var(--bk-text-faint)] transition disabled:pointer-events-none disabled:opacity-40';

  // ── Dữ liệu từng tầng sau lọc + sort ──
  const q = normalizeSearch(query);

  const facilityRows = useMemo(() => {
    let rows = facilities;
    if (q) rows = rows.filter((f) => normalizeSearch(f.name).includes(q));
    if (!sort) return rows;
    const val = (f: FacilityNode): string | number | undefined => {
      switch (sort.key) {
        case 'count':
          return f.scenarios.length;
        case 'createdAt':
          return f.createdAt;
        case 'updatedAt':
          return facilityUpdatedAt(f);
        default:
          return f.name;
      }
    };
    return [...rows].sort((a, b) => compareCells(val(a), val(b), sort.dir));
  }, [facilities, q, sort]);

  const scenarioRows = useMemo(() => {
    let rows = facility?.scenarios ?? [];
    if (q)
      rows = rows.filter((s) =>
        [s.name, latestVersionOf(s)?.author ?? ''].some((h) => normalizeSearch(h).includes(q)),
      );
    if (!sort) return rows;
    const val = (s: ScenarioNode): string | number | undefined => {
      switch (sort.key) {
        case 'latest':
          return latestOf(s) || undefined;
        case 'applied':
          return s.appliedMaster ?? s.appliedDemo ?? undefined;
        case 'createdAt':
          return s.createdAt;
        case 'updatedAt':
          return latestVersionOf(s)?.updatedAt;
        case 'author':
          return latestVersionOf(s)?.author;
        default:
          return s.name;
      }
    };
    return [...rows].sort((a, b) => compareCells(val(a), val(b), sort.dir));
  }, [facility, q, sort]);

  const versionRows = useMemo(() => {
    // Mặc định: bản mới nhất ở trên (dữ liệu đã DESC sẵn theo v).
    let rows = scenario?.versions ?? [];
    if (q) rows = rows.filter((v) => normalizeSearch(v.author).includes(q));
    if (!sort) return rows;
    const val = (x: VersionNode): string | number =>
      sort.key === 'createdAt'
        ? x.createdAt
        : sort.key === 'updatedAt'
          ? x.updatedAt
          : sort.key === 'author'
            ? x.author
            : x.v;
    return [...rows].sort((a, b) => compareCells(val(a), val(b), sort.dir));
  }, [scenario, q, sort]);

  // Phân trang trên tầng đang xem (áp sau lọc + sort).
  const activeCount =
    level === 1 ? facilityRows.length : level === 2 ? scenarioRows.length : versionRows.length;
  const totalPages = Math.max(1, Math.ceil(activeCount / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageSlice = <T,>(rows: T[]): T[] =>
    rows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const subtitleKey: TKey =
    level === 1 ? 'dmSubtitleFacilities' : level === 2 ? 'dmSubtitleScenarios' : 'dmSubtitleVersions';

  return (
    <div className="relative flex h-full flex-col bg-[var(--bk-bg)]">
      {/* ── Top bar (đồng bộ FileManagerScreen) ── */}
      <header className="flex items-center justify-between border-b border-[var(--bk-border)] bg-[var(--bk-surface)] px-4 py-2.5">
        <BrandLockup logoClass="h-8 w-8" textClass="text-xl" />
        {/* Owner mới có mục "Quản lý quyền" trong menu */}
        <FileManagerMenu onManagePermissions={permissions ? () => setShowPermissions(true) : undefined} />
      </header>

      <main className="relative mx-auto w-full max-w-7xl flex-1 overflow-auto p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-24 h-[420px] w-[640px] -translate-x-1/2 rounded-full bg-[var(--bk-accent)] opacity-[0.07] blur-[110px]"
        />

        <div className="relative overflow-hidden rounded-3xl border border-[var(--bk-border)] bg-[var(--bk-surface)] p-6 shadow-[var(--bk-shadow)]">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-[var(--bk-accent)] to-transparent opacity-70"
          />

          {/* Tiêu đề (+ chip prototype khi chạy mock) */}
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold tracking-tight text-[var(--bk-text)]">{t('fmTitle')}</h1>
              <p className="text-sm text-[var(--bk-text-muted)]">{t(subtitleKey)}</p>
            </div>
            {mock && (
              <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                <Icon icon="lucide:triangle-alert" width={12} height={12} />
                {t('dmPreviewBadge')}
              </span>
            )}
          </div>

          {/* ── Breadcrumb: 病院一覧 › 病院 › シナリオ ── */}
          <nav className="mb-4 flex flex-wrap items-center gap-1 text-sm">
            <button
              type="button"
              onClick={() => setPath({})}
              className={`rounded-md px-1.5 py-0.5 transition ${
                level === 1
                  ? 'font-bold text-[var(--bk-text)]'
                  : 'font-medium text-[var(--bk-accent)] hover:bg-[var(--bk-accent-soft)]'
              }`}
            >
              {t('dmRootCrumb')}
            </button>
            {facility && (
              <>
                <Icon icon="lucide:chevron-right" width={14} height={14} className="text-[var(--bk-text-faint)]" />
                <button
                  type="button"
                  onClick={() => setPath({ facilityId: facility.id })}
                  className={`rounded-md px-1.5 py-0.5 transition ${
                    level === 2
                      ? 'font-bold text-[var(--bk-text)]'
                      : 'font-medium text-[var(--bk-accent)] hover:bg-[var(--bk-accent-soft)]'
                  }`}
                >
                  {facility.name}
                </button>
              </>
            )}
            {scenario && (
              <>
                <Icon icon="lucide:chevron-right" width={14} height={14} className="text-[var(--bk-text-faint)]" />
                <span className="px-1.5 py-0.5 font-bold text-[var(--bk-text)]">{scenario.name}</span>
              </>
            )}
          </nav>

          {/* ── Thanh hành động: Tạo mới / Import / Làm mới / Tìm kiếm / Phân trang ── */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openNewModal}
              disabled={busy || (!mock && !actions.onCreateFlow)}
              className="flex items-center gap-1.5 rounded-lg bg-[#16a34a] px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-95 disabled:pointer-events-none disabled:opacity-60"
            >
              <Icon icon="line-md:plus" width={17} height={17} />
              {t('fmNew')}
            </button>
            {/* Import file YAML -> modal chọn/tạo folder bệnh viện + kịch bản */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy || (!mock && !actions.onImport)}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--bk-accent)] px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-95 disabled:pointer-events-none disabled:opacity-60"
            >
              <Icon icon="line-md:upload-loop" width={17} height={17} />
              {t('dmImport')}
            </button>
            <button
              type="button"
              onClick={() => actions.onRefresh?.()}
              disabled={loading || busy || !actions.onRefresh}
              title={t('fmRefresh')}
              aria-label={t('fmRefresh')}
              className={`${iconBtn} h-9 w-9`}
            >
              <Icon icon="lucide:refresh-cw" width={18} height={18} className={loading ? 'animate-spin' : ''} />
            </button>
            {/* Nút tìm kiếm (kính lúp) — bấm mới hiện ô nhập (đồng bộ FileManagerScreen) */}
            <button
              type="button"
              onClick={toggleSearch}
              title={t('fmSearch')}
              aria-label={t('fmSearch')}
              aria-pressed={searchOpen}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 ${
                searchOpen
                  ? 'bg-[var(--bk-accent-soft)] text-[var(--bk-accent)]'
                  : 'text-[var(--bk-text-muted)] hover:text-[var(--bk-accent)]'
              }`}
            >
              <Icon icon="line-md:search" width={18} height={18} />
            </button>

            {/* Ô tìm kiếm: trượt ra khi bật, Escape để đóng */}
            <div
              className={`relative flex items-center overflow-hidden transition-[flex-grow,opacity,margin] duration-300 ease-out ${
                searchOpen ? 'ml-0.5 min-w-[160px] flex-1 opacity-100' : 'ml-0 w-0 flex-none opacity-0'
              }`}
            >
              <input
                ref={searchInputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') toggleSearch();
                }}
                placeholder={t('fmSearch')}
                aria-label={t('fmSearch')}
                className="w-full rounded-lg border border-[var(--bk-border)] bg-[var(--bk-bg)] py-2 pl-3 pr-8 text-sm text-[var(--bk-text)] outline-none transition focus:border-[var(--bk-accent)] focus:ring-2 focus:ring-[var(--bk-accent-soft)]"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    searchInputRef.current?.focus();
                  }}
                  title={t('fmSearchClear')}
                  aria-label={t('fmSearchClear')}
                  className="absolute right-1.5 flex h-6 w-6 items-center justify-center rounded-md text-[var(--bk-text-faint)] transition hover:bg-[var(--bk-surface-2)] hover:text-[var(--bk-text)]"
                >
                  <Icon icon="lucide:x" width={14} height={14} />
                </button>
              )}
            </div>

            {/* ── Phần trang: số kết quả · số dòng mỗi trang · điều hướng ── */}
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              <span className="hidden whitespace-nowrap text-xs text-[var(--bk-text-faint)] lg:inline">
                {t('fmResultCount', { n: activeCount })}
              </span>
              <div className="flex shrink-0 items-center gap-1.5 text-sm text-[var(--bk-text-muted)]">
                <span className="hidden sm:inline">{t('fmPerPage')}</span>
                <div className="relative inline-flex shrink-0 items-center">
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    aria-label={t('fmPerPage')}
                    className="cursor-pointer appearance-none rounded-lg border border-[var(--bk-border)] bg-[var(--bk-bg)] py-1.5 pl-2 pr-6 text-sm font-medium text-[var(--bk-text)] outline-none transition hover:border-[var(--bk-accent)] focus:border-[var(--bk-accent)]"
                  >
                    {PAGE_SIZES.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <Icon
                    icon="lucide:chevron-down"
                    width={14}
                    height={14}
                    className="pointer-events-none absolute right-1.5 text-[var(--bk-text-muted)]"
                  />
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  title={t('fmPrevPage')}
                  aria-label={t('fmPrevPage')}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--bk-text-muted)] transition hover:bg-[var(--bk-accent-soft)] hover:text-[var(--bk-accent)] disabled:pointer-events-none disabled:opacity-40"
                >
                  <Icon icon="lucide:chevron-left" width={18} height={18} />
                </button>
                <span className="min-w-[84px] whitespace-nowrap text-center text-xs font-medium text-[var(--bk-text-muted)]">
                  {t('fmPageOf', { page: safePage, total: totalPages })}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  title={t('fmNextPage')}
                  aria-label={t('fmNextPage')}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--bk-text-muted)] transition hover:bg-[var(--bk-accent-soft)] hover:text-[var(--bk-accent)] disabled:pointer-events-none disabled:opacity-40"
                >
                  <Icon icon="lucide:chevron-right" width={18} height={18} />
                </button>
              </div>
            </div>
          </div>

          {/* Input file ẩn cho Import */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".yaml,.yml,text/yaml,application/x-yaml"
            className="hidden"
            onChange={(e) => void handleImportFile(e.target.files)}
          />

          {(actionError || listErrorKey || uploadErrorKey) && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              <Icon icon="lucide:triangle-alert" className="mt-0.5 shrink-0" />
              <span>
                {actionError ?? (listErrorKey ? t(listErrorKey) : uploadErrorKey ? t(uploadErrorKey) : null)}
              </span>
            </div>
          )}

          {/* ── Bảng theo tầng ── */}
          <div className="overflow-x-auto rounded-xl border border-[var(--bk-border)] bg-[var(--bk-surface)]">
            {loading ? (
              <div className="flex items-center justify-center gap-2 p-8 text-sm text-[var(--bk-text-muted)]">
                <Icon icon="lucide:loader-circle" className="animate-spin" />
                {t('fmLoading')}
              </div>
            ) : level === 1 ? (
              facilityRows.length === 0 ? (
                <EmptyState icon="line-md:folder-multiple" text={q ? t('fmNoResults') : t('dmEmptyFacilities')} />
              ) : (
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--bk-border)]">
                      {renderSortTh('name', 'colFacility', 'w-[380px] min-w-[300px]')}
                      {renderSortTh('count', 'colScenarioCount')}
                      {renderSortTh('createdAt', 'colCreatedAt')}
                      {renderSortTh('updatedAt', 'colUpdatedAt')}
                      {/* Ô trống cố định cuối dòng cho nút thao tác (hiện khi hover) */}
                      <th className={`${th} w-[88px]`} aria-hidden />
                    </tr>
                  </thead>
                  <tbody>
                    {pageSlice(facilityRows).map((f) => (
                      // Click bất kỳ chỗ nào trên dòng = vào danh sách kịch bản.
                      // Nút thao tác nổi ở mép phải, chỉ hiện khi hover.
                      <tr
                        key={f.id}
                        {...rowHoverProps(f.id)}
                        onClick={() => {
                          if (!busy) setPath({ facilityId: f.id });
                        }}
                        className="group cursor-pointer border-b border-[var(--bk-border)] transition last:border-0 hover:bg-[var(--bk-surface-2)]"
                      >
                        <td className={cell}>
                          <span className="flex min-w-0 items-center gap-2 font-medium text-[var(--bk-text)]">
                            <Icon icon="line-md:folder-multiple" width={16} height={16} className="shrink-0 text-[var(--bk-accent)]" />
                            <span className="truncate">{f.name}</span>
                          </span>
                        </td>
                        <td className={`${cell} text-[var(--bk-text-muted)]`}>{f.scenarios.length}</td>
                        <td className={`${cell} whitespace-nowrap text-[var(--bk-text-muted)]`}>
                          {f.createdAt ?? '—'}
                        </td>
                        <td className={`${cell} whitespace-nowrap text-[var(--bk-text-muted)]`}>
                          {facilityUpdatedAt(f) ?? '—'}
                        </td>
                        <td className={cell} onClick={(e) => e.stopPropagation()}>
                          <div className={rowActions}>
                            {/* Sửa = đổi tên folder bệnh viện */}
                            <HoverLabelButton
                              label={t('edit')}
                              onClick={() => openRenameModal('facility', f.id, f.name)}
                              disabled={busy || (!mock && !actions.onRename)}
                              className={`${rowBtn} hover:text-[#f97316]`}
                            >
                              <Icon key={iconKey(f.id)} icon="line-md:edit-twotone" width={17} height={17} />
                            </HoverLabelButton>
                            {/* Xoá — chỉ owner/admin (phân quyền) */}
                            {canDelete && (
                              <HoverLabelButton
                                label={t('delete')}
                                onClick={() => setDeleteTarget({ kind: 'facility', id: f.id, label: f.name })}
                                disabled={busy || (!mock && !actions.onDelete)}
                                className={`${rowBtn} hover:text-rose-500`}
                              >
                                <Icon key={iconKey(f.id)} icon="line-md:trash" width={17} height={17} />
                              </HoverLabelButton>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : level === 2 && facility ? (
              scenarioRows.length === 0 ? (
                <EmptyState icon="line-md:folder" text={q ? t('fmNoResults') : t('dmEmptyScenarios')} />
              ) : (
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--bk-border)]">
                      {renderSortTh('name', 'colScenario', 'w-[300px] min-w-[240px]')}
                      {renderSortTh('latest', 'colLatestVersion')}
                      {renderSortTh('applied', 'colAppliedVersion')}
                      {renderSortTh('createdAt', 'colCreatedAt')}
                      {renderSortTh('updatedAt', 'colUpdatedAt')}
                      {renderSortTh('author', 'colAuthor')}
                      <th className={`${th} w-[88px]`} aria-hidden />
                    </tr>
                  </thead>
                  <tbody>
                    {pageSlice(scenarioRows).map((s) => {
                      const latest = latestOf(s);
                      const lv = latestVersionOf(s);
                      return (
                        // Kịch bản hoạt động như folder: click dòng = vào màn quản lý phiên bản.
                        <tr
                          key={s.id}
                          {...rowHoverProps(s.id)}
                          onClick={() => {
                            if (!busy) setPath({ facilityId: facility.id, scenarioId: s.id });
                          }}
                          className="group cursor-pointer border-b border-[var(--bk-border)] transition last:border-0 hover:bg-[var(--bk-surface-2)]"
                        >
                          <td className={cell}>
                            <span className="flex min-w-0 items-center gap-2 font-medium text-[var(--bk-text)]">
                              <Icon icon="line-md:folder" width={16} height={16} className="shrink-0 text-[var(--bk-accent)]" />
                              <span className="truncate">{s.name}</span>
                            </span>
                          </td>
                          <td className={`${cell} font-semibold`}>{latest ? `V${latest}` : '—'}</td>
                          <td className={cell}>
                            {/* Stamp môi trường + V{N} đang chạy, bố cục giống badge Main|Sub flow
                                (ngăn bằng gạch đứng); môi trường chưa deploy thì KHÔNG hiện. */}
                            {s.appliedMaster == null && s.appliedDemo == null ? (
                              <span className="text-[var(--bk-text-faint)]">—</span>
                            ) : (
                              <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-[var(--bk-text-muted)]">
                                {s.appliedMaster != null && (
                                  <span className="flex items-center gap-1">
                                    <EnvStamp env="master" />
                                    <span>V{s.appliedMaster}</span>
                                  </span>
                                )}
                                {s.appliedMaster != null && s.appliedDemo != null && (
                                  <span aria-hidden className="h-3.5 w-px bg-[var(--bk-border)]" />
                                )}
                                {s.appliedDemo != null && (
                                  <span className="flex items-center gap-1">
                                    <EnvStamp env="demo" />
                                    <span>V{s.appliedDemo}</span>
                                  </span>
                                )}
                              </span>
                            )}
                          </td>
                          <td className={`${cell} whitespace-nowrap text-[var(--bk-text-muted)]`}>{s.createdAt ?? '—'}</td>
                          <td className={`${cell} whitespace-nowrap text-[var(--bk-text-muted)]`}>{lv?.updatedAt ?? '—'}</td>
                          <td className={`${cell} text-[var(--bk-text-muted)]`}>{lv?.author ?? '—'}</td>
                          <td className={cell} onClick={(e) => e.stopPropagation()}>
                            <div className={rowActions}>
                              {/* Sửa = đổi tên folder kịch bản */}
                              <HoverLabelButton
                                label={t('edit')}
                                onClick={() => openRenameModal('scenario', s.id, s.name)}
                                disabled={busy || (!mock && !actions.onRename)}
                                className={`${rowBtn} hover:text-[#f97316]`}
                              >
                                <Icon key={iconKey(s.id)} icon="line-md:edit-twotone" width={17} height={17} />
                              </HoverLabelButton>
                              {/* Xoá — chỉ owner/admin (phân quyền) */}
                              {canDelete && (
                                <HoverLabelButton
                                  label={t('delete')}
                                  onClick={() => setDeleteTarget({ kind: 'scenario', id: s.id, label: s.name })}
                                  disabled={busy || (!mock && !actions.onDelete)}
                                  className={`${rowBtn} hover:text-rose-500`}
                                >
                                  <Icon key={iconKey(s.id)} icon="line-md:trash" width={17} height={17} />
                                </HoverLabelButton>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )
            ) : level === 3 && facility && scenario ? (
              versionRows.length === 0 ? (
                <EmptyState icon="line-md:file-document" text={q ? t('fmNoResults') : t('dmEmptyVersions')} />
              ) : (
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--bk-border)]">
                      {renderSortTh('v', 'colVersion', 'w-[340px] min-w-[280px]')}
                      {/* Môi trường đã deploy bản này (stamp MASTER/DEMO) — không sort */}
                      <th className={th}>{t('colDeployedEnv')}</th>
                      {renderSortTh('createdAt', 'colCreatedAt')}
                      {renderSortTh('updatedAt', 'colUpdatedAt')}
                      {renderSortTh('author', 'colAuthor')}
                      {/* Rộng hơn 2 tầng trên: dòng version có thêm nút Ghi chú (3 nút) */}
                      <th className={`${th} w-[124px]`} aria-hidden />
                    </tr>
                  </thead>
                  <tbody>
                    {pageSlice(versionRows).map((ver) => {
                      const isLatest = ver.v === latestOf(scenario);
                      const onMaster = scenario.appliedMaster === ver.v;
                      const onDemo = scenario.appliedDemo === ver.v;
                      return (
                        // Click bất kỳ chỗ nào trên dòng (trừ cột thao tác) = mở bản này lên canvas.
                        <tr
                          key={ver.fileId}
                          {...rowHoverProps(ver.fileId)}
                          onClick={() => {
                            if (!busy) actions.onOpenVersion?.(facility, scenario, ver);
                          }}
                          className="group cursor-pointer border-b border-[var(--bk-border)] transition last:border-0 hover:bg-[var(--bk-surface-2)]"
                        >
                          <td className={cell}>
                            <div className="flex items-center gap-2.5">
                              <span className="flex min-w-0 items-center gap-2 font-semibold text-[var(--bk-text)]">
                                <Icon icon="line-md:file-document" width={16} height={16} className="shrink-0 text-[var(--bk-accent)]" />
                                <span>V{ver.v}</span>
                              </span>
                              <span className="truncate text-xs text-[var(--bk-text-faint)]">
                                {versionFileName(scenario.name, ver.v)}
                              </span>
                              {/* Cấu trúc flow CỦA BẢN NÀY: Main | Sub · số lượng (ẩn khi chưa đọc xong). */}
                              {ver.subflowCount !== undefined && (
                                <FlowStructureBadge subflowCount={ver.subflowCount} />
                              )}
                              {isLatest && (
                                <span
                                  className="inline-flex shrink-0 items-center text-[#b026ff]"
                                  title={t('dmLatestBadge')}
                                >
                                  <Icon icon="mdi:new-box" width={20} height={20} />
                                </span>
                              )}
                            </div>
                          </td>
                          <td className={cell}>
                            {/* Bản này đang chạy trên môi trường nào (stamp MASTER/DEMO). */}
                            {!onMaster && !onDemo ? (
                              <span className="text-[var(--bk-text-faint)]">—</span>
                            ) : (
                              <span className="flex flex-wrap items-center gap-1.5">
                                {onMaster && <EnvStamp env="master" />}
                                {onDemo && <EnvStamp env="demo" />}
                              </span>
                            )}
                          </td>
                          <td className={`${cell} whitespace-nowrap text-[var(--bk-text-muted)]`}>{ver.createdAt}</td>
                          <td className={`${cell} whitespace-nowrap text-[var(--bk-text-muted)]`}>{ver.updatedAt}</td>
                          <td className={`${cell} text-[var(--bk-text-muted)]`}>{ver.author}</td>
                          <td className={cell} onClick={(e) => e.stopPropagation()}>
                            <div className={rowActions}>
                              {/* Ghi chú CỦA BẢN NÀY: hover = xem nhanh nội dung
                                  (tooltip); click = mở modal sửa. Đã có ghi chú thì
                                  icon đổi sang bong bóng có dòng chữ. */}
                              <HoverLabelButton
                                label={ver.note ?? t('dmNote')}
                                onClick={() => openNoteModal(ver)}
                                disabled={busy || (!mock && !actions.onSaveNote)}
                                className={`${rowBtn} hover:text-sky-500`}
                              >
                                <Icon
                                  key={`${iconKey(ver.fileId)}-${ver.note ? 'memo' : 'empty'}`}
                                  icon={ver.note ? 'app:chat-round-text' : 'line-md:chat-round'}
                                  width={17}
                                  height={17}
                                />
                              </HoverLabelButton>
                              {/* Duplicate = tạo V{max+1} với nội dung bản này. */}
                              <HoverLabelButton
                                label={t('fmDuplicate')}
                                onClick={() => actions.onDuplicate?.(facility, scenario, ver)}
                                disabled={busy || (!mock && !actions.onDuplicate)}
                                className={`${rowBtn} hover:text-[#22c55e]`}
                              >
                                <Icon key={iconKey(ver.fileId)} icon="line-md:duplicate" width={17} height={17} />
                              </HoverLabelButton>
                              {/* Xoá — chỉ owner/admin (phân quyền) */}
                              {canDelete && (
                                <HoverLabelButton
                                  label={t('delete')}
                                  onClick={() =>
                                    setDeleteTarget({
                                      kind: 'version',
                                      id: ver.fileId,
                                      label: versionFileName(scenario.name, ver.v),
                                    })
                                  }
                                  disabled={busy || (!mock && !actions.onDelete)}
                                  className={`${rowBtn} hover:text-rose-500`}
                                >
                                  <Icon key={iconKey(ver.fileId)} icon="line-md:trash" width={17} height={17} />
                                </HoverLabelButton>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )
            ) : null}
          </div>
        </div>
      </main>

      {/* Overlay "đang xử lý" */}
      {busy && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[color-mix(in_srgb,var(--bk-bg)_55%,transparent)]">
          <Icon icon="lucide:loader-circle" width={28} height={28} className="animate-spin text-[var(--bk-accent)]" />
        </div>
      )}

      {/* Modal: tạo flow mới — chọn/tạo folder bệnh viện + kịch bản, GIỐNG modal
          import. Click ngoài modal KHÔNG đóng — chỉ nút Hủy. */}
      {showNew && (
        <div className="bk-modal-overlay bk-modal-overlay--fixed" role="dialog" aria-modal="true">
          <div className="bk-modal">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--bk-text)]">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--bk-accent-soft)] text-[var(--bk-accent)]">
                <Icon icon="lucide:file-plus" width={15} height={15} />
              </span>
              {t('fmNew')}
            </div>

            <label className="mb-1 block text-xs font-semibold text-[var(--bk-text-muted)]">
              {t('dmImportFacilityLabel')}
            </label>
            {facility ? (
              // Đang đứng trong 1 bệnh viện -> tạo vào bệnh viện đó, không cho đổi.
              <div className="mb-3 flex items-center gap-2 rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface-2)] px-3 py-2 text-sm text-[var(--bk-text-muted)]">
                <Icon icon="line-md:folder-multiple" width={15} height={15} className="shrink-0 text-[var(--bk-accent)]" />
                <span className="truncate">{facility.name}</span>
              </div>
            ) : (
              <PickOrCreateField
                options={facilities.map((f) => ({ id: f.id, name: f.name }))}
                optionIcon="line-md:folder-multiple"
                selected={newFacSel}
                onSelect={(id) => {
                  setNewFacSel(id);
                  // Đổi bệnh viện -> danh sách kịch bản đổi theo, về chế độ "tạo mới".
                  setNewScenSel(NEW_OPTION);
                }}
                name={newFacName}
                onNameChange={setNewFacName}
                placeholder={t('fmFacilityPlaceholder')}
                createLabel={t('dmImportCreateNew')}
                backLabel={t('dmPickFromList')}
                className="mb-3"
              />
            )}

            <label className="mb-1 block text-xs font-semibold text-[var(--bk-text-muted)]">
              {t('dmImportScenarioLabel')}
            </label>
            <PickOrCreateField
              options={((facility ?? newFacility)?.scenarios ?? []).map((s) => ({ id: s.id, name: s.name }))}
              optionIcon="line-md:folder"
              selected={newScenSel}
              onSelect={setNewScenSel}
              name={newScenName}
              onNameChange={setNewScenName}
              placeholder={t('fmScenarioPlaceholder')}
              createLabel={t('dmImportCreateNew')}
              backLabel={t('dmPickFromList')}
              onEnter={handleCreate}
              className="mb-4"
            />

            {createErrorKey && <div className="mb-3 text-xs text-rose-500">{t(createErrorKey)}</div>}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNew(false)}
                className="rounded-lg border border-[var(--bk-border)] px-4 py-2 text-sm font-semibold text-[var(--bk-text-muted)] transition hover:bg-[var(--bk-surface-2)] hover:text-[var(--bk-text)]"
              >
                {t('btnCancel')}
              </button>
              <button
                type="button"
                onClick={handleCreate}
                className="rounded-lg bg-[var(--bk-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
              >
                {t('fmCreate')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: import — chọn folder bệnh viện + kịch bản có sẵn hoặc tạo mới bằng
          cách gõ tên. Click ngoài modal KHÔNG đóng — chỉ nút Hủy. */}
      {importContent != null && (
        <div className="bk-modal-overlay bk-modal-overlay--fixed" role="dialog" aria-modal="true">
          <div className="bk-modal">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--bk-text)]">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--bk-accent-soft)] text-[var(--bk-accent)]">
                <Icon icon="line-md:upload-loop" width={15} height={15} />
              </span>
              {t('dmImportTitle')}
            </div>

            <label className="mb-1 block text-xs font-semibold text-[var(--bk-text-muted)]">
              {t('dmImportFacilityLabel')}
            </label>
            {facility ? (
              // Tầng kịch bản: import vào bệnh viện đang mở — hiện cố định, không cho đổi.
              <div className="mb-3 flex items-center gap-2 rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface-2)] px-3 py-2 text-sm text-[var(--bk-text-muted)]">
                <Icon icon="line-md:folder-multiple" width={15} height={15} className="shrink-0 text-[var(--bk-accent)]" />
                <span className="truncate">{facility.name}</span>
              </div>
            ) : (
              // 1 control duy nhất: pulldown có mục "Tạo mới…" trên cùng; chọn thì
              // biến thành textbox nhập tên (xem PickOrCreateField).
              <PickOrCreateField
                options={facilities.map((f) => ({ id: f.id, name: f.name }))}
                optionIcon="line-md:folder-multiple"
                selected={impFacSel}
                onSelect={(id) => {
                  setImpFacSel(id);
                  // Đổi bệnh viện -> danh sách kịch bản đổi theo, về chế độ "tạo mới".
                  setImpScenSel(NEW_OPTION);
                }}
                name={impFacName}
                onNameChange={setImpFacName}
                placeholder={t('fmFacilityPlaceholder')}
                createLabel={t('dmImportCreateNew')}
                backLabel={t('dmPickFromList')}
                className="mb-3"
              />
            )}

            <label className="mb-1 block text-xs font-semibold text-[var(--bk-text-muted)]">
              {t('dmImportScenarioLabel')}
            </label>
            <PickOrCreateField
              options={(impFacility?.scenarios ?? []).map((s) => ({ id: s.id, name: s.name }))}
              optionIcon="line-md:folder"
              selected={impScenSel}
              onSelect={setImpScenSel}
              name={impScenName}
              onNameChange={setImpScenName}
              placeholder={t('fmScenarioPlaceholder')}
              createLabel={t('dmImportCreateNew')}
              backLabel={t('dmPickFromList')}
              onEnter={handleImportConfirm}
              className="mb-4"
            />

            {importErrorKey && <div className="mb-3 text-xs text-rose-500">{t(importErrorKey)}</div>}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setImportContent(null)}
                className="rounded-lg border border-[var(--bk-border)] px-4 py-2 text-sm font-semibold text-[var(--bk-text-muted)] transition hover:bg-[var(--bk-surface-2)] hover:text-[var(--bk-text)]"
              >
                {t('btnCancel')}
              </button>
              <button
                type="button"
                onClick={handleImportConfirm}
                className="rounded-lg bg-[var(--bk-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
              >
                {t('dmImport')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: đổi tên folder bệnh viện / kịch bản (chỉ tên folder). Click ngoài không đóng. */}
      {renameTarget && (
        <div className="bk-modal-overlay bk-modal-overlay--fixed" role="dialog" aria-modal="true">
          <div className="bk-modal">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--bk-text)]">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--bk-accent-soft)] text-[var(--bk-accent)]">
                <Icon icon="line-md:edit-twotone" width={15} height={15} />
              </span>
              {t('fmRename')}
            </div>

            <label className="mb-1 block text-xs font-semibold text-[var(--bk-text-muted)]">
              {t(renameTarget.kind === 'facility' ? 'colFacility' : 'colScenario')}
            </label>
            <input
              autoFocus
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename();
              }}
              placeholder={t(renameTarget.kind === 'facility' ? 'fmFacilityPlaceholder' : 'fmScenarioPlaceholder')}
              className={`mb-4 ${FIELD_CLS}`}
            />

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenameTarget(null)}
                className="rounded-lg border border-[var(--bk-border)] px-4 py-2 text-sm font-semibold text-[var(--bk-text-muted)] transition hover:bg-[var(--bk-surface-2)] hover:text-[var(--bk-text)]"
              >
                {t('btnCancel')}
              </button>
              <button
                type="button"
                onClick={handleRename}
                disabled={!renameName.trim()}
                className="rounded-lg bg-[var(--bk-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {t('btnSave')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: xác nhận xoá (đưa vào Thùng rác Drive). Click ngoài không đóng. */}
      {deleteTarget && (
        <div className="bk-modal-overlay bk-modal-overlay--fixed" role="dialog" aria-modal="true">
          <div className="bk-modal">
            <div className="mb-1 flex items-center gap-2 text-sm font-bold text-[var(--bk-text)]">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[color-mix(in_srgb,#dc2626_14%,transparent)] text-[#dc2626]">
                <Icon icon="lucide:trash-2" width={15} height={15} />
              </span>
              {t('fmDeleteTitle')}
            </div>
            <p className="mb-4 text-sm leading-relaxed text-[var(--bk-text-muted)]">
              {t('fmDeleteConfirm', { name: deleteTarget.label })}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-[var(--bk-border)] px-4 py-2 text-sm font-semibold text-[var(--bk-text-muted)] transition hover:bg-[var(--bk-surface-2)] hover:text-[var(--bk-text)]"
              >
                {t('btnCancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = deleteTarget;
                  setDeleteTarget(null);
                  actions.onDelete?.(target);
                }}
                className="rounded-lg bg-[#dc2626] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95"
              >
                {t('delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: ghi chú của 1 version. Click ngoài không đóng — chỉ Hủy/Lưu. */}
      {noteTarget && scenario && (
        <div className="bk-modal-overlay bk-modal-overlay--fixed" role="dialog" aria-modal="true">
          <div className="bk-modal">
            <div className="mb-1 flex items-center gap-2 text-sm font-bold text-[var(--bk-text)]">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[color-mix(in_srgb,#0ea5e9_14%,transparent)] text-sky-500">
                <Icon icon="app:chat-round-text" width={15} height={15} />
              </span>
              {t('dmNoteTitle')}
            </div>
            <p className="mb-3 truncate text-xs text-[var(--bk-text-muted)]">
              {versionFileName(scenario.name, noteTarget.v)}
            </p>

            <textarea
              autoFocus
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              rows={5}
              placeholder={t('dmNotePlaceholder')}
              className={`mb-4 resize-y ${FIELD_CLS}`}
            />

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNoteTarget(null)}
                className="rounded-lg border border-[var(--bk-border)] px-4 py-2 text-sm font-semibold text-[var(--bk-text-muted)] transition hover:bg-[var(--bk-surface-2)] hover:text-[var(--bk-text)]"
              >
                {t('btnCancel')}
              </button>
              <button
                type="button"
                onClick={handleSaveNote}
                className="rounded-lg bg-[var(--bk-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
              >
                {t('btnSave')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: 権限管理 — chỉ owner (mở từ menu). */}
      {showPermissions && permissions && (
        <PermissionsModal
          data={permissions.data}
          busy={busy}
          error={permissions.error}
          onChangeRole={permissions.onChangeRole}
          onClose={() => setShowPermissions(false)}
        />
      )}
    </div>
  );
}

// Stamp môi trường deploy: MAS/本番 (xanh emerald ngả cyan) / DEM/デモ (cam) — nền
// đặc, chữ trắng bold (KHÔNG nghiêng). Font cùng phong cách với logo (Space Grotesk):
// tiếng Nhật dùng Zen Kaku Gothic New — cùng chất geometric/hiện đại.
function EnvStamp({ env }: { env: 'master' | 'demo' }) {
  const t = useT();
  const master = env === 'master';
  return (
    <span
      title={t('dmAppliedBadge')}
      className="inline-flex shrink-0 items-center rounded px-1.5 py-px text-[10px] font-bold uppercase leading-4 tracking-widest text-white"
      style={{
        background: master ? '#10b981' : '#f97316',
        fontFamily: "'Space Grotesk', 'Zen Kaku Gothic New', sans-serif",
      }}
    >
      {t(master ? 'dmEnvMaster' : 'dmEnvDemo')}
    </span>
  );
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 p-10 text-center text-[var(--bk-text-muted)]">
      <Icon icon={icon} width={28} height={28} className="text-[var(--bk-text-faint)]" />
      <span className="text-sm">{text}</span>
    </div>
  );
}

// Trường "chọn có sẵn hoặc tạo mới" trong modal import — 1 control duy nhất:
// pulldown với mục "Tạo mới…" (icon +) ở TRÊN CÙNG; chọn mục đó thì control biến
// thành textbox nhập tên (kèm nút ✕ quay lại chọn từ danh sách nếu có lựa chọn).
function PickOrCreateField({
  options,
  optionIcon,
  selected,
  onSelect,
  name,
  onNameChange,
  placeholder,
  createLabel,
  backLabel,
  onEnter,
  className = '',
}: {
  options: { id: string; name: string }[];
  optionIcon: string; // icon của item có sẵn (folder-multiple / folder)
  selected: string; // id đang chọn hoặc NEW_OPTION
  onSelect: (id: string) => void;
  name: string; // tên đang gõ ở chế độ tạo mới
  onNameChange: (v: string) => void;
  placeholder: string;
  createLabel: string;
  backLabel: string;
  onEnter?: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  // ── Chế độ TẠO MỚI: textbox nhập tên (icon + bên trái, ✕ để quay lại pulldown) ──
  if (selected === NEW_OPTION) {
    return (
      <div className={`relative ${className}`}>
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--bk-accent)]">
          <Icon icon="line-md:plus" width={15} height={15} />
        </span>
        <input
          autoFocus
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onEnter?.();
          }}
          placeholder={placeholder}
          className={`${FIELD_CLS} pl-9 ${options.length ? 'pr-9' : ''}`}
        />
        {options.length > 0 && (
          <button
            type="button"
            onClick={() => onSelect(options[0].id)}
            title={backLabel}
            aria-label={backLabel}
            className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-[var(--bk-text-faint)] transition hover:bg-[var(--bk-surface-2)] hover:text-[var(--bk-text)]"
          >
            <Icon icon="lucide:x" width={14} height={14} />
          </button>
        )}
      </div>
    );
  }

  // ── Chế độ CHỌN: pulldown custom (mục "Tạo mới…" luôn ở trên cùng) ──
  const current = options.find((o) => o.id === selected) ?? null;
  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`${FIELD_CLS} flex cursor-pointer items-center justify-between gap-2 text-left`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Icon icon={optionIcon} width={15} height={15} className="shrink-0 text-[var(--bk-accent)]" />
          <span className="truncate">{current?.name ?? ''}</span>
        </span>
        <Icon
          icon="lucide:chevron-down"
          width={14}
          height={14}
          className={`shrink-0 text-[var(--bk-text-muted)] transition ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <>
          {/* Lớp phủ trong suốt để click ra ngoài là đóng list */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-56 overflow-auto rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface)] py-1 shadow-lg">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onSelect(NEW_OPTION);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-[var(--bk-accent)] transition hover:bg-[var(--bk-accent-soft)]"
            >
              <Icon icon="line-md:plus" width={15} height={15} />
              {createLabel}
            </button>
            <div className="mx-2 my-1 h-px bg-[var(--bk-border)]" aria-hidden />
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onSelect(o.id);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-[var(--bk-surface-2)] ${
                  o.id === selected ? 'font-semibold text-[var(--bk-accent)]' : 'text-[var(--bk-text)]'
                }`}
              >
                <Icon icon={optionIcon} width={15} height={15} className="shrink-0 text-[var(--bk-accent)]" />
                <span className="truncate">{o.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
