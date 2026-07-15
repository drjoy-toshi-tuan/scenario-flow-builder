import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { useTheme } from '../ui/theme';
import { useLang, useT } from '../ui/i18n';
import { Icon } from '../ui/icons';
import { SlideToggle } from '../components/SlideToggle';
import { MenuBrandHeader } from '../components/MenuBrandHeader';
import { MenuToggleIcon } from '../components/MenuToggleIcon';

// ─────────────────────────────────────────────────────────────────────────────
// Menu dọc cho màn Quản lý file (giống HeaderMenu ở canvas: nút icon -> panel
// đóng/mở có animation). Gom: cài đặt giao diện (ngôn ngữ, theme), quản lý quyền
// (chỉ owner), và tài khoản (đăng xuất).
// KHÔNG có mục "Cài đặt flow" vì màn này chưa mở flow nào.
// ─────────────────────────────────────────────────────────────────────────────

export function FileManagerMenu({
  onManagePermissions,
}: {
  // Chỉ truyền khi người dùng là OWNER (màn Drive) -> hiện mục "Quản lý quyền".
  onManagePermissions?: () => void;
} = {}) {
  const [open, setOpen] = useState(false);
  const [render, setRender] = useState(false);
  // Xác nhận trước khi đăng xuất (tránh bấm nhầm 1 click).
  const [confirmLogout, setConfirmLogout] = useState(false);
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

  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const { lang, setLang } = useLang();
  const t = useT();

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--bk-border)] bg-[var(--bk-surface)] text-[var(--bk-text)] shadow-[var(--bk-shadow)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--bk-accent)] hover:text-[var(--bk-accent)] hover:shadow-md active:translate-y-0 active:scale-95"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t('menu')}
        title={t('menu')}
      >
        <MenuToggleIcon open={open} />
      </button>

      {render && (
        <div
          role="menu"
          onAnimationEnd={(e) => {
            if (e.target === e.currentTarget && !open) setRender(false);
          }}
          className={`bk-addmenu bk-headermenu ${open ? 'bk-addmenu--in' : 'bk-addmenu--out'} absolute right-0 top-full z-30 mt-2 w-72 overflow-hidden rounded-2xl border border-[var(--bk-border)] bg-[var(--bk-surface)] p-2 shadow-[var(--bk-shadow)]`}
        >
          <MenuBrandHeader />
          {/* ── Cài đặt giao diện ── */}
          <div className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-[var(--bk-text-faint)]">
            {t('secInterface')}
          </div>
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
                { key: 'light', icon: 'line-md:sunny-loop' },
                { key: 'dark', icon: 'line-md:moon-alt-loop' },
              ]}
              onChange={(k) => setTheme(k as 'light' | 'dark')}
              ariaLabel="Theme"
              title={theme === 'dark' ? t('themeDark') : t('themeLight')}
            />
          </div>

          {/* ── Quản lý quyền (chỉ owner) ── */}
          {onManagePermissions && (
            <>
              <div className="bk-menu-sep" />
              <button
                type="button"
                role="menuitem"
                className="bk-menu-item"
                onClick={() => {
                  setOpen(false);
                  onManagePermissions();
                }}
              >
                <Icon icon="app:key-draw" width={16} height={16} className="text-[var(--bk-accent)]" />
                <span>{t('pmMenu')}</span>
              </button>
            </>
          )}

          {/* ── Tài khoản / Đăng xuất ── */}
          <div className="bk-menu-sep" />
          <div className="bk-menu-account">
            {user?.picture && <img src={user.picture} alt="" className="h-7 w-7 rounded-full" />}
            <span className="min-w-0 flex-1 truncate text-xs text-[var(--bk-text-muted)]" title={user?.email}>
              {user?.name}
            </span>
            <button
              type="button"
              className="bk-menu-logout"
              onClick={() => {
                setConfirmLogout(true);
                setOpen(false);
              }}
              title={t('logout')}
            >
              <Icon icon="line-md:logout" width={14} height={14} />
              <span>{t('logout')}</span>
            </button>
          </div>
        </div>
      )}

      {/* Modal xác nhận đăng xuất. */}
      {confirmLogout && (
        <ConfirmModal
          icon="line-md:logout"
          title={t('logoutConfirmTitle')}
          message={t('logoutConfirmMessage')}
          confirmLabel={t('logout')}
          onCancel={() => setConfirmLogout(false)}
          onConfirm={signOut}
          cancelLabel={t('btnCancel')}
        />
      )}
    </div>
  );
}

// Modal xác nhận nhỏ dùng chung cho đăng xuất / ngắt kết nối trong menu này.
function ConfirmModal({
  icon,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onCancel,
  onConfirm,
}: {
  icon: string;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="bk-modal-overlay bk-modal-overlay--fixed" role="dialog" aria-modal="true" onClick={onCancel}>
      <div className="bk-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center gap-2 text-sm font-bold text-[var(--bk-text)]">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[color-mix(in_srgb,#dc2626_14%,transparent)] text-[#dc2626]">
            <Icon icon={icon} width={15} height={15} />
          </span>
          {title}
        </div>
        <p className="mb-4 text-sm leading-relaxed text-[var(--bk-text-muted)]">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-[var(--bk-border)] px-4 py-2 text-sm font-semibold text-[var(--bk-text-muted)] transition hover:bg-[var(--bk-surface-2)] hover:text-[var(--bk-text)]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-[#dc2626] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
