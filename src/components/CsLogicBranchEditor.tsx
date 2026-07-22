import type { CSSProperties, ReactNode } from 'react';
import { useFlowStore } from '../store/flowStore';
import type { FlowNode } from '../ir/types';
import { DAY_KEYS, type DayKey } from '../ir/types';
import {
  csProductBranches,
  csSlotsToDataBranches,
  dayRemainder,
  defaultSlot,
  hearingNodeLabel,
  hearingSourceOptions,
  phoneValuesFor,
  readCsCount,
  readCsSlots,
  timeRemainderRanges,
  CS_DAY_LABELS,
  MAX_CS_CONDITIONS,
  type CsRange,
  type CsSlot,
  type CsSlotKind,
} from '../ui/csLogic';
import { NODE_CONFIG } from '../ui/nodeConfig';
import { Icon } from '../ui/icons';
import { useLang, useT } from '../ui/i18n';
import { HoverTip } from './HoverTip';

// ─────────────────────────────────────────────────────────────────────────────
// Node 分岐ロジック (CS). 2 tab:
//   - プロパティ設定: CsLogicPropertyEditor — số điều kiện (1/2/3) + mỗi điều kiện
//     (聴取内容 / 電話番号 / 着信日時) với tập giá trị.
//   - 分岐設定: CsLogicBranchList — liệt kê nhánh = tích các tập giá trị (READ-ONLY,
//     bố cục 条件 → ノード giống các node khác; KHÔNG có nhánh catch-all).
// ─────────────────────────────────────────────────────────────────────────────

const inputClass =
  'w-full rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface-2)] px-2.5 py-1.5 text-sm text-[var(--bk-text)] outline-none transition focus:border-[var(--bk-accent)]';

function useCsState(node: FlowNode) {
  const draft = useFlowStore((s) => s.draft);
  const setDraftField = useFlowStore((s) => s.setDraftField);
  const data = draft?.data ?? node.data;
  const count = readCsCount(data);
  const slots = readCsSlots(data);
  const commit = (nextSlots: CsSlot[], nextCount = nextSlots.length) => {
    setDraftField('csCount', nextCount);
    setDraftField('csSlots', nextSlots);
    setDraftField('branches', csSlotsToDataBranches(nextSlots));
  };
  return { count, slots, commit };
}

export function CsLogicPropertyEditor({ node }: { node: FlowNode }) {
  const t = useT();
  const ir = useFlowStore((s) => s.ir);
  const { count, slots, commit } = useCsState(node);

  const setCount = (n: number) => {
    if (n === slots.length) return;
    const next = slots.slice(0, n);
    while (next.length < n) next.push(defaultSlot('hearing', ir, node.id));
    commit(next, n);
  };
  const updateSlot = (i: number, slot: CsSlot) => commit(slots.map((s, j) => (j === i ? slot : s)), count);

  return (
    <div className="space-y-3">
      {/* 条件の数 — nút on/off, to. */}
      <div>
        <span className="mb-1.5 block text-xs font-semibold text-[var(--bk-text-muted)]">{t('clCondCount')}</span>
        <div className="flex gap-2">
          {Array.from({ length: MAX_CS_CONDITIONS }, (_, k) => k + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setCount(n)}
              className={[
                'flex-1 rounded-xl border px-3 py-2.5 text-sm font-bold transition',
                count === n
                  ? 'border-[var(--bk-accent)] bg-[var(--bk-accent-soft)] text-[var(--bk-accent)]'
                  : 'border-[var(--bk-border)] text-[var(--bk-text-muted)] hover:border-[var(--bk-accent)]',
              ].join(' ')}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {slots.map((slot, i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-[var(--bk-border)]">
          <div className="border-b border-[var(--bk-border)] bg-[var(--bk-surface-2)] px-3 py-2 text-sm font-bold text-[var(--bk-text)]">
            <span className="mr-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-[var(--bk-accent-soft)] px-1.5 text-[11px] font-bold text-[var(--bk-accent)]">
              {i + 1}
            </span>
            {t('clCondition')} {i + 1}
          </div>
          <div className="space-y-2.5 p-3">
            <SlotEditor node={node} slot={slot} onChange={(s) => updateSlot(i, s)} />
          </div>
        </div>
      ))}
    </div>
  );
}

const CATEGORY_META: { id: CsSlotKind; key: 'clHearing' | 'clPhone' | 'clDatetime'; icon: string }[] = [
  // 聴取内容 dùng icon giống node Hearing (interaction); 電話番号 / 着信日時 dùng icon riêng.
  { id: 'hearing', key: 'clHearing', icon: 'mingcute:voice-fill' },
  { id: 'phone', key: 'clPhone', icon: 'bx:dialpad-alt' },
  { id: 'datetime', key: 'clDatetime', icon: 'griddy-icons:calendar-time-filled' },
];

function SlotEditor({ node, slot, onChange }: { node: FlowNode; slot: CsSlot; onChange: (s: CsSlot) => void }) {
  const t = useT();
  const ir = useFlowStore((s) => s.ir);
  const changeKind = (kind: CsSlotKind) => {
    if (kind === slot.kind) return;
    onChange(defaultSlot(kind, ir, node.id));
  };
  return (
    <>
      <div className="flex gap-1.5">
        {CATEGORY_META.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => changeKind(c.id)}
            className={[
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[13px] font-semibold transition',
              slot.kind === c.id
                ? 'border-[var(--bk-accent)] bg-[var(--bk-accent-soft)] text-[var(--bk-accent)]'
                : 'border-[var(--bk-border)] text-[var(--bk-text-muted)] hover:border-[var(--bk-accent)]',
            ].join(' ')}
          >
            <Icon icon={c.icon} width={15} height={15} />
            {t(c.key)}
          </button>
        ))}
      </div>
      {slot.kind === 'hearing' && <HearingSlot node={node} slot={slot} onChange={onChange} />}
      {slot.kind === 'phone' && <PhoneSlot slot={slot} onChange={onChange} />}
      {slot.kind === 'datetime' && <DatetimeSlot slot={slot} onChange={onChange} />}
    </>
  );
}

