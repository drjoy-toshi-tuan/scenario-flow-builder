import { useFlowStore, type CanvasTab } from '../../store/flowStore';
import { Icon } from '../../ui/icons';
import { useT, type TKey } from '../../ui/i18n';

// ─────────────────────────────────────────────────────────────────────────────
// Dải tab của màn canvas (ngay dưới header) — kiểu tab browser/Google Sheets.
// 4 tab bắt buộc: Flow Diagram (canvas) / Announce List / General Settings /
// Status Settings. (Clinical Department / Courses sẽ bổ sung sau nếu cần.)
// ─────────────────────────────────────────────────────────────────────────────

// Key i18n prefix "ct" (canvas tab) — "tabGeneral" đã thuộc về tab của panel setting.
const TABS: { id: CanvasTab; labelKey: TKey; icon: string }[] = [
  { id: 'flow', labelKey: 'ctFlow', icon: 'lucide:git-fork' },
  { id: 'announce', labelKey: 'ctAnnounce', icon: 'lucide:volume-2' },
  { id: 'general', labelKey: 'ctGeneral', icon: 'lucide:layout-dashboard' },
  { id: 'status', labelKey: 'ctStatus', icon: 'lucide:circle-check' },
];

export function CanvasTabs() {
  const t = useT();
  const active = useFlowStore((s) => s.canvasTab);
  const setTab = useFlowStore((s) => s.setCanvasTab);

  return (
    <div className="flex items-end gap-1 border-b border-[var(--bk-border)] bg-[var(--bk-surface-2)] px-3 pt-1.5">
      {TABS.map((tab) => {
        const on = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => setTab(tab.id)}
            aria-current={on ? 'page' : undefined}
            className={[
              // -mb-px: tab active đè lên border-b của dải -> "dính" liền vùng nội dung.
              'flex items-center gap-2 rounded-t-lg border border-b-0 px-4 py-2 text-[12.5px] font-semibold transition -mb-px',
              on
                ? 'border-[var(--bk-border)] bg-[var(--bk-canvas)] text-[var(--bk-accent)]'
                : 'border-transparent text-[var(--bk-text-muted)] hover:bg-[color-mix(in_srgb,var(--bk-text)_6%,transparent)] hover:text-[var(--bk-text)]',
            ].join(' ')}
          >
            <Icon icon={tab.icon} width={14} height={14} />
            <span>{t(tab.labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
}
