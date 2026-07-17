import { useFlowStore } from '../store/flowStore';
import type { FlowNode } from '../ir/types';
import {
  csBranchesToDataBranches,
  csBranchSentence,
  csSourceGroups,
  newCsCondition,
  nextCsBranchId,
  nextCsBranchName,
  operatorOf,
  operatorsFor,
  readCsBranches,
  sourceValueType,
  CS_DAY_SETS,
  CS_ELSE_LABEL,
  type CsBranch,
  type CsCondition,
} from '../ui/csLogic';
import { Icon } from '../ui/icons';

// ─────────────────────────────────────────────────────────────────────────────
// Tab 分岐設定 của node 分岐ロジック (màn CS): thay ô regex bằng "câu điều kiện"
// chọn từ pulldown — 1 nhánh = 1 thẻ, đánh giá TỪ TRÊN xuống, else その他 cố định.
// Mọi chỉnh sửa ghi vào DRAFT (giống các tab khác): setDraftField('csConditions')
// + sync data.branches để handle/dây/commit dùng lại cơ chế sẵn có.
// Nhãn UI tiếng Nhật cố định theo spec CS (không qua i18n) — xem ui/csLogic.ts.
// ─────────────────────────────────────────────────────────────────────────────

const inputClass =
  'w-full rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface-2)] px-2.5 py-1.5 text-sm text-[var(--bk-text)] outline-none transition focus:border-[var(--bk-accent)]';

