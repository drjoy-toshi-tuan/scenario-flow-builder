import { useEffect, useRef, useState } from 'react';
import { useFlowStore } from '../store/flowStore';
import { useFileStore } from '../store/fileStore';
import { useGithubToken } from '../github/token';
import { putFlow } from '../github/api';
import { ghErrorKey } from '../github/errors';
import { formatDateTime } from '../ir/ivrProperty';
import { useAuth } from '../auth/useAuth';
import { useTheme } from '../ui/theme';
import { useLang, useT, type TKey } from '../ui/i18n';
import { useToast } from '../ui/toast';
import { Icon } from '../ui/icons';
import { SlideToggle } from './SlideToggle';
import { IvrPropertyModal } from './IvrPropertyModal';

// ─────────────────────────────────────────────────────────────────────────────
// Menu dọc trên header (đóng/mở, animation giống "Thêm node"). Gom mọi chức năng
// từng nằm rời trên header: ngôn ngữ, theme, tự sắp xếp, xuất YAML, đăng xuất —
// và thêm mục mới "Cài đặt IVR Property" (mở modal).
// ─────────────────────────────────────────────────────────────────────────────

export function HeaderMenu() {
  const [open, setOpen] = useState(false);
  // Giữ menu mounted trong lúc chạy animation ĐÓNG.
  const [render, setRender] = useState(false);
  const [ivrOpen, setIvrOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) setRender(true);
  }, [open]);
  // Click ra ngoài panel -> tự đóng menu (không cần bấm lại nút menu).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const ir = useFlowStore((s) => s.ir);
  const autoLayout = useFlowStore((s) => s.autoLayout);
  const exportYaml = useFlowStore((s) => s.exportYaml);
  const setMeta = useFlowStore((s) => s.setMeta);
  const currentFile = useFileStore((s) => s.current);
  const closeFile = useFileStore((s) => s.closeFile);
  const setSha = useFileStore((s) => s.setSha);
  const token = useGithubToken((s) => s.token);
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const { lang, setLang } = useLang();
  const t = useT();
  const showToast = useToast((s) => s.show);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  // Thời điểm lưu về repo thành công gần nhất (yyyy-MM-dd HH:mm) — hiện cạnh dấu tích.
  const [savedAt, setSavedAt] = useState<string | null>(null);
  // Key lỗi i18n nếu lưu thất bại (null = không lỗi).
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleAutoLayout = async () => {
    setBusy(true);
    try {
      await autoLayout();
    } finally {
      setBusy(false);
    }
  };

  // Lưu flow hiện tại (export IR -> YAML) về đúng file trên repo (cập nhật theo sha).
  const handleSaveToRepo = async () => {
    if (!currentFile || !token || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      // Đóng dấu 更新日時 (và 作成者/作成日時 nếu file cũ chưa có) trước khi export.
      const now = formatDateTime(new Date());
      setMeta({
        updatedAt: now,
        ...(ir?.meta.createdAt ? {} : { createdAt: now }),
        ...(ir?.meta.author ? {} : { author: user?.name ?? user?.email ?? '' }),
      });
      const yaml = exportYaml();
      const res = await putFlow(
        token,
        currentFile.path,
        yaml,
        t('commitSave', { name: currentFile.name }),
        currentFile.sha ?? undefined,
      );
      setSha(res.sha);
      setSavedAt(now);
      showToast(t('fmSaved')); // thông báo nổi, tự biến mất
    } catch (e) {
      setSaveError(ghErrorKey(e));
    } finally {
      setSaving(false);
    }
  };

  // Phím tắt Ctrl/Cmd + Shift + S = lưu về repo (dùng ref để luôn gọi handler mới nhất).
  const saveRef = useRef(handleSaveToRepo);
  saveRef.current = handleSaveToRepo;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyS') {
        e.preventDefault();
        void saveRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const handleExport = () => {
    const yaml = exportYaml();
    const blob = new Blob([yaml], { type: 'text/yaml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ir?.meta.id ?? 'flow'}.yaml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f97316] text-white shadow-[var(--bk-shadow)] transition hover:brightness-95"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t('menu')}
        title={t('menu')}
      >
        <Icon icon="heroicons-solid:menu-alt-3" width={20} height={20} />
      </button>

      {render && (
        <div
          role="menu"
          onAnimationEnd={(e) => {
            if (e.target === e.currentTarget && !open) setRender(false);
          }}
          className={`bk-addmenu bk-headermenu ${open ? 'bk-addmenu--in' : 'bk-addmenu--out'} absolute right-0 top-full z-30 mt-2 w-72 overflow-hidden rounded-2xl border border-[var(--bk-border)] bg-[var(--bk-surface)] p-2 shadow-[var(--bk-shadow)]`}
        >
          {/* ── Cài đặt giao diện ── */}
          <MenuSection title={t('secInterface')} />
          <div className="bk-menu-row">
            <span className="bk-menu-row-label">{t('mLanguage')}</span>
            <SlideToggle
              value={lang}
              options={[
                { key: 'vi', icon: 'twemoji:flag-vietnam' },
                { key: 'ja', icon: 'twemoji:flag-japan' },
              ]}
              onChange={(k) => setLang(k as 'vi' | 'ja')}
              ariaLabel="Language"
              title={lang === 'vi' ? 'Tiếng Việt' : '日本語'}
            />
          </div>
          <div className="bk-menu-row">
            <span className="bk-menu-row-label">{t('mTheme')}</span>
            <SlideToggle
              value={theme}
              options={[
                { key: 'light', icon: 'lucide:sun' },
                { key: 'dark', icon: 'lucide:moon' },
              ]}
              onChange={(k) => setTheme(k as 'light' | 'dark')}
              ariaLabel="Theme"
              title={theme === 'dark' ? t('themeDark') : t('themeLight')}
            />
          </div>
          <button
            type="button"
            role="menuitem"
            className="bk-menu-item"
            onClick={handleAutoLayout}
            disabled={busy || !ir}
          >
            <Icon icon="lucide:layout-dashboard" width={16} height={16} className="text-[var(--bk-accent)]" />
            <span>{busy ? t('autoLayoutBusy') : t('autoLayout')}</span>
          </button>

          {/* ── Cài đặt flow ── */}
          <MenuSection title={t('secFlow')} />
          <button
            type="button"
            role="menuitem"
            className="bk-menu-item"
            onClick={() => {
              setIvrOpen(true);
              setOpen(false);
            }}
          >
            <Icon icon="fluent:code-text-20-filled" width={16} height={16} className="text-[var(--bk-accent)]" />
            <span>{t('ivrProperty')}</span>
          </button>
          {currentFile && (
            <button
              type="button"
              role="menuitem"
              className="bk-menu-item"
              onClick={handleSaveToRepo}
              disabled={!ir || !token || saving}
            >
              <Icon
                icon={saving ? 'lucide:loader-circle' : 'lucide:save'}
                width={16}
                height={16}
                className={`text-[var(--bk-accent)] ${saving ? 'animate-spin' : ''}`}
              />
              <span>{saving ? t('fmSaving') : t('fmSaveToRepo')}</span>
              {!saving && saveError && (
                <Icon icon="lucide:triangle-alert" width={14} height={14} className="ml-auto text-rose-500" />
              )}
              {!saving && !saveError && savedAt && (
                <span className="ml-auto flex items-center gap-1 whitespace-nowrap text-[11px] text-emerald-500">
                  <Icon icon="lucide:circle-check" width={14} height={14} />
                  {savedAt}
                </span>
              )}
            </button>
          )}
          {saveError && (
            <div className="px-3 pb-1 text-[11px] text-rose-500">{t(saveError as TKey)}</div>
          )}
          <button
            type="button"
            role="menuitem"
            className="bk-menu-item"
            onClick={handleExport}
            disabled={!ir}
          >
            <Icon icon="lucide:download" width={16} height={16} className="text-[var(--bk-accent)]" />
            <span>{t('exportYaml')}</span>
          </button>

          {/* ── Tài khoản / Đăng xuất ── */}
          <div className="bk-menu-sep" />
          {currentFile && (
            <button
              type="button"
              role="menuitem"
              className="bk-menu-item"
              onClick={() => {
                closeFile();
                setOpen(false);
              }}
            >
              <Icon icon="line-md:list-3-filled" width={16} height={16} className="text-[var(--bk-accent)]" />
              <span>{t('fmBackToManager')}</span>
            </button>
          )}
          <div className="bk-menu-account">
            {user?.picture && <img src={user.picture} alt="" className="h-7 w-7 rounded-full" />}
            <span className="min-w-0 flex-1 truncate text-xs text-[var(--bk-text-muted)]" title={user?.email}>
              {user?.name}
            </span>
            <button type="button" className="bk-menu-logout" onClick={signOut} title={t('logout')}>
              <Icon icon="lucide:log-out" width={14} height={14} />
              <span>{t('logout')}</span>
            </button>
          </div>
        </div>
      )}

      {ivrOpen && <IvrPropertyModal onClose={() => setIvrOpen(false)} />}
    </div>
  );
}

function MenuSection({ title }: { title: string }) {
  return (
    <div className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-[var(--bk-text-faint)]">
      {title}
    </div>
  );
}
