import { useLayoutEffect, useMemo, useRef, useState } from 'react';
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
//   - Màn CHÍNH: bảng mọi node CÓ ANNOUNCE của flow đang mở, sửa trực tiếp ->
//     ghi thẳng vào IR (liên động 2 chiều với tab Flow Diagram). Riêng cột
//     切断時フラグ chỉ lưu vào node.data (không thể hiện trên diagram); option
//     của nó liên động với tab Status Settings (statuses / smsFlags).
//   - Màn PHỤ (リトライ・復唱アナウンス一覧): list câu announce của Retry /
//     Re-confirm — các mục CÙNG câu announce gộp 1 dòng, sửa 1 lần áp cho cả nhóm.
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

// 1 dòng màn phụ: các node CÙNG loại (retry/reconfirm) và CÙNG câu announce gộp lại.
interface RrRow {
  kind: RrKind;
  nodes: FlowNode[];
  text: string;
}

export function AnnounceListTab() {
  const t = useT();
  const ir = useFlowStore((s) => s.ir);
  const setNodeData = useFlowStore((s) => s.setNodeData);
  const addEdge = useFlowStore((s) => s.addEdge);
  const removeEdge = useFlowStore((s) => s.removeEdge);
  const settings = ensureSettings(ir?.settings);

  // Màn đang xem: 'main' (announce chính) | 'sub' (リトライ・復唱).
  const [view, setView] = useState<'main' | 'sub'>('main');

  const rows = useMemo(
    () => (ir?.nodes ?? []).filter((n) => CONTENT_KEY[n.type] !== undefined),
    [ir],
  );

  // Dòng màn phụ: node Hearing bật retry (>0) / reconfirm — nhóm theo câu announce.
  const subRows = useMemo<RrRow[]>(() => {
    const buckets: Record<RrKind, Map<string, RrRow>> = { retry: new Map(), reconfirm: new Map() };
    const add = (kind: RrKind, node: FlowNode) => {
      const text = str(node.data[RR_KIND[kind].contentKey]);
      const bucket = buckets[kind];
      const row = bucket.get(text);
      if (row) row.nodes.push(node);
      else bucket.set(text, { kind, nodes: [node], text });
    };
    for (const n of ir?.nodes ?? []) {
      if (n.type !== 'interaction') continue;
      if (retryOn(n.data)) add('retry', n);
      if (n.data.reconfirm === 'yes') add('reconfirm', n);
    }
    return [...buckets.retry.values(), ...buckets.reconfirm.values()];
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

  // Toggle kiểu ー / ✓ cho field yes/no. Cột 復唱 dùng tone cyan (đồng bộ màu icon
  // status/flag trên node CS); FAQ giữ emerald như cũ.
  const yesNoToggle = (node: FlowNode, key: string, tone: 'emerald' | 'cyan' = 'emerald') => {
    const on = node.data[key] === 'yes';
    const onClass =
      tone === 'cyan'
        ? 'border-cyan-500 bg-cyan-500/90 text-white shadow-sm dark:border-cyan-400 dark:bg-cyan-400/80'
        : 'border-emerald-500 bg-emerald-500/90 text-white shadow-sm dark:border-emerald-500 dark:bg-emerald-500/80';
    return (
      <button
        type="button"
        onClick={() => setNodeData(node.id, { [key]: on ? 'no' : 'yes' })}
        className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border transition ${
          on ? onClass : 'border-[var(--bk-border)] text-[var(--bk-text-faint)] hover:text-[var(--bk-text)]'
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
    // Pulldown TỰ VẼ (FlagSelect): mặt đóng + dòng đầu list đều hiện stamp 継続/Carried
    // (màu tím thống nhất) kèm "<flag> - <tên>" — không gạch phân cách, không dòng lặp.
    return (
    <label className="flex items-center gap-1.5">
      {/* Chip nhãn BỀ NGANG CỐ ĐỊNH -> 2 pulldown Status / SMS Flag rộng bằng nhau.
          Màu phân biệt 2 loại: Status (状態) nền xanh ngọc (水色 đậm hơn một chút)
          trong suốt theo yêu cầu CS, SMS Flag nền vàng sáng trong suốt — chữ đậm
          cùng tông để giữ contrast cả light/dark. */}
      <span
        className={`inline-flex w-[72px] shrink-0 justify-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ${
          key === 'hangupStatusFlag'
            ? 'bg-cyan-500/20 text-cyan-600 dark:bg-cyan-500/25 dark:text-cyan-300'
            : 'bg-amber-300/25 text-amber-600 dark:bg-amber-300/25 dark:text-amber-300'
        }`}
      >
        {label}
      </span>
      <div className="min-w-0 flex-1">
        <FlagSelect
          value={str(node.data[key])}
          onChange={(v) => setNodeData(node.id, { [key]: v })}
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
  // Pulldown 状態 (切断時フラグ) chỉ dùng các flag 0,1,2,3,6 theo yêu cầu team CS.
  const STATUS_FLAG_WHITELIST = new Set([0, 1, 2, 3, 6]);
  const statusOptions = settings.statuses
    .filter((s) => STATUS_FLAG_WHITELIST.has(s.flag))
    .map((s) => ({ value: String(s.flag), label: `${s.flag} - ${s.name}` }));
  const smsOptions = settings.smsFlags.map((s) => ({ value: String(s.flag), label: `${s.flag} - ${s.type || '—'}` }));

  return (
    <div className="h-full overflow-auto bg-[var(--bk-canvas)] p-5">
      {/* Nới bề rộng bảng (max 1600px) để cột 切断時フラグ đủ chỗ cho stamp Carried
          + nhãn flag dài — flag quá dài vẫn cắt bằng "…" trong pulldown. */}
      <div className="mx-auto max-w-[1600px]">
        {/* Tiêu đề màn (đổi theo màn đang xem) + nút chuyển màn chính⇄phụ ngay cạnh */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-[15px] font-bold text-[var(--bk-text)]">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--bk-accent-soft)] text-[var(--bk-accent)]">
              <Icon icon={view === 'main' ? 'lucide:volume-2' : 'line-md:chat-filled'} width={17} height={17} />
            </span>
            {view === 'main' ? t('ctAnnounce') : t('alSubTitle')}
          </div>
          {/* Segmented switch: viên thuốc 2 nút, nút active nền accent nhạt. */}
          <div className="flex items-center gap-0.5 rounded-full border border-[var(--bk-border)] bg-[var(--bk-surface)] p-0.5 shadow-sm">
            {(
              [
                { id: 'main', icon: 'lucide:volume-2', labelKey: 'alViewMain' },
                { id: 'sub', icon: 'line-md:chat-filled', labelKey: 'alViewSub' },
              ] as const
            ).map((v) => {
              const on = view === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => switchView(v.id)}
                  aria-pressed={on}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition ${
                    on
                      ? 'bg-[var(--bk-accent-soft)] font-bold text-[var(--bk-accent)]'
                      : 'font-semibold text-[var(--bk-text-muted)] hover:text-[var(--bk-text)]'
                  }`}
                >
                  <Icon icon={v.icon} width={13} height={13} />
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
                // Retry: rỗng coi như 0 (tắt); CHƯA TỪNG nhập mới áp default 2.
                const rawRetry = node.data.retryCount;
                const retryValue = rawRetry == null ? '2' : str(rawRetry).trim() || '0';
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
                    {/* 復唱: toggle (cyan) + icon chat khi bật -> hover xem câu 復唱 */}
                    <td className="px-3 py-2 text-center">
                      {isHearing ? (
                        <span className="inline-flex items-center justify-center gap-1.5">
                          {yesNoToggle(node, 'reconfirm', 'cyan')}
                          {node.data.reconfirm === 'yes' && (
                            <RrHint kind="reconfirm" text={str(node.data.reconfirmAnnounce)} />
                          )}
                        </span>
                      ) : (
                        dash
                      )}
                    </td>
                    {/* リトライ回数: 0-5 + icon chat khi >0 -> hover xem câu リトライ */}
                    <td className="px-3 py-2 text-center">
                      {isHearing ? (
                        <span className="inline-flex items-center justify-center gap-1.5">
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
                          {retryOn(node.data) && <RrHint kind="retry" text={str(node.data.retryAnnounce)} />}
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
        ) : (
        // ── Màn PHỤ: リトライ・復唱アナウンス一覧 ──────────────────────────────
        <div className="overflow-auto rounded-xl border border-[var(--bk-border)] bg-[var(--bk-surface)]">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--bk-border)] text-left text-[11px] font-bold uppercase tracking-wide text-[var(--bk-text-faint)]">
                <th className="w-[150px] px-3 py-2.5">{t('alColType')}</th>
                <th className="px-3 py-2.5">{t('alColSubItems')}</th>
                <th className="w-[46%] px-3 py-2.5">{t('alColAnnounce')}</th>
              </tr>
            </thead>
            <tbody>
              {pageSubRows.map((row) => {
                const cfg = RR_KIND[row.kind];
                return (
                  <tr
                    key={`${row.kind}:${row.nodes.map((n) => n.id).join(',')}`}
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
                    {/* 項目: tên node — các mục cùng câu announce gộp 1 dòng,
                        hiển thị dạng chip tự wrap nhiều dòng. */}
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

// ── Icon chat + hover card xem câu announce của Retry / Re-confirm ────────────
// Icon line-md:chat-filled màu cyan (đồng bộ màu icon status/flag trên node CS).
// Hover -> card nổi (portal ra <body>, không bị bảng cắt): header là icon màu
// đặc trưng (không viền/nền) + tiêu đề chữ xám bold; dưới là nội dung announce.

// Element icon trigger dùng CHUNG 1 reference cho mọi render: Iconify <Icon> mỗi
// lần re-render sẽ THAY children của <svg> (sinh id mask mới) ngay dưới con trỏ,
// làm browser bắn mouseenter lặp vô hạn và nuốt mất mouseleave (card không ẩn).
// Cùng reference -> React bail-out, SVG giữ nguyên -> enter/leave hoạt động đúng.
const CHAT_TRIGGER_ICON = <Icon icon="line-md:chat-filled" width={16} height={16} />;

function RrHint({ kind, text }: { kind: RrKind; text: string }) {
  const t = useT();
  const cfg = RR_KIND[kind];
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean } | null>(null);

  // Ẩn card nếu cuộn/zoom (vị trí đã cũ) — giống useFloatingTip của HoverTip.
  useLayoutEffect(() => {
    if (!pos) return;
    const onScroll = () => setPos(null);
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [pos]);

  const show = () => {
    const el = ref.current;
    if (!el || pos) return; // đang mở rồi -> không set lại (tránh vòng re-render)
    const r = el.getBoundingClientRect();
    const x = Math.min(Math.max(r.left + r.width / 2, 210), window.innerWidth - 210);
    const below = r.top < 140; // gần mép trên -> lật xuống dưới cho khỏi tràn màn hình
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
