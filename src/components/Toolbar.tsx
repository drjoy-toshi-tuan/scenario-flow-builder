import { useFlowStore } from '../store/flowStore';
import { useWorkspaceStore } from '../store/workspaceStore';
import { useT } from '../ui/i18n';
import { BrekekeLogo } from '../ui/BrekekeLogo';
import { HeaderMenu } from './HeaderMenu';
import { FlowsPanel } from './FlowsPanel';

// Thanh công cụ trên cùng: nút Main/Sub Flow + thông tin flow bên trái, menu bên phải.
// Màn CS: KHÔNG có panel Main/Sub Flow (CS không có khái niệm sub flow) — bên trái
// chỉ là logo app + tên bệnh viện (trên) + tên scenario (dưới).
export function Toolbar() {
  const ir = useFlowStore((s) => s.ir);
  const activeFlowId = useFlowStore((s) => s.activeFlowId);
  const csMode = useWorkspaceStore((s) => s.mode === 'cs');
  const t = useT();

  // Dòng trên: 施設名 | tên flow (không có 施設名 -> chỉ tên flow). Đang ở sub flow
  // thì kèm badge tên sub flow để biết mình đang sửa graph nào.
  const activeSub =
    activeFlowId !== 'main' ? ir?.subflows?.find((s) => s.id === activeFlowId) : undefined;
  const flowName = ir?.meta.name ?? 'Scenario Flow Builder';
  const facility = ir?.meta.facility ?? '';
  const title = facility ? `${facility} | ${flowName}` : flowName;
  const subCount = ir?.subflows?.length ?? 0;

  if (csMode) {
    return (
      <header className="flex items-center justify-between border-b border-[var(--bk-border)] bg-[var(--bk-surface)] px-4 py-2.5">
        <div className="flex items-center gap-3">
          <BrekekeLogo className="h-9 w-9 shrink-0" />
          <div>
            {/* Trên: 施設名 (thiếu thì hiện luôn tên scenario); dưới: tên scenario. */}
            <div
              className="max-w-[420px] truncate text-base font-bold text-[var(--bk-text)]"
              title={facility || flowName}
            >
              {facility || flowName}
            </div>
            {facility && (
              <div className="mt-0.5 max-w-[420px] truncate text-[11px] text-[var(--bk-text-muted)]" title={flowName}>
                {flowName}
              </div>
            )}
          </div>
        </div>
        <HeaderMenu />
      </header>
    );
  }

  return (
    <header className="flex items-center justify-between border-b border-[var(--bk-border)] bg-[var(--bk-surface)] px-4 py-2.5">
      <div className="flex items-center gap-3">
        <FlowsPanel />
        <div>
          <div className="flex items-center gap-2 text-base font-bold text-[var(--bk-text)]">
            <span className="max-w-[380px] truncate" title={title}>{title}</span>
            {activeSub ? (
              <span className="max-w-[180px] truncate rounded-md bg-[var(--bk-accent-soft)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--bk-accent)]" title={activeSub.name}>
                {t('subFlowBadge')}: {activeSub.name}
              </span>
            ) : (
              // Đang ở main flow: badge xanh lá SÁNG ngả nhẹ về lam (emerald) — nền soft cùng tông.
              <span className="rounded-md bg-[color-mix(in_srgb,#10b981_14%,transparent)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#10b981]">
                {t('mainFlowBadge')}
              </span>
            )}
          </div>
          {/* Dòng dưới: số lượng Main Flow · gạch dọc · số lượng Sub Flow. */}
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--bk-text-faint)]">
            <span>{t('mainFlowSection')}: 1</span>
            <span aria-hidden className="h-3 w-px bg-[var(--bk-border)]" />
            <span>{t('subFlowSection')}: {subCount}</span>
          </div>
        </div>
      </div>

      <HeaderMenu />
    </header>
  );
}
