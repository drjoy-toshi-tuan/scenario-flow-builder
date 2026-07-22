import { useFlowStore } from '../store/flowStore';
import type { FlowIR, FlowNode } from '../ir/types';
import {
  csBranchesToDataBranches,
  csBranchSentence,
  csDataCategory,
  datetimeKindOf,
  defaultConditionForCategory,
  hearingSourceOptions,
  newCsCondition,
  nextCsBranchId,
  nextCsBranchName,
  operatorOf,
  operatorsFor,
  phoneKindOf,
  phoneValuesFor,
  readCsBranches,
  CS_DAY_SETS,
  CS_ELSE_LABEL,
  type CsBranch,
  type CsCondition,
  type CsDataCategory,
} from '../ui/csLogic';
import { Icon } from '../ui/icons';

// ─────────────────────────────────────────────────────────────────────────────
// Tab プロパティ設定 của node 分岐ロジック (màn CS): "câu điều kiện" có cấu trúc.
// 1 nhánh = 1 thẻ. Trong thẻ:
//   - 条件の数 (1/2/3): nút on/off chọn số điều kiện kết hợp.
//   - mỗi điều kiện: chọn データ (聴取内容 / 電話番号 / 着信日時) → cascade riêng.
//   - AND/OR chỉ hiện khi ≥ 2 điều kiện.
// Đánh giá TỪ TRÊN xuống; else その他 cố định. Ghi vào DRAFT: csConditions +
// data.branches (bản sync để handle/dây/commit dùng lại cơ chế sẵn có).
// ─────────────────────────────────────────────────────────────────────────────

const inputClass =
  'w-full rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface-2)] px-2.5 py-1.5 text-sm text-[var(--bk-text)] outline-none transition focus:border-[var(--bk-accent)]';

const CATEGORY_META: { id: CsDataCategory; label: string; icon: string }[] = [
  { id: 'hearing', label: '聴取内容', icon: 'lucide:headphones' },
  { id: 'phone', label: '電話番号', icon: 'lucide:phone' },
  { id: 'datetime', label: '着信日時', icon: 'lucide:calendar-clock' },
];

export function CsLogicBranchEditor({ node }: { node: FlowNode }) {
  const ir = useFlowStore((s) => s.ir);
  const draft = useFlowStore((s) => s.draft);
  const setDraftField = useFlowStore((s) => s.setDraftField);

  const data = draft?.data ?? node.data;
  const branches = readCsBranches(data);

  // Ghi cả 2 key trong 1 lượt: csConditions (nguồn sự thật CS) + branches (bản sync).
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

  const updateCond = (bi: number, ci: number, cond: CsCondition) =>
    updateBranch(bi, {
      conditions: branches[bi].conditions.map((c, i) => (i === ci ? cond : c)),
    });

  // 条件の数 (1/2/3): thêm/bớt số điều kiện của nhánh cho khớp N.
  const setConditionCount = (bi: number, count: number) => {
    const cur = branches[bi].conditions;
    let next: CsCondition[];
    if (count <= cur.length) next = cur.slice(0, count);
    else next = [...cur, ...Array.from({ length: count - cur.length }, () => newCsCondition())];
    updateBranch(bi, { conditions: next });
  };

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
            {/* 条件の数 — nút on/off 1/2/3. */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-[var(--bk-text-muted)]">条件の数</span>
              <span className="flex overflow-hidden rounded-full border border-[var(--bk-border)]">
                {[1, 2, 3].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setConditionCount(bi, n)}
                    className={[
                      'px-3 py-1 text-[11px] font-bold transition',
                      branch.conditions.length === n
                        ? 'bg-[var(--bk-accent-soft)] text-[var(--bk-accent)]'
                        : 'text-[var(--bk-text-faint)] hover:text-[var(--bk-text)]',
                    ].join(' ')}
                  >
                    {n}条件
                  </button>
                ))}
              </span>
            </div>

            {branch.conditions.map((cond, ci) => (
              <ConditionRow
                key={ci}
                ir={ir}
                selfId={node.id}
                branch={branch}
                cond={cond}
                index={ci}
                onChange={(cnext) => updateCond(bi, ci, cnext)}
                onRemove={
                  branch.conditions.length > 1
                    ? () => updateBranch(bi, { conditions: branch.conditions.filter((_, i) => i !== ci) })
                    : undefined
                }
              />
            ))}

            {/* AND/OR chỉ có nghĩa khi ≥ 2 điều kiện. */}
            {branch.conditions.length > 1 && (
              <div className="flex justify-end">
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
              </div>
            )}

            {/* Câu tóm tắt tự sinh — CS đọc để tự kiểm tra, TS đọc như spec. */}
            <div className="rounded-lg border border-[color-mix(in_srgb,#16a34a_30%,var(--bk-border))] bg-[color-mix(in_srgb,#16a34a_8%,var(--bk-surface))] px-2.5 py-1.5 text-xs leading-relaxed text-[var(--bk-text)]">
              {csBranchSentence(branch, ir)}
              <span className="mx-1 font-bold text-[#16a34a]">→</span>
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

