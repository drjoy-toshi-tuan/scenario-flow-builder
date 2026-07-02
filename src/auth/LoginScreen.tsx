import { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from './useAuth';
import { ALLOWED_DOMAIN, GOOGLE_CLIENT_ID } from './config';
import { decodeJwt } from './jwt';
import { Icon } from '../ui/icons';
import { useLang, useT } from '../ui/i18n';
import { useTheme } from '../ui/theme';
import { SlideToggle } from '../components/SlideToggle';

// ─────────────────────────────────────────────────────────────────────────────
// Màn hình đăng nhập. Chỉ tài khoản @drjoy.jp (claim hd) và email_verified mới vào.
// Nếu chưa cấu hình GOOGLE_CLIENT_ID -> cho vào "chế độ demo" để test UI ngay.
// ─────────────────────────────────────────────────────────────────────────────

export function LoginScreen() {
  const { authenticate } = useAuth();
  const { lang, setLang } = useLang();
  const { theme, setTheme } = useTheme();
  const t = useT();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="relative flex h-full items-center justify-center bg-[var(--bk-bg)] p-6">
      {/* Toggle ngôn ngữ & theme ngay trên màn login */}
      <div className="absolute right-5 top-5 flex items-center gap-2">
        <SlideToggle
          value={lang}
          options={[
            { key: 'vi', label: 'Tiếng Việt' },
            { key: 'ja', label: '日本語' },
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
      </div>

      <div className="w-full max-w-md rounded-2xl border border-[var(--bk-border)] bg-[var(--bk-surface)] p-8 shadow-[var(--bk-shadow)]">
        <div className="mb-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--bk-accent-soft)] text-3xl text-[var(--bk-accent)]">
            <Icon icon="lucide:phone" />
          </div>
          <h1 className="mt-3 text-xl font-bold text-[var(--bk-text)]">AI電話 Flow Builder</h1>
          <p className="mt-1 text-sm text-[var(--bk-text-muted)]">
            {t('loginSubtitle', { domain: ALLOWED_DOMAIN })}
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}

        {GOOGLE_CLIENT_ID ? (
          <div className="flex justify-center">
            <GoogleLogin
              onSuccess={(res) => {
                setError(null);
                const claims = res.credential ? decodeJwt(res.credential) : null;
                if (!claims) {
                  setError(t('loginReadError'));
                  return;
                }
                // Gate chính: hd === domain cho phép & email đã xác minh.
                if (claims.hd !== ALLOWED_DOMAIN || claims.email_verified !== true) {
                  setError(t('loginDomainError', { domain: ALLOWED_DOMAIN }));
                  return;
                }
                authenticate({
                  name: claims.name ?? claims.email ?? 'User',
                  email: claims.email ?? '',
                  picture: claims.picture,
                  hd: claims.hd,
                });
              }}
              onError={() => setError(t('loginGoogleError'))}
            />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {t('loginDemoNotice')}
            </div>
            <button
              type="button"
              className="w-full rounded-lg bg-[var(--bk-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
              onClick={() =>
                authenticate({ name: 'Demo user', email: `demo@${ALLOWED_DOMAIN}`, demo: true })
              }
            >
              {t('loginDemoButton')}
            </button>
          </div>
        )}

        <p className="mt-6 text-center text-[11px] leading-relaxed text-[var(--bk-text-faint)]">
          {t('loginFooter')}
        </p>
      </div>
    </div>
  );
}