// 聴取内容: node + danh sách giá trị tự nhập (thêm/bớt, không toán tử).
function HearingSlot({ node, slot, onChange }: { node: FlowNode; slot: CsSlot; onChange: (s: CsSlot) => void }) {
  const t = useT();
  const ir = useFlowStore((s) => s.ir);
  const options = hearingSourceOptions(ir, node.id);
  const values = slot.values ?? [''];
  const setValues = (v: string[]) => onChange({ ...slot, values: v });
  return (
    <div className="space-y-2">
      <div>
        <span className="mb-1 block text-[11px] font-semibold text-[var(--bk-text-muted)]">{t('clWhichHearing')}</span>
        <select
          className={inputClass}
          value={slot.nodeId ?? ''}
          aria-label={t('clWhichHearing')}
          onChange={(e) => onChange({ ...slot, nodeId: e.target.value })}
        >
          {options.length === 0 && <option value="">—</option>}
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <span className="mb-1 block text-[11px] font-semibold text-[var(--bk-text-muted)]">{t('clValues')}</span>
        <div className="space-y-1.5">
          {values.map((v, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                type="text"
                className={inputClass}
                value={v}
                placeholder={t('clValues')}
                aria-label={`${t('clValues')} ${i + 1}`}
                onChange={(e) => setValues(values.map((x, j) => (j === i ? e.target.value : x)))}
              />
              <IconBtn
                icon="lucide:x"
                title="×"
                danger
                disabled={values.length <= 1}
                onClick={() => setValues(values.filter((_, j) => j !== i))}
              />
            </div>
          ))}
          <AddButton label={t('clAddValue')} onClick={() => setValues([...values, ''])} />
        </div>
      </div>
    </div>
  );
}

// 電話番号: 着信/聴取 → liệt kê TẤT CẢ 種別 (cố định, read-only).
function PhoneSlot({ slot, onChange }: { slot: CsSlot; onChange: (s: CsSlot) => void }) {
  const t = useT();
  const kind = slot.phoneKind ?? 'incoming';
  const values = phoneValuesFor(kind);
  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        <SubToggle label={t('clIncoming')} on={kind === 'incoming'} onClick={() => onChange({ ...slot, phoneKind: 'incoming' })} />
        <SubToggle label={t('clAnswered')} on={kind === 'answered'} onClick={() => onChange({ ...slot, phoneKind: 'answered' })} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span
            key={v}
            className="rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface-2)] px-2.5 py-1 text-xs font-semibold text-[var(--bk-text)]"
          >
            {v}
          </span>
        ))}
      </div>
    </div>
  );
}