// 1 điều kiện: [lead] [データ nhóm] → cascade theo nhóm.
function ConditionRow({
  ir,
  selfId,
  branch,
  cond,
  index,
  onChange,
  onRemove,
}: {
  ir: FlowIR | null;
  selfId: string;
  branch: CsBranch;
  cond: CsCondition;
  index: number;
  onChange: (cond: CsCondition) => void;
  onRemove?: () => void;
}) {
  const lead = index === 0 ? 'もし' : branch.combinator === 'and' ? 'かつ' : 'または';
  const category = csDataCategory(cond.source);

  const changeCategory = (next: CsDataCategory) => {
    if (next === category) return;
    onChange(defaultConditionForCategory(next, ir, selfId));
  };

  return (
    <div className="rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface)] p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span
          className={`text-[11px] font-bold ${index === 0 ? 'text-[var(--bk-text-faint)]' : 'text-[var(--bk-accent)]'}`}
        >
          {lead}
        </span>
        {onRemove ? <IconBtn icon="lucide:x" title="条件を削除" danger onClick={onRemove} /> : null}
      </div>

      {/* データ nhóm — 3 nút chọn. */}
      <div className="mb-2 flex gap-1.5">
        {CATEGORY_META.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => changeCategory(c.id)}
            className={[
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11.5px] font-semibold transition',
              category === c.id
                ? 'border-[var(--bk-accent)] bg-[var(--bk-accent-soft)] text-[var(--bk-accent)]'
                : 'border-[var(--bk-border)] text-[var(--bk-text-muted)] hover:border-[var(--bk-accent)]',
            ].join(' ')}
          >
            <Icon icon={c.icon} width={13} height={13} />
            {c.label}
          </button>
        ))}
      </div>

      {category === 'hearing' && <HearingCascade ir={ir} selfId={selfId} cond={cond} onChange={onChange} />}
      {category === 'phone' && <PhoneCascade cond={cond} onChange={onChange} />}
      {category === 'datetime' && <DatetimeCascade cond={cond} onChange={onChange} />}
    </div>
  );
}

// 聴取内容: chọn node 聴取 → toán tử → giá trị.
function HearingCascade({
  ir,
  selfId,
  cond,
  onChange,
}: {
  ir: FlowIR | null;
  selfId: string;
  cond: CsCondition;
  onChange: (cond: CsCondition) => void;
}) {
  const options = hearingSourceOptions(ir, selfId);
  const ops = operatorsFor(cond.source);
  const op = operatorOf(cond);
  return (
    <div className="space-y-1.5">
      <select
        className={inputClass}
        value={cond.source}
        aria-label="どの聴取の回答"
        onChange={(e) => onChange({ ...cond, source: e.target.value })}
      >
        {options.length === 0 && <option value={cond.source}>（聴取ノードがありません）</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            聴取「{o.label}」の結果
          </option>
        ))}
      </select>
      <div className="flex gap-1.5">
        <select
          className={`${inputClass} flex-1`}
          value={op.id}
          aria-label="比較"
          onChange={(e) => onChange({ ...cond, operator: e.target.value, value: '' })}
        >
          {ops.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        {op.value !== 'none' ? (
          <input
            type="text"
            className={`${inputClass} flex-1`}
            value={cond.value}
            placeholder="値を入力（例: 予約）"
            aria-label="値"
            onChange={(e) => onChange({ ...cond, value: e.target.value })}
          />
        ) : (
          <span className="flex-1 rounded-lg border border-dashed border-[var(--bk-border)] bg-[var(--bk-surface-2)] px-2 py-1.5 text-center text-xs text-[var(--bk-text-faint)]">
            値の入力は不要
          </span>
        )}
      </div>
    </div>
  );
}

