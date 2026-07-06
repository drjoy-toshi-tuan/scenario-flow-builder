import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useFlowStore } from '../store/flowStore';
import type { FlowNode, NodeType } from '../ir/types';
import { NODE_CONFIG } from '../ui/nodeConfig';
import {
  PROPERTY_FIELDS,
  BRANCH_SCHEMA,
  readBranches,
  catchAllDisplay,
  CATCH_ALL_ID,
  type PropertyField,
} from '../ui/nodeSchema';
import { Icon } from '../ui/icons';
import { useT, type TKey } from '../ui/i18n';
import { lintScript, type ScriptError } from '../ui/scriptLint';
import { CodeEditor } from './CodeEditor';
import { RegexBranchInput } from './RegexBranchInput';
import { AutoGrowTextarea } from './AutoGrowTextarea';

// Key giải thích ý nghĩa loại node trong từ điển i18n (exStart, exAnnounce, …).
function explainKey(type: NodeType): TKey {
  return ('ex' + type.charAt(0).toUpperCase() + type.slice(1)) as TKey;
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel setting: 3 tab chọn từ header (General/Property/Branch, tràn hết bề rộng).
// Mọi chỉnh sửa ghi vào DRAFT trong store; LƯU mới commit vào IR, HỦY thì bỏ.
// Rời panel khi còn thay đổi -> hiện modal cảnh báo (pendingSelect trong store).
// ─────────────────────────────────────────────────────────────────────────────

const inputClass =
  'mt-1 w-full rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface-2)] px-3 py-2 text-sm text-[var(--bk-text)] outline-none transition focus:border-[var(--bk-accent)]';

type Tab = 'general' | 'property' | 'branch';

export function NodeSettingsPanel() {
  const ir = useFlowStore((s) => s.ir);
  const selectedNodeId = useFlowStore((s) => s.selectedNodeId);
  const selectNode = useFlowStore((s) => s.selectNode);

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
        'absolute right-0 top-0 z-10 flex h-full w-[600px] max-w-[90vw] flex-col border-l border-[var(--bk-border)] bg-[var(--bk-surface)] shadow-[var(--bk-shadow)]',
        'transition-transform duration-300 ease-out will-change-transform',
        open ? 'translate-x-0' : 'translate-x-full pointer-events-none',
      ].join(' ')}
      aria-hidden={!open}
    >
      {display && <PanelContent key={display.id} node={display} onClose={() => selectNode(null)} />}
    </aside>
  );
}

