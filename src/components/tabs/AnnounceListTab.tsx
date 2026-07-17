import { useMemo, useState } from 'react';
import { useFlowStore } from '../../store/flowStore';
import { ensureSettings } from '../../ir/settings';
import { computeInheritedFlags } from '../../ir/statusFlow';
import type { FlowNode, NodeType } from '../../ir/types';
import { NODE_CONFIG } from '../../ui/nodeConfig';
import { Icon } from '../../ui/icons';
import { useT } from '../../ui/i18n';
import { AutoGrowTextarea } from '../AutoGrowTextarea';

// ─────────────────────────────────────────────────────────────────────────────
// Tab "Announce List / アナウンス一覧": bảng mọi node CÓ ANNOUNCE của flow đang mở,
// sửa trực tiếp -> ghi thẳng vào IR (liên động 2 chiều với tab Flow Diagram).
// Riêng cột 切断時フラグ chỉ lưu vào node.data (không thể hiện trên diagram);
// option của nó liên động với tab Status Settings (statuses / smsFlags).
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 15;

// Loại node có announce + field chứa nội dung announce của từng loại.
const CONTENT_KEY: Partial<Record<NodeType, string>> = {
  announce: 'text',
  interaction: 'announce',
  transfer: 'announce',
  hangup: 'announce',
};

// Loại node có nhánh FAILED cố định -> chọn được "Retry 上限後".
const FAILED_CAPABLE: ReadonlySet<NodeType> = new Set(['interaction', 'openai', 'faq', 'transfer']);

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));