// 着信日時: 日付 / 曜日 / 時間.
function DatetimeSlot({ slot, onChange }: { slot: CsSlot; onChange: (s: CsSlot) => void }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const dtKind = slot.dtKind ?? 'time';
  const ranges = slot.ranges ?? [];
  // 曜日: nhiều khung (nhóm thứ). Legacy `days` (1 nhóm) tự gộp vào khung đầu.
  const dayGroups = slot.dayGroups ?? (slot.days && slot.days.length ? [slot.days] : [[]]);

  const setRanges = (r: CsRange[]) => onChange({ ...slot, ranges: r });
  const setDayGroups = (g: DayKey[][]) => onChange({ ...slot, dayGroups: g });
  const toggleDay = (gi: number, d: DayKey) =>
    setDayGroups(dayGroups.map((g, j) => (j === gi ? (g.includes(d) ? g.filter((x) => x !== d) : [...g, d]) : g)));

  const remainderDays = dayRemainder(dayGroups.flat());
  const remainderRanges = timeRemainderRanges(ranges);

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        <SubToggle label={t('clDate')} on={dtKind === 'date'} onClick={() => onChange({ kind: 'datetime', dtKind: 'date', ranges: [{ from: '', to: '' }], days: [] })} />
        <SubToggle label={t('clDay')} on={dtKind === 'day'} onClick={() => onChange({ kind: 'datetime', dtKind: 'day', ranges: [], dayGroups: [[]] })} />
        <SubToggle label={t('clTime')} on={dtKind === 'time'} onClick={() => onChange({ kind: 'datetime', dtKind: 'time', ranges: [{ from: '09:00', to: '17:00' }], days: [] })} />
      </div>

      {dtKind === 'date' && (
        <div className="space-y-1.5">
          {ranges.map((r, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                type="date"
                className={`${inputClass} min-w-0 flex-1`}
                value={r.from}
                aria-label="from"
                onChange={(e) => setRanges(ranges.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))}
              />
              <span className="shrink-0 text-xs text-[var(--bk-text-faint)]">〜</span>
              <input
                type="date"
                className={`${inputClass} min-w-0 flex-1`}
                value={r.to}
                aria-label="to"
                onChange={(e) => setRanges(ranges.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))}
              />
              <IconBtn icon="lucide:x" title="×" danger onClick={() => setRanges(ranges.filter((_, j) => j !== i))} />
            </div>
          ))}
          {/* Nút thêm khung — icon, đặt DƯỚI cùng. */}
          <AddButton label={t('clAddRange')} onClick={() => setRanges([...ranges, { from: '', to: '' }])} />
        </div>
      )}

      {dtKind === 'day' && (
        <div className="space-y-1.5">
          {/* Mỗi khung = 1 nhóm thứ (bấm chọn); thêm/bớt khung giống 日付 / 時間. */}
          {dayGroups.map((group, gi) => (
            <div key={gi} className="flex items-start gap-1.5">
              <div className="flex flex-1 flex-wrap gap-1.5">
                {DAY_KEYS.map((d) => (
                  <DayCell
                    key={d}
                    day={d}
                    label={CS_DAY_LABELS[d][lang]}
                    on={group.includes(d)}
                    onClick={() => toggleDay(gi, d)}
                  />
                ))}
              </div>
              <IconBtn
                icon="lucide:x"
                title="×"
                danger
                disabled={dayGroups.length <= 1}
                onClick={() => setDayGroups(dayGroups.filter((_, j) => j !== gi))}
              />
            </div>
          ))}
          {/* Phần còn lại (tự động) — tính từ HỢP mọi khung; hiển thị y hệt mục chọn
              nhưng MỜ & không sửa được. */}
          {remainderDays.length > 0 && (
            <RemainderFrame>
              <div className="flex flex-wrap gap-1.5">
                {remainderDays.map((d) => (
                  <DayCell key={d} day={d} label={CS_DAY_LABELS[d][lang]} on dim />
                ))}
              </div>
            </RemainderFrame>
          )}
          {/* Nút thêm khung — icon, đặt DƯỚI cùng (giống 日付 / 時間). */}
          <AddButton label={t('clAddRange')} onClick={() => setDayGroups([...dayGroups, []])} />
        </div>
      )}

      {dtKind === 'time' && (
        <div className="space-y-1.5">
          {ranges.map((r, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                type="time"
                className={`${inputClass} min-w-0 flex-1`}
                value={r.from}
                aria-label="from"
                onChange={(e) => setRanges(ranges.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))}
              />
              <span className="shrink-0 text-xs text-[var(--bk-text-faint)]">〜</span>
              <input
                type="time"
                className={`${inputClass} min-w-0 flex-1`}
                value={r.to}
                aria-label="to"
                onChange={(e) => setRanges(ranges.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))}
              />
              <IconBtn icon="lucide:x" title="×" danger onClick={() => setRanges(ranges.filter((_, j) => j !== i))} />
            </div>
          ))}
          {/* Phần còn lại (tự động) — khung riêng, hiển thị y hệt mục chọn nhưng MỜ &
              không sửa được. */}
          {remainderRanges.length > 0 && (
            <RemainderFrame>
              <div className="space-y-1.5">
                {remainderRanges.map((r, i) => (
                  // Ô read-only trông như input giờ; dùng span (không <input type=time>) vì
                  // biên cuối ngày là "24:00" — input time không hiển thị được (thành trống).
                  <div key={i} className="flex items-center gap-1.5">
                    <span className={`${inputClass} block min-w-0 flex-1`}>{r.from}</span>
                    <span className="shrink-0 text-xs text-[var(--bk-text-faint)]">〜</span>
                    <span className={`${inputClass} block min-w-0 flex-1`}>{r.to}</span>
                  </div>
                ))}
              </div>
            </RemainderFrame>
          )}
          {/* Nút thêm khung — icon, đặt DƯỚI phần cover khoảng còn lại. */}
          <AddButton label={t('clAddRange')} onClick={() => setRanges([...ranges, { from: '', to: '' }])} />
        </div>
      )}
    </div>
  );
}