// 電話番号: 着信 / 聴取 → 種別 CỐ ĐỊNH (enum, không thêm/sửa/xoá).
function PhoneCascade({ cond, onChange }: { cond: CsCondition; onChange: (cond: CsCondition) => void }) {
  const kind = phoneKindOf(cond.source);
  const values = phoneValuesFor(cond.source);
  const setKind = (next: 'incoming' | 'answered') => {
    const source = next === 'answered' ? 'answeredPhone' : 'incomingPhone';
    const list = phoneValuesFor(source);
    const value = list.includes(cond.value) ? cond.value : list[list.length - 1];
    onChange({ source, operator: 'is', value, value2: '' });
  };
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        <SubToggle label="着信電話番号" on={kind === 'incoming'} onClick={() => setKind('incoming')} />
        <SubToggle label="聴取電話番号" on={kind === 'answered'} onClick={() => setKind('answered')} />
      </div>
      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold text-[var(--bk-text-faint)]">
        <Icon icon="lucide:lock" width={11} height={11} />
        種別は固定（選択・編集・削除できません）
      </div>
      <select
        className={inputClass}
        value={cond.value}
        aria-label="種別"
        onChange={(e) => onChange({ ...cond, value: e.target.value })}
      >
        {values.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </div>
  );
}

// 着信日時: 日付(range) / 曜日(dayset) / 時間(range).
function DatetimeCascade({ cond, onChange }: { cond: CsCondition; onChange: (cond: CsCondition) => void }) {
  const kind = datetimeKindOf(cond.source);
  const setKind = (next: 'date' | 'day' | 'time') => {
    if (next === 'date') onChange({ source: 'callDate', operator: 'between', value: '', value2: '' });
    else if (next === 'day') onChange({ source: 'callDay', operator: 'is', value: CS_DAY_SETS[0], value2: '' });
    else onChange({ source: 'callTime', operator: 'between', value: '09:00', value2: '17:00' });
  };
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        <SubToggle label="日付" on={kind === 'date'} onClick={() => setKind('date')} />
        <SubToggle label="曜日" on={kind === 'day'} onClick={() => setKind('day')} />
        <SubToggle label="時間" on={kind === 'time'} onClick={() => setKind('time')} />
      </div>
      {kind === 'date' && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            className={`${inputClass} min-w-0 flex-1`}
            value={cond.value}
            aria-label="開始日"
            onChange={(e) => onChange({ ...cond, value: e.target.value })}
          />
          <span className="flex-none text-xs text-[var(--bk-text-faint)]">〜</span>
          <input
            type="date"
            className={`${inputClass} min-w-0 flex-1`}
            value={cond.value2}
            aria-label="終了日"
            onChange={(e) => onChange({ ...cond, value2: e.target.value })}
          />
        </div>
      )}
      {kind === 'day' && (
        <select
          className={inputClass}
          value={cond.value || CS_DAY_SETS[0]}
          aria-label="曜日"
          onChange={(e) => onChange({ ...cond, value: e.target.value })}
        >
          {CS_DAY_SETS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      )}
      {kind === 'time' && (
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            className={`${inputClass} min-w-0 flex-1`}
            value={cond.value}
            placeholder="09:00"
            aria-label="開始時刻"
            onChange={(e) => onChange({ ...cond, value: e.target.value })}
          />
          <span className="flex-none text-xs text-[var(--bk-text-faint)]">〜</span>
          <input
            type="text"
            className={`${inputClass} min-w-0 flex-1`}
            value={cond.value2}
            placeholder="17:00"
            aria-label="終了時刻"
            onChange={(e) => onChange({ ...cond, value2: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}

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
