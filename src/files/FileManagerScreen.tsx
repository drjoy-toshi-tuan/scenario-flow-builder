import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { useGithubToken } from '../github/token';
import { GithubConnectPanel } from './GithubConnectPanel';
import {
  listFlows,
  getFlow,
  putFlow,
  deleteFlow,
  sanitizeFileName,
  type FlowFile,
} from '../github/api';
import { ghErrorKey } from '../github/errors';
import { FLOWS_DIR, flowsBrowseUrl } from '../github/config';
import { fromYaml } from '../ir/fromYaml';
import { useFlowStore } from '../store/flowStore';
import { useFileStore } from '../store/fileStore';
import { useLang, useT, type TKey } from '../ui/i18n';
import { useTheme } from '../ui/theme';
import { Icon } from '../ui/icons';
import { SlideToggle } from '../components/SlideToggle';

// Nội dung flow trống khi "Tạo flow mới".
function buildBlankFlow(name: string): string {
  return [
    'flow:',
    `  name: "${name}"`,
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
    const ir = fromYaml(text);
    return Array.isArray(ir.nodes);
  } catch {
    return false;
  }
}

export function FileManagerScreen() {
  const { user, signOut } = useAuth();
  const { token, login, disconnect } = useGithubToken();
  const { lang, setLang } = useLang();
  const { theme, setTheme } = useTheme();
  const t = useT();

  const loadYaml = useFlowStore((s) => s.loadYaml);
  const openFile = useFileStore((s) => s.openFile);

  const [files, setFiles] = useState<FlowFile[]>([]);
  const [loading, setLoading] = useState(false);
  // Giữ KEY i18n (không phải chuỗi đã dịch) để refresh không phụ thuộc hàm t()
  // — t() đổi identity mỗi render, nếu đưa vào deps sẽ gây vòng lặp fetch vô hạn.
  const [listErrorKey, setListErrorKey] = useState<TKey | null>(null);
  const [busy, setBusy] = useState(false); // đang mở/tải lên/tạo/xoá.
  const [actionError, setActionError] = useState<string | null>(null);

  // Modal tạo mới / xoá / xác nhận ghi đè khi upload.
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<FlowFile | null>(null);
  const [overwrite, setOverwrite] = useState<{ name: string; content: string; sha: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setListErrorKey(null);
    try {
      setFiles(await listFlows(token));
    } catch (e) {
      setListErrorKey(ghErrorKey(e));
    } finally {
      setLoading(false);
    }
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
      setActionError(t(ghErrorKey(e)));
      setBusy(false);
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
      setActionError(t(ghErrorKey(e)));
      setBusy(false);
    }
  };

  const handleUploadPick = () => fileInputRef.current?.click();

  const handleUploadFile = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    // Cho phép chọn lại cùng file lần sau.
    if (fileInputRef.current) fileInputRef.current.value = '';
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
      // Đã có -> hỏi xác nhận ghi đè (cần sha).
      setOverwrite({ name, content, sha: existing.sha });
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

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      setActionError(t('fmNameRequired'));
      return;
    }
    const name = sanitizeFileName(trimmed);
    const base = name.replace(/\.ya?ml$/i, '');
    setShowNew(false);
    setNewName('');
    const existing = files.find((f) => f.name === name);
    const content = buildBlankFlow(base);
    await commitAndOpen(name, content, t('commitCreate', { name }), existing?.sha);
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
      setActionError(t(ghErrorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex h-full flex-col bg-[var(--bk-bg)]">
      {/* ── Top bar ── */}
      <header className="flex items-center justify-between border-b border-[var(--bk-border)] bg-[var(--bk-surface)] px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--bk-accent-soft)] text-lg text-[var(--bk-accent)]">
            <Icon icon="hugeicons:workflow-square-10" />
          </span>
          <div>
            <div className="text-sm font-semibold text-[var(--bk-text)]">{t('fmTitle')}</div>
            <div className="text-[11px] text-[var(--bk-text-faint)]">
              {t('fmFolderNote', { dir: FLOWS_DIR })}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SlideToggle
            value={lang}
            options={[
              { key: 'vi', icon: 'twemoji:flag-vietnam' },
              { key: 'ja', icon: 'twemoji:flag-japan' },
            ]}
            onChange={(k) => setLang(k as 'vi' | 'ja')}
            ariaLabel="Language"
          />
          <SlideToggle
            value={theme}
            options={[
              { key: 'light', icon: 'lucide:sun' },
              { key: 'dark', icon: 'lucide:moon' },
            ]}
            onChange={(k) => setTheme(k as 'light' | 'dark')}
            ariaLabel="Theme"
          />
          <div className="mx-1 h-6 w-px bg-[var(--bk-border)]" />
          {user?.picture && <img src={user.picture} alt="" className="h-7 w-7 rounded-full" />}
          <span
            className="hidden max-w-[140px] truncate text-xs text-[var(--bk-text-muted)] sm:block"
            title={user?.email}
          >
            {user?.name}
          </span>
          <button type="button" onClick={signOut} className="bk-menu-logout" title={t('logout')}>
            <Icon icon="lucide:log-out" width={14} height={14} />
            <span>{t('logout')}</span>
          </button>
        </div>
      </header>

      {/* ── Nội dung ── */}
      {!token ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <GithubConnectPanel />
        </div>
      ) : (
        <main className="mx-auto w-full max-w-3xl flex-1 overflow-auto p-6">
          <div className="mb-4">
            <h1 className="text-lg font-bold text-[var(--bk-text)]">{t('fmTitle')}</h1>
            <p className="text-sm text-[var(--bk-text-muted)]">{t('fmSubtitle')}</p>
          </div>

          {/* Thanh hành động */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleUploadPick}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--bk-accent)] px-3.5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              <Icon icon="lucide:upload" width={16} height={16} />
              {t('fmUpload')}
            </button>
            <button
              type="button"
              onClick={() => {
                setActionError(null);
                setNewName('');
                setShowNew(true);
              }}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--bk-border)] px-3.5 py-2 text-sm font-semibold text-[var(--bk-text)] transition hover:border-[var(--bk-accent)] hover:text-[var(--bk-accent)] disabled:opacity-60"
            >
              <Icon icon="lucide:file-plus" width={16} height={16} />
              {t('fmNew')}
            </button>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading || busy}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--bk-border)] px-3.5 py-2 text-sm font-semibold text-[var(--bk-text-muted)] transition hover:border-[var(--bk-accent)] hover:text-[var(--bk-accent)] disabled:opacity-60"
            >
              <Icon icon="lucide:refresh-cw" width={16} height={16} className={loading ? 'animate-spin' : ''} />
              {t('fmRefresh')}
            </button>
            <div className="ml-auto flex items-center gap-3">
              <a
                href={flowsBrowseUrl()}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-[var(--bk-text-faint)] hover:text-[var(--bk-accent)] hover:underline"
              >
                <Icon icon="lucide:external-link" width={14} height={14} />
                {t('fmBrowseRepo')}
              </a>
              <span className="inline-flex items-center gap-1.5 text-xs text-[var(--bk-text-faint)]" title={t('fmConnectedAs', { login: login ?? '' })}>
                <Icon icon="lucide:github" width={14} height={14} />
                {login}
                <button
                  type="button"
                  onClick={disconnect}
                  className="ml-1 text-[var(--bk-text-faint)] hover:text-rose-500"
                  title={t('fmDisconnect')}
                >
                  <Icon icon="lucide:x" width={13} height={13} />
                </button>
              </span>
            </div>
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

          {/* Danh sách file */}
          <div className="overflow-hidden rounded-xl border border-[var(--bk-border)] bg-[var(--bk-surface)]">
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
              <ul className="divide-y divide-[var(--bk-border)]">
                {files.map((file) => (
                  <li
                    key={file.path}
                    className="flex items-center gap-3 px-4 py-3 transition hover:bg-[var(--bk-surface-2)]"
                  >
                    <Icon icon="lucide:file-text" width={18} height={18} className="shrink-0 text-[var(--bk-accent)]" />
                    <button
                      type="button"
                      onClick={() => void handleOpen(file)}
                      disabled={busy}
                      className="min-w-0 flex-1 text-left disabled:opacity-60"
                    >
                      <div className="truncate text-sm font-medium text-[var(--bk-text)]">{file.name}</div>
                      <div className="text-[11px] text-[var(--bk-text-faint)]">
                        {(file.size / 1024).toFixed(1)} KB
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleOpen(file)}
                      disabled={busy}
                      className="flex items-center gap-1.5 rounded-lg border border-[var(--bk-border)] px-3 py-1.5 text-xs font-semibold text-[var(--bk-text)] transition hover:border-[var(--bk-accent)] hover:text-[var(--bk-accent)] disabled:opacity-60"
                    >
                      <Icon icon="lucide:folder-open" width={14} height={14} />
                      {t('fmOpen')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(file)}
                      disabled={busy}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--bk-border)] text-[var(--bk-text-faint)] transition hover:border-rose-400 hover:text-rose-500 disabled:opacity-60"
                      title={t('fmDeleteTitle')}
                    >
                      <Icon icon="lucide:trash-2" width={14} height={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </main>
      )}

      {/* Overlay "đang xử lý" */}
      {busy && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[color-mix(in_srgb,var(--bk-bg)_55%,transparent)]">
          <Icon icon="lucide:loader-circle" width={28} height={28} className="animate-spin text-[var(--bk-accent)]" />
        </div>
      )}

      {/* Modal: tạo flow mới */}
      {showNew && (
        <div className="bk-modal-overlay bk-modal-overlay--fixed" role="dialog" aria-modal="true" onClick={() => setShowNew(false)}>
          <div className="bk-modal" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--bk-text)]">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--bk-accent-soft)] text-[var(--bk-accent)]">
                <Icon icon="lucide:file-plus" width={15} height={15} />
              </span>
              {t('fmNew')}
            </div>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreate();
              }}
              placeholder={t('fmNamePrompt')}
              className="mb-4 w-full rounded-lg border border-[var(--bk-border)] bg-[var(--bk-bg)] px-3 py-2 text-sm text-[var(--bk-text)] outline-none focus:border-[var(--bk-accent)]"
            />
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
              {t('fmUploadReplace', { name: overwrite.name })}
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
              {t('fmDeleteConfirm', { name: deleteTarget.name })}
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