export function AnnounceListTab() {
  const t = useT();
  const ir = useFlowStore((s) => s.ir);
  const setNodeData = useFlowStore((s) => s.setNodeData);
  const addEdge = useFlowStore((s) => s.addEdge);
  const removeEdge = useFlowStore((s) => s.removeEdge);
  const settings = ensureSettings(ir?.settings);

  const rows = useMemo(
    () => (ir?.nodes ?? []).filter((n) => CONTENT_KEY[n.type] !== undefined),
    [ir],
  );

  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = rows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  // Đích hiện tại của nhánh FAILED (nếu đã nối).
  const failedTargetOf = (nodeId: string) =>
    ir?.edges.find((e) => e.source === nodeId && e.sourceHandle === 'failed') ?? null;

  const setFailedTarget = (nodeId: string, targetId: string) => {
    const current = failedTargetOf(nodeId);
    if (!targetId) {
      if (current) removeEdge(current.id);
      return;
    }
    // addEdge tự THAY dây cũ cùng handle 'failed' (1 output 1 dây).
    addEdge({ id: `${nodeId}->${targetId}#failed`, source: nodeId, target: targetId, sourceHandle: 'failed' });
  };

  // Toggle kiểu ー / ✓ cho field yes/no.
  const yesNoToggle = (node: FlowNode, key: string) => {
    const on = node.data[key] === 'yes';
    return (
      <button
        type="button"
        onClick={() => setNodeData(node.id, { [key]: on ? 'no' : 'yes' })}
        className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border transition ${
          on
            ? 'border-emerald-500 bg-emerald-500/90 text-white shadow-sm dark:border-emerald-500 dark:bg-emerald-500/80'
            : 'border-[var(--bk-border)] text-[var(--bk-text-faint)] hover:text-[var(--bk-text)]'
        }`}
        aria-pressed={on}
      >
        {on ? <Icon icon="lucide:check" width={15} height={15} /> : 'ー'}
      </button>
    );
  };

  const dash = <span className="text-[var(--bk-text-faint)]">ー</span>;
  // Status/SMS flag kế thừa từ node phía trên (tự fill) — ô chưa chọn sẽ hiện flag kế thừa.
  const inheritedFlags = useMemo(() => computeInheritedFlags(ir), [ir]);
  const chipSelect = (
    node: FlowNode,
    key: 'hangupStatusFlag' | 'hangupSmsFlag',
    label: string,
    options: { value: string; label: string }[],
  ) => {
    const inheritedValue =
      key === 'hangupStatusFlag'
        ? inheritedFlags.get(node.id)?.statusFlag
        : inheritedFlags.get(node.id)?.smsFlag;
    const inheritedLabel = inheritedValue
      ? options.find((o) => o.value === inheritedValue)?.label ?? inheritedValue
      : '';
    return (
    <label className="flex items-center gap-1.5">
      {/* Chip nhãn BỀ NGANG CỐ ĐỊNH -> 2 pulldown Status / SMS Flag rộng bằng nhau.
          Màu phân biệt 2 loại: Status nền xanh emerald sáng trong suốt, SMS Flag nền
          vàng sáng trong suốt — chữ đậm cùng tông để giữ contrast cả light/dark. */}
      <span
        className={`inline-flex w-[72px] shrink-0 justify-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ${
          key === 'hangupStatusFlag'
            ? 'bg-emerald-400/20 text-emerald-600 dark:bg-emerald-400/25 dark:text-emerald-300'
            : 'bg-amber-300/25 text-amber-600 dark:bg-amber-300/25 dark:text-amber-300'
        }`}
      >
        {label}
      </span>
      <select
        value={str(node.data[key])}
        onChange={(e) => setNodeData(node.id, { [key]: e.target.value })}
        className="w-full min-w-0 flex-1 rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface)] px-1.5 py-1 text-xs text-[var(--bk-text)]"
      >
        {/* Ô rỗng: có flag kế thừa từ node phía trên -> hiện "継承: <flag>" (đang tự fill). */}
        <option value="">{inheritedValue ? `${t('flagInherit')}: ${inheritedLabel}` : 'ー'}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
    );
  };

  // Nhãn option dạng "0 - 途中切断" (flag - tên) theo yêu cầu team CS.
  // Pulldown 状態 (切断時フラグ) chỉ dùng các flag 0,1,2,3,6 theo yêu cầu team CS.
  const STATUS_FLAG_WHITELIST = new Set([0, 1, 2, 3, 6]);
  const statusOptions = settings.statuses
    .filter((s) => STATUS_FLAG_WHITELIST.has(s.flag))
    .map((s) => ({ value: String(s.flag), label: `${s.flag} - ${s.name}` }));
  const smsOptions = settings.smsFlags.map((s) => ({ value: String(s.flag), label: `${s.flag} - ${s.type || '—'}` }));

  return (
    <div className="h-full overflow-auto bg-[var(--bk-canvas)] p-5">
      <div className="mx-auto max-w-[1400px]">
        {/* Tiêu đề tab: icon + tên (trên cùng bên trái) */}
        <div className="mb-4 flex items-center gap-2 text-[15px] font-bold text-[var(--bk-text)]">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--bk-accent-soft)] text-[var(--bk-accent)]">
            <Icon icon="lucide:volume-2" width={17} height={17} />
          </span>
          {t('ctAnnounce')}
        </div>

        <div className="overflow-auto rounded-xl border border-[var(--bk-border)] bg-[var(--bk-surface)]">
          <table className="w-full min-w-[1080px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--bk-border)] text-left text-[11px] font-bold uppercase tracking-wide text-[var(--bk-text-faint)]">
                <th className="px-3 py-2.5">{t('alColItem')}</th>
                <th className="px-3 py-2.5 text-center">{t('alColReconfirm')}</th>
                <th className="px-3 py-2.5 text-center">{t('alColRetry')}</th>
                <th className="px-3 py-2.5">{t('alColRetryFailed')}</th>
                <th className="px-3 py-2.5 text-center">{t('alColFaq')}</th>
                <th className="w-[230px] px-3 py-2.5">{t('alColHangup')}</th>
                {/* 発話文言 — cột rộng nhất */}
                <th className="w-[34%] px-3 py-2.5">{t('alColAnnounce')}</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((node) => {
                const cfg = NODE_CONFIG[node.type];
                const isHearing = node.type === 'interaction';
                const contentKey = CONTENT_KEY[node.type]!;
                const failed = failedTargetOf(node.id);
                return (
                  // align-middle: các ô ngoài 発話文言 căn GIỮA theo chiều dọc dòng —
                  // chiều cao dòng do ô announce (tự cao theo nội dung) quyết định.
                  <tr key={node.id} className="border-b border-[var(--bk-border)] align-middle last:border-0">
                    {/* 聴取項目: tên node + chấm màu loại */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        {/* Icon loại node trong huy hiệu TRÒN (thay chấm màu) — màu icon =
                            màu loại node, nền pha nhẹ cùng màu. */}
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                          style={{ color: cfg.color, background: `color-mix(in srgb, ${cfg.color} 16%, transparent)` }}
                        >
                          <Icon icon={cfg.icon} width={13} height={13} />
                        </span>
                        <span className="font-semibold text-[var(--bk-text)]">{node.label}</span>
                      </div>
                    </td>
                    {/* 復唱 */}
                    <td className="px-3 py-2 text-center">{isHearing ? yesNoToggle(node, 'reconfirm') : dash}</td>
                    {/* リトライ回数: 0-5 */}
                    <td className="px-3 py-2 text-center">
                      {isHearing ? (
                        <select
                          value={str(node.data.retryCount) || '2'}
                          onChange={(e) => setNodeData(node.id, { retryCount: e.target.value })}
                          className="rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface)] px-2 py-1 text-sm text-[var(--bk-text)]"
                        >
                          {['0', '1', '2', '3', '4', '5'].map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      ) : (
                        dash
                      )}
                    </td>
                    {/* リトライ上限後: node tiếp theo khi vượt retry (= nhánh FAILED) */}
                    <td className="px-3 py-2">
                      {FAILED_CAPABLE.has(node.type) ? (
                        <select
                          value={failed?.target ?? ''}
                          onChange={(e) => setFailedTarget(node.id, e.target.value)}
                          className="w-full rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface)] px-2 py-1 text-sm text-[var(--bk-text)]"
                        >
                          <option value="">{t('alUnset')}</option>
                          {(ir?.nodes ?? [])
                            .filter((n) => n.id !== node.id && n.type !== 'start')
                            .map((n) => (
                              <option key={n.id} value={n.id}>
                                {n.label}
                              </option>
                            ))}
                        </select>
                      ) : (
                        dash
                      )}
                    </td>
                    {/* FAQ設定 */}
                    <td className="px-3 py-2 text-center">{isHearing ? yesNoToggle(node, 'faqEnabled') : dash}</td>
                    {/* 切断時フラグ: 2 chip Status / SMS Flag — option từ tab Status Settings.
                        KHÔNG liên động với diagram (chỉ lưu trong node.data). */}
                    <td className="px-3 py-2">
                      {isHearing ? (
                        <div className="flex flex-col gap-1.5">
                          {chipSelect(node, 'hangupStatusFlag', t('alStatusChip'), statusOptions)}
                          {chipSelect(node, 'hangupSmsFlag', t('alSmsChip'), smsOptions)}
                        </div>
                      ) : (
                        dash
                      )}
                    </td>
                    {/* 発話文言: textbox "1 dòng logic" — không cho Enter, text dài tự
                        wrap theo đúng bề ngang cột và tự tăng chiều cao dòng. */}
                    <td className="px-3 py-2">
                      <AutoGrowTextarea
                        value={str(node.data[contentKey])}
                        onChange={(v) => setNodeData(node.id, { [contentKey]: v })}
                        className="w-full resize-none overflow-hidden rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface)] px-2.5 py-1.5 text-sm leading-relaxed text-[var(--bk-text)]"
                      />
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-xs text-[var(--bk-text-faint)]">
                    {t('alEmpty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Phân trang: tối đa 15 dòng / trang */}
        {totalPages > 1 && (
          <div className="mt-3 flex items-center justify-end gap-2 text-xs text-[var(--bk-text-muted)]">
            <span>{t('fmResultCount', { n: rows.length })}</span>
            <button
              type="button"
              disabled={safePage === 0}
              onClick={() => setPage(safePage - 1)}
              title={t('fmPrevPage')}
              className="rounded-lg border border-[var(--bk-border)] p-1.5 transition enabled:hover:text-[var(--bk-text)] disabled:opacity-40"
            >
              <Icon icon="lucide:chevron-left" width={14} height={14} />
            </button>
            <span className="font-semibold text-[var(--bk-text)]">
              {t('fmPageOf', { page: safePage + 1, total: totalPages })}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage(safePage + 1)}
              title={t('fmNextPage')}
              className="rounded-lg border border-[var(--bk-border)] p-1.5 transition enabled:hover:text-[var(--bk-text)] disabled:opacity-40"
            >
              <Icon icon="lucide:chevron-right" width={14} height={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
