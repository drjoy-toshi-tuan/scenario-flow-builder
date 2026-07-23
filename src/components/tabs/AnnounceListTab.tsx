import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFlowStore } from '../../store/flowStore';
import { ensureSettings, STATUS_FLAG_PICKABLE } from '../../ir/settings';
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
//     chế catch-all (gộp theo câu, chip Default) + có thể thêm/tách node thành dòng
//     riêng, sửa node + câu ngay trên dòng, và xoá dòng (trừ retry catch-all).
// ─────────────────────────────────────────────────────────────────────────────

// Chiều cao tối đa ô 発話文言: ~3 dòng (text-sm leading-relaxed) rồi mới scroll.
const ANNOUNCE_MAX_H = 80;
// Ước lượng chiều cao 1 dòng bảng (worst-case ô announce 3 dòng) — dùng để tính số
// record/trang theo chiều cao khả dụng, chống browser tạo scroll.
const ROW_H_EST = 100;
const THEAD_H = 40;

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

  const interactions = useMemo(
    () => (ir?.nodes ?? []).filter((n) => n.type === 'interaction'),
    [ir],
  );

  // Dòng màn phụ (Re-confirm trước, Retry sau):
  //  - Re-confirm: mỗi node bật 復唱 = 1 dòng riêng (1 node 1 câu, không gộp).
  //  - Retry catch-all: các node retry CHƯA tách riêng, gộp theo câu リトライ.
  //  - Retry tách riêng (data.retryBreakout): mỗi node 1 dòng.
  const subRows = useMemo<RrRow[]>(() => {
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
  }, [interactions]);

  const [page, setPage] = useState(0);
  // Số record/trang tính động theo chiều cao khả dụng (chống scroll của browser).
  const [pageSize, setPageSize] = useState(12);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tableTopRef = useRef<HTMLDivElement>(null);

  // Bản nháp dòng "Thêm" của màn phụ (hiện như 1 dòng bảng: chọn node + nhập câu).
  const [draft, setDraft] = useState<{ kind: RrKind; nodeId: string; text: string } | null>(null);
  useEffect(() => {
    if (view === 'main') setDraft(null);
  }, [view]);

  const rowCount = view === 'main' ? rows.length : subRows.length;
  const totalPages = Math.max(1, Math.ceil(rowCount / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = rows.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const pageSubRows = subRows.slice(safePage * pageSize, (safePage + 1) * pageSize);

  // Tính số record/trang theo chiều cao còn trống (viewport - phần trên bảng - chỗ
  // phân trang - vùng "Thêm" của màn phụ). Bảo đảm ít nhất 3 dòng.
  useLayoutEffect(() => {
    const compute = () => {
      const scroll = scrollRef.current;
      const marker = tableTopRef.current;
      if (!scroll || !marker) return;
      const usedTop = marker.getBoundingClientRect().top - scroll.getBoundingClientRect().top;
      const reservedBottom = 20 /* p-5 bottom */ + 48 /* thanh phân trang */ + (view === 'sub' ? 108 /* vùng Thêm/nháp */ : 0);
      const available = scroll.clientHeight - usedTop - reservedBottom - THEAD_H;
      const n = Math.max(3, Math.floor(available / ROW_H_EST));
      setPageSize(n);
    };
    compute();
    const ro = new ResizeObserver(compute);
    if (scrollRef.current) ro.observe(scrollRef.current);
    window.addEventListener('resize', compute);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', compute);
    };
  }, [view]);

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

  // Bật tính năng cho node (từ dòng nháp "Thêm"): reconfirm=yes / retry tách riêng.
  const enableSub = (kind: RrKind, nodeId: string, text: string) => {
    const node = ir?.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    if (kind === 'reconfirm') {
      setNodeData(nodeId, { reconfirm: 'yes', ...(text ? { reconfirmAnnounce: text } : {}) });
    } else {
      setNodeData(nodeId, {
        retryBreakout: true,
        ...(retryOn(node.data) ? {} : { retryCount: '2' }),
        ...(text ? { retryAnnounce: text } : {}),
      });
    }
  };

  // Đổi node của 1 dòng (reconfirm / retry tách riêng) ngay trên dòng — chuyển cấu
  // hình + câu từ node cũ sang node mới.
  const changeRecordNode = (row: RrRow, newId: string) => {
    const oldNode = row.nodes[0];
    if (!oldNode || oldNode.id === newId) return;
    if (row.kind === 'reconfirm') {
      setNodeData(oldNode.id, { reconfirm: 'no', reconfirmAnnounce: '' });
      setNodeData(newId, { reconfirm: 'yes', reconfirmAnnounce: row.text });
    } else {
      const target = ir?.nodes.find((n) => n.id === newId);
      setNodeData(oldNode.id, { retryBreakout: false });
      setNodeData(newId, {
        retryBreakout: true,
        retryAnnounce: row.text,
        ...(target && retryOn(target.data) ? {} : { retryCount: '2' }),
      });
    }
  };

  // Xoá 1 dòng (mọi dòng TRỪ retry catch-all). Reconfirm -> tự tắt 復唱=yes (bỏ câu);
  // retry tách riêng -> nhập lại catch-all (bỏ dòng riêng).
  const deleteRecord = (row: RrRow) => {
    const node = row.nodes[0];
    if (!node || row.catchAll) return;
    if (row.kind === 'reconfirm') {
      setNodeData(node.id, { reconfirm: 'no', reconfirmAnnounce: '' });
    } else {
      setNodeData(node.id, { retryBreakout: false });
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
    const inh = inheritedFlags.get(node.id);
    const inheritedValue = kind === 'status' ? inh?.statusFlag : inh?.smsFlag;
    const inheritedLabel = inheritedValue
      ? options.find((o) => o.value === inheritedValue)?.label ?? inheritedValue
      : '';
    // Node đầu tiên: giá trị mặc định (0 / -2) hiện PLAIN, KHÔNG stamp 継続/Carried.
    const inheritedStamp = !inh?.isEntry;
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
          inheritedStamp={inheritedStamp}
          emptyLabel="ー"
          buttonClass="w-full min-w-0 rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface)] px-1.5 py-1 text-xs text-[var(--bk-text)]"
          size="xs"
        />
      </div>
    </label>
    );
  };

  // Nhãn option dạng "0 - 途中切断" (flag - tên) theo yêu cầu team CS.
  const statusOptions = settings.statuses
    .filter((s) => STATUS_FLAG_PICKABLE.has(s.flag))
    .map((s) => ({ value: String(s.flag), label: `${s.flag} - ${s.name}` }));
  const smsOptions = settings.smsFlags.map((s) => ({ value: String(s.flag), label: `${s.flag} - ${s.type || '—'}` }));

  // Grid template dùng chung cho header + dòng của màn phụ (3 cột + gutter thùng rác).
  // Cột 分類 rộng thêm ~20% (170→205px) để text 復唱/リトライ + chip không bị xô; bù lại
  // 2 cột còn lại (項目 = 1fr, 発話文言 46%→44%) hẹp đi chút để giữ nguyên bề rộng bảng.
  const SUB_GRID = 'grid-cols-[205px_minmax(0,1fr)_44%]';

  return (
    <div ref={scrollRef} className="h-full overflow-auto bg-[var(--bk-canvas)] p-5">
      <div className="mx-auto max-w-[1600px]">
        {/* Tiêu đề màn (đổi theo màn đang xem) + nút chuyển màn NẰM SÁT tiêu đề. */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 whitespace-nowrap text-[15px] font-bold text-[var(--bk-text)]">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--bk-accent-soft)] text-[var(--bk-accent)]">
              <Icon icon="lucide:volume-2" width={17} height={17} />
            </span>
            {t('ctAnnounce')}
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

        {/* Marker đầu bảng: mốc đo chiều cao khả dụng để phân trang động. */}
        <div ref={tableTopRef} />

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
                    {/* 発話文言 — giới hạn 3 dòng rồi scroll. */}
                    <td className="px-3 py-2">
                      <AutoGrowTextarea
                        value={str(node.data[contentKey])}
                        onChange={(v) => setNodeData(node.id, { [contentKey]: v })}
                        maxHeight={ANNOUNCE_MAX_H}
                        className="w-full resize-none rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface)] px-2.5 py-1.5 text-sm leading-relaxed text-[var(--bk-text)]"
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
        // Bố cục div-grid (không dùng <table>) để nút xoá nằm NGOÀI bảng, cùng hàng
        // với record. Mỗi hàng = [ ô bảng (3 cột) ] + [ gutter thùng rác ].
        <>
        <div className="overflow-x-auto">
          <div className="min-w-[1240px]">
            {/* Header: chỉ phủ phần bảng (flex-1), gutter thùng rác để trống. */}
            <div className="flex items-stretch">
              <div
                className={`grid flex-1 ${SUB_GRID} rounded-t-xl border border-[var(--bk-border)] bg-[var(--bk-surface)] text-left text-[11px] font-bold uppercase tracking-wide text-[var(--bk-text-faint)]`}
              >
                <div className="px-3 py-2.5">{t('alColType')}</div>
                <div className="px-3 py-2.5">{t('alColSubItems')}</div>
                <div className="px-3 py-2.5">{t('alColAnnounce')}</div>
              </div>
              <div className="w-10 shrink-0" />
            </div>

            {pageSubRows.map((row, idx) => {
              const cfg = RR_KIND[row.kind];
              const isLastCard = idx === pageSubRows.length - 1 && !draft;
              // Dòng đơn node (reconfirm / retry tách riêng) -> sửa node + xoá được.
              const editable = !row.catchAll && row.nodes.length === 1;
              const candidates = editable
                ? interactions.filter((n) =>
                    row.kind === 'reconfirm'
                      ? n.data.reconfirm !== 'yes' || n.id === row.nodes[0].id
                      : n.data.retryBreakout !== true || n.id === row.nodes[0].id,
                  )
                : [];
              return (
                <div key={row.key} className="flex items-stretch">
                  <div
                    className={`grid flex-1 ${SUB_GRID} border border-t-0 border-[var(--bk-border)] bg-[var(--bk-surface)] align-middle ${
                      isLastCard ? 'rounded-b-xl' : ''
                    }`}
                  >
                    {/* 分類: logo + màu đặc trưng; retry catch-all kèm chip Default. */}
                    <div className="flex items-center gap-2 px-3 py-2.5">
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                        style={{ color: cfg.color, background: `color-mix(in srgb, ${cfg.color} 16%, transparent)` }}
                      >
                        <Icon icon={cfg.icon} width={13} height={13} />
                      </span>
                      <span className="text-sm font-semibold text-[var(--bk-text)]">{t(cfg.typeKey)}</span>
                      {row.catchAll && (
                        <span className="inline-flex items-center rounded-full bg-[var(--bk-accent-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--bk-accent)]">
                          {t('alDefault')}
                        </span>
                      )}
                    </div>
                    {/* 項目: catch-all -> chip node (chỉ đọc); dòng đơn -> chọn node ngay. */}
                    <div className="flex items-center px-3 py-2.5">
                      {editable ? (
                        <NodePicker
                          nodes={candidates}
                          value={row.nodes[0].id}
                          onChange={(id) => changeRecordNode(row, id)}
                          accent={cfg.color}
                          emptyLabel={t('alAddNoNode')}
                        />
                      ) : (
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
                      )}
                    </div>
                    {/* 発話文言: sửa 1 lần -> áp cho MỌI node trong nhóm (cùng câu). */}
                    <div className="px-3 py-2">
                      <AutoGrowTextarea
                        value={row.text}
                        onChange={(v) => {
                          for (const n of row.nodes) setNodeData(n.id, { [cfg.contentKey]: v });
                        }}
                        maxHeight={ANNOUNCE_MAX_H}
                        className="w-full resize-none rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface)] px-2.5 py-1.5 text-sm leading-relaxed text-[var(--bk-text)]"
                      />
                    </div>
                  </div>
                  {/* Gutter NGOÀI bảng: thùng rác (mọi dòng trừ retry catch-all). */}
                  <div className="flex w-10 shrink-0 items-center justify-center">
                    {!row.catchAll && (
                      <button
                        type="button"
                        onClick={() => deleteRecord(row)}
                        title={t('alDeleteRow')}
                        aria-label={t('alDeleteRow')}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--bk-text-faint)] transition hover:bg-[color-mix(in_srgb,#ef4444_14%,transparent)] hover:text-[#ef4444]"
                      >
                        <Icon icon="lucide:trash-2" width={15} height={15} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Dòng nháp "Thêm": trông như 1 dòng bảng — chọn node + nhập câu ngay. */}
            {draft && (
              <DraftRow
                grid={SUB_GRID}
                draft={draft}
                nodes={interactions}
                onChangeText={(text) => setDraft((d) => (d ? { ...d, text } : d))}
                onChangeKind={() => setDraft(null)}
                onPickNode={(id) => {
                  enableSub(draft.kind, id, draft.text);
                  setDraft(null);
                }}
                onCancel={() => setDraft(null)}
              />
            )}

            {subRows.length === 0 && !draft && (
              <div className="flex items-stretch">
                <div className="flex-1 rounded-b-xl border border-t-0 border-[var(--bk-border)] bg-[var(--bk-surface)] px-3 py-8 text-center text-xs text-[var(--bk-text-faint)]">
                  {t('alSubEmpty')}
                </div>
                <div className="w-10 shrink-0" />
              </div>
            )}
          </div>
        </div>
        {/* Nút thêm dòng (chọn phân loại -> hiện dòng nháp trong bảng) */}
        {!draft && (
          <AddRrButton
            onPick={(kind) => {
              setDraft({ kind, nodeId: '', text: '' });
              setPage(0);
            }}
          />
        )}
        </>
        )}

        {/* Phân trang: số record/trang tính theo chiều cao (chống scroll) */}
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

// ── Dòng nháp "Thêm" của màn phụ: 1 dòng bảng (chọn node + nhập câu) ──────────
function DraftRow({
  grid,
  draft,
  nodes,
  onChangeText,
  onChangeKind,
  onPickNode,
  onCancel,
}: {
  grid: string;
  draft: { kind: RrKind; nodeId: string; text: string };
  nodes: FlowNode[];
  onChangeText: (text: string) => void;
  onChangeKind: () => void;
  onPickNode: (id: string) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const cfg = RR_KIND[draft.kind];
  // Node còn "thêm được": reconfirm -> chưa bật 復唱; retry -> chưa tách riêng.
  const candidates = useMemo(
    () =>
      nodes.filter((n) =>
        draft.kind === 'reconfirm' ? n.data.reconfirm !== 'yes' : n.data.retryBreakout !== true,
      ),
    [nodes, draft.kind],
  );

  return (
    <div className="flex items-stretch">
      <div
        className={`grid flex-1 ${grid} rounded-b-xl border border-t-0 border-[var(--bk-accent)] bg-[var(--bk-accent-soft)]/30`}
      >
        {/* 分類: chip phân loại đã chọn — bấm để đổi lại (huỷ dòng nháp). */}
        <div className="flex items-center px-3 py-2.5">
          <button
            type="button"
            onClick={onChangeKind}
            title={t('alAddPickKind')}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-white shadow-sm"
            style={{ background: cfg.color }}
          >
            <Icon icon={cfg.icon} width={13} height={13} />
            {t(cfg.typeKey)}
            <Icon icon="lucide:chevron-down" width={12} height={12} />
          </button>
        </div>
        {/* 項目: chọn node — chọn xong là commit (bật tính năng cho node). */}
        <div className="flex items-center px-3 py-2.5">
          <NodePicker
            nodes={candidates}
            value=""
            onChange={onPickNode}
            accent={cfg.color}
            emptyLabel={t('alAddNoNode')}
            placeholder={t('alPickNodePh')}
          />
        </div>
        {/* 発話文言: nhập câu ngay (áp vào node khi chọn node xong). */}
        <div className="px-3 py-2">
          <AutoGrowTextarea
            value={draft.text}
            onChange={onChangeText}
            maxHeight={ANNOUNCE_MAX_H}
            className="w-full resize-none rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface)] px-2.5 py-1.5 text-sm leading-relaxed text-[var(--bk-text)]"
          />
        </div>
      </div>
      {/* Gutter: nút huỷ dòng nháp. */}
      <div className="flex w-10 shrink-0 items-center justify-center">
        <button
          type="button"
          onClick={onCancel}
          title={t('alAddCancel')}
          aria-label={t('alAddCancel')}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--bk-text-faint)] transition hover:text-[var(--bk-text)]"
        >
          <Icon icon="line-md:close-small" width={16} height={16} />
        </button>
      </div>
    </div>
  );
}

// ── Nút "Thêm" -> popover chọn 分類 (Re-confirm / Retry) rồi mở dòng nháp ──────
function AddRrButton({ onPick }: { onPick: (kind: RrKind) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div className="relative mt-3 inline-block" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`inline-flex items-center gap-2 rounded-xl border border-dashed px-3.5 py-2 text-sm font-semibold transition ${
          open
            ? 'border-[var(--bk-accent)] text-[var(--bk-accent)]'
            : 'border-[var(--bk-border)] text-[var(--bk-text-muted)] hover:border-[var(--bk-accent)] hover:text-[var(--bk-accent)]'
        }`}
      >
        <Icon icon="line-md:plus-square-filled" width={18} height={18} />
        {t('alAddRow')}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-60 overflow-hidden rounded-xl border border-[var(--bk-border)] bg-[var(--bk-surface)] p-1 shadow-[var(--bk-shadow)]">
          <div className="px-2.5 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--bk-text-faint)]">
            {t('alAddPickKind')}
          </div>
          {(['reconfirm', 'retry'] as const).map((k) => {
            const kcfg = RR_KIND[k];
            return (
              <button
                key={k}
                type="button"
                onClick={() => {
                  onPick(k);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-[var(--bk-text)] transition hover:bg-[var(--bk-surface-2)]"
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                  style={{ color: kcfg.color, background: `color-mix(in srgb, ${kcfg.color} 16%, transparent)` }}
                >
                  <Icon icon={kcfg.icon} width={15} height={15} />
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{t(kcfg.typeKey)}</span>
              </button>
            );
          })}
        </div>
      )}
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
  placeholder,
}: {
  nodes: FlowNode[];
  value: string;
  onChange: (id: string) => void;
  accent: string;
  emptyLabel: string;
  placeholder?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  // Toạ độ menu (fixed) neo theo input. Render qua portal ra document.body để menu
  // KHÔNG bị container `overflow-x-auto` của bảng cắt/tạo scroll dọc (overflow-x:auto
  // ép overflow-y thành auto theo spec) — cùng lý do RrHint dùng portal.
  const [menuPos, setMenuPos] = useState<{ left: number; top: number; width: number } | null>(null);

  const selected = nodes.find((n) => n.id === value);
  const q = query.trim().toLowerCase();
  const visible = q ? nodes.filter((n) => n.label.toLowerCase().includes(q)) : nodes;

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    const place = () => {
      const el = wrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setMenuPos({ left: r.left, top: r.bottom + 4, width: r.width });
    };
    place();
    // Cuộn/resize -> đặt lại vị trí (capture để bắt cả cuộn trong container bảng).
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  return (
    <div className="relative w-full" ref={wrapRef}>
      <input
        type="text"
        className="w-full rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface)] px-2.5 py-1.5 pr-8 text-sm text-[var(--bk-text)] outline-none focus:border-[var(--bk-accent)]"
        value={open ? query : selected?.label ?? ''}
        placeholder={placeholder ?? t('searchSelectPlaceholder')}
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
      {open &&
        menuPos &&
        createPortal(
          <div
            className="fixed z-[1000] max-h-52 overflow-y-auto rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface)] p-1 shadow-[var(--bk-shadow)]"
            style={{ left: menuPos.left, top: menuPos.top, width: menuPos.width }}
          >
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
          </div>,
          document.body,
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