export function CsLogicBranchEditor({ node }: { node: FlowNode }) {
  const ir = useFlowStore((s) => s.ir);
  const draft = useFlowStore((s) => s.draft);
  const setDraftField = useFlowStore((s) => s.setDraftField);

  const data = draft?.data ?? node.data;
  const branches = readCsBranches(data);
  const groups = csSourceGroups(ir, node.id);

  // Ghi cả 2 key trong 1 lượt: csConditions (nguồn sự thật CS) + branches (bản sync).
  // 2 lời gọi setDraftField nối tiếp đều đọc draft mới nhất từ store nên an toàn.
  const apply = (next: CsBranch[]) => {
    setDraftField('csConditions', next);
    setDraftField('branches', csBranchesToDataBranches(next));
  };

  const updateBranch = (index: number, patch: Partial<CsBranch>) =>
    apply(branches.map((b, i) => (i === index ? { ...b, ...patch } : b)));

  const moveBranch = (index: number, delta: -1 | 1) => {
    const to = index + delta;
    if (to < 0 || to >= branches.length) return;
    const next = [...branches];
    [next[index], next[to]] = [next[to], next[index]];
    apply(next);
  };

  const addBranch = () =>
    apply([
      ...branches,
      {
        id: nextCsBranchId(branches),
        name: nextCsBranchName(branches),
        combinator: 'and',
        conditions: [newCsCondition()],
      },
    ]);

  const updateCond = (bi: number, ci: number, patch: Partial<CsCondition>) =>
    updateBranch(bi, {
      conditions: branches[bi].conditions.map((c, i) => (i === ci ? { ...c, ...patch } : c)),
    });

  return (
    <div className="space-y-3">
      {/* Thứ tự thẻ = thứ tự đánh giá — nhắc ngay trên đầu để CS không bất ngờ. */}
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-[var(--bk-border)] bg-[var(--bk-surface-2)] px-3 py-2 text-xs text-[var(--bk-text-muted)]">
        <Icon icon="lucide:arrow-down-narrow-wide" width={14} height={14} className="shrink-0 text-[var(--bk-accent)]" />
        分岐は上から順に判定され、最初に当てはまった分岐へ進みます
      </div>

      {branches.map((branch, bi) => (
        <div key={branch.id} className="overflow-hidden rounded-xl border border-[var(--bk-border)]">
          {/* Header thẻ: số thứ tự + tên nhánh + đổi thứ tự + xoá. */}
          <div className="flex items-center gap-2 border-b border-[var(--bk-border)] bg-[var(--bk-surface-2)] py-1.5 pl-2.5 pr-1.5">
            <span className="flex h-6 w-6 flex-none items-center justify-center rounded-md bg-[var(--bk-accent-soft)] text-[11px] font-bold text-[var(--bk-accent)]">
              {bi + 1}
            </span>
            <input
              type="text"
              className={`${inputClass} !border-transparent !bg-transparent font-semibold hover:!border-[var(--bk-border)]`}
              value={branch.name}
              placeholder="分岐名"
              aria-label="分岐名"
              onChange={(e) => updateBranch(bi, { name: e.target.value.replace(/[\r\n]+/g, ' ') })}
            />
            <IconBtn icon="lucide:arrow-up" title="上へ" disabled={bi === 0} onClick={() => moveBranch(bi, -1)} />
            <IconBtn
              icon="lucide:arrow-down"
              title="下へ"
              disabled={bi === branches.length - 1}
              onClick={() => moveBranch(bi, 1)}
            />
            <IconBtn
              icon="lucide:trash-2"
              title="分岐を削除"
              danger
              onClick={() => apply(branches.filter((_, i) => i !== bi))}
            />
          </div>

          <div className="space-y-2 p-2.5">
            {branch.conditions.map((cond, ci) => (
              <ConditionRow
                key={ci}
                branch={branch}
                cond={cond}
                index={ci}
                groups={groups}
                onChange={(patch) => updateCond(bi, ci, patch)}
                onRemove={
                  branch.conditions.length > 1
                    ? () => updateBranch(bi, { conditions: branch.conditions.filter((_, i) => i !== ci) })
                    : undefined
                }
              />
            ))}

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => updateBranch(bi, { conditions: [...branch.conditions, newCsCondition()] })}
                className="flex items-center gap-1.5 rounded-full border border-dashed border-[var(--bk-border)] px-3 py-1 text-xs font-semibold text-[var(--bk-text-muted)] transition hover:border-[var(--bk-accent)] hover:text-[var(--bk-accent)]"
              >
                <Icon icon="lucide:plus" width={13} height={13} />
                条件を追加
              </button>
              {/* AND/OR chỉ có nghĩa khi ≥ 2 điều kiện. */}
              {branch.conditions.length > 1 && (
                <span className="flex overflow-hidden rounded-full border border-[var(--bk-border)]">
                  <CombButton
                    label="すべて満たす"
                    on={branch.combinator === 'and'}
                    onClick={() => updateBranch(bi, { combinator: 'and' })}
                  />
                  <CombButton
                    label="いずれか満たす"
                    on={branch.combinator === 'or'}
                    onClick={() => updateBranch(bi, { combinator: 'or' })}
                  />
                </span>
              )}
            </div>

            {/* Câu tóm tắt tự sinh — CS đọc để tự kiểm tra, TS đọc như spec. */}
            <div className="rounded-lg border border-[color-mix(in_srgb,#10b981_30%,var(--bk-border))] bg-[color-mix(in_srgb,#10b981_8%,var(--bk-surface))] px-2.5 py-1.5 text-xs leading-relaxed text-[var(--bk-text)]">
              {csBranchSentence(branch, ir)}
              <span className="mx-1 font-bold text-[#10b981]">→</span>
              <span className="font-semibold">「{branch.name || '（無題）'}」へ進む</span>
            </div>
          </div>
        </div>
      ))}

      {/* Nhánh else その他 — luôn CUỐI, không sửa/không xoá (catch-all). */}
      <div className="overflow-hidden rounded-xl border border-dashed border-[var(--bk-border)]">
        <div className="flex items-center gap-2 px-2.5 py-2">
          <span className="flex h-6 w-6 flex-none items-center justify-center rounded-md bg-[var(--bk-surface-2)] text-[11px] font-bold text-[var(--bk-text-faint)]">
            {branches.length + 1}
          </span>
          <span className="text-sm font-semibold text-[var(--bk-text-muted)]">{CS_ELSE_LABEL}（上記以外）</span>
        </div>
        <p className="px-3 pb-2.5 text-xs text-[var(--bk-text-faint)]">
          上のどの分岐にも当てはまらなかった場合に進む分岐です（削除できません）。
        </p>
      </div>

      <button
        type="button"
        onClick={addBranch}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--bk-border)] px-3 py-2.5 text-sm font-semibold text-[var(--bk-text-muted)] transition hover:border-[var(--bk-accent)] hover:bg-[var(--bk-accent-soft)] hover:text-[var(--bk-accent)]"
      >
        <Icon icon="lucide:plus" width={16} height={16} />
        分岐を追加
      </button>
    </div>
  );
}

