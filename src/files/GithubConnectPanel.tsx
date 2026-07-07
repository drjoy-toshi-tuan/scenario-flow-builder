import { useState } from 'react';
import { useGithubToken } from '../github/token';
import { ghErrorKey } from '../github/errors';
import { useT } from '../ui/i18n';
import { Icon } from '../ui/icons';

// URL tạo fine-grained personal access token trên GitHub.
const TOKEN_CREATE_URL = 'https://github.com/settings/personal-access-tokens/new';

// ─────────────────────────────────────────────────────────────────────────────
// Panel nhập GitHub token (fine-grained) để đọc/ghi file YAML vào repo.
// Hiện khi chưa kết nối. Token chỉ lưu sessionStorage (xem github/token.ts).
// ─────────────────────────────────────────────────────────────────────────────

export function GithubConnectPanel() {
  const { connect, connecting, error } = useGithubToken();
  const t = useT();
  const [value, setValue] = useState('');

  const submit = async () => {
    if (connecting) return;
    await connect(value);
  };

  return (
    <div className="w-full max-w-lg rounded-2xl border border-[var(--bk-border)] bg-[var(--bk-surface)] p-8 shadow-[var(--bk-shadow)]">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--bk-accent-soft)] text-2xl text-[var(--bk-accent)]">
          <Icon icon="mdi:github" />
        </span>
        <div>
          <h2 className="text-lg font-bold text-[var(--bk-text)]">{t('fmConnectTitle')}</h2>
          <p className="text-xs text-[var(--bk-text-muted)]">{t('fmConnectDesc')}</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <Icon icon="lucide:triangle-alert" className="mt-0.5 shrink-0" />
          <span>{t(ghErrorKey(error))}</span>
        </div>
      )}

      <label className="mb-1 block text-xs font-semibold text-[var(--bk-text-muted)]">
        {t('fmTokenLabel')}
      </label>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--bk-text-faint)]">
            <Icon icon="lucide:key-round" width={16} height={16} />
          </span>
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
            placeholder={t('fmTokenPlaceholder')}
            className="w-full rounded-lg border border-[var(--bk-border)] bg-[var(--bk-bg)] py-2 pl-9 pr-3 text-sm text-[var(--bk-text)] outline-none focus:border-[var(--bk-accent)]"
          />
        </div>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={connecting}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--bk-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
        >
          {connecting ? (
            <Icon icon="lucide:loader-circle" className="animate-spin" />
          ) : (
            <Icon icon="lucide:plug" width={16} height={16} />
          )}
          <span>{connecting ? t('fmConnecting') : t('fmConnectBtn')}</span>
        </button>
      </div>

      <div className="mt-4">
        <a
          href={TOKEN_CREATE_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--bk-accent)] hover:underline"
        >
          <Icon icon="lucide:external-link" width={14} height={14} />
          {t('fmTokenHelp')}
        </a>
      </div>
    </div>
  );
}
