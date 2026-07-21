import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFlowStore } from '../../store/flowStore';
import { ensureSettings } from '../../ir/settings';
import { computeInheritedFlags } from '../../ir/statusFlow';
import { FlagSelect } from '../../ui/FlagSelect';
import type { FlowNode, NodeType } from '../../ir/types';
import { NODE_CONFIG } from '../../ui/nodeConfig';
import { retryOn } from '../../ui/nodeSchema';
import { Icon } from '../../ui/icons';
import { useT, type TKey } from '../../ui/i18n';
import { AutoGrowTextarea } from '../AutoGrowTextarea';

// ─────────────────────────────────────────────────────────────────────────────
// Tab "Announce List / アナウンス一覧" — gồm 2 MÀN, chuyển bằng nút cạnh tiêu đề:
//   - Màn CHÍNH (Main): bảng mọi node CÓ ANNOUNCE của flow đang mở, sửa trực tiếp ->
//     ghi thẳng vào IR (liên động 2 chiều với tab Flow Diagram). Cột 切断時フラグ
//     lưu vào node.data (interaction dùng hangup*Flag; announce/transfer/hangup dùng
//     statusFlag/smsFlag) — option liên động tab Status Settings.
//   - Màn PHỤ (復唱・リトライ): Re-confirm luôn ở trên (1 node 1 câu); Retry để cơ
//     chế catch-all (gộp theo câu) + có thể "thêm" node để tách riêng khỏi catch-all.
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

// Cột 切断時フラグ: key data theo loại node. interaction lưu ở hangup*Flag (đồng bộ
// panel Hearing); announce/transfer/hangup lưu ở statusFlag/smsFlag (cùng key panel CS).
const FLAG_KEYS: Partial<Record<NodeType, { status: string; sms: string }>> = {
  interaction: { status: 'hangupStatusFlag', sms: 'hangupSmsFlag' },
  announce: { status: 'statusFlag', sms: 'smsFlag' },
  transfer: { status: 'statusFlag', sms: 'smsFlag' },
  hangup: { status: 'statusFlag', sms: 'smsFlag' },
};

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));

// ── Retry / Re-confirm: icon + màu ĐẶC TRƯNG (đúng bộ indicator trên node CS —
// xem CsIndicators trong BaseNode.tsx) dùng cho logo màn phụ + header tooltip. ──
type RrKind = 'retry' | 'reconfirm';
const RR_KIND: Record<
  RrKind,
  { icon: string; color: string; tipTitleKey: TKey; typeKey: TKey; contentKey: string }
> = {
  retry: {
    icon: 'akar-icons:arrow-cycle',
    color: '#f472b6',
    tipTitleKey: 'alRetryTipTitle',
    typeKey: 'alTypeRetry',
    contentKey: 'retryAnnounce',
  },
  reconfirm: {
    icon: 'fa6-solid:check-double',
    color: '#fbbf24',
    tipTitleKey: 'alReconfirmTipTitle',
    typeKey: 'alTypeReconfirm',
    contentKey: 'reconfirmAnnounce',
  },
};

// 1 dòng màn phụ. reconfirm: luôn 1 node. retry: catch-all gộp theo câu (nhiều node)
// hoặc node đã "tách riêng" (retryBreakout) -> 1 node.
interface RrRow {
  key: string;
  kind: RrKind;
  nodes: FlowNode[];
  text: string;
  catchAll?: boolean;
}

