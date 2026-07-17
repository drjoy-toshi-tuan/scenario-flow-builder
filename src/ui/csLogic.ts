import type { FlowIR, FlowNode } from '../ir/types';
import { CATCH_ALL_ID, type DataBranch } from './nodeSchema';

// ─────────────────────────────────────────────────────────────────────────────
// Node 分岐ロジック của màn CS: nhánh KHÔNG viết regex mà là "câu điều kiện" có
// cấu trúc — chọn [dữ liệu gì] → [so sánh thế nào] → [với giá trị nào].
//
// Lưu trữ trong node.data:
//   - data.csConditions: CsBranch[]  ← nguồn sự thật của màn CS (spec cho TS đọc)
//   - data.branches:     DataBranch[] ← BẢN SYNC (id/label = tên nhánh) để toàn bộ
//     cơ chế sẵn có (handle output, dây nối, commitDraft, toYaml) chạy y như cũ.
// Nhánh else (その他) chính là catch-all 'default' — luôn có, không xoá được.
//
// Mọi nhãn ở đây là TIẾNG NHẬT CỐ ĐỊNH (spec UI của team CS, không theo i18n).
// Module thuần (không import React) — dùng chung cho panel + BaseNode preview.
// ─────────────────────────────────────────────────────────────────────────────

// Loại giá trị của 1 nguồn dữ liệu — quyết định bộ toán tử + kiểu ô nhập.
export type CsValueType = 'phone' | 'time' | 'day' | 'text';

// Nguồn 通話情報 (không thuộc node nào) — id lưu trong CsCondition.source.
export const CS_CALL_SOURCES: readonly { id: string; label: string; type: CsValueType }[] = [
  { id: 'callerNumber', label: '発信元電話番号', type: 'phone' },
  { id: 'callTime', label: '受電時刻', type: 'time' },
  { id: 'callDay', label: '受電曜日', type: 'day' },
];

// Nguồn "kết quả node trước": lưu dạng 'node:<nodeId>' để đổi tên node không vỡ rule.
const NODE_SOURCE_PREFIX = 'node:';
export function nodeSource(nodeId: string): string {
  return NODE_SOURCE_PREFIX + nodeId;
}
export function nodeIdOfSource(source: string): string | null {
  return source.startsWith(NODE_SOURCE_PREFIX) ? source.slice(NODE_SOURCE_PREFIX.length) : null;
}

// Kiểu ô nhập giá trị của 1 toán tử.
export type CsOperatorValue =
  | 'none' // không cần nhập giá trị (vd 携帯電話である)
  | 'text' // 1 ô text
  | 'range' // 2 ô (từ〜đến) — dùng cho 受電時刻の間
  | 'dayset'; // pulldown chọn nhóm ngày (平日/土日祝/…)

export interface CsOperator {
  id: string;
  label: string; // đuôi câu tiếng Nhật: 「090」で始まる / 携帯電話である …
  value: CsOperatorValue;
}

// Bộ toán tử theo loại giá trị — thứ tự = thứ tự hiển thị trong pulldown.
export const CS_OPERATORS: Record<CsValueType, readonly CsOperator[]> = {
  phone: [
    { id: 'startsWith', label: 'で始まる', value: 'text' },
    { id: 'equals', label: 'と等しい', value: 'text' },
    { id: 'contains', label: 'を含む', value: 'text' },
    { id: 'isMobile', label: '携帯電話である', value: 'none' },
    { id: 'isLandline', label: '固定電話である', value: 'none' },
    { id: 'isAnonymous', label: '非通知である', value: 'none' },
  ],
  time: [
    { id: 'between', label: 'の間', value: 'range' },
    { id: 'before', label: 'より前', value: 'text' },
    { id: 'after', label: 'より後', value: 'text' },
  ],
  day: [{ id: 'is', label: 'である', value: 'dayset' }],
  text: [
    { id: 'equals', label: 'と等しい', value: 'text' },
    { id: 'contains', label: 'を含む', value: 'text' },
    { id: 'startsWith', label: 'で始まる', value: 'text' },
    { id: 'isEmpty', label: '未入力である', value: 'none' },
  ],
};

// Nhóm ngày cho toán tử 受電曜日である.
export const CS_DAY_SETS: readonly string[] = [
  '平日',
  '土日祝',
  '月曜',
  '火曜',
  '水曜',
  '木曜',
  '金曜',
  '土曜',
  '日曜',
  '祝日',
];

// Nhãn nhánh else (catch-all) — hiện trên dây + panel, không xoá được.
export const CS_ELSE_LABEL = 'その他';

// 1 dòng điều kiện: [source] が [value] [operator].
export interface CsCondition {
  source: string; // id trong CS_CALL_SOURCES hoặc 'node:<nodeId>'
  operator: string; // id trong CS_OPERATORS theo loại của source
  value: string;
  value2: string; // chỉ dùng cho toán tử 'range' (の間)
}

// 1 nhánh = 1 thẻ trong panel: các điều kiện kết hợp AND (すべて) / OR (いずれか).
export interface CsBranch {
  id: string; // = DataBranch.id = sourceHandle của dây
  name: string; // tên nhánh — label trên dây + tag trên canvas
  combinator: 'and' | 'or';
  conditions: CsCondition[];
}

// Loại giá trị của 1 source ('node:...' → text; không nhận diện được → text).
export function sourceValueType(source: string): CsValueType {
  return CS_CALL_SOURCES.find((s) => s.id === source)?.type ?? 'text';
}

