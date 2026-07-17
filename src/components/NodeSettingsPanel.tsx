import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useFlowStore } from '../store/flowStore';
import { useWorkspaceStore } from '../store/workspaceStore';
import type { FlowNode, NodeType } from '../ir/types';
import { NODE_CONFIG, nodeTypeLabel } from '../ui/nodeConfig';
import { CsLogicBranchEditor } from './CsLogicBranchEditor';
import { ensureSettings } from '../ir/settings';
import { computeInheritedFlags } from '../ir/statusFlow';
import {
  PROPERTY_FIELDS,
  propertyFieldsFor,
  csEditableBranchNode,
  csBranchesOf,
  BRANCH_SCHEMA,
  type DataBranch,
  readBranches,
  readPairs,
  readClinicalDepartments,
  effectiveBranches,
  isPairBranchNode,
  fixedModuleBranches,
  catchAllEditable,
  optionGroupsForSource,
  catchAllDisplay,
  logicModuleOf,
  formatTimeInput,
  templateLocks,
  CATCH_ALL_ID,
  LOGIC_MODULE_SCRIPT,
  LOGIC_MODULE_CDC,
  LOGIC_MODULE_PHONE_TYPE,
  type PropertyField,
} from '../ui/nodeSchema';
import { Icon } from '../ui/icons';
import { FlowGlyph } from '../ui/FlowGlyph';
import { useLang, useT, type TKey } from '../ui/i18n';
import { lintFor, type ScriptError } from '../ui/scriptLint';
import { refreshScriptExplanation } from '../ai/explain';
import { CodeEditor } from './CodeEditor';
import { RegexBranchInput } from './RegexBranchInput';
import { AutoGrowTextarea } from './AutoGrowTextarea';
import { HoverTip, useClipTip } from './HoverTip';
import { AiEditableField } from './AiFieldExtras';

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
  // Màn CS: nhãn loại tiếng Nhật; node 分岐ロジック dùng editor điều kiện riêng
  // (không regex, không tab Property) — xem CsLogicBranchEditor.
  const csMode = useWorkspaceStore((s) => s.mode === 'cs');
  const csLogic = csMode && node.type === 'logic';

  const ir = useFlowStore((s) => s.ir);
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

  // Tên node phải khác rỗng và DUY NHẤT trong flow đang mở (ir.nodes) — khác flow
  // thì trùng được. Chặn LƯU khi vi phạm, hiện lỗi ở tab General.
  const nameTrimmed = editing.label.trim();
  const nameError: TKey | null = !nameTrimmed
    ? 'nodeNameRequired'
    : ir?.nodes.some((n) => n.id !== node.id && n.label.trim() === nameTrimmed)
      ? 'nodeNameDuplicate'
      : null;

  // Màn CS: KHÔNG còn tab Property riêng — field property hiển thị ngay trong
  // tab General (gộp làm 1); TS giữ 3 tab như cũ.
  const hasProperty = !csMode && !csLogic && PROPERTY_FIELDS[node.type].length > 0;
  const hasBranch = BRANCH_SCHEMA[node.type].mode !== 'none';

  const [tab, setTab] = useState<Tab>('general');
  useEffect(() => {
    if ((tab === 'property' && !hasProperty) || (tab === 'branch' && !hasBranch)) setTab('general');
  }, [tab, hasProperty, hasBranch]);

  // Kiểm tra cú pháp các ô code (script JS / JSON) trong draft -> chặn LƯU khi có lỗi.
  const scriptError = useMemo<ScriptError | null>(() => {
    if (!draft) return null;
    for (const f of PROPERTY_FIELDS[node.type]) {
      if (f.kind !== 'code') continue;
      const v = draft.data[f.key];
      if (typeof v === 'string') {
        const err = lintFor(f.language, v);
        if (err) return err;
      }
    }
    return null;
  }, [draft, node.type]);

  const { lang } = useLang();
  // LƯU node logic (module Script) với script ĐÃ ĐỔI -> tự 再生成 phần giải thích
  // AI ở nền để giải nghĩa luôn khớp code mới (thiếu key -> bỏ qua im lặng).
  const maybeRefreshExplanation = () => {
    if (!draft || node.type !== 'logic' || logicModuleOf(draft.data) !== LOGIC_MODULE_SCRIPT) return;
    const script = typeof draft.data.script === 'string' ? draft.data.script : '';
    if (script !== (typeof node.data.script === 'string' ? node.data.script : '')) {
      refreshScriptExplanation(node.id, script, lang);
    }
  };

  const [showSyntaxWarn, setShowSyntaxWarn] = useState(false);
  const handleSave = () => {
    if (nameError) {
      setTab('general'); // đưa về tab General để người dùng thấy lỗi tên node
      return;
    }
    if (scriptError) {
      setTab('property'); // đưa về tab có ô script để người dùng thấy lỗi
      setShowSyntaxWarn(true);
      return;
    }
    maybeRefreshExplanation();
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
                {nodeTypeLabel(node.type, csMode)}
              </div>
              <div className="text-sm font-medium text-[var(--bk-text-muted)]">
                {t(csLogic ? 'exCsLogic' : explainKey(node.type))}
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
          {/* CS: tab General gộp luôn Property -> đặt tên "Property Settings / プロパティ設定"
              (dùng key tabProperty) để đồng bộ với TS sau này. */}
          <TabButton
            label={csMode ? t('tabProperty') : t('tabGeneral')}
            active={tab === 'general'}
            onClick={() => setTab('general')}
          />
          {/* CS: General gộp luôn Property -> không có tab Property riêng. */}
          {!csMode && (
            <TabButton
              label={t('tabProperty')}
              active={tab === 'property'}
              disabled={!hasProperty}
              onClick={() => setTab('property')}
            />
          )}
          <TabButton
            label={csLogic ? '分岐設定' : t('tabBranch')}
            active={tab === 'branch'}
            disabled={!hasBranch}
            onClick={() => setTab('branch')}
          />
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {tab === 'general' && (
          <>
            {/* CS: bỏ ô Mô tả; field property hiển thị ngay dưới Tên node. */}
            <GeneralTab label={editing.label} nameError={nameError} showDescription={!csMode} />
            {csMode && !csLogic && <PropertyTab node={node} data={editing.data} />}
          </>
        )}
        {tab === 'property' && <PropertyTab node={node} data={editing.data} />}
        {tab === 'branch' &&
          (csLogic ? (
            <CsLogicBranchEditor node={node} />
          ) : csMode && csEditableBranchNode(node.type) ? (
            <CsBranchTab node={node} data={editing.data} />
          ) : csMode ? (
            // CS: node có nhánh cố định (announce/transfer…) -> hiển thị read-only.
            <CsFixedBranchTab node={node} />
          ) : (
            <BranchTab node={node} data={editing.data} />
          ))}
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
          disabled={!dirty || !!nameError}
          className={[
            'rounded-lg px-5 py-2 text-sm font-semibold text-white transition',
            dirty && !nameError
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
function GeneralTab({
  label,
  nameError,
  showDescription = true,
}: {
  label: string;
  nameError: TKey | null;
  // Màn CS: General gộp Property và BỎ ô mô tả.
  showDescription?: boolean;
}) {
  const t = useT();
  const setDraftLabel = useFlowStore((s) => s.setDraftLabel);
  const setDraftField = useFlowStore((s) => s.setDraftField);
  const draft = useFlowStore((s) => s.draft);
  const description = typeof draft?.data.description === 'string' ? draft.data.description : '';

  return (
    <>
      <label className="block">
        <span className="text-xs font-medium text-[var(--bk-text-muted)]">{t('nodeName')}</span>
        {/* Tên node: ô tự cao khi text dài (không cho Enter) — cho xuống DUY NHẤT 1 dòng
            (tối đa 2 dòng, chặn bằng max-height ở .bk-name-autogrow). */}
        <AutoGrowTextarea
          className={`${inputClass} bk-autogrow bk-name-autogrow ${nameError ? '!border-rose-400 focus:!border-rose-400' : ''}`}
          value={label}
          onChange={setDraftLabel}
        />
        {nameError && <span className="mt-1 block text-xs text-rose-500">{t(nameError)}</span>}
      </label>
      {showDescription && (
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
      )}
    </>
  );
}

// ── Property ──────────────────────────────────────────────────────────────────
function PropertyTab({ node, data }: { node: FlowNode; data: Record<string, unknown> }) {
  const t = useT();
  const csMode = useWorkspaceStore((s) => s.mode === 'cs');
  const fields = propertyFieldsFor(node.type, csMode).filter((f) => !f.showIf || f.showIf(data));
  // Interaction có Template -> các tham số bị mẫu ÉP giá trị + khoá (không cho sửa).
  const locks = node.type === 'interaction' ? templateLocks(data) : {};
  if (fields.length === 0) {
    return <p className="text-sm text-[var(--bk-text-faint)]">{t('noPropertyNote')}</p>;
  }
  return (
    <div className="space-y-4">
      {fields.map((f) => (
        <FieldControl key={f.key} node={node} field={f} data={data} lockedValue={locks[f.key]} />
      ))}
    </div>
  );
}

function FieldControl({
  node,
  field,
  data,
  lockedValue,
}: {
  node: FlowNode;
  field: PropertyField;
  data: Record<string, unknown>;
  // Khác undefined -> tham số bị Template ÉP giá trị này + khoá (không cho sửa).
  lockedValue?: string;
}) {
  const t = useT();
  const setDraftField = useFlowStore((s) => s.setDraftField);
  const locked = lockedValue !== undefined;
  const raw = data[field.key];
  // YAML có thể trả số (retryCount: 2) -> ép về chuỗi để hiển thị/sửa nhất quán.
  // Tham số bị Template khoá: luôn hiển thị giá trị mẫu đã ép.
  const value = locked
    ? lockedValue
    : typeof raw === 'string' ? raw : typeof raw === 'number' ? String(raw) : field.default ?? '';
  const set = (v: string) => setDraftField(field.key, v);
  const label = <span className="text-xs font-medium text-[var(--bk-text-muted)]">{t(field.labelKey)}</span>;

  switch (field.kind) {
    case 'text':
      return (
        <label className="block">
          {label}
          {/* Text 1 dòng: chặn xuống dòng (dán nhiều dòng -> gộp về 1 dòng).
              readOnly (vd Nguồn ngày lễ): hiển thị mờ, không cho sửa. */}
          <input
            type="text"
            className={`${inputClass} ${field.readOnly ? 'cursor-not-allowed opacity-70' : ''}`}
            value={value}
            readOnly={field.readOnly}
            tabIndex={field.readOnly ? -1 : undefined}
            onChange={field.readOnly ? undefined : (e) => set(e.target.value.replace(/[\r\n]+/g, ' '))}
          />
        </label>
      );
    case 'searchSelect':
      return (
        <div className="block">
          {label}
          <SearchSelect field={field} value={value} onChange={set} />
        </div>
      );
    case 'pairs':
      return <PairsEditor data={data} />;
    case 'departments':
      return <DepartmentsEditor data={data} />;
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
    case 'time':
      // Giờ HH:mm:ss (vd 比較時点 của Date Of Call Classifier): chỉ nhận chữ số,
      // ':' tự chèn theo format — không gõ được text khác định dạng.
      return (
        <label className="block">
          {label}
          <input
            type="text"
            inputMode="numeric"
            className={inputClass}
            value={value}
            placeholder={field.placeholder}
            onChange={(e) => set(formatTimeInput(e.target.value))}
          />
        </label>
      );
    case 'textarea':
      // Prompt (OpenAI) có AI Generate -> dùng AiEditableField (loading + typing).
      if (field.aiGenerate) {
        return <AiEditableField node={node} field={field} value={value} onChange={set} data={data} />;
      }
      return (
        <label className="block">
          {label}
          <textarea
            className={`${inputClass} resize-y`}
            rows={field.rows ?? 3}
            value={value}
            placeholder={field.placeholder}
            onChange={(e) => set(e.target.value)}
          />
        </label>
      );
    case 'select':
      return (
        <label className="block">
          {label}
          {/* Template khoá -> disabled, hiển thị giá trị mẫu đã ép, không cho đổi. */}
          <select
            className={`${inputClass} ${locked ? 'cursor-not-allowed opacity-70' : ''}`}
            value={value}
            disabled={locked}
            onChange={locked ? undefined : (e) => set(e.target.value)}
          >
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
                  disabled={locked}
                  onClick={locked ? undefined : () => set(o.value)}
                  className={[
                    'flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition',
                    on
                      ? 'border-[var(--bk-accent)] bg-[var(--bk-accent-soft)] text-[var(--bk-accent)]'
                      : 'border-[var(--bk-border)] bg-[var(--bk-surface-2)] text-[var(--bk-text-muted)] hover:text-[var(--bk-text)]',
                    locked ? 'cursor-not-allowed opacity-70' : '',
                  ].join(' ')}
                >
                  {o.labelKey ? t(o.labelKey) : o.label}
                </button>
              );
            })}
          </div>
        </div>
      );
    case 'settingsSelect':
      return (
        <label className="block">
          {label}
          <SettingsSelect field={field} value={value} onChange={set} node={node} />
        </label>
      );
    case 'code':
      // Script (Logic) có AI Generate -> AiEditableField (loading + typing + giải thích).
      if (field.aiGenerate) {
        return <AiEditableField node={node} field={field} value={value} onChange={set} data={data} />;
      }
      return (
        <label className="block">
          {label}
          <div className="mt-1">
            <CodeEditor value={value} onChange={set} rows={field.rows ?? 12} language={field.language} />
          </div>
        </label>
      );
    case 'collapsibleTextarea':
      return <CollapsibleField field={field} value={value} onChange={set} />;
  }
}

