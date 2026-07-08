import { useFlowStore } from '../store/flowStore';
import { useT } from '../ui/i18n';
import { HeaderMenu } from './HeaderMenu';
import { FlowsPanel } from './FlowsPanel';

// Thanh công cụ trên cùng: nút Main/Sub Flow + thông tin flow bên trái, menu bên phải.
export function Toolbar() {
  const ir = useFlowStore((s) => s.ir);
  const activeFlowId = useFlowStore((s) => s.activeFlowId);
  const t = useT();

  // Dòng trên: 施設名 | tên flow (không có 施設名 -> chỉ tên flow). Đang ở sub flow
  // thì kèm badge tên sub flow để biết mình đang sửa graph nào.
  const activeSub =
    activeFlowId !== 'main' ? ir?.subflows?.find((s) => s.id === activeFlowId) : undefined;
  const flowName = ir?.meta.name ?? 'Brekeke Flow Builder';
  const title = ir?.meta.facility ? `${ir.meta.facility} | ${flowName}` : flowName;
  const subCount = ir?.subflows?.length ?? 0;

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
              // Đang ở main flow: badge xanh lá (nền soft cùng tông để chữ nổi rõ).
              <span className="rounded-md bg-[color-mix(in_srgb,#16a34a_14%,transparent)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#16a34a]">
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