// Bộ toán tử áp dụng cho 1 source.
export function operatorsFor(source: string): readonly CsOperator[] {
  return CS_OPERATORS[sourceValueType(source)];
}

// Toán tử đang chọn của 1 điều kiện (lệch loại/không tồn tại → toán tử đầu danh sách).
export function operatorOf(cond: CsCondition): CsOperator {
  const ops = operatorsFor(cond.source);
  return ops.find((o) => o.id === cond.operator) ?? ops[0];
}

// Điều kiện mặc định khi bấm "＋ 条件を追加".
export function newCsCondition(): CsCondition {
  return { source: 'callerNumber', operator: 'startsWith', value: '', value2: '' };
}

// Đọc data.csConditions (an toàn kiểu — dữ liệu từ YAML có thể lệch dạng).
export function readCsBranches(data: Record<string, unknown>): CsBranch[] {
  const raw = data.csConditions;
  if (!Array.isArray(raw)) return [];
  const branches: CsBranch[] = [];
  for (const b of raw) {
    if (!b || typeof b !== 'object') continue;
    const o = b as Record<string, unknown>;
    if (typeof o.id !== 'string' || o.id === CATCH_ALL_ID) continue;
    const conds = Array.isArray(o.conditions)
      ? (o.conditions as unknown[])
          .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
          .map((c) => ({
            source: typeof c.source === 'string' ? c.source : 'callerNumber',
            operator: typeof c.operator === 'string' ? c.operator : 'startsWith',
            value: typeof c.value === 'string' ? c.value : '',
            value2: typeof c.value2 === 'string' ? c.value2 : '',
          }))
      : [];
    branches.push({
      id: o.id,
      name: typeof o.name === 'string' ? o.name : '',
      combinator: o.combinator === 'or' ? 'or' : 'and',
      conditions: conds.length > 0 ? conds : [newCsCondition()],
    });
  }
  return branches;
}

// Sync CsBranch[] -> data.branches (DataBranch[]): mỗi nhánh 1 handle, value/label =
// tên nhánh; else = catch-all その他 đứng CUỐI (thứ tự đánh giá trên xuống của CS).
export function csBranchesToDataBranches(branches: CsBranch[]): DataBranch[] {
  const list: DataBranch[] = branches.map((b) => ({
    id: b.id,
    value: b.name,
    label: b.name || undefined,
  }));
  list.push({ id: CATCH_ALL_ID, value: '', label: CS_ELSE_LABEL });
  return list;
}

// id nhánh mới b0, b1, … (không đụng catch-all 'default').
export function nextCsBranchId(branches: CsBranch[]): string {
  const used = new Set(branches.map((b) => b.id));
  let i = 0;
  let id = `b${i}`;
  while (used.has(id)) id = `b${++i}`;
  return id;
}

// Tên nhánh mặc định 分岐1, 分岐2, … (duy nhất trong node).
export function nextCsBranchName(branches: CsBranch[]): string {
  const used = new Set(branches.map((b) => b.name));
  let i = 1;
  while (used.has(`分岐${i}`)) i++;
  return `分岐${i}`;
}

// ── Nguồn dữ liệu khả dụng cho pulldown「データ」 ────────────────────────────
// 通話情報 (cố định) + kết quả các node 聴取 (interaction) khác trong flow đang mở.
export interface CsSourceOption {
  id: string;
  label: string;
}
export interface CsSourceGroup {
  label: string;
  items: CsSourceOption[];
}

export function csSourceGroups(ir: FlowIR | null, selfId: string): CsSourceGroup[] {
  const nodeItems = (ir?.nodes ?? [])
    .filter((n) => n.type === 'interaction' && n.id !== selfId)
    .map((n) => ({ id: nodeSource(n.id), label: `聴取「${n.label.trim() || n.id}」の結果` }));
  return [
    { label: '通話情報', items: CS_CALL_SOURCES.map((s) => ({ id: s.id, label: s.label })) },
    { label: '前のノードの結果', items: nodeItems },
  ];
}

// Nhãn hiển thị của 1 source (node đã bị xoá → hiện id thô để người dùng biết sửa).
export function csSourceLabel(source: string, ir: FlowIR | null): string {
  const fixed = CS_CALL_SOURCES.find((s) => s.id === source);
  if (fixed) return fixed.label;
  const nodeId = nodeIdOfSource(source);
  if (nodeId) {
    const node: FlowNode | undefined = ir?.nodes.find((n) => n.id === nodeId);
    return `聴取「${node ? node.label.trim() || node.id : nodeId}」の結果`;
  }
  return source;
}

// ── Câu tóm tắt tiếng Nhật (dòng xanh trong panel + preview trên canvas) ──────
export function csConditionSentence(cond: CsCondition, ir: FlowIR | null): string {
  const src = csSourceLabel(cond.source, ir);
  const op = operatorOf(cond);
  switch (op.value) {
    case 'none':
      return `${src}が${op.label}`;
    case 'range':
      return `${src}が ${cond.value || '–'}〜${cond.value2 || '–'} ${op.label}`;
    default:
      return `${src}が「${cond.value || '–'}」${op.label}`;
  }
}

export function csBranchSentence(branch: CsBranch, ir: FlowIR | null): string {
  const joiner = branch.combinator === 'and' ? ' かつ ' : ' または ';
  return branch.conditions.map((c) => csConditionSentence(c, ir)).join(joiner);
}