// Khung "phần còn lại (tự động)" — viền đứt + nền chìm + mờ + khoá tương tác. Nội dung
// bên trong trông y hệt mục chọn của user, chỉ khác là mờ đi & không sửa được.
function RemainderFrame({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none rounded-xl border border-dashed border-[var(--bk-border)] bg-[var(--bk-surface-2)] p-2 opacity-60">
      {children}
    </div>
  );
}

// 1 ô thứ (T2〜NL). Màu như 稼働スケジュール của General Settings: ngày thường xanh,
// cuối tuần & ngày lễ đỏ. dim = ô "còn lại (tự động)" — hiện màu nhưng mờ & không bấm.
function DayCell({ day, label, on, dim, onClick }: { day: DayKey; label: string; on: boolean; dim?: boolean; onClick?: () => void }) {
  const isRedDay = day === 'sat' || day === 'sun' || day === 'holiday';
  return (
    <button
      type="button"
      disabled={dim}
      onClick={onClick}
      aria-pressed={on}
      className={[
        'h-8 w-9 rounded-lg border text-xs font-bold transition',
        on
          ? isRedDay
            ? 'border-[#ef4444] bg-[#ef4444] text-white'
            : 'border-[#059669] bg-[#059669] text-white'
          : 'border-[var(--bk-border)] bg-[var(--bk-surface-2)] text-[var(--bk-text-faint)] hover:border-[var(--bk-accent)] hover:text-[var(--bk-text)]',
        dim ? 'cursor-default' : '',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

// ── Tab 分岐設定: danh sách nhánh = tích các điều kiện (READ-ONLY) ─────────────
// Bố cục 条件 → ノード giống các node khác (bk-branch-row); KHÔNG có nhánh catch-all,
// chỉ các nhánh sinh từ điều kiện ở プロパティ設定.
export function CsLogicBranchList({ node }: { node: FlowNode }) {
  const t = useT();
  const draft = useFlowStore((s) => s.draft);
  const ir = useFlowStore((s) => s.ir);
  const data = draft?.data ?? node.data;
  const slots = readCsSlots(data);
  const branches = csProductBranches(slots);

  // Đích của 1 nhánh = target của edge xuất phát từ handle đó (IR đã commit).
  const targetInfo = (handleId: string): { label: string; color: string } | null => {
    const edge = ir?.edges.find((e) => e.source === node.id && (e.sourceHandle ?? 'default') === handleId);
    if (!edge) return null;
    const target = ir?.nodes.find((n) => n.id === edge.target);
    return {
      label: target?.label ?? edge.target,
      color: target ? NODE_CONFIG[target.type].color : 'var(--bk-text-faint)',
    };
  };

  return (
    <div className="space-y-3">
      {branches.length === 0 ? (
        <p className="px-1 text-sm text-[var(--bk-text-faint)]">{t('clNoValue')}</p>
      ) : (
        <div className="space-y-2.5">
          <div className="bk-branch-row bk-branch-head">
            <div className="bk-branch-cond">{t('branchColCondition')}</div>
            <span className="bk-branch-arrow-spacer" aria-hidden />
            <div className="bk-branch-target bk-branch-target--left">{t('branchColNode')}</div>
          </div>
          {branches.map((b) => (
            <div key={b.id} className="bk-branch-row">
              <div className="bk-branch-cond">
                <div className="flex flex-wrap items-center gap-1.5">
                  {b.parts.map((p, j) => (
                    <span key={j} className="inline-flex items-center gap-1.5">
                      {j > 0 && <span className="text-[var(--bk-text-faint)]">×</span>}
                      <span className="rounded-md border border-[var(--bk-border)] bg-[var(--bk-surface-2)] px-2 py-1 text-xs font-semibold text-[var(--bk-text)]">
                        {p}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
              <Icon icon="fluent:flow-dot-20-filled" width={18} height={18} className="bk-branch-arrow" />
              <div className="bk-branch-target bk-branch-target--left">
                <BranchTargetChip info={targetInfo(b.id)} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Nhắc: 聴取ノード đã bị xoá → tên node trong điều kiện có thể lệch. */}
      {slots.some((s) => s.kind === 'hearing' && s.nodeId && !ir?.nodes.some((n) => n.id === s.nodeId)) && (
        <p className="px-1 text-xs text-rose-500">
          {slots
            .filter((s) => s.kind === 'hearing' && s.nodeId)
            .map((s) => hearingNodeLabel(s.nodeId ?? '', ir))
            .join(', ')}
        </p>
      )}
    </div>
  );
}

// Tag node đích — đồng bộ style với BranchTarget của các node khác (bk-branch-tag).
function BranchTargetChip({ info }: { info: { label: string; color: string } | null }) {
  const t = useT();
  if (!info) return <span className="bk-branch-none">{t('branchTargetNone')}</span>;
  return (
    <HoverTip className="bk-branch-tag" style={{ '--tagc': info.color } as CSSProperties} content={info.label}>
      {info.label}
    </HoverTip>
  );
}

// ── UI phụ ───────────────────────────────────────────────────────────────────
function SubToggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex-1 rounded-lg border px-2 py-1.5 text-[11.5px] font-bold transition',
        on
          ? 'border-[var(--bk-accent)] bg-[var(--bk-accent-soft)] text-[var(--bk-accent)]'
          : 'border-[var(--bk-border)] text-[var(--bk-text-muted)] hover:border-[var(--bk-accent)]',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

// Nút thêm — CHỈ icon (title/aria-label giữ nhãn cho a11y).
function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-dashed border-[var(--bk-border)] text-[var(--bk-text-muted)] transition hover:border-[var(--bk-accent)] hover:text-[var(--bk-accent)]"
    >
      <Icon icon="lucide:plus" width={14} height={14} />
    </button>
  );
}

function IconBtn({
  icon,
  title,
  onClick,
  disabled,
  danger,
}: {
  icon: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title}
      aria-label={title}
      className={[
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--bk-text-faint)] transition',
        disabled
          ? 'cursor-not-allowed opacity-30'
          : danger
            ? 'hover:bg-[color-mix(in_srgb,#dc2626_12%,transparent)] hover:text-rose-500'
            : 'hover:bg-[var(--bk-surface-2)] hover:text-[var(--bk-text)]',
      ].join(' ')}
    >
      <Icon icon={icon} width={14} height={14} />
    </button>
  );
}
