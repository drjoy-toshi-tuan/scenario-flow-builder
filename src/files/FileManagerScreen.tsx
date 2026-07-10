import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { useGithubToken } from '../github/token';
import { GithubConnectPanel } from './GithubConnectPanel';
import { FileManagerMenu } from './FileManagerMenu';
import {
  listFlows,
  getFlow,
  putFlow,
  deleteFlow,
  sanitizeFileName,
  uniqueFileName,
  GithubApiError,
  type FlowFile,
} from '../github/api';
import { ghErrorKey } from '../github/errors';
import { FLOWS_DIR } from '../github/config';
import { fromYaml } from '../ir/fromYaml';
import { parseFlowMeta, updateFlowMeta, type FlowMeta } from '../ir/flowMeta';
import { formatDateTime } from '../ir/ivrProperty';
import { useFlowStore } from '../store/flowStore';
import { useFileStore } from '../store/fileStore';
import { useT, type TKey } from '../ui/i18n';
import { Icon } from '../ui/icons';

// File kèm metadata đọc từ header YAML (để hiển thị theo cột).
type FileRow = FlowFile & { meta: FlowMeta };

// Bỏ đuôi .yaml/.yml khi hiển thị (danh sách chỉ hiện tên).
const stripExt = (name: string) => name.replace(/\.ya?ml$/i, '');

// Tên file trên repo theo quy ước <tên bệnh viện>_<tên flow>.yaml.
// (Màn quản lý vẫn hiển thị 2 phần tách riêng theo metadata trong file.)
const flowFileName = (facility: string, scenario: string) =>
  sanitizeFileName(`${facility}_${scenario}`);

// Cache metadata theo blob sha (sha = hash nội dung, đổi khi file đổi). Nhờ vậy khi
// quay lại màn danh sách / bấm Làm mới mà file không đổi -> KHÔNG tải lại nội dung;
// chỉ file mới hoặc vừa sửa (sha khác) mới phải fetch. Sống ở cấp module để giữ qua
// các lần mount (điều hướng canvas <-> quản lý file).
const metaCache = new Map<string, FlowMeta>();

// Nội dung flow trống khi "Tạo flow mới" — kèm metadata (施設名/シナリオ名/作成者/日時).
function buildBlankFlow(o: { facility: string; name: string; author: string; createdAt: string }): string {
  const q = (s: string) => JSON.stringify(s ?? ''); // double-quoted scalar an toàn cho YAML
  return [
    'flow:',
    `  name: ${q(o.name)}`,
    `  facility: ${q(o.facility)}`,
    `  author: ${q(o.author)}`,
    `  createdAt: ${q(o.createdAt)}`,
    `  updatedAt: ${q(o.createdAt)}`,
    '  start: welcome',
    '  nodes:',
    '    - id: welcome',
    '      type: announce',
    '      text: ""',
    '      next: goodbye',
    '    - id: goodbye',
    '      type: hangup',
    '',
  ].join('\n');
}

// Kiểm tra YAML có phải flow đọc được không (không ném lỗi khi vào canvas).
function isValidFlowYaml(text: string): boolean {
  try {
    return Array.isArray(fromYaml(text).nodes);
  } catch {
    return false;
  }
}