// 1 dòng điều kiện: [もし/かつ/または] [データ] [比較] [値] [xoá].
function ConditionRow({
  branch,
  cond,
  index,
  groups,
  onChange,
  onRemove,
}: {
  branch: CsBranch;
  cond: CsCondition;
  index: number;
  groups: ReturnType<typeof csSourceGroups>;
  onChange: (patch: Partial<CsCondition>) => void;
  onRemove?: () => void;
}) {
  const op = operatorOf(cond);
  const lead = index === 0 ? 'もし' : branch.combinator === 'and' ? 'かつ' : 'または';

  // Đổi nguồn dữ liệu -> toán tử về mặc định của loại mới, xoá giá trị cũ (lệch kiểu).
  const changeSource = (source: string) => {
    if (sourceValueType(source) === sourceValueType(cond.source)) onChange({ source });
    else onChange({ source, operator: operatorsFor(source)[0].id, value: '', value2: '' });
  };

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`w-9 flex-none text-center text-[11px] font-bold ${
          index === 0 ? 'text-[var(--bk-text-faint)]' : 'text-[var(--bk-accent)]'
        }`}
      >
        {lead}
      </span>
      <select
        className={`${inputClass} min-w-0 flex-[1.4]`}
        value={cond.source}
        aria-label="データ"
        onChange={(e) => changeSource(e.target.value)}
      >
        {groups.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.items.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <select
        className={`${inputClass} min-w-0 flex-1`}
        value={op.id}
        aria-label="比較"
        onChange={(e) => onChange({ operator: e.target.value, value2: '' })}
      >
        {operatorsFor(cond.source).map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <ValueField cond={cond} onChange={onChange} />
      {onRemove ? (
        <IconBtn icon="lucide:x" title="条件を削除" danger onClick={onRemove} />
      ) : (
        <span className="w-7 flex-none" aria-hidden />
      )}
    </div>
  );
}

// Ô nhập giá trị đổi theo toán tử: text / khoảng thời gian (〜) / nhóm ngày / không cần.
function ValueField({
  cond,
  onChange,
}: {
  cond: CsCondition;
  onChange: (patch: Partial<CsCondition>) => void;
}) {
  const op = operatorOf(cond);
  switch (op.value) {
    case 'none':
      return (
        <span className="min-w-0 flex-1 rounded-lg border border-dashed border-[var(--bk-border)] bg-[var(--bk-surface-2)] px-2 py-1.5 text-center text-xs text-[var(--bk-text-faint)]">
          値の入力は不要
        </span>
      );
    case 'dayset':
      return (
        <select
          className={`${inputClass} min-w-0 flex-1`}
          value={cond.value || CS_DAY_SETS[0]}
          aria-label="値"
          onChange={(e) => onChange({ value: e.target.value })}
        >
          {CS_DAY_SETS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      );
    case 'range':
      return (
        <span className="flex min-w-0 flex-1 items-center gap-1">
          <input
            type="text"
            className={`${inputClass} min-w-0`}
            value={cond.value}
            placeholder="09:00"
            aria-label="値（から）"
            onChange={(e) => onChange({ value: e.target.value })}
          />
          <span className="flex-none text-xs text-[var(--bk-text-faint)]">〜</span>
          <input
            type="text"
            className={`${inputClass} min-w-0`}
            value={cond.value2}
            placeholder="12:00"
            aria-label="値（まで）"
            onChange={(e) => onChange({ value2: e.target.value })}
          />
        </span>
      );
    default:
      return (
        <input
          type="text"
          className={`${inputClass} min-w-0 flex-1`}
          value={cond.value}
          placeholder={sourceValueType(cond.source) === 'phone' ? '例: 090' : '値を入力'}
          aria-label="値"
          onChange={(e) => onChange({ value: e.target.value })}
        />
      );
  }
}

// Nút toggle すべて満たす (AND) / いずれか満たす (OR) trong thẻ nhánh.
function CombButton({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'px-2.5 py-1 text-[11px] font-bold transition',
        on
          ? 'bg-[var(--bk-accent-soft)] text-[var(--bk-accent)]'
          : 'text-[var(--bk-text-faint)] hover:text-[var(--bk-text)]',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

// Nút icon nhỏ dùng chung trong thẻ nhánh (đổi thứ tự / xoá).
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
        'flex h-7 w-7 flex-none items-center justify-center rounded-lg text-[var(--bk-text-faint)] transition',
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