function PanelContent({ node, onClose }: { node: FlowNode; onClose: () => void }) {
  const t = useT();
  const cfg = NODE_CONFIG[node.type];

  const draft = useFlowStore((s) => s.draft);
  const commitDraft = useFlowStore((s) => s.commitDraft);
  const cancelEdit = useFlowStore((s) => s.cancelEdit);
  const pendingSelect = useFlowStore((s) => s.pendingSelect);
  const confirmPendingSelect = useFlowStore((s) => s.confirmPendingSelect);
  const cancelPendingSelect = useFlowStore((s) => s.cancelPendingSelect);

  // Nguồn hiển thị: draft khi đang mở; lúc trượt ra (draft=null) dùng data đã commit.
  const editing = draft ?? { label: node.label, data: node.data };
  const dirty =
    !!draft &&
    (draft.label !== node.label || JSON.stringify(draft.data) !== JSON.stringify(node.data));

  const hasProperty = PROPERTY_FIELDS[node.type].length > 0;
  const hasBranch = BRANCH_SCHEMA[node.type].mode !== 'none';

  const [tab, setTab] = useState<Tab>('general');
  useEffect(() => {
    if ((tab === 'property' && !hasProperty) || (tab === 'branch' && !hasBranch)) setTab('general');
  }, [tab, hasProperty, hasBranch]);

  // Kiểm tra cú pháp các ô code (script) trong draft -> chặn LƯU khi có lỗi.
  const scriptError = useMemo<ScriptError | null>(() => {
    if (!draft) return null;
    for (const f of PROPERTY_FIELDS[node.type]) {
      if (f.kind !== 'code') continue;
      const v = draft.data[f.key];
      if (typeof v === 'string') {
        const err = lintScript(v);
        if (err) return err;
      }
    }
    return null;
  }, [draft, node.type]);

  const [showSyntaxWarn, setShowSyntaxWarn] = useState(false);
  const handleSave = () => {
    if (scriptError) {
      setTab('property'); // đưa về tab có ô script để người dùng thấy lỗi
      setShowSyntaxWarn(true);
      return;
    }
    commitDraft();
  };

  return (
    <div className="bk-panel-content flex h-full flex-col">
      <header className="bk-panel-header border-b border-[var(--bk-border)]">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <span
              className="flex h-9 w-9 flex-none items-center justify-center rounded-xl text-lg"
              style={{ color: cfg.color, background: `color-mix(in srgb, ${cfg.color} 15%, transparent)` }}
            >
              <Icon icon={cfg.icon} />
            </span>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: cfg.color }}>
                {cfg.typeLabel}
              </div>
              <div className="text-sm font-medium text-[var(--bk-text-muted)]">
                {t(explainKey(node.type))}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface)] text-[var(--bk-text-muted)] shadow-sm transition hover:border-[var(--bk-accent)] hover:text-[var(--bk-accent)]"
            onClick={onClose}
            aria-label={t('close')}
          >
            <Icon icon="lucide:x" width={16} height={16} />
          </button>
        </div>

        {/* Tab tràn hết bề rộng panel; tab đang chọn có nền + gạch chân accent. */}
        <div className="bk-tabs">
          <TabButton label={t('tabGeneral')} active={tab === 'general'} onClick={() => setTab('general')} />
          <TabButton
            label={t('tabProperty')}
            active={tab === 'property'}
            disabled={!hasProperty}
            onClick={() => setTab('property')}
          />
          <TabButton
            label={t('tabBranch')}
            active={tab === 'branch'}
            disabled={!hasBranch}
            onClick={() => setTab('branch')}
          />
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {tab === 'general' && <GeneralTab label={editing.label} />}
        {tab === 'property' && <PropertyTab type={node.type} data={editing.data} />}
        {tab === 'branch' && <BranchTab node={node} data={editing.data} />}
      </div>

      {/* Nút LƯU / HỦY ở đáy panel. */}
      <footer className="flex items-center justify-end gap-2 border-t border-[var(--bk-border)] px-4 py-3">
        <button
          type="button"
          onClick={cancelEdit}
          className="rounded-lg border border-[var(--bk-border)] px-4 py-2 text-sm font-semibold text-[var(--bk-text-muted)] transition hover:bg-[var(--bk-surface-2)] hover:text-[var(--bk-text)]"
        >
          {t('btnCancel')}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty}
          className={[
            'rounded-lg px-5 py-2 text-sm font-semibold text-white transition',
            dirty
              ? 'bg-[var(--bk-success)] hover:bg-[var(--bk-success-hover)]'
              : 'cursor-not-allowed bg-[var(--bk-text-faint)] opacity-60',
          ].join(' ')}
        >
          {t('btnSave')}
        </button>
      </footer>

      {/* Modal cảnh báo khi bấm LƯU lúc script còn lỗi cú pháp. */}
      {showSyntaxWarn && scriptError && (
        <div className="bk-modal-overlay" role="dialog" aria-modal="true">
          <div className="bk-modal">
            <div className="mb-1 text-sm font-bold text-[var(--bk-text)]">{t('syntaxErrorTitle')}</div>
            <p className="mb-2 text-sm leading-relaxed text-[var(--bk-text-muted)]">{t('syntaxErrorMessage')}</p>
            <pre className="mb-4 overflow-x-auto rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface-2)] px-3 py-2 text-xs text-[#dc2626]">
              {scriptError.line != null ? `Dòng ${scriptError.line}: ` : ''}
              {scriptError.message}
            </pre>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSyntaxWarn(false)}
                className="rounded-lg border border-[var(--bk-border)] px-4 py-2 text-sm font-semibold text-[var(--bk-text-muted)] transition hover:bg-[var(--bk-surface-2)] hover:text-[var(--bk-text)]"
              >
                {t('syntaxErrorFix')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSyntaxWarn(false);
                  commitDraft();
                }}
                className="rounded-lg bg-[#dc2626] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95"
              >
                {t('syntaxErrorSaveAnyway')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal cảnh báo khi rời panel lúc còn thay đổi chưa lưu. */}
      {pendingSelect && (
        <div className="bk-modal-overlay" role="dialog" aria-modal="true">
          <div className="bk-modal">
            <div className="mb-1 text-sm font-bold text-[var(--bk-text)]">{t('unsavedTitle')}</div>
            <p className="mb-4 text-sm leading-relaxed text-[var(--bk-text-muted)]">{t('unsavedMessage')}</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelPendingSelect}
                className="rounded-lg border border-[var(--bk-border)] px-4 py-2 text-sm font-semibold text-[var(--bk-text-muted)] transition hover:bg-[var(--bk-surface-2)] hover:text-[var(--bk-text)]"
              >
                {t('keepEditing')}
              </button>
              <button
                type="button"
                onClick={confirmPendingSelect}
                className="rounded-lg bg-[#dc2626] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95"
              >
                {t('discardChanges')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TabButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        'bk-tab',
        active ? 'bk-tab--active' : '',
        disabled ? 'bk-tab--disabled' : '',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

// ── General ─────────────────────────────────────────────────────────────────
function GeneralTab({ label }: { label: string }) {
  const t = useT();
  const setDraftLabel = useFlowStore((s) => s.setDraftLabel);
  const setDraftField = useFlowStore((s) => s.setDraftField);
  const draft = useFlowStore((s) => s.draft);
  const description = typeof draft?.data.description === 'string' ? draft.data.description : '';

  return (
    <>
      <label className="block">
        <span className="text-xs font-medium text-[var(--bk-text-muted)]">{t('nodeName')}</span>
        <input className={inputClass} value={label} onChange={(e) => setDraftLabel(e.target.value)} />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-[var(--bk-text-muted)]">{t('description')}</span>
        <input
          type="text"
          className={inputClass}
          placeholder={t('descriptionPlaceholder')}
          value={description}
          onChange={(e) => setDraftField('description', e.target.value)}
        />
      </label>
    </>
  );
}

// ── Property ──────────────────────────────────────────────────────────────────
function PropertyTab({ type, data }: { type: NodeType; data: Record<string, unknown> }) {
  const t = useT();
  const fields = PROPERTY_FIELDS[type].filter((f) => !f.showIf || f.showIf(data));
  if (fields.length === 0) {
    return <p className="text-sm text-[var(--bk-text-faint)]">{t('noPropertyNote')}</p>;
  }
  return (
    <div className="space-y-4">
      {fields.map((f) => (
        <FieldControl key={f.key} field={f} data={data} />
      ))}
    </div>
  );
}

function FieldControl({ field, data }: { field: PropertyField; data: Record<string, unknown> }) {
  const t = useT();
  const setDraftField = useFlowStore((s) => s.setDraftField);
  const raw = data[field.key];
  // YAML có thể trả số (retryCount: 2) -> ép về chuỗi để hiển thị/sửa nhất quán.
  const value =
    typeof raw === 'string' ? raw : typeof raw === 'number' ? String(raw) : field.default ?? '';
  const set = (v: string) => setDraftField(field.key, v);
  const label = <span className="text-xs font-medium text-[var(--bk-text-muted)]">{t(field.labelKey)}</span>;

  switch (field.kind) {
    case 'text':
      return (
        <label className="block">
          {label}
          {/* Text 1 dòng: chặn xuống dòng (dán nhiều dòng -> gộp về 1 dòng). */}
          <input
            type="text"
            className={inputClass}
            value={value}
            onChange={(e) => set(e.target.value.replace(/[\r\n]+/g, ' '))}
          />
        </label>
      );
    case 'autoText':
      return (
        <label className="block">
          {label}
          {/* Announce: 1 dòng, tự wrap + cao lên khi dài (xem AutoGrowTextarea). */}
          <AutoGrowTextarea className={`${inputClass} bk-autogrow`} value={value} onChange={set} />
        </label>
      );
    case 'number':
      return (
        <label className="block">
          {label}
          <input
            type="text"
            inputMode="numeric"
            className={inputClass}
            value={value}
            onChange={(e) => set(e.target.value.replace(/[^0-9]/g, ''))}
          />
        </label>
      );
    case 'textarea':
      return (
        <label className="block">
          {label}
          <textarea
            className={`${inputClass} resize-y`}
            rows={field.rows ?? 3}
            value={value}
            onChange={(e) => set(e.target.value)}
          />
        </label>
      );
    case 'select':
      return (
        <label className="block">
          {label}
          <select className={inputClass} value={value} onChange={(e) => set(e.target.value)}>
            {field.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.labelKey ? t(o.labelKey) : o.label}
              </option>
            ))}
          </select>
        </label>
      );
    case 'yesno':
      return (
        <div className="block">
          {label}
          <div className="mt-1 flex gap-2">
            {field.options?.map((o) => {
              const on = value === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => set(o.value)}
                  className={[
                    'flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition',
                    on
                      ? 'border-[var(--bk-accent)] bg-[var(--bk-accent-soft)] text-[var(--bk-accent)]'
                      : 'border-[var(--bk-border)] bg-[var(--bk-surface-2)] text-[var(--bk-text-muted)] hover:text-[var(--bk-text)]',
                  ].join(' ')}
                >
                  {o.labelKey ? t(o.labelKey) : o.label}
                </button>
              );
            })}
          </div>
        </div>
      );
    case 'code':
      return (
        <div className="block">
          {label}
          <div className="mt-1">
            <CodeEditor value={value} onChange={set} rows={field.rows ?? 12} />
          </div>
        </div>
      );
    case 'collapsibleTextarea':
      return <CollapsibleField field={field} value={value} onChange={set} />;
  }
}

