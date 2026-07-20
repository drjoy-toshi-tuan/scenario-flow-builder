import { useFlowStore } from '../store/flowStore';
import type { FlowNode } from '../ir/types';
import { fieldsFor, modeledKeysFor, type DesignField } from '../ir/designYaml/blockSchema';
import type { DesignBlockType } from '../ir/designYaml/blockTypeMap';

// ─────────────────────────────────────────────────────────────────────────────
// Tab Property CHO NODE 設計書 (blockType đến từ pipeline gen_flow, khác hẳn
// PROPERTY_FIELDS/nodeSchema.ts vốn keyed theo NodeType của webapp). Field bắt
// buộc/khuyến nghị lấy từ blockSchema.ts (chính bản: qa_validator.py::
// BLOCK_REQUIRED_FIELDS). Nhánh (conditions/next) KHÔNG sửa ở đây — dùng editor
// nhánh có sẵn của canvas (tab Rẽ nhánh), vì node.data.branches đã được nạp sẵn
// từ fromDesignYaml.ts.
//
// "Field khác": mọi key trong node.data chưa có form riêng (chưa kiểm chứng đủ
// để làm ô riêng, hoặc field lạ của pipeline chưa hỗ trợ) vẫn sửa được ở đây —
// đảm bảo KHÔNG mất dữ liệu khi lưu lại (xem toDesignYaml.ts).
// ─────────────────────────────────────────────────────────────────────────────

const inputClass =
  'mt-1 w-full rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface-2)] px-3 py-2 text-sm text-[var(--bk-text)] outline-none transition focus:border-[var(--bk-accent)]';

const STRUCTURAL_DATA_KEYS = new Set(['blockType', 'conditions', 'branches']);

function toListText(value: unknown): string {
  return Array.isArray(value) ? value.map((v) => String(v)).join('\n') : '';
}

function fromListText(text: string): string[] {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

function DesignFieldControl({ field, data, required }: { field: DesignField; data: Record<string, unknown>; required: boolean }) {
  const setDraftField = useFlowStore((s) => s.setDraftField);
  const raw = data[field.key];
  const label = (
    <span className="text-xs font-medium text-[var(--bk-text-muted)]">
      {field.label}
      {required && <span className="ml-0.5 text-[var(--bk-danger,#e5484d)]">*</span>}
    </span>
  );

  if (field.kind === 'list') {
    return (
      <label className="block">
        {label}
        <textarea
          className={`${inputClass} min-h-[80px]`}
          value={toListText(raw)}
          placeholder="1行に1件"
          onChange={(e) => setDraftField(field.key, fromListText(e.target.value))}
        />
      </label>
    );
  }

  if (field.kind === 'select') {
    const value = typeof raw === 'string' ? raw : '';
    return (
      <label className="block">
        {label}
        <select className={inputClass} value={value} onChange={(e) => setDraftField(field.key, e.target.value)}>
          <option value="">（未設定）</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </label>
    );
  }

  const value = typeof raw === 'string' ? raw : typeof raw === 'number' ? String(raw) : '';
  if (field.kind === 'textarea') {
    return (
      <label className="block">
        {label}
        <textarea className={`${inputClass} min-h-[80px]`} value={value} onChange={(e) => setDraftField(field.key, e.target.value)} />
      </label>
    );
  }

  return (
    <label className="block">
      {label}
      <input type="text" className={inputClass} value={value} onChange={(e) => setDraftField(field.key, e.target.value)} />
    </label>
  );
}

// Field lạ (chưa có form riêng) — sửa dạng JSON thô để không mất kiểu dữ liệu
// gốc (string/number/array/object). Parse lỗi -> giữ nguyên chuỗi vừa gõ.
function RawFieldControl({ dataKey, data }: { dataKey: string; data: Record<string, unknown> }) {
  const setDraftField = useFlowStore((s) => s.setDraftField);
  const raw = data[dataKey];
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw ?? null);
  return (
    <label className="block">
      <span className="text-xs font-medium text-[var(--bk-text-muted)]">{dataKey}</span>
      <input
        type="text"
        className={inputClass}
        value={text}
        onChange={(e) => {
          const next = e.target.value;
          try {
            setDraftField(dataKey, JSON.parse(next));
          } catch {
            setDraftField(dataKey, next);
          }
        }}
      />
    </label>
  );
}

export function DesignBlockPropertyTab({
  node,
  data,
  blockType,
}: {
  node: FlowNode;
  data: Record<string, unknown>;
  blockType: DesignBlockType;
}) {
  const schema = fieldsFor(blockType);
  const modeled = modeledKeysFor(blockType);
  const rawKeys = Object.keys(data).filter((k) => !STRUCTURAL_DATA_KEYS.has(k) && !modeled.has(k));

  return (
    <div className="space-y-4">
      <p className="text-xs text-[var(--bk-text-faint)]">
        ブロック型（設計書）: <code>{blockType}</code>
        {node.type === 'interaction' || node.type === 'faq' || node.type === 'openai' || node.type === 'transfer'
          ? ' — 分岐がある場合、直後の「〇〇：分岐」ノードで設定（このノード自体は固定2出力）'
          : ' — 分岐/次の遷移先は「Rẽ nhánh」タブで設定'}
      </p>

      {schema.required.length > 0 && (
        <div className="space-y-3">
          {schema.required.map((f) => (
            <DesignFieldControl key={f.key} field={f} data={data} required />
          ))}
        </div>
      )}

      {schema.optional.length > 0 && (
        <div className="space-y-3 border-t border-[var(--bk-border)] pt-3">
          {schema.optional.map((f) => (
            <DesignFieldControl key={f.key} field={f} data={data} required={false} />
          ))}
        </div>
      )}

      {rawKeys.length > 0 && (
        <div className="space-y-3 border-t border-[var(--bk-border)] pt-3">
          <p className="text-xs font-medium text-[var(--bk-text-faint)]">その他のフィールド（{node.id}）</p>
          {rawKeys.map((k) => (
            <RawFieldControl key={k} dataKey={k} data={data} />
          ))}
        </div>
      )}

      {schema.required.length === 0 && schema.optional.length === 0 && rawKeys.length === 0 && (
        <p className="text-sm text-[var(--bk-text-faint)]">このブロック型は追加フィールドがありません。</p>
      )}
    </div>
  );
}
