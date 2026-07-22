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
//
// ── Cấu trúc chọn dữ liệu (データ) 3 nhóm (spec CS 2026-07) ───────────────────
//   聴取内容   (hearing)  : kết quả 1 node 聴取 (interaction) → so khớp text.
//   電話番号   (phone)    : 着信電話番号 / 聴取電話番号 — GIÁ TRỊ CỐ ĐỊNH (enum),
//                          không thêm/sửa/xoá option. Chọn 1 種別 cho điều kiện.
//   着信日時   (datetime) : 日付(range) / 曜日(dayset) / 時間(range).
// ─────────────────────────────────────────────────────────────────────────────

// Loại giá trị của 1 nguồn dữ liệu — quyết định bộ toán tử + kiểu ô nhập.
export type CsValueType =
  | 'phone' // legacy 発信元電話番号 (giữ để tương thích flow cũ)
  | 'phoneIncoming' // 着信電話番号 — enum cố định 6 種別
  | 'phoneAnswered' // 聴取電話番号 — enum cố định 3 種別
  | 'date' // 着信日付 — khoảng ngày
  | 'time'
  | 'day'
  | 'text';

// Nhóm データ cấp cao (3 nút chọn trên panel).
export type CsDataCategory = 'hearing' | 'phone' | 'datetime';

// Nguồn 通話情報 (không thuộc node nào) — id lưu trong CsCondition.source.
export const CS_CALL_SOURCES: readonly { id: string; label: string; type: CsValueType }[] = [
  { id: 'callerNumber', label: '発信元電話番号', type: 'phone' }, // legacy (flow cũ)
  { id: 'incomingPhone', label: '着信電話番号', type: 'phoneIncoming' },
  { id: 'answeredPhone', label: '聴取電話番号', type: 'phoneAnswered' },
  { id: 'callDate', label: '着信日付', type: 'date' },
  { id: 'callTime', label: '受電時刻', type: 'time' },
  { id: 'callDay', label: '受電曜日', type: 'day' },
];

// Giá trị種別 CỐ ĐỊNH của điện thoại (không thêm/sửa/xoá — spec CS).
//   着信電話番号 (số gọi đến): 6 種別 (Incoming Classifier).
//   聴取電話番号 (số khách đọc): 3 種別 (Phone Type Classifier).
export const INCOMING_PHONE_VALUES: readonly string[] = ['その他', '非通知', '海外', 'WebRTC', '固定', '携帯'];
export const ANSWERED_PHONE_VALUES: readonly string[] = ['その他', '固定', '携帯'];

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
  | 'daterange' // 2 ô ngày (từ〜đến) — 着信日付
  | 'enum' // pulldown chọn 1 種別 cố định (電話番号)
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
  // 電話番号 種別: 1 toán tử 'である', giá trị chọn từ enum cố định.
  phoneIncoming: [{ id: 'is', label: 'である', value: 'enum' }],
  phoneAnswered: [{ id: 'is', label: 'である', value: 'enum' }],
  date: [{ id: 'between', label: 'の期間', value: 'daterange' }],
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
  value: string; // enum: 種別 / range: từ / text: giá trị
  value2: string; // chỉ dùng cho toán tử 'range' | 'daterange' (đến)
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

// Nhóm データ cấp cao của 1 source (cho 3 nút chọn trên panel).
export function csDataCategory(source: string): CsDataCategory {
  if (source.startsWith(NODE_SOURCE_PREFIX)) return 'hearing';
  const t = sourceValueType(source);
  if (t === 'phone' || t === 'phoneIncoming' || t === 'phoneAnswered') return 'phone';
  if (t === 'date' || t === 'time' || t === 'day') return 'datetime';
  return 'hearing';
}

// Loại điện thoại của source (着信/聴取). legacy callerNumber coi như 着信.
export function phoneKindOf(source: string): 'incoming' | 'answered' {
  return source === 'answeredPhone' ? 'answered' : 'incoming';
}

// Loại 着信日時 của source.
export function datetimeKindOf(source: string): 'date' | 'day' | 'time' {
  if (source === 'callDate') return 'date';
  if (source === 'callDay') return 'day';
  return 'time';
}

// Danh sách種別 cố định của 1 source điện thoại.
export function phoneValuesFor(source: string): readonly string[] {
  return phoneKindOf(source) === 'answered' ? ANSWERED_PHONE_VALUES : INCOMING_PHONE_VALUES;
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

// Điều kiện mặc định khi bấm "＋ 条件を追加" (mặc định: 着信電話番号 → 携帯).
export function newCsCondition(): CsCondition {
  return { source: 'incomingPhone', operator: 'is', value: '携帯', value2: '' };
}

// Điều kiện mặc định cho 1 nhóm データ (khi bấm nút nhóm trên panel).
export function defaultConditionForCategory(category: CsDataCategory, ir: FlowIR | null, selfId: string): CsCondition {
  if (category === 'hearing') {
    const first = (ir?.nodes ?? []).find((n) => n.type === 'interaction' && n.id !== selfId);
    return { source: first ? nodeSource(first.id) : 'node:', operator: 'equals', value: '', value2: '' };
  }
  if (category === 'phone') return { source: 'incomingPhone', operator: 'is', value: '携帯', value2: '' };
  return { source: 'callTime', operator: 'between', value: '09:00', value2: '17:00' };
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
            source: typeof c.source === 'string' ? c.source : 'incomingPhone',
            operator: typeof c.operator === 'string' ? c.operator : 'is',
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

// Danh sách node 聴取 (cho pulldown khi データ = 聴取内容).
export function hearingSourceOptions(ir: FlowIR | null, selfId: string): CsSourceOption[] {
  return (ir?.nodes ?? [])
    .filter((n) => n.type === 'interaction' && n.id !== selfId)
    .map((n) => ({ id: nodeSource(n.id), label: n.label.trim() || n.id }));
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
    case 'daterange':
      return `${src}が ${cond.value || '–'}〜${cond.value2 || '–'} ${op.label}`;
    default:
      return `${src}が「${cond.value || '–'}」${op.label}`;
  }
}

export function csBranchSentence(branch: CsBranch, ir: FlowIR | null): string {
  const joiner = branch.combinator === 'and' ? ' かつ ' : ' または ';
  return branch.conditions.map((c) => csConditionSentence(c, ir)).join(joiner);
}
