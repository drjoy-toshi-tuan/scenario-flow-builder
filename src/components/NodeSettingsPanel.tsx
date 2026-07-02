import { useEffect, useState } from 'react';
import { useFlowStore } from '../store/flowStore';
import type { FlowNode, NodeType } from '../ir/types';
import { NODE_CONFIG } from '../ui/nodeConfig';
import { Icon } from '../ui/icons';
import { useT, type TKey } from '../ui/i18n';

// Key giải thích ý nghĩa loại node trong từ điển i18n (exStart, exAnnounce, …).
function explainKey(type: NodeType): TKey {
  return ('ex' + type.charAt(0).toUpperCase() + type.slice(1)) as TKey;
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel setting: sửa tên module (label), MÔ TẢ (data.description — hiện trên node)
// và các field chuỗi khác trong `data`. Mở khi double-click / bấm "Sửa".
//
// Hiệu ứng: panel luôn mount, TRƯỢT vào/ra từ phải (transition-transform). Khi
// đang trượt ra vẫn giữ nội dung node cuối (shownNode) để không biến mất đột ngột;
// khi đổi sang module khác, nội dung fade/slide nhẹ (key theo node.id).
// ─────────────────────────────────────────────────────────────────────────────

const inputClass =
  'mt-1 w-full rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface-2)] px-3 py-2 text-sm text-[var(--bk-text)] outline-none transition focus:border-[var(--bk-accent)]';

export function NodeSettingsPanel() {
  const ir = useFlowStore((s) => s.ir);
  const selectedNodeId = useFlowStore((s) => s.selectedNodeId);
  const selectNode = useFlowStore((s) => s.selectNode);
  const updateNode = useFlowStore((s) => s.updateNode);
  const t = useT();

  const node = ir?.nodes.find((n) => n.id === selectedNodeId) ?? null;
  const open = !!node;

  // Giữ node cuối để nội dung còn hiển thị trong lúc panel trượt ra.
  const [shownNode, setShownNode] = useState<FlowNode | null>(node);
  useEffect(() => {
    if (node) setShownNode(node);
  }, [node]);

  const display = node ?? shownNode;

  return (
    <aside
      className={[
        'absolute right-0 top-0 z-10 flex h-full w-[560px] max-w-[85vw] flex-col border-l border-[var(--bk-border)] bg-[var(--bk-surface)] shadow-[var(--bk-shadow)]',
        'transition-transform duration-300 ease-out will-change-transform',
        open ? 'translate-x-0' : 'translate-x-full pointer-events-none',
      ].join(' ')}
      aria-hidden={!open}
    >
      {display && (
        <PanelContent
          key={display.id}
          node={display}
          t={t}
          onClose={() => selectNode(null)}
          onUpdate={updateNode}
        />
      )}
    </aside>
  );
}

interface PanelContentProps {
  node: FlowNode;
  t: ReturnType<typeof useT>;
  onClose: () => void;
  onUpdate: (id: string, patch: { label?: string; data?: Record<string, unknown> }) => void;
}

function PanelContent({ node, t, onClose, onUpdate }: PanelContentProps) {
  const cfg = NODE_CONFIG[node.type];
  const description = typeof node.data.description === 'string' ? node.data.description : '';

  // Field data chuỗi khác (bỏ 'description' vì đã có ô riêng bên trên).
  const editableEntries = Object.entries(node.data).filter(
    ([key, v]) => key !== 'description' && typeof v === 'string',
  ) as [string, string][];

  return (
    <div className="bk-panel-content flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-[var(--bk-border)] px-4 py-3">
        <div className="flex items-center gap-3">
          <span
            className="flex h-9 w-9 flex-none items-center justify-center rounded-xl text-lg"
            style={{
              color: cfg.color,
              background: `color-mix(in srgb, ${cfg.color} 15%, transparent)`,
            }}
          >
            <Icon icon={cfg.icon} />
          </span>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: cfg.color }}>
              {cfg.typeLabel}
            </div>
            {/* Giải thích ý nghĩa loại node (thay cho id thô trước đây). */}
            <div className="text-sm font-medium text-[var(--bk-text-muted)]">
              {t(explainKey(node.type))}
            </div>
          </div>
        </div>
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--bk-text-faint)] transition hover:bg-[var(--bk-surface-2)] hover:text-[var(--bk-text)]"
          onClick={onClose}
          aria-label={t('close')}
        >
          <Icon icon="lucide:x" width={16} height={16} />
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <label className="block">
          <span className="text-xs font-medium text-[var(--bk-text-muted)]">{t('nodeName')}</span>
          <input
            className={inputClass}
            value={node.label}
            onChange={(e) => onUpdate(node.id, { label: e.target.value })}
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-[var(--bk-text-muted)]">{t('description')}</span>
          <textarea
            className={`${inputClass} resize-y`}
            rows={3}
            placeholder={t('descriptionPlaceholder')}
            value={description}
            onChange={(e) => onUpdate(node.id, { data: { description: e.target.value } })}
          />
        </label>

        {editableEntries.length > 0 && (
          <div className="border-t border-[var(--bk-border)] pt-3">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[var(--bk-text-faint)]">
              {t('params')}
            </div>
            <div className="space-y-3">
              {editableEntries.map(([key, value]) => (
                <label key={key} className="block">
                  <span className="text-xs font-medium text-[var(--bk-text-muted)]">{key}</span>
                  <textarea
                    className={`${inputClass} resize-y`}
                    rows={key === 'text' || key === 'prompt' ? 3 : 1}
                    value={value}
                    onChange={(e) => onUpdate(node.id, { data: { [key]: e.target.value } })}
                  />
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
