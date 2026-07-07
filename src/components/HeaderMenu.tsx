import { useEffect, useState } from 'react';
import { useFlowStore } from '../store/flowStore';
import { useFileStore } from '../store/fileStore';
import { useGithubToken } from '../github/token';
import { putFlow } from '../github/api';
import { ghErrorKey } from '../github/errors';
import { useAuth } from '../auth/useAuth';
import { useTheme } from '../ui/theme';
import { useLang, useT, type TKey } from '../ui/i18n';
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
  useEffect(() => {
    if (open) setRender(true);
  }, [open]);

  const ir = useFlowStore((s) => s.ir);
  const autoLayout = useFlowStore((s) => s.autoLayout);
  const exportYaml = useFlowStore((s) => s.exportYaml);
  const currentFile = useFileStore((s) => s.current);
  const closeFile = useFileStore((s) => s.closeFile);
  const setSha = useFileStore((s) => s.setSha);
  const token = useGithubToken((s) => s.token);
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const { lang, setLang } = useLang();
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  // Trạng thái lưu về repo: null | 'saved' | key lỗi i18n.
  const [saveState, setSaveState] = useState<string | null>(null);

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
    setSaveState(null);
    try {
      const yaml = exportYaml();
      const res = await putFlow(
        token,
        currentFile.path,
        yaml,
        t('commitSave', { name: currentFile.name }),
        currentFile.sha ?? undefined,
      );
      setSha(res.sha);
      setSaveState('saved');
    } catch (e) {
      setSaveState(ghErrorKey(e));
    } finally {
      setSaving(false);
    }
  };

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
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--bk-border)] bg-[var(--bk-surface)] text-[var(--bk-text)] shadow-[var(--bk-shadow)] transition hover:border-[var(--bk-accent)] hover:text-[var(--bk-accent)]"
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
            <Icon icon="lucide:layout-dashboard" width={16} height={16} className="text-[var(--bk-accent)]" />
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
              <span>
                {saving
                  ? t('fmSaving')
                  : saveState === 'saved'
                    ? t('fmSaved')
                    : t('fmSaveToRepo')}
              </span>
              {saveState && saveState !== 'saved' && (
                <Icon icon="lucide:triangle-alert" width={14} height={14} className="ml-auto text-rose-500" />
              )}
              {saveState === 'saved' && (
                <Icon icon="lucide:circle-check" width={14} height={14} className="ml-auto text-emerald-500" />
              )}
            </button>
          )}
          {saveState && saveState !== 'saved' && (
            <div className="px-3 pb-1 text-[11px] text-rose-500">{t(saveState as TKey)}</div>
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