// Pulldown option động từ tab Status Settings (状態 / SMSフラグ) — dùng cho
// Status/SMS Flag của node Transfer/Hangup màn CS. Value lưu là SỐ flag (chuỗi).
function SettingsSelect({
  field,
  value,
  onChange,
  node,
}: {
  field: PropertyField;
  value: string;
  onChange: (v: string) => void;
  node: FlowNode;
}) {
  const t = useT();
  const ir = useFlowStore((s) => s.ir);
  const settings = ensureSettings(ir?.settings);
  // Nhãn option dạng "0 - 途中切断" (flag - tên) — đồng bộ với tab Announce List.
  const options =
    field.settingsOptions === 'smsFlags'
      ? settings.smsFlags.map((s) => ({ value: String(s.flag), label: `${s.flag} - ${s.type || '—'}` }))
      : settings.statuses.map((s) => ({ value: String(s.flag), label: `${s.flag} - ${s.name}` }));
  // Status/SMS flag KẾ THỪA từ node phía trên (tự fill): khi node chưa tự đặt flag, ô
  // "chưa chọn" hiển thị flag kế thừa để người dùng biết giá trị mặc định đang áp dụng.
  const inherited = useMemo(() => computeInheritedFlags(ir), [ir]);
  const inheritedValue =
    field.settingsOptions === 'smsFlags'
      ? inherited.get(node.id)?.smsFlag
      : inherited.get(node.id)?.statusFlag;
  const inheritedLabel = inheritedValue
    ? options.find((o) => o.value === inheritedValue)?.label ?? inheritedValue
    : '';
  return (
    <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
      {/* Ô rỗng: nếu có flag kế thừa từ thượng nguồn -> hiện "継承: <flag>" (đang tự fill). */}
      <option value="">{inheritedValue ? `${t('flagInherit')}: ${inheritedLabel}` : t('alUnset')}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
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

// ── searchSelect: pulldown gõ để lọc ─────────────────────────────────────────
// Option lấy động từ IR (node Interaction / context đã lưu / sub flow). Gõ chữ để
// lọc; giá trị gõ tự do vẫn được giữ (lenient) để không chặn dữ liệu chưa có nguồn.
function SearchSelect({
  field,
  value,
  onChange,
}: {
  field: PropertyField;
  value: string;
  onChange: (v: string) => void;
}) {
  const t = useT();
  const ir = useFlowStore((s) => s.ir);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Option lấy trên TÀI LIỆU ĐẦY ĐỦ (main flow + mọi sub flow) — không chỉ flow
  // đang mở. `ir` trong deps để danh sách cập nhật theo mỗi thay đổi. Nguồn
  // 'nodeAndContexts' chia 2 nhóm Node / Context (mỗi nhóm có tiêu đề).
  const groups = useMemo(() => {
    if (!field.optionsFrom) return [];
    const doc = useFlowStore.getState().assembleDoc();
    return optionGroupsForSource(field.optionsFrom, doc);
  }, [field.optionsFrom, ir]); // eslint-disable-line react-hooks/exhaustive-deps
  const query = value.trim().toLowerCase();
  // Đang gõ -> lọc theo chữ; giá trị khớp hẳn 1 option -> hiện đủ danh sách để đổi nhanh.
  const exact = groups.some((g) => g.items.some((o) => o.toLowerCase() === query));
  const visibleGroups = groups
    .map((g) => ({
      ...g,
      items: query && !exact ? g.items.filter((o) => o.toLowerCase().includes(query)) : g.items,
    }))
    .filter((g) => g.items.length > 0);

  // Node Jump trỏ tới sub flow -> hiện logo Sub Flow (màu cau) cạnh mỗi lựa chọn
  // + trước giá trị đang chọn (đồng bộ với modal AI Generate).
  const isSubflow = field.optionsFrom === 'subflows';
  const showGlyph = isSubflow && value.trim().length > 0;

  return (
    <div className="relative" ref={wrapRef}>
      {showGlyph && (
        <FlowGlyph isMain={false} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2" />
      )}
      <input
        type="text"
        className={`${inputClass} pr-8 ${showGlyph ? 'pl-8' : ''}`}
        value={value}
        placeholder={t('searchSelectPlaceholder')}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          onChange(e.target.value.replace(/[\r\n]+/g, ' '));
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
          {visibleGroups.length === 0 ? (
            <div className="px-2.5 py-2 text-xs text-[var(--bk-text-faint)]">{t('searchSelectEmpty')}</div>
          ) : (
            visibleGroups.map((g, gi) => (
              <div key={g.labelKey ?? gi}>
                {/* Tiêu đề nhóm (Node / Context) — style giống section header ở panel setting/flow. */}
                {g.labelKey && (
                  <div className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-[var(--bk-text-faint)]">
                    {t(g.labelKey)}
                  </div>
                )}
                {g.items.map((o) => (
                  <button
                    key={o}
                    type="button"
                    // mousedown (trước blur) để click chọn không bị dropdown đóng "nuốt" mất.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onChange(o);
                      setOpen(false);
                    }}
                    className={[
                      'flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-sm transition',
                      o === value
                        ? 'bg-[var(--bk-accent-soft)] font-medium text-[var(--bk-accent)]'
                        : 'text-[var(--bk-text)] hover:bg-[var(--bk-surface-2)]',
                    ].join(' ')}
                    title={o}
                  >
                    {/* Logo Sub Flow bám sát text (chỉ ở pulldown chọn sub flow của Jump). */}
                    <span className="min-w-0 truncate">{o}</span>
                    {isSubflow && <FlowGlyph isMain={false} className="ml-1.5" />}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Pairs (Context Match Router) ─────────────────────────────────────────────
// Mỗi Pair = output của Node-Context 1 × output của Node-Context 2. Pair 1 không
// xoá được; các Pair sau thêm/xoá tự do. Nhánh (Branch Settings) sinh tự động từ
// danh sách này (value ^Pair{n}$) — xem effectiveBranches.
function PairsEditor({ data }: { data: Record<string, unknown> }) {
  const t = useT();
  const setDraftField = useFlowStore((s) => s.setDraftField);
  const pairs = readPairs(data);

  const update = (index: number, side: 'left' | 'right', v: string) => {
    const next = pairs.map((p, i) => (i === index ? { ...p, [side]: v.replace(/[\r\n]+/g, ' ') } : p));
    setDraftField('pairs', next);
  };
  const add = () => setDraftField('pairs', [...pairs, { left: '', right: '' }]);
  const remove = (index: number) => {
    if (index === 0) return; // Pair 1 cố định
    setDraftField('pairs', pairs.filter((_, i) => i !== index));
  };

  return (
    <div className="block space-y-2.5">
      {pairs.map((p, i) => (
        <div key={i}>
          <span className="text-xs font-medium text-[var(--bk-text-muted)]">{`${t('fPairs')} ${i + 1}`}</span>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="text"
              className={`${inputClass} !mt-0 flex-1`}
              value={p.left}
              placeholder={t('pairLeftPh')}
              onChange={(e) => update(i, 'left', e.target.value)}
            />
            {/* Dấu × giữa 2 output: pair khớp khi CẢ 2 giá trị cùng khớp. */}
            <Icon icon="lucide:x" width={16} height={16} className="shrink-0 text-[var(--bk-text-faint)]" />
            <input
              type="text"
              className={`${inputClass} !mt-0 flex-1`}
              value={p.right}
              placeholder={t('pairRightPh')}
              onChange={(e) => update(i, 'right', e.target.value)}
            />
            {i === 0 ? (
              <span className="w-8 shrink-0" aria-hidden />
            ) : (
              <button
                type="button"
                onClick={() => remove(i)}
                title={t('deletePair')}
                aria-label={t('deletePair')}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--bk-text-faint)] transition hover:bg-[color-mix(in_srgb,#dc2626_12%,transparent)] hover:text-rose-500"
              >
                <Icon icon="lucide:trash-2" width={15} height={15} />
              </button>
            )}
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="flex items-center gap-2 rounded-lg border border-dashed border-[var(--bk-border)] px-3 py-2 text-sm font-medium text-[var(--bk-text-muted)] transition hover:border-[var(--bk-accent)] hover:text-[var(--bk-accent)]"
      >
        <Icon icon="lucide:plus" width={16} height={16} />
        {t('addPair')}
      </button>
    </div>
  );
}

// ── Departments (Clinical Department Classifier) ─────────────────────────────
// Mỗi set = List khoa khám ("Khoa1;Khoa2;…") -> Tên output. Set 1 không xoá được;
// các set sau thêm/xoá tự do. Nhánh (Branch Settings) sinh tự động từ Tên output
// (value = label = output) — xem clinicalDepartmentBranches.
function DepartmentsEditor({ data }: { data: Record<string, unknown> }) {
  const t = useT();
  const setDraftDepartments = useFlowStore((s) => s.setDraftDepartments);
  const items = readClinicalDepartments(data);

  const update = (index: number, side: 'list' | 'output', v: string) => {
    const next = items.map((d, i) => (i === index ? { ...d, [side]: v.replace(/[\r\n]+/g, ' ') } : d));
    setDraftDepartments(next);
  };
  const add = () => setDraftDepartments([...items, { list: '', output: '' }]);
  const remove = (index: number) => {
    if (index === 0) return; // Set 1 cố định
    setDraftDepartments(items.filter((_, i) => i !== index));
  };

  return (
    <div className="block space-y-3">
      {items.map((d, i) => (
        <div key={i} className="rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface-2)] p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--bk-text-muted)]">{`${t('fClinicalDeptList')} ${i + 1}`}</span>
            {i > 0 && (
              <button
                type="button"
                onClick={() => remove(i)}
                title={t('deleteDepartment')}
                aria-label={t('deleteDepartment')}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--bk-text-faint)] transition hover:bg-[color-mix(in_srgb,#dc2626_12%,transparent)] hover:text-rose-500"
              >
                <Icon icon="lucide:trash-2" width={15} height={15} />
              </button>
            )}
          </div>
          <input
            type="text"
            className={`${inputClass} font-mono`}
            value={d.list}
            placeholder={t('deptListPh')}
            onChange={(e) => update(i, 'list', e.target.value)}
          />
          <span className="mt-2 block text-xs font-medium text-[var(--bk-text-muted)]">{`${t('fResultName')} ${i + 1}`}</span>
          <input
            type="text"
            className={inputClass}
            value={d.output}
            placeholder={t('deptOutputPh')}
            onChange={(e) => update(i, 'output', e.target.value)}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="flex items-center gap-2 rounded-lg border border-dashed border-[var(--bk-border)] px-3 py-2 text-sm font-medium text-[var(--bk-text-muted)] transition hover:border-[var(--bk-accent)] hover:text-[var(--bk-accent)]"
      >
        <Icon icon="lucide:plus" width={16} height={16} />
        {t('addDepartment')}
      </button>
    </div>
  );
}

// ── Branch ────────────────────────────────────────────────────────────────────
interface TargetInfo {
  label: string;
  color: string;
}

// Branch Settings màn CS (node KHÔNG phải logic): 1 cột ĐIỀU KIỆN (chữ thường,
// không cú pháp ^$, không tách Value/Label) + cột NODE căn TRÁI. Thêm/sửa/xoá
// điều kiện tự do; hàng else (default) không xoá được.
function CsBranchTab({ node, data }: { node: FlowNode; data: Record<string, unknown> }) {
  const t = useT();
  const ir = useFlowStore((s) => s.ir);
  const setDraftField = useFlowStore((s) => s.setDraftField);
  const branches = csBranchesOf(node.type, data);
  const write = (list: DataBranch[]) => setDraftField('branches', list);

  const setCondition = (id: string, text: string) =>
    write(
      branches.map((b) => (b.id === id ? { ...b, label: text.replace(/[\r\n]+/g, ' ') } : b)),
    );
  const add = () => {
    const used = new Set(branches.map((b) => b.id));
    let i = 0;
    let id = `b${i}`;
    while (used.has(id)) id = `b${++i}`;
    write([...branches, { id, value: '' }]);
  };
  const remove = (id: string) => {
    if (id === CATCH_ALL_ID) return; // nhánh else luôn giữ
    write(branches.filter((b) => b.id !== id));
  };

  // Đích của 1 nhánh = target của edge xuất phát từ handle đó (IR đã commit).
  const targetInfo = (handleId: string): TargetInfo | null => {
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
      <div className="space-y-2.5">
        <div className="bk-branch-row bk-branch-head">
          <div className="bk-branch-cond">{t('branchColCondition')}</div>
          <span className="bk-branch-arrow-spacer" aria-hidden />
          <div className="bk-branch-target bk-branch-target--left">{t('branchColNode')}</div>
          <span className="bk-branch-del-spacer" aria-hidden />
        </div>
        {branches.map((b) => (
          <div key={b.id} className="bk-branch-row">
            <div className="bk-branch-cond">
              <input
                type="text"
                className={`${inputClass} !mt-0 w-full`}
                value={b.label ?? ''}
                placeholder={t('branchConditionCsPlaceholder')}
                onChange={(e) => setCondition(b.id, e.target.value)}
              />
            </div>
            <Icon icon="fluent:flow-dot-20-filled" width={18} height={18} className="bk-branch-arrow" />
            <div className="bk-branch-target bk-branch-target--left">
              <BranchTarget info={targetInfo(b.id)} />
            </div>
            {b.id === CATCH_ALL_ID ? (
              <span className="bk-branch-del-spacer" aria-hidden />
            ) : (
              <button
                type="button"
                onClick={() => remove(b.id)}
                title={t('deleteBranch')}
                aria-label={t('deleteBranch')}
                className="bk-branch-del"
              >
                <Icon icon="lucide:trash-2" width={16} height={16} />
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={add}
        className="flex items-center gap-2 rounded-lg border border-dashed border-[var(--bk-border)] px-3 py-2 text-sm font-medium text-[var(--bk-text-muted)] transition hover:border-[var(--bk-accent)] hover:text-[var(--bk-accent)]"
      >
        <Icon icon="lucide:plus" width={16} height={16} />
        {t('addCondition')}
      </button>
    </div>
  );
}

// Branch Settings màn CS cho node có nhánh CỐ ĐỊNH (announce: 次へ; transfer: 失敗/次へ):
// READ-ONLY — chỉ hiện nhãn nhánh + node đích, không sửa/thêm/xoá. 1 cột nhãn +
// cột NODE căn TRÁI, đồng bộ layout với CsBranchTab.
function CsFixedBranchTab({ node }: { node: FlowNode }) {
  const t = useT();
  const ir = useFlowStore((s) => s.ir);
  const fixed = BRANCH_SCHEMA[node.type].fixed ?? [];

  const targetInfo = (handleId: string): TargetInfo | null => {
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
      <p className="text-xs text-[var(--bk-text-faint)]">{t('branchFixedNote')}</p>
      <div className="space-y-2.5">
        <div className="bk-branch-row bk-branch-head">
          <div className="bk-branch-cond">{t('branchColCondition')}</div>
          <span className="bk-branch-arrow-spacer" aria-hidden />
          <div className="bk-branch-target bk-branch-target--left">{t('branchColNode')}</div>
        </div>
        {fixed.map((b) => (
          <div key={b.id} className="bk-branch-row">
            <div className="bk-branch-cond">
              <HoverTip className="bk-branch-fixed" content={b.label ?? ''}>
                {b.label ?? ''}
              </HoverTip>
            </div>
            <Icon icon="fluent:flow-dot-20-filled" width={18} height={18} className="bk-branch-arrow" />
            <div className="bk-branch-target bk-branch-target--left">
              <BranchTarget info={targetInfo(b.id)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
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
                  <HoverTip className="bk-branch-fixed" content={value}>
                    {value}
                  </HoverTip>
                </div>
                <div className="bk-branch-label-col">
                  {/* LABEL: nhãn hiển thị (次へ / 失敗), read-only. */}
                  <HoverTip className="bk-branch-fixed" content={label}>
                    {label}
                  </HoverTip>
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

  // Node logic (Context Match Router): nhánh SINH TỪ Pair — value ^Pair{n}$ khoá cứng,
  // label sửa được, KHÔNG thêm/xoá nhánh ở đây (thêm/xoá Pair bên tab Property).
  const pairMode = isPairBranchNode(node.type, data);
  // Module có bộ nhánh CỐ ĐỊNH (Incoming Classifier / Date Of Call Classifier):
  // value + label khoá cứng, không thêm/xoá nhánh.
  const fixedModule = fixedModuleBranches(node.type, data) !== null;
  // Node logic (Module Result Binder): value catch-all SỬA ĐƯỢC (vẫn không xoá được).
  const editableCatchAll = catchAllEditable(node.type, data);

  // Nhánh tự do (nexus/logic/jump): nhánh catch-all (^.*$) đứng đầu, không sửa/xoá;
  // các nhánh còn lại thêm/sửa/xoá tuỳ ý. "+ Thêm nhánh" để thêm.
  const branches =
    pairMode || fixedModule ? effectiveBranches(node.type, data) : readBranches(data);
  const catchAllValue = catchAllDisplay(branches);
  // Clinic Days Classifier / Phone Type Classifier: nhánh catch-all (診療日/その他) để
  // CUỐI cùng theo yêu cầu; các module/loại khác giữ catch-all ở trên đầu như cũ.
  const catchAllModule = logicModuleOf(data);
  const catchAllLast =
    node.type === 'classifier' &&
    (catchAllModule === LOGIC_MODULE_CDC || catchAllModule === LOGIC_MODULE_PHONE_TYPE);
  const catchAllBranch = branches.filter((b) => b.id === CATCH_ALL_ID);
  const otherBranches = branches.filter((b) => b.id !== CATCH_ALL_ID);
  const ordered = catchAllLast
    ? [...otherBranches, ...catchAllBranch]
    : [...catchAllBranch, ...otherBranches];

  return (
    <div className="space-y-3">
      {pairMode && <p className="text-xs text-[var(--bk-text-faint)]">{t('branchPairNote')}</p>}
      {fixedModule && <p className="text-xs text-[var(--bk-text-faint)]">{t('branchFixedNote')}</p>}
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
                {isCatchAll && editableCatchAll ? (
                  // MRB: catch-all sửa được value như nhánh thường (không xoá được).
                  <RegexBranchInput
                    className={`${inputClass} !mt-0 w-full font-mono`}
                    value={b.value}
                    placeholder={t('branchConditionPlaceholder')}
                    onChange={(v) => draftUpdateBranch(b.id, v)}
                  />
                ) : isCatchAll && fixedModule && b.value ? (
                  // Catch-all có value cố định theo module (DOCC: ^ERROR$) — khoá cứng.
                  <HoverTip className="bk-branch-fixed" content={`^${b.value}$`}>
                    {`^${b.value}$`}
                  </HoverTip>
                ) : isCatchAll ? (
                  // Read-only nhưng vẫn cho trỏ chuột vào & KÉO để cuộn xem hết chuỗi dài;
                  // hover mà bị cắt "…" -> tooltip full text (xem ReadonlyBranchValue).
                  <ReadonlyBranchValue
                    className={`${inputClass} !mt-0 w-full font-mono bk-branch-catchall`}
                    value={catchAllValue}
                  />
                ) : pairMode || fixedModule ? (
                  // Value khoá cứng: nhánh Pair (^Pair{n}$) / bộ nhánh cố định của IC & DOCC.
                  <HoverTip className="bk-branch-fixed" content={`^${b.value}$`}>
                    {`^${b.value}$`}
                  </HoverTip>
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
                {fixedModule ? (
                  // IC/DOCC: label cũng thuộc bộ chuẩn (その他/エラー/…) — read-only.
                  <HoverTip className="bk-branch-fixed" content={b.label ?? ''}>
                    {b.label ?? ''}
                  </HoverTip>
                ) : (
                  <input
                    type="text"
                    className={`${inputClass} !mt-0 w-full`}
                    value={b.label ?? ''}
                    placeholder={t('branchLabelPlaceholder')}
                    onChange={(e) => draftSetBranchLabel(b.id, e.target.value.replace(/[\r\n]+/g, ' '))}
                  />
                )}
              </div>
              <Icon icon="fluent:flow-dot-20-filled" width={18} height={18} className="bk-branch-arrow" />
              <div className="bk-branch-target">
                <BranchTarget info={targetInfo(b.id)} />
              </div>
              {isCatchAll || pairMode || fixedModule ? (
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
      {!pairMode && !fixedModule && (
        <button
          type="button"
          onClick={draftAddBranch}
          className="flex items-center gap-2 rounded-lg border border-dashed border-[var(--bk-border)] px-3 py-2 text-sm font-medium text-[var(--bk-text-muted)] transition hover:border-[var(--bk-accent)] hover:text-[var(--bk-accent)]"
        >
          <Icon icon="lucide:plus" width={16} height={16} />
          {t('addBranch')}
        </button>
      )}
    </div>
  );
}

// Ô value read-only (nhánh catch-all): không cho sửa nhưng vẫn cho trỏ chuột vào &
// KÉO để cuộn ngang xem hết chuỗi dài; nếu bị cắt "…" thì hover hiện tooltip full text
// (giống preview property trên canvas). Không dùng title gốc -> tránh 2 tầng tooltip.
function ReadonlyBranchValue({ value, className }: { value: string; className: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const { onMouseEnter, onMouseLeave, tip } = useClipTip(ref, value);
  return (
    <>
      <input
        ref={ref}
        className={className}
        value={value}
        readOnly
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      />
      {tip}
    </>
  );
}

// Đích jump hiển thị dạng "tag" nền = màu đại diện của node đích; "chưa nối" nếu chưa có dây.
function BranchTarget({ info }: { info: TargetInfo | null }) {
  const t = useT();
  if (!info) {
    return <span className="bk-branch-none">{t('branchTargetNone')}</span>;
  }
  // Tên node dài -> cắt "…"; hover xem đầy đủ (tooltip nổi).
  return (
    <HoverTip className="bk-branch-tag" style={{ '--tagc': info.color } as CSSProperties} content={info.label}>
      {info.label}
    </HoverTip>
  );
}
