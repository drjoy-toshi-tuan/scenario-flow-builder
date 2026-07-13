import { useMemo, useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from './useAuth';
import { ALLOWED_DOMAIN, GOOGLE_CLIENT_ID, ALLOW_DEMO } from './config';
import { verifyIdToken, reasonToMessageKey } from './verifyIdToken';
import { createNonce, clearNonce, peekNonce } from './nonce';
import { Icon } from '../ui/icons';
import { BrandLockup } from '../ui/BrandLockup';
import { useLang, useT, type TKey } from '../ui/i18n';
import { useTheme } from '../ui/theme';
import { InterfaceMenu } from '../components/InterfaceMenu';

// ─────────────────────────────────────────────────────────────────────────────
// Màn hình đăng nhập. Chỉ tài khoản @drjoy.jp (claim hd) và email_verified mới vào.
// Nếu chưa cấu hình GOOGLE_CLIENT_ID -> cho vào "chế độ demo" để test UI ngay.
// ─────────────────────────────────────────────────────────────────────────────

export function LoginScreen() {
  const { authenticate } = useAuth();
  // Chỉ đọc lang/theme để truyền cho <GoogleLogin>; đổi giá trị nằm trong InterfaceMenu.
  const { lang } = useLang();
  const { theme } = useTheme();
  const t = useT();
  const [error, setError] = useState<string | null>(null);

  // Sinh nonce một lần cho mỗi lần mở màn login (chống replay). Gắn vào <GoogleLogin>.
  const nonce = useMemo(() => createNonce(), []);

  // Icon spinner (SMIL loop) giữ nguyên element giữa các lần render (đổi theme/lang/
  // error đều re-render màn này) — nếu không, animation chết sau lần render thứ 2
  // (xem giải thích ở FlowsPanel).
  const logoIcon = useMemo(
    () => <Icon icon="svg-spinners:gooey-balls-1" width={34} height={34} />,
    [],
  );

  return (
    <div className="relative flex h-full flex-col bg-[var(--bk-bg)]">
      {/* ── Top bar: thương hiệu + menu giao diện — đồng bộ hệt màn Quản lý file ── */}
      <header className="flex items-center justify-between border-b border-[var(--bk-border)] bg-[var(--bk-surface)] px-4 py-2.5">
        <BrandLockup logoClass="h-8 w-8" textClass="text-lg" />
        <InterfaceMenu />
      </header>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden p-6">
        {/* Vầng sáng accent mờ phía sau — tạo chiều sâu, cảm giác cao cấp */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-[460px] w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--bk-accent)] opacity-[0.08] blur-[100px]"
        />

        <div className="relative w-full max-w-[480px] overflow-hidden rounded-3xl border border-[var(--bk-border)] bg-[var(--bk-surface)] p-8 shadow-[var(--bk-shadow)]">
          {/* Dải accent mảnh trên đỉnh thẻ */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-[var(--bk-accent)] to-transparent opacity-70"
          />
          <div className="mb-6 text-center">
            {/* Icon spinner cam như thiết kế cũ (không kèm chữ "Scenario Flow Builder"
                vì thương hiệu đã nằm ở header trên cùng bên trái). */}
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--bk-accent)] text-white shadow-lg ring-4 ring-[var(--bk-accent-soft)]">
              {logoIcon}
            </div>
            <h2 className="mt-4 text-xl font-bold tracking-tight text-[var(--bk-text)]">
              {t('loginTitle')}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--bk-text-muted)]">
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
                // Nút do Google render trong iframe — chỉ custom được trong khuôn khổ GIS:
                // pill + theme/locale đồng bộ với app (không áp CSS riêng được).
                shape="pill"
                size="large"
                width={280}
                theme={theme === 'dark' ? 'filled_black' : 'outline'}
                locale={lang === 'ja' ? 'ja' : 'vi'}
                // hint cho Google chỉ gợi ý tài khoản đúng Workspace; nonce chống replay.
                hosted_domain={ALLOWED_DOMAIN}
                nonce={nonce}
                onSuccess={(res) => {
                  setError(null);
                  if (!res.credential) {
                    setError(t('loginReadError'));
                    return;
                  }
                  // Verify "kỹ" claim ở client (iss/aud/exp/nonce/hd/email…).
                  const result = verifyIdToken(res.credential, { expectedNonce: peekNonce() });
                  clearNonce(); // nonce dùng-một-lần dù thành công hay thất bại.
                  if (!result.ok) {
                    const key = reasonToMessageKey(result.reason) as TKey;
                    setError(t(key, { domain: ALLOWED_DOMAIN }));
                    return;
                  }
                  const { claims } = result;
                  authenticate({
                    name: claims.name ?? claims.email ?? 'User',
                    email: claims.email ?? '',
                    picture: claims.picture,
                    hd: claims.hd,
                    sub: claims.sub,
                    exp: claims.exp,
                    // Giữ ID token thô để gọi AI proxy (Authorization: Bearer).
                    credential: res.credential,
                  });
                }}
                onError={() => setError(t('loginGoogleError'))}
              />
            </div>
          ) : ALLOW_DEMO ? (
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
          ) : (
            // Không có Client ID và demo bị tắt (bản production) -> chặn, buộc cấu hình.
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              <Icon icon="lucide:triangle-alert" className="mt-0.5 shrink-0" />
              <span>{t('loginNotConfigured')}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
