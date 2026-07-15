import { useT } from '../ui/i18n';
import { Icon } from '../ui/icons';
import { gdErrorKey } from '../drive/errors';

// ─────────────────────────────────────────────────────────────────────────────
// Panel "Kết nối Google Drive" — hiện khi chưa có access token Drive trong phiên.
// Chỉ 1 nút bấm (popup consent chỉ hiện LẦN ĐẦU mỗi tài khoản; về sau popup tự
// đóng ngay). Cần user gesture để mở popup nên không tự bật lúc mount.
// Panel kết nối Google Drive (màn chờ trước khi có access token).
// ─────────────────────────────────────────────────────────────────────────────

export function DriveConnectPanel({
  connecting,
  error,
  onConnect,
}: {
  connecting: boolean;
  error: string | null;
  onConnect: () => void;
}) {
  const t = useT();
  return (
    <div className="w-full max-w-lg rounded-2xl border border-[var(--bk-border)] bg-[var(--bk-surface)] p-8 shadow-[var(--bk-shadow)]">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--bk-accent-soft)] text-2xl text-[var(--bk-accent)]">
          <Icon icon="mdi:google-drive" />
        </span>
        <div>
          <h2 className="text-lg font-bold text-[var(--bk-text)]">{t('dmConnectTitle')}</h2>
          <p className="text-xs text-[var(--bk-text-muted)]">{t('dmConnectDesc')}</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <Icon icon="lucide:triangle-alert" className="mt-0.5 shrink-0" />
          <span>{t(gdErrorKey(error))}</span>
        </div>
      )}

      <button
        type="button"
        onClick={onConnect}
        disabled={connecting}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--bk-accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
      >
        {connecting ? (
          <Icon icon="lucide:loader-circle" className="animate-spin" width={18} height={18} />
        ) : (
          <Icon icon="mdi:google-drive" width={18} height={18} />
        )}
        <span>{connecting ? t('dmConnecting') : t('dmConnectBtn')}</span>
      </button>

      <p className="mt-4 flex items-start gap-1.5 text-[11px] leading-relaxed text-[var(--bk-text-faint)]">
        <Icon icon="lucide:info" width={13} height={13} className="mt-0.5 shrink-0" />
        <span>{t('dmConnectHint')}</span>
      </p>
    </div>
  );
}
