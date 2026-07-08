import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { useGithubToken } from '../github/token';
import { useTheme } from '../ui/theme';
import { useLang, useT } from '../ui/i18n';
import { Icon } from '../ui/icons';
import { SlideToggle } from '../components/SlideToggle';

// ─────────────────────────────────────────────────────────────────────────────
// Menu dọc cho màn Quản lý file (giống HeaderMenu ở canvas: nút icon -> panel
// đóng/mở có animation). Gom: cài đặt giao diện (ngôn ngữ, theme), kết nối GitHub
// (tên đăng nhập + ngắt kết nối), và tài khoản (đăng xuất).
// KHÔNG có mục "Cài đặt flow" vì màn này chưa mở flow nào.
// ─────────────────────────────────────────────────────────────────────────────

export function FileManagerMenu() {
  const [open, setOpen] = useState(false);
  const [render, setRender] = useState(false);
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
  const { login, disconnect } = useGithubToken();
  const { theme, setTheme } = useTheme();
  const { lang, setLang } = useLang();
  const t = useT();

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
                { key: 'light', icon: 'lucide:sun' },
                { key: 'dark', icon: 'lucide:moon' },
              ]}
              onChange={(k) => setTheme(k as 'light' | 'dark')}
              ariaLabel="Theme"
              title={theme === 'dark' ? t('themeDark') : t('themeLight')}
            />
          </div>

          {/* ── GitHub ── */}
          {login && (
            <>
              <div className="bk-menu-sep" />
              <div className="bk-menu-row">
                <span className="flex min-w-0 items-center gap-1.5 text-xs text-[var(--bk-text-muted)]">
                  <Icon icon="mdi:github" width={14} height={14} />
                  <span className="truncate" title={t('fmConnectedAs', { login })}>{login}</span>
                </span>
                <button
                  type="button"
                  onClick={disconnect}
                  className="rounded-md px-2 py-1 text-xs font-semibold text-[var(--bk-text-muted)] transition hover:text-rose-500"
                >
                  {t('fmDisconnect')}
                </button>
              </div>
            </>
          )}

          {/* ── Tài khoản / Đăng xuất ── */}
          <div className="bk-menu-sep" />
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
    </div>
  );
}