export function FileManagerScreen() {
  const { user } = useAuth();
  const { token } = useGithubToken();
  const invalidateToken = useGithubToken((s) => s.invalidate);
  const t = useT();

  // Token bị GitHub từ chối (hết hạn / thu hồi / mất quyền) khi đang thao tác:
  // KHÔNG hiện banner đỏ trên màn danh sách — thay vào đó xoá token và đưa người
  // dùng về ô nhập token kèm cảnh báo (xem GithubConnectPanel). Trả true nếu đã
  // xử lý (là lỗi auth) để nơi gọi dừng, không set banner nữa.
  const handledAsExpired = (e: unknown): boolean => {
    if (e instanceof GithubApiError && e.code === 'auth') {
      invalidateToken();
      return true;
    }
    return false;
  };

  const loadYaml = useFlowStore((s) => s.loadYaml);
  const openFile = useFileStore((s) => s.openFile);

  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(false);
  // Giữ KEY i18n (không phải chuỗi đã dịch) để refresh không phụ thuộc hàm t()
  // — t() đổi identity mỗi render, nếu đưa vào deps sẽ gây vòng lặp fetch vô hạn.
  const [listErrorKey, setListErrorKey] = useState<TKey | null>(null);
  const [busy, setBusy] = useState(false); // đang mở/tải lên/tạo/xoá.
  const [actionError, setActionError] = useState<string | null>(null);

  // Modal tạo mới / xoá / xác nhận ghi đè khi upload.
  const [showNew, setShowNew] = useState(false);
  const [newFacility, setNewFacility] = useState('');
  const [newScenario, setNewScenario] = useState('');
  const [createErrorKey, setCreateErrorKey] = useState<TKey | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FileRow | null>(null);
  const [overwrite, setOverwrite] = useState<{ name: string; content: string; sha: string } | null>(null);
  // Đổi tên bệnh viện / tên flow ngay trên màn quản lý (không cần mở canvas).
  const [renameTarget, setRenameTarget] = useState<FileRow | null>(null);
  const [renameFacility, setRenameFacility] = useState('');
  const [renameScenario, setRenameScenario] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setListErrorKey(null);
    try {
      const list = await listFlows(token);
      // Đọc metadata từng file (song song), tận dụng cache theo sha để không tải lại
      // file không đổi. Chỉ fetch những file chưa có trong cache (mới/vừa sửa).
      const rows = await Promise.all(
        list.map(async (f): Promise<FileRow> => {
          const cached = metaCache.get(f.sha);
          if (cached) return { ...f, meta: cached };
          try {
            const { content } = await getFlow(token, f.path);
            const meta = parseFlowMeta(content);
            metaCache.set(f.sha, meta);
            return { ...f, meta };
          } catch {
            return { ...f, meta: {} };
          }
        }),
      );
      // Dọn cache: chỉ giữ sha còn trong danh sách hiện tại (tránh phình vô hạn).
      const alive = new Set(list.map((f) => f.sha));
      for (const sha of metaCache.keys()) {
        if (!alive.has(sha)) metaCache.delete(sha);
      }
      setFiles(rows);
    } catch (e) {
      if (handledAsExpired(e)) return;
      setListErrorKey(ghErrorKey(e));
    } finally {
      setLoading(false);
    }
    // handledAsExpired dùng action zustand ổn định (invalidateToken) nên không cần
    // đưa vào deps — giữ deps = [token] để tránh vòng lặp fetch (xem ghi chú listErrorKey).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Nạp nội dung vào store rồi chuyển sang canvas.
  const openContent = useCallback(
    async (content: string, path: string, name: string, sha: string | null) => {
      await loadYaml(content);
      openFile({ path, name, sha });
    },
    [loadYaml, openFile],
  );

  const handleOpen = async (file: FlowFile) => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const { content, sha } = await getFlow(token!, file.path);
      await openContent(content, file.path, file.name, sha);
    } catch (e) {
      setBusy(false);
      if (handledAsExpired(e)) return;
      setActionError(t(ghErrorKey(e)));
    }
  };

  // Commit nội dung mới (upload/tạo) rồi mở. sha != undefined -> ghi đè file cũ.
  const commitAndOpen = async (name: string, content: string, commitMsg: string, sha?: string) => {
    const path = `${FLOWS_DIR}/${name}`;
    setBusy(true);
    setActionError(null);
    try {
      const res = await putFlow(token!, path, content, commitMsg, sha);
      await openContent(content, path, name, res.sha);
    } catch (e) {
      setBusy(false);
      if (handledAsExpired(e)) return;
      setActionError(t(ghErrorKey(e)));
    }
  };

  const handleUploadFile = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (fileInputRef.current) fileInputRef.current.value = ''; // cho phép chọn lại cùng file
    if (!file) return;
    setActionError(null);
    let content: string;
    try {
      content = await file.text();
    } catch {
      setActionError(t('fmUploadInvalid'));
      return;
    }
    if (!isValidFlowYaml(content)) {
      setActionError(t('fmUploadInvalid'));
      return;
    }
    const name = sanitizeFileName(file.name);
    const existing = files.find((f) => f.name === name);
    if (existing) {
      setOverwrite({ name, content, sha: existing.sha }); // hỏi xác nhận ghi đè
      return;
    }
    await commitAndOpen(name, content, t('commitUpload', { name }));
  };

  const confirmOverwrite = async () => {
    if (!overwrite) return;
    const { name, content, sha } = overwrite;
    setOverwrite(null);
    await commitAndOpen(name, content, t('commitUpload', { name }), sha);
  };

  const openNewModal = () => {
    setCreateErrorKey(null);
    setNewFacility('');
    setNewScenario('');
    setShowNew(true);
  };

  const handleCreate = async () => {
    const facility = newFacility.trim();
    const scenario = newScenario.trim();
    if (!facility) {
      setCreateErrorKey('fmFacilityRequired');
      return;
    }
    if (!scenario) {
      setCreateErrorKey('fmScenarioRequired');
      return;
    }
    // Tên file theo quy ước 施設名_シナリオ名; đảm bảo duy nhất để không ghi đè.
    const name = uniqueFileName(flowFileName(facility, scenario), new Set(files.map((f) => f.name)));
    setShowNew(false);
    const now = formatDateTime(new Date());
    const author = user?.name ?? user?.email ?? '';
    const content = buildBlankFlow({ facility, name: scenario, author, createdAt: now });
    await commitAndOpen(name, content, t('commitCreate', { name }));
  };

  // Mở modal đổi tên (prefill từ metadata của dòng).
  const openRenameModal = (file: FileRow) => {
    setRenameTarget(file);
    setRenameFacility(file.meta.facility ?? '');
    setRenameScenario(file.meta.name ?? stripExt(file.name));
  };

  // Lưu đổi tên: đọc file -> vá metadata (giữ nguyên nodes) -> commit lại theo sha.
  // Tên file theo quy ước 施設名_シナリオ名 nên đổi tên metadata cũng ĐỔI TÊN FILE
  // (tạo file mới rồi xoá file cũ — Contents API không có thao tác move).
  const handleRename = async () => {
    if (!renameTarget) return;
    const target = renameTarget;
    const facility = renameFacility.trim();
    const scenario = renameScenario.trim();
    if (!facility || !scenario) return;
    setRenameTarget(null);
    setBusy(true);
    setActionError(null);
    try {
      const { content, sha } = await getFlow(token!, target.path);
      const next = updateFlowMeta(content, {
        facility,
        name: scenario,
        updatedAt: formatDateTime(new Date()),
      });
      const desired = flowFileName(facility, scenario);
      if (desired === target.name) {
        await putFlow(token!, target.path, next, t('commitRename', { name: target.name }), sha);
      } else {
        const taken = new Set(files.filter((f) => f.path !== target.path).map((f) => f.name));
        const newName = uniqueFileName(desired, taken);
        await putFlow(token!, `${FLOWS_DIR}/${newName}`, next, t('commitRename', { name: newName }));
        await deleteFlow(token!, target.path, sha, t('commitRename', { name: target.name }));
      }
      await refresh();
    } catch (e) {
      if (!handledAsExpired(e)) setActionError(t(ghErrorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  // Nhân bản: copy nội dung sang file mới (tên file + tên kịch bản thêm hậu tố),
  // đóng dấu người tạo/thời điểm là người nhân bản.
  const handleDuplicate = async (file: FileRow) => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const { content } = await getFlow(token!, file.path);
      const now = formatDateTime(new Date());
      const baseName = file.meta.name ?? stripExt(file.name);
      // Tên file bản sao cũng theo quy ước 施設名_シナリオ名 (fallback tên cũ nếu thiếu 施設名).
      const desired = file.meta.facility
        ? flowFileName(file.meta.facility, `${baseName}-copy`)
        : sanitizeFileName(file.name);
      const newFileName = uniqueFileName(desired, new Set(files.map((f) => f.name)));
      const next = updateFlowMeta(content, {
        name: `${baseName} (Copy)`,
        createdAt: now,
        updatedAt: now,
        author: user?.name ?? user?.email ?? '',
      });
      await putFlow(token!, `${FLOWS_DIR}/${newFileName}`, next, t('commitDuplicate', { name: newFileName }));
      await refresh();
    } catch (e) {
      if (!handledAsExpired(e)) setActionError(t(ghErrorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    setBusy(true);
    setActionError(null);
    try {
      await deleteFlow(token!, target.path, target.sha, t('commitDelete', { name: target.name }));
      await refresh();
    } catch (e) {
      if (!handledAsExpired(e)) setActionError(t(ghErrorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  const cell = 'px-4 py-3 text-sm text-[var(--bk-text)]';
  const th = 'px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-[var(--bk-text-faint)]';

  return (
    <div className="relative flex h-full flex-col bg-[var(--bk-bg)]">
      {/* ── Top bar: tiêu đề + nút menu (giống canvas) ── */}
      <header className="flex items-center justify-between border-b border-[var(--bk-border)] bg-[var(--bk-surface)] px-4 py-2.5">
        {/* Không đặt icon ở đây — tránh nhầm là nút bấm (nút icon chỉ có ở màn canvas). */}
        <div>
          <div className="text-base font-bold text-[var(--bk-text)]">Brekeke Flow Builder</div>
          <div className="text-[11px] text-[var(--bk-text-faint)]">{t('fmTitle')}</div>
        </div>
        <FileManagerMenu />
      </header>

      {/* ── Nội dung ── */}
      {!token ? (
        <div className="relative flex flex-1 items-center justify-center overflow-hidden p-6">
          {/* Vầng sáng accent mờ (đồng bộ màn login). */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 h-[460px] w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--bk-accent)] opacity-[0.08] blur-[100px]"
          />
          <GithubConnectPanel />
        </div>
      ) : (
        // Panel nới rộng (max-w-7xl) để cột 施設名 có chỗ mở rộng.
        <main className="relative mx-auto w-full max-w-7xl flex-1 overflow-auto p-6">
          {/* Vầng sáng accent mờ phía sau card — chiều sâu kiểu màn login. */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-24 h-[420px] w-[640px] -translate-x-1/2 rounded-full bg-[var(--bk-accent)] opacity-[0.07] blur-[110px]"
          />

          <div className="relative overflow-hidden rounded-3xl border border-[var(--bk-border)] bg-[var(--bk-surface)] p-6 shadow-[var(--bk-shadow)]">
            {/* Dải accent mảnh trên đỉnh card (đồng bộ thẻ login). */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-[var(--bk-accent)] to-transparent opacity-70"
            />
            <div className="mb-4">
              <h1 className="text-lg font-bold tracking-tight text-[var(--bk-text)]">{t('fmTitle')}</h1>
              <p className="text-sm text-[var(--bk-text-muted)]">{t('fmSubtitle')}</p>
            </div>

          {/* Thanh hành động */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--bk-accent)] px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-95 disabled:pointer-events-none disabled:opacity-60"
            >
              <Icon icon="line-md:upload-loop" width={17} height={17} />
              {t('fmUpload')}
            </button>
            <button
              type="button"
              onClick={openNewModal}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg bg-[#16a34a] px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-95 disabled:pointer-events-none disabled:opacity-60"
            >
              <Icon icon="line-md:plus" width={17} height={17} />
              {t('fmNew')}
            </button>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading || busy}
              title={t('fmRefresh')}
              aria-label={t('fmRefresh')}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--bk-text-muted)] transition-all duration-200 hover:-translate-y-0.5 hover:text-[var(--bk-accent)] active:translate-y-0 active:scale-95 disabled:pointer-events-none disabled:opacity-60"
            >
              <Icon icon="lucide:refresh-cw" width={18} height={18} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".yaml,.yml,text/yaml,application/x-yaml"
            className="hidden"
            onChange={(e) => void handleUploadFile(e.target.files)}
          />

          {(actionError || listErrorKey) && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              <Icon icon="lucide:triangle-alert" className="mt-0.5 shrink-0" />
              <span>{actionError ?? (listErrorKey ? t(listErrorKey) : null)}</span>
            </div>
          )}

          {/* Bảng danh sách file */}
          <div className="overflow-x-auto rounded-xl border border-[var(--bk-border)] bg-[var(--bk-surface)]">
            {loading ? (
              <div className="flex items-center justify-center gap-2 p-8 text-sm text-[var(--bk-text-muted)]">
                <Icon icon="lucide:loader-circle" className="animate-spin" />
                {t('fmLoading')}
              </div>
            ) : files.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-10 text-center text-[var(--bk-text-muted)]">
                <Icon icon="lucide:folder" width={28} height={28} className="text-[var(--bk-text-faint)]" />
                <span className="text-sm">{t('fmEmpty')}</span>
              </div>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-[var(--bk-border)]">
                    {/* Cột 施設名 rộng ~1.5 lần trước đây (ghim min-width). */}
                    <th className={`${th} w-[270px] min-w-[270px]`}>{t('colFacility')}</th>
                    <th className={th}>{t('colScenario')}</th>
                    <th className={th}>{t('colCreatedAt')}</th>
                    <th className={th}>{t('colUpdatedAt')}</th>
                    <th className={th}>{t('colAuthor')}</th>
                    <th className={`${th} text-right`}>{t('colActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((file) => (
                    <tr
                      key={file.path}
                      className="border-b border-[var(--bk-border)] transition last:border-0 hover:bg-[var(--bk-surface-2)]"
                    >
                      <td className={`${cell} text-[var(--bk-text-muted)]`}>{file.meta.facility ?? '—'}</td>
                      <td className={cell}>
                        <button
                          type="button"
                          onClick={() => void handleOpen(file)}
                          disabled={busy}
                          className="flex items-center gap-2 text-left font-medium text-[var(--bk-text)] transition hover:text-[var(--bk-accent)] disabled:opacity-60"
                        >
                          <Icon icon="lucide:file-text" width={16} height={16} className="shrink-0 text-[var(--bk-accent)]" />
                          <span className="truncate">{file.meta.name ?? stripExt(file.name)}</span>
                        </button>
                      </td>
                      <td className={`${cell} whitespace-nowrap text-[var(--bk-text-muted)]`}>
                        {file.meta.createdAt ?? '—'}
                      </td>
                      <td className={`${cell} whitespace-nowrap text-[var(--bk-text-muted)]`}>
                        {file.meta.updatedAt ?? '—'}
                      </td>
                      <td className={`${cell} text-[var(--bk-text-muted)]`}>{file.meta.author ?? '—'}</td>
                      <td className={cell}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => void handleOpen(file)}
                            disabled={busy}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--bk-accent)] transition hover:bg-[var(--bk-accent-soft)] disabled:opacity-60"
                            title={t('fmOpen')}
                          >
                            <Icon icon="fluent:open-16-filled" width={18} height={18} />
                          </button>
                          <button
                            type="button"
                            onClick={() => openRenameModal(file)}
                            disabled={busy}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--bk-text-faint)] transition hover:bg-[var(--bk-accent-soft)] hover:text-[var(--bk-accent)] disabled:opacity-60"
                            title={t('fmRename')}
                          >
                            <Icon icon="lucide:pencil" width={16} height={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDuplicate(file)}
                            disabled={busy}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--bk-text-faint)] transition hover:bg-[var(--bk-accent-soft)] hover:text-[var(--bk-accent)] disabled:opacity-60"
                            title={t('fmDuplicate')}
                          >
                            <Icon icon="lucide:copy" width={16} height={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(file)}
                            disabled={busy}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--bk-text-faint)] transition hover:bg-[color-mix(in_srgb,#dc2626_12%,transparent)] hover:text-rose-500 disabled:opacity-60"
                            title={t('fmDeleteTitle')}
                          >
                            <Icon icon="lucide:trash-2" width={16} height={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          </div>
        </main>
      )}

      {/* Overlay "đang xử lý" */}
      {busy && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[color-mix(in_srgb,var(--bk-bg)_55%,transparent)]">
          <Icon icon="lucide:loader-circle" width={28} height={28} className="animate-spin text-[var(--bk-accent)]" />
        </div>
      )}

      {/* Modal: tạo flow mới (施設名 + シナリオ名) */}
      {showNew && (
        <div className="bk-modal-overlay bk-modal-overlay--fixed" role="dialog" aria-modal="true" onClick={() => setShowNew(false)}>
          <div className="bk-modal" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--bk-text)]">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--bk-accent-soft)] text-[var(--bk-accent)]">
                <Icon icon="lucide:file-plus" width={15} height={15} />
              </span>
              {t('fmNew')}
            </div>

            <label className="mb-1 block text-xs font-semibold text-[var(--bk-text-muted)]">
              {t('colFacility')}
            </label>
            <input
              autoFocus
              value={newFacility}
              onChange={(e) => setNewFacility(e.target.value)}
              placeholder={t('fmFacilityPlaceholder')}
              className="mb-3 w-full rounded-lg border border-[var(--bk-border)] bg-[var(--bk-bg)] px-3 py-2 text-sm text-[var(--bk-text)] outline-none focus:border-[var(--bk-accent)]"
            />

            <label className="mb-1 block text-xs font-semibold text-[var(--bk-text-muted)]">
              {t('colScenario')}
            </label>
            <input
              value={newScenario}
              onChange={(e) => setNewScenario(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreate();
              }}
              placeholder={t('fmScenarioPlaceholder')}
              className="mb-4 w-full rounded-lg border border-[var(--bk-border)] bg-[var(--bk-bg)] px-3 py-2 text-sm text-[var(--bk-text)] outline-none focus:border-[var(--bk-accent)]"
            />

            {createErrorKey && (
              <div className="mb-3 text-xs text-rose-500">{t(createErrorKey)}</div>
            )}

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
                onClick={() => void handleCreate()}
                className="rounded-lg bg-[var(--bk-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
              >
                {t('fmCreate')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: đổi tên bệnh viện / tên flow (vá metadata, giữ nguyên nodes) */}
      {renameTarget && (
        <div className="bk-modal-overlay bk-modal-overlay--fixed" role="dialog" aria-modal="true" onClick={() => setRenameTarget(null)}>
          <div className="bk-modal" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--bk-text)]">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--bk-accent-soft)] text-[var(--bk-accent)]">
                <Icon icon="lucide:pencil" width={15} height={15} />
              </span>
              {t('fmRenameTitle')}
            </div>

            <label className="mb-1 block text-xs font-semibold text-[var(--bk-text-muted)]">
              {t('colFacility')}
            </label>
            <input
              autoFocus
              value={renameFacility}
              onChange={(e) => setRenameFacility(e.target.value)}
              placeholder={t('fmFacilityPlaceholder')}
              className="mb-3 w-full rounded-lg border border-[var(--bk-border)] bg-[var(--bk-bg)] px-3 py-2 text-sm text-[var(--bk-text)] outline-none focus:border-[var(--bk-accent)]"
            />

            <label className="mb-1 block text-xs font-semibold text-[var(--bk-text-muted)]">
              {t('colScenario')}
            </label>
            <input
              value={renameScenario}
              onChange={(e) => setRenameScenario(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleRename();
              }}
              placeholder={t('fmScenarioPlaceholder')}
              className="mb-4 w-full rounded-lg border border-[var(--bk-border)] bg-[var(--bk-bg)] px-3 py-2 text-sm text-[var(--bk-text)] outline-none focus:border-[var(--bk-accent)]"
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
                onClick={() => void handleRename()}
                disabled={!renameFacility.trim() || !renameScenario.trim()}
                className="rounded-lg bg-[var(--bk-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {t('btnSave')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: xác nhận ghi đè khi upload trùng tên */}
      {overwrite && (
        <div className="bk-modal-overlay bk-modal-overlay--fixed" role="dialog" aria-modal="true" onClick={() => setOverwrite(null)}>
          <div className="bk-modal" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center gap-2 text-sm font-bold text-[var(--bk-text)]">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[color-mix(in_srgb,#d97706_16%,transparent)] text-[#d97706]">
                <Icon icon="lucide:triangle-alert" width={15} height={15} />
              </span>
              {t('fmUploadReplaceTitle')}
            </div>
            <p className="mb-4 text-sm leading-relaxed text-[var(--bk-text-muted)]">
              {t('fmUploadReplace', { name: stripExt(overwrite.name) })}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOverwrite(null)}
                className="rounded-lg border border-[var(--bk-border)] px-4 py-2 text-sm font-semibold text-[var(--bk-text-muted)] transition hover:bg-[var(--bk-surface-2)] hover:text-[var(--bk-text)]"
              >
                {t('btnCancel')}
              </button>
              <button
                type="button"
                onClick={() => void confirmOverwrite()}
                className="rounded-lg bg-[var(--bk-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
              >
                {t('fmOverwrite')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: xác nhận xoá */}
      {deleteTarget && (
        <div className="bk-modal-overlay bk-modal-overlay--fixed" role="dialog" aria-modal="true" onClick={() => setDeleteTarget(null)}>
          <div className="bk-modal" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center gap-2 text-sm font-bold text-[var(--bk-text)]">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[color-mix(in_srgb,#dc2626_14%,transparent)] text-[#dc2626]">
                <Icon icon="lucide:trash-2" width={15} height={15} />
              </span>
              {t('fmDeleteTitle')}
            </div>
            <p className="mb-4 text-sm leading-relaxed text-[var(--bk-text-muted)]">
              {t('fmDeleteConfirm', { name: deleteTarget.meta.name ?? stripExt(deleteTarget.name) })}
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
                onClick={() => void handleDelete()}
                className="rounded-lg bg-[#dc2626] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95"
              >
                {t('delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