// Textarea dài -> ẩn/hiện bằng nút bấm (giống cơ chế mở panel thêm node).
function CollapsibleField({
  field,
  value,
  onChange,
}: {
  field: PropertyField;
  value: string;
  onChange: (v: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface-2)] px-3 py-2 text-left text-xs font-medium text-[var(--bk-text-muted)] transition hover:text-[var(--bk-text)]"
        aria-expanded={open}
      >
        <span>
          {t(field.labelKey)}
          {value.trim() && !open ? ' •' : ''}
        </span>
        <Icon
          icon="lucide:chevron-down"
          width={15}
          height={15}
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <textarea
          className={`${inputClass} resize-y font-mono`}
          rows={field.rows ?? 6}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus
        />
      )}
    </div>
  );
}

// ── Branch ────────────────────────────────────────────────────────────────────
interface TargetInfo {
  label: string;
  color: string;
}

function BranchTab({ node, data }: { node: FlowNode; data: Record<string, unknown> }) {
  const t = useT();
  const schema = BRANCH_SCHEMA[node.type];
  const ir = useFlowStore((s) => s.ir);
  const draftAddBranch = useFlowStore((s) => s.draftAddBranch);
  const draftUpdateBranch = useFlowStore((s) => s.draftUpdateBranch);
  const draftSetBranchLabel = useFlowStore((s) => s.draftSetBranchLabel);
  const draftRemoveBranch = useFlowStore((s) => s.draftRemoveBranch);

  // Đích jump của 1 nhánh = target của edge xuất phát từ handle đó (IR đã commit).
  const targetInfo = (handleId: string): TargetInfo | null => {
    const edge = ir?.edges.find((e) => e.source === node.id && (e.sourceHandle ?? 'default') === handleId);
    if (!edge) return null;
    const target = ir?.nodes.find((n) => n.id === edge.target);
    return {
      label: target?.label ?? edge.target,
      color: target ? NODE_CONFIG[target.type].color : 'var(--bk-text-faint)',
    };
  };

  if (schema.mode === 'none') {
    return <p className="text-sm text-[var(--bk-text-faint)]">{t('branchNoneNote')}</p>;
  }

  if (schema.mode === 'fixed') {
    // Nhánh cố định (FAILED / NEXT …): cùng bố cục VALUE · LABEL · NODE như nhánh tự do,
    // chỉ khác là không sửa/không thêm/không xoá được (hiển thị read-only).
    return (
      <div className="space-y-3">
        <p className="text-xs text-[var(--bk-text-faint)]">{t('branchFixedNote')}</p>
        <div className="space-y-2.5">
          <div className="bk-branch-row bk-branch-head">
            <div className="bk-branch-cond">{t('branchColValue')}</div>
            <div className="bk-branch-label-col">{t('branchColLabel')}</div>
            <span className="bk-branch-arrow-spacer" aria-hidden />
            <div className="bk-branch-target">{t('branchColNode')}</div>
          </div>
          {(schema.fixed ?? []).map((b) => {
            const value = `^${b.name ?? b.id}$`;
            const label = b.label ?? '';
            return (
              <div key={b.id} className="bk-branch-row">
                <div className="bk-branch-cond">
                  {/* VALUE: tên nhánh cố định neo ^…$ (giữ nguyên, không sửa). */}
                  <span className="bk-branch-fixed" title={value}>
                    {value}
                  </span>
                </div>
                <div className="bk-branch-label-col">
                  {/* LABEL: nhãn hiển thị (次へ / 失敗), read-only. */}
                  <span className="bk-branch-fixed" title={label}>
                    {label}
                  </span>
                </div>
                <Icon icon="fluent:flow-dot-20-filled" width={18} height={18} className="bk-branch-arrow" />
                <div className="bk-branch-target">
                  <BranchTarget info={targetInfo(b.id)} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Nhánh tự do (condition/script): nhánh catch-all (^.*$) đứng đầu, không sửa/xoá;
  // các nhánh còn lại thêm/sửa/xoá tuỳ ý. "+ Thêm nhánh" để thêm.
  const branches = readBranches(data);
  const catchAllValue = catchAllDisplay(branches);
  // catch-all luôn hiển thị trước, các nhánh khác theo sau.
  const ordered = [
    ...branches.filter((b) => b.id === CATCH_ALL_ID),
    ...branches.filter((b) => b.id !== CATCH_ALL_ID),
  ];

  return (
    <div className="space-y-3">
      <div className="space-y-2.5">
        {/* Tiêu đề cột: VALUE · LABEL · NODE (nhãn hiển thị trên dây thay cho value). */}
        <div className="bk-branch-row bk-branch-head">
          <div className="bk-branch-cond">{t('branchColValue')}</div>
          <div className="bk-branch-label-col">{t('branchColLabel')}</div>
          <span className="bk-branch-arrow-spacer" aria-hidden />
          <div className="bk-branch-target">{t('branchColNode')}</div>
          <span className="bk-branch-del-spacer" aria-hidden />
        </div>
        {ordered.map((b) => {
          const isCatchAll = b.id === CATCH_ALL_ID;
          return (
            <div key={b.id} className="bk-branch-row">
              <div className="bk-branch-cond">
                {isCatchAll ? (
                  <input
                    className={`${inputClass} !mt-0 w-full font-mono bk-branch-catchall`}
                    value={catchAllValue}
                    readOnly
                    tabIndex={-1}
                    title={t('branchElse')}
                  />
                ) : (
                  <RegexBranchInput
                    className={`${inputClass} !mt-0 w-full font-mono`}
                    value={b.value}
                    placeholder={t('branchConditionPlaceholder')}
                    onChange={(v) => draftUpdateBranch(b.id, v)}
                  />
                )}
              </div>
              <div className="bk-branch-label-col">
                <input
                  type="text"
                  className={`${inputClass} !mt-0 w-full`}
                  value={b.label ?? ''}
                  placeholder={t('branchLabelPlaceholder')}
                  onChange={(e) => draftSetBranchLabel(b.id, e.target.value.replace(/[\r\n]+/g, ' '))}
                />
              </div>
              <Icon icon="fluent:flow-dot-20-filled" width={18} height={18} className="bk-branch-arrow" />
              <div className="bk-branch-target">
                <BranchTarget info={targetInfo(b.id)} />
              </div>
              {isCatchAll ? (
                <span className="bk-branch-del-spacer" aria-hidden />
              ) : (
                <button
                  type="button"
                  onClick={() => draftRemoveBranch(b.id)}
                  title={t('deleteBranch')}
                  aria-label={t('deleteBranch')}
                  className="bk-branch-del"
                >
                  <Icon icon="lucide:trash-2" width={16} height={16} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={draftAddBranch}
        className="flex items-center gap-2 rounded-lg border border-dashed border-[var(--bk-border)] px-3 py-2 text-sm font-medium text-[var(--bk-text-muted)] transition hover:border-[var(--bk-accent)] hover:text-[var(--bk-accent)]"
      >
        <Icon icon="lucide:plus" width={16} height={16} />
        {t('addBranch')}
      </button>
    </div>
  );
}

// Đích jump hiển thị dạng "tag" nền = màu đại diện của node đích; "chưa nối" nếu chưa có dây.
function BranchTarget({ info }: { info: TargetInfo | null }) {
  const t = useT();
  if (!info) {
    return <span className="bk-branch-none">{t('branchTargetNone')}</span>;
  }
  return (
    <span className="bk-branch-tag" style={{ '--tagc': info.color } as CSSProperties} title={info.label}>
      {info.label}
    </span>
  );
}