export function AnnounceListTab() {
  const t = useT();
  const ir = useFlowStore((s) => s.ir);
  const setNodeData = useFlowStore((s) => s.setNodeData);
  const addEdge = useFlowStore((s) => s.addEdge);
  const removeEdge = useFlowStore((s) => s.removeEdge);
  const settings = ensureSettings(ir?.settings);

  // Màn đang xem: 'main' (announce chính) | 'sub' (復唱・リトライ).
  const [view, setView] = useState<'main' | 'sub'>('main');

  const rows = useMemo(
    () => (ir?.nodes ?? []).filter((n) => CONTENT_KEY[n.type] !== undefined),
    [ir],
  );

  // Dòng màn phụ (Re-confirm trước, Retry sau):
  //  - Re-confirm: mỗi node bật 復唱 = 1 dòng riêng (1 node 1 câu, không gộp).
  //  - Retry catch-all: các node retry CHƯA tách riêng, gộp theo câu リトライ.
  //  - Retry tách riêng (data.retryBreakout): mỗi node 1 dòng.
  const subRows = useMemo<RrRow[]>(() => {
    const interactions = (ir?.nodes ?? []).filter((n) => n.type === 'interaction');

    // Re-confirm — 1 node 1 dòng.
    const reconfirmRows: RrRow[] = interactions
      .filter((n) => n.data.reconfirm === 'yes')
      .map((n) => ({
        key: `reconfirm:${n.id}`,
        kind: 'reconfirm',
        nodes: [n],
        text: str(n.data.reconfirmAnnounce),
      }));

    // Retry — 1 catch-all DUY NHẤT (mọi node retry chưa tách riêng, không gộp theo
    // câu) + các node đã tách riêng (retryBreakout) mỗi node 1 dòng.
    const retryNodes = interactions.filter((n) => retryOn(n.data));
    const brokenOut = retryNodes.filter((n) => n.data.retryBreakout === true);
    const catchAllNodes = retryNodes.filter((n) => n.data.retryBreakout !== true);

    const retryRows: RrRow[] = [];
    if (catchAllNodes.length > 0) {
      // Text hiển thị = câu của node đầu; sửa 1 lần áp cho MỌI node trong catch-all.
      retryRows.push({
        key: 'retry-catchall',
        kind: 'retry',
        nodes: catchAllNodes,
        text: str(catchAllNodes[0].data.retryAnnounce),
        catchAll: true,
      });
    }
    retryRows.push(
      ...brokenOut.map((n) => ({
        key: `retry:${n.id}`,
        kind: 'retry' as const,
        nodes: [n],
        text: str(n.data.retryAnnounce),
      })),
    );

    return [...reconfirmRows, ...retryRows];
  }, [ir]);

  const [page, setPage] = useState(0);
  const rowCount = view === 'main' ? rows.length : subRows.length;
  const totalPages = Math.max(1, Math.ceil(rowCount / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = rows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const pageSubRows = subRows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const switchView = (v: 'main' | 'sub') => {
    setView(v);
    setPage(0);
  };

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

  // Thêm node vào màn phụ (chọn phân loại -> chọn node): bật tính năng + (retry) tách
  // khỏi catch-all thành dòng riêng.
  const addSubNode = (kind: RrKind, nodeId: string) => {
    const node = ir?.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    if (kind === 'reconfirm') {
      setNodeData(nodeId, { reconfirm: 'yes' });
    } else {
      setNodeData(nodeId, { retryBreakout: true, ...(retryOn(node.data) ? {} : { retryCount: '2' }) });
    }
  };

  // Toggle TRÒN nhỏ (復唱 / FAQ):
  //  - TẮT: vòng tròn rỗng + ー, viền đậm hơn cho dễ nhìn.
  //  - BẬT: tô đặc màu + icon, KHÔNG viền. 復唱 dùng line-md:check-all tone amber
  //    (đồng bộ chip/stamp Re-confirm); FAQ dùng line-md:confirm tone emerald.
  const roundToggle = (node: FlowNode, key: string, opts: { tone: 'amber' | 'emerald'; icon: string }) => {
    const on = node.data[key] === 'yes';
    const onClass = opts.tone === 'amber' ? 'bg-amber-400 text-white' : 'bg-emerald-500 text-white';
    return (
      <button
        type="button"
        onClick={() => setNodeData(node.id, { [key]: on ? 'no' : 'yes' })}
        aria-pressed={on}
        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs transition ${
          on
            ? onClass
            : 'border border-[color-mix(in_srgb,var(--bk-text)_38%,transparent)] text-[var(--bk-text-muted)] hover:border-[var(--bk-text)] hover:text-[var(--bk-text)]'
        }`}
      >
        {on ? <Icon icon={opts.icon} width={13} height={13} /> : 'ー'}
      </button>
    );
  };

  const dash = <span className="text-[var(--bk-text-faint)]">ー</span>;
  // Status/SMS flag kế thừa từ node phía trên (tự fill) — ô chưa chọn sẽ hiện flag kế thừa.
  const inheritedFlags = useMemo(() => computeInheritedFlags(ir), [ir]);
  const chipSelect = (
    node: FlowNode,
    dataKey: string,
    kind: 'status' | 'sms',
    label: string,
    options: { value: string; label: string }[],
  ) => {
    const inheritedValue =
      kind === 'status' ? inheritedFlags.get(node.id)?.statusFlag : inheritedFlags.get(node.id)?.smsFlag;
    const inheritedLabel = inheritedValue
      ? options.find((o) => o.value === inheritedValue)?.label ?? inheritedValue
      : '';
    return (
    <label className="flex items-center gap-1.5">
      {/* Chip nhãn BỀ NGANG CỐ ĐỊNH -> 2 pulldown Status / SMS Flag rộng bằng nhau. */}
      <span
        className={`inline-flex w-[72px] shrink-0 justify-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ${
          kind === 'status'
            ? 'bg-cyan-500/20 text-cyan-600 dark:bg-cyan-500/25 dark:text-cyan-300'
            : 'bg-amber-300/25 text-amber-600 dark:bg-amber-300/25 dark:text-amber-300'
        }`}
      >
        {label}
      </span>
      <div className="min-w-0 flex-1">
        <FlagSelect
          value={str(node.data[dataKey])}
          onChange={(v) => setNodeData(node.id, { [dataKey]: v })}
          options={options}
          inheritedValue={inheritedValue}
          inheritedLabel={inheritedLabel}
          emptyLabel="ー"
          buttonClass="w-full min-w-0 rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface)] px-1.5 py-1 text-xs text-[var(--bk-text)]"
          size="xs"
        />
      </div>
    </label>
    );
  };

  // Nhãn option dạng "0 - 途中切断" (flag - tên) theo yêu cầu team CS.
  const STATUS_FLAG_WHITELIST = new Set([0, 1, 2, 3, 6]);
  const statusOptions = settings.statuses
    .filter((s) => STATUS_FLAG_WHITELIST.has(s.flag))
    .map((s) => ({ value: String(s.flag), label: `${s.flag} - ${s.name}` }));
  const smsOptions = settings.smsFlags.map((s) => ({ value: String(s.flag), label: `${s.flag} - ${s.type || '—'}` }));

  return (
    <div className="h-full overflow-auto bg-[var(--bk-canvas)] p-5">
      <div className="mx-auto max-w-[1600px]">
        {/* Tiêu đề màn (đổi theo màn đang xem) + nút chuyển màn chính⇄phụ ngay cạnh */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-[15px] font-bold text-[var(--bk-text)]">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--bk-accent-soft)] text-[var(--bk-accent)]">
              <Icon icon={view === 'main' ? 'lucide:volume-2' : 'line-md:chat-filled'} width={17} height={17} />
            </span>
            {view === 'main' ? t('ctAnnounce') : t('alSubTitle')}
          </div>
          {/* Segmented switch: viên thuốc 2 nút (KHÔNG icon), nút active nền accent nhạt. */}
          <div className="flex items-center gap-0.5 rounded-full border border-[var(--bk-border)] bg-[var(--bk-surface)] p-0.5 shadow-sm">
            {(
              [
                { id: 'main', labelKey: 'alViewMain' },
                { id: 'sub', labelKey: 'alViewSub' },
              ] as const
            ).map((v) => {
              const on = view === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => switchView(v.id)}
                  aria-pressed={on}
                  className={`rounded-full px-3.5 py-1 text-xs transition ${
                    on
                      ? 'bg-[var(--bk-accent-soft)] font-bold text-[var(--bk-accent)]'
                      : 'font-semibold text-[var(--bk-text-muted)] hover:text-[var(--bk-text)]'
                  }`}
                >
                  {t(v.labelKey)}
                </button>
              );
            })}
          </div>
        </div>

        {view === 'main' ? (
        <div className="overflow-auto rounded-xl border border-[var(--bk-border)] bg-[var(--bk-surface)]">
          <table className="w-full min-w-[1200px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--bk-border)] text-left text-[11px] font-bold uppercase tracking-wide text-[var(--bk-text-faint)]">
                <th className="px-3 py-2.5">{t('alColItem')}</th>
                <th className="px-3 py-2.5 text-center">{t('alColReconfirm')}</th>
                <th className="px-3 py-2.5 text-center">{t('alColRetry')}</th>
                <th className="px-3 py-2.5">{t('alColRetryFailed')}</th>
                <th className="px-3 py-2.5 text-center">{t('alColFaq')}</th>
                <th className="w-[310px] px-3 py-2.5">{t('alColHangup')}</th>
                <th className="w-[34%] px-3 py-2.5">{t('alColAnnounce')}</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((node) => {
                const cfg = NODE_CONFIG[node.type];
                const isHearing = node.type === 'interaction';
                const contentKey = CONTENT_KEY[node.type]!;
                const failed = failedTargetOf(node.id);
                const rawRetry = node.data.retryCount;
                const retryValue = rawRetry == null ? '2' : str(rawRetry).trim() || '0';
                const flagKeys = FLAG_KEYS[node.type];
                return (
                  <tr key={node.id} className="border-b border-[var(--bk-border)] align-middle last:border-0">
                    {/* 聴取項目: tên node + huy hiệu màu loại */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                          style={{ color: cfg.color, background: `color-mix(in srgb, ${cfg.color} 16%, transparent)` }}
                        >
                          <Icon icon={cfg.icon} width={13} height={13} />
                        </span>
                        <span className="font-semibold text-[var(--bk-text)]">{node.label}</span>
                      </div>
                    </td>
                    {/* 復唱: toggle tròn (check-all, amber) — icon câu 復唱 hiện BÊN CẠNH,
                        không xô lệch vị trí toggle (định vị absolute). */}
                    <td className="px-3 py-2 text-center">
                      {isHearing ? (
                        <span className="relative inline-flex items-center justify-center">
                          {roundToggle(node, 'reconfirm', { tone: 'amber', icon: 'line-md:check-all' })}
                          {node.data.reconfirm === 'yes' && (
                            <span className="absolute inset-y-0 left-full ml-1.5 flex items-center">
                              <RrHint kind="reconfirm" text={str(node.data.reconfirmAnnounce)} />
                            </span>
                          )}
                        </span>
                      ) : (
                        dash
                      )}
                    </td>
                    {/* リトライ回数: pulldown 0-5 — icon câu リトライ hiện BÊN CẠNH, không
                        xô lệch pulldown (định vị absolute). */}
                    <td className="px-3 py-2 text-center">
                      {isHearing ? (
                        <span className="relative inline-flex items-center justify-center">
                          <select
                            value={retryValue}
                            onChange={(e) => setNodeData(node.id, { retryCount: e.target.value })}
                            className="rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface)] px-2 py-1 text-sm text-[var(--bk-text)]"
                          >
                            {['0', '1', '2', '3', '4', '5'].map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </select>
                          {retryOn(node.data) && (
                            <span className="absolute inset-y-0 left-full ml-1.5 flex items-center">
                              <RrHint kind="retry" text={str(node.data.retryAnnounce)} />
                            </span>
                          )}
                        </span>
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
                    {/* FAQ設定: toggle tròn (confirm, emerald) */}
                    <td className="px-3 py-2 text-center">
                      {isHearing ? roundToggle(node, 'faqEnabled', { tone: 'emerald', icon: 'line-md:confirm' }) : dash}
                    </td>
                    {/* 切断時フラグ: 2 chip Status / SMS Flag — hiện cho MỌI node có flag
                        (interaction + announce/transfer/hangup). */}
                    <td className="px-3 py-2">
                      {flagKeys ? (
                        <div className="flex flex-col gap-1.5">
                          {chipSelect(node, flagKeys.status, 'status', t('alStatusChip'), statusOptions)}
                          {chipSelect(node, flagKeys.sms, 'sms', t('alSmsChip'), smsOptions)}
                        </div>
                      ) : (
                        dash
                      )}
                    </td>
                    {/* 発話文言 */}
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
        ) : (
        // ── Màn PHỤ: 復唱・リトライアナウンス一覧 ────────────────────────────────
        <>
        <div className="overflow-auto rounded-xl border border-[var(--bk-border)] bg-[var(--bk-surface)]">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--bk-border)] text-left text-[11px] font-bold uppercase tracking-wide text-[var(--bk-text-faint)]">
                <th className="w-[170px] px-3 py-2.5">{t('alColType')}</th>
                <th className="px-3 py-2.5">{t('alColSubItems')}</th>
                <th className="w-[46%] px-3 py-2.5">{t('alColAnnounce')}</th>
              </tr>
            </thead>
            <tbody>
              {pageSubRows.map((row) => {
                const cfg = RR_KIND[row.kind];
                return (
                  <tr
                    key={row.key}
                    className="border-b border-[var(--bk-border)] align-middle last:border-0"
                  >
                    {/* 分類: logo + màu đặc trưng (đúng icon indicator trên node CS) */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                          style={{ color: cfg.color, background: `color-mix(in srgb, ${cfg.color} 16%, transparent)` }}
                        >
                          <Icon icon={cfg.icon} width={13} height={13} />
                        </span>
                        <span className="font-semibold text-[var(--bk-text)]">{t(cfg.typeKey)}</span>
                      </div>
                    </td>
                    {/* 項目: tên node — chip tự wrap nhiều dòng. */}
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {row.nodes.map((n) => (
                          <span
                            key={n.id}
                            className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium text-[var(--bk-text)]"
                            style={{
                              background: `color-mix(in srgb, ${cfg.color} 10%, transparent)`,
                              borderColor: `color-mix(in srgb, ${cfg.color} 35%, transparent)`,
                            }}
                          >
                            {n.label}
                          </span>
                        ))}
                      </div>
                    </td>
                    {/* 発話文言: sửa 1 lần -> áp cho MỌI node trong nhóm (cùng câu). */}
                    <td className="px-3 py-2">
                      <AutoGrowTextarea
                        value={row.text}
                        onChange={(v) => {
                          for (const n of row.nodes) setNodeData(n.id, { [cfg.contentKey]: v });
                        }}
                        className="w-full resize-none overflow-hidden rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface)] px-2.5 py-1.5 text-sm leading-relaxed text-[var(--bk-text)]"
                      />
                    </td>
                  </tr>
                );
              })}
              {subRows.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-8 text-center text-xs text-[var(--bk-text-faint)]">
                    {t('alSubEmpty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Nút thêm node vào màn phụ (chọn phân loại -> chọn node) */}
        <AddRrForm nodes={(ir?.nodes ?? []).filter((n) => n.type === 'interaction')} onAdd={addSubNode} />
        </>
        )}

        {/* Phân trang: tối đa 15 dòng / trang (theo màn đang xem) */}
        {totalPages > 1 && (
          <div className="mt-3 flex items-center justify-end gap-2 text-xs text-[var(--bk-text-muted)]">
            <span>{t('fmResultCount', { n: rowCount })}</span>
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

// ── Nút "Thêm" node vào màn phụ ──────────────────────────────────────────────
// Bấm plus-square-filled -> mở form: chọn 分類 (Retry/Re-confirm) + pulldown chọn
// node (search theo tên) + nút xác nhận plus-circle.
function AddRrForm({
  nodes,
  onAdd,
}: {
  nodes: FlowNode[];
  onAdd: (kind: RrKind, nodeId: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<RrKind>('reconfirm');
  const [nodeId, setNodeId] = useState('');

  // Node còn "thêm được": reconfirm -> chưa bật 復唱; retry -> chưa tách riêng.
  const candidates = useMemo(
    () =>
      nodes.filter((n) =>
        kind === 'reconfirm' ? n.data.reconfirm !== 'yes' : n.data.retryBreakout !== true,
      ),
    [nodes, kind],
  );

  // Đổi phân loại -> reset node đã chọn nếu không còn hợp lệ.
  useEffect(() => {
    if (nodeId && !candidates.some((n) => n.id === nodeId)) setNodeId('');
  }, [candidates, nodeId]);

  const cfg = RR_KIND[kind];
  const canAdd = nodeId && candidates.some((n) => n.id === nodeId);

  const submit = () => {
    if (!canAdd) return;
    onAdd(kind, nodeId);
    setNodeId('');
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex items-center gap-2 rounded-xl border border-dashed border-[var(--bk-border)] px-3.5 py-2 text-sm font-semibold text-[var(--bk-text-muted)] transition hover:border-[var(--bk-accent)] hover:text-[var(--bk-accent)]"
      >
        <Icon icon="line-md:plus-square-filled" width={18} height={18} />
        {t('alAddRow')}
      </button>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-[var(--bk-border)] bg-[var(--bk-surface)] p-3 shadow-sm">
      {/* 分類 */}
      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--bk-text-faint)]">
          {t('alAddPickKind')}
        </span>
        <div className="flex items-center gap-0.5 rounded-full border border-[var(--bk-border)] bg-[var(--bk-canvas)] p-0.5">
          {(['reconfirm', 'retry'] as const).map((k) => {
            const on = kind === k;
            const kcfg = RR_KIND[k];
            return (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition ${
                  on ? 'text-white shadow-sm' : 'text-[var(--bk-text-muted)] hover:text-[var(--bk-text)]'
                }`}
                style={on ? { background: kcfg.color } : undefined}
              >
                <Icon icon={kcfg.icon} width={13} height={13} />
                {t(kcfg.typeKey)}
              </button>
            );
          })}
        </div>
      </label>
      {/* Chọn node (search) */}
      <label className="flex min-w-[240px] flex-1 flex-col gap-1">
        <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--bk-text-faint)]">
          {t('alAddPickNode')}
        </span>
        <NodePicker
          nodes={candidates}
          value={nodeId}
          onChange={setNodeId}
          accent={cfg.color}
          emptyLabel={t('alAddNoNode')}
        />
      </label>
      {/* Xác nhận */}
      <button
        type="button"
        onClick={submit}
        disabled={!canAdd}
        className="inline-flex items-center gap-2 rounded-xl border border-[var(--bk-accent)] bg-[var(--bk-accent-soft)] px-3.5 py-2 text-sm font-semibold text-[var(--bk-accent)] transition enabled:hover:bg-[var(--bk-accent)] enabled:hover:text-white disabled:opacity-40"
      >
        <Icon icon="line-md:plus-circle" width={18} height={18} />
        {t('alAddConfirm')}
      </button>
    </div>
  );
}

// Pulldown chọn node có search theo tên (giống searchSelect của panel setting).
function NodePicker({
  nodes,
  value,
  onChange,
  accent,
  emptyLabel,
}: {
  nodes: FlowNode[];
  value: string;
  onChange: (id: string) => void;
  accent: string;
  emptyLabel: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = nodes.find((n) => n.id === value);
  const q = query.trim().toLowerCase();
  const visible = q ? nodes.filter((n) => n.label.toLowerCase().includes(q)) : nodes;

  return (
    <div className="relative" ref={wrapRef}>
      <input
        type="text"
        className="w-full rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface)] px-2.5 py-1.5 pr-8 text-sm text-[var(--bk-text)] outline-none focus:border-[var(--bk-accent)]"
        value={open ? query : selected?.label ?? ''}
        placeholder={t('searchSelectPlaceholder')}
        onFocus={() => {
          setOpen(true);
          setQuery('');
        }}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
      />
      <Icon
        icon="lucide:chevron-down"
        width={15}
        height={15}
        className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--bk-text-faint)] transition-transform ${open ? 'rotate-180' : ''}`}
      />
      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-52 overflow-y-auto rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface)] p-1 shadow-[var(--bk-shadow)]">
          {visible.length === 0 ? (
            <div className="px-2.5 py-2 text-xs text-[var(--bk-text-faint)]">{emptyLabel}</div>
          ) : (
            visible.map((n) => (
              <button
                key={n.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(n.id);
                  setOpen(false);
                }}
                className={[
                  'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition',
                  n.id === value
                    ? 'bg-[var(--bk-accent-soft)] font-medium text-[var(--bk-accent)]'
                    : 'text-[var(--bk-text)] hover:bg-[var(--bk-surface-2)]',
                ].join(' ')}
                title={n.label}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: accent }} />
                <span className="min-w-0 truncate">{n.label}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Icon chat + hover card xem câu announce của Retry / Re-confirm ────────────
const CHAT_TRIGGER_ICON = <Icon icon="line-md:chat-filled" width={16} height={16} />;

function RrHint({ kind, text }: { kind: RrKind; text: string }) {
  const t = useT();
  const cfg = RR_KIND[kind];
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean } | null>(null);

  useLayoutEffect(() => {
    if (!pos) return;
    const onScroll = () => setPos(null);
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [pos]);

  const show = () => {
    const el = ref.current;
    if (!el || pos) return;
    const r = el.getBoundingClientRect();
    const x = Math.min(Math.max(r.left + r.width / 2, 210), window.innerWidth - 210);
    const below = r.top < 140;
    setPos({ x, y: below ? r.bottom : r.top, below });
  };

  return (
    <span
      ref={ref}
      className="inline-flex cursor-help text-cyan-500 dark:text-cyan-400"
      onMouseEnter={show}
      onMouseLeave={() => setPos(null)}
    >
      {CHAT_TRIGGER_ICON}
      {pos &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[1000] w-max max-w-[380px] rounded-xl border border-[var(--bk-border)] bg-[var(--bk-surface)] px-3.5 py-2.5 text-left shadow-xl"
            style={{
              left: pos.x,
              top: pos.y,
              transform: pos.below ? 'translate(-50%, 8px)' : 'translate(-50%, calc(-100% - 8px))',
            }}
          >
            <div className="flex items-center gap-1.5">
              <span style={{ color: cfg.color }}>
                <Icon icon={cfg.icon} width={13} height={13} />
              </span>
              <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--bk-text-faint)]">
                {t(cfg.tipTitleKey)}
              </span>
            </div>
            {text.trim() ? (
              <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--bk-text)]">{text}</p>
            ) : (
              <p className="mt-1.5 text-[13px] italic leading-relaxed text-[var(--bk-text-faint)]">
                {t('alTipEmpty')}
              </p>
            )}
          </div>,
          document.body,
        )}
    </span>
  );
}
