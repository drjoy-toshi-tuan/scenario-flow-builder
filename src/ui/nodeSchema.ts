import type { FlowNode, NodeType } from '../ir/types';
import type { TKey } from './i18n';

// ─────────────────────────────────────────────────────────────────────────────
// Schema khai báo cho panel setting: MỖI loại node có
//   - propertyFields: danh sách tham số (tab "Property Settings").
//   - branch: hành vi nhánh (tab "Branch Settings") — cố định / tự do / không có.
// Module thuần (không import React) nên dùng chung được cho panel + irAdapter.
// ─────────────────────────────────────────────────────────────────────────────

// Kiểu ô nhập cho 1 tham số.
export type FieldKind =
  | 'text' // 1 dòng, không cho xuống dòng
  | 'autoText' // 1 dòng logic (không Enter) nhưng tự wrap + tăng chiều cao khi dài
  | 'number' // chỉ nhập số
  | 'textarea' // nhiều dòng
  | 'collapsibleTextarea' // textarea ẩn/hiện (nội dung dài)
  | 'code' // editor có tô sáng cú pháp
  | 'select' // pull-down
  | 'yesno'; // checkbox 2 lựa chọn あり / なし

export interface FieldOption {
  value: string;
  // Nhãn cố định (tiếng Anh, không dịch: STT, TEXT, …) HOẶC key i18n (song ngữ).
  label?: string;
  labelKey?: TKey;
}

export interface PropertyField {
  key: string; // key trong node.data
  labelKey: TKey;
  kind: FieldKind;
  options?: FieldOption[]; // cho select / yesno
  default?: string;
  rows?: number; // cho textarea
  // Chỉ hiển thị khi điều kiện đúng (vd Voice Type chỉ hiện khi Input Type là STT).
  showIf?: (data: Record<string, unknown>) => boolean;
}

// Hành vi nhánh của 1 loại node.
export type BranchMode =
  | 'none' // không có nhánh (hangup)
  | 'fixed' // nhánh cố định, không sửa được (announce/input/llm/faq/transfer/start)
  | 'editable'; // thêm/bớt nhánh tự do (condition/script)

export interface BranchDescriptor {
  id: string; // trùng với sourceHandle của edge
  label?: string;
}

export interface BranchSchema {
  mode: BranchMode;
  fixed?: BranchDescriptor[]; // dùng khi mode = 'fixed'
}

// Options tái dùng.
const YESNO_OPTIONS: FieldOption[] = [
  { value: 'yes', labelKey: 'optYes' },
  { value: 'no', labelKey: 'optNo' },
];

const INPUT_TYPE_OPTIONS: FieldOption[] = [
  { value: 'STT', label: 'STT' },
  { value: 'STT_DTMF', label: 'STT & DTMF' },
  { value: 'DTMF', label: 'DTMF' },
];

const VOICE_TYPE_OPTIONS: FieldOption[] = [
  { value: 'KANA_NAME', labelKey: 'vtKanaName' },
  { value: 'NUMBER', labelKey: 'vtNumber' },
  { value: 'PHONE_NUMBER', labelKey: 'vtPhone' },
  { value: 'DATETIME', labelKey: 'vtDatetime' },
];

const CONTEXT_TYPE_OPTIONS: FieldOption[] = [
  'TEXT',
  'DEPARTMENT',
  'CLASSIFICATION',
  'NUMBER',
  'DATE_OF_BIRTH',
  'DATE',
  'PHONE_NUMBER',
].map((v) => ({ value: v, label: v }));

const TRANSFER_TYPE_OPTIONS: FieldOption[] = [
  { value: 'ATTENDED', label: 'Attended Transfer' },
  { value: 'BLIND', label: 'Blind Transfer' },
];

// Input Type có STT (STT hoặc STT & DTMF) -> mới hiện Voice Type.
function inputHasStt(data: Record<string, unknown>): boolean {
  const v = data.inputType;
  return v === 'STT' || v === 'STT_DTMF' || v == null; // mặc định STT
}

// Condition: chỉ hiện Tên/Kiểu context khi bật "Lưu context".
function saveContextOn(data: Record<string, unknown>): boolean {
  return data.saveContext === 'yes';
}

export const PROPERTY_FIELDS: Record<NodeType, PropertyField[]> = {
  start: [
    { key: 'acceptanceTime', labelKey: 'fAcceptanceTime', kind: 'yesno', options: YESNO_OPTIONS, default: 'yes' },
    { key: 'contextSetting', labelKey: 'fContextSetting', kind: 'collapsibleTextarea', rows: 6 },
  ],
  announce: [{ key: 'text', labelKey: 'fAnnounce', kind: 'autoText' }],
  input: [
    { key: 'announce', labelKey: 'fAnnounce', kind: 'autoText' },
    { key: 'inputType', labelKey: 'fInputType', kind: 'select', options: INPUT_TYPE_OPTIONS, default: 'STT' },
    {
      key: 'voiceType',
      labelKey: 'fVoiceType',
      kind: 'select',
      options: VOICE_TYPE_OPTIONS,
      default: 'KANA_NAME',
      showIf: inputHasStt,
    },
    { key: 'retryCount', labelKey: 'fRetryCount', kind: 'number', default: '2' },
  ],
  condition: [
    { key: 'saveContext', labelKey: 'fSaveContext', kind: 'yesno', options: YESNO_OPTIONS, default: 'no' },
    { key: 'contextName', labelKey: 'fContextName', kind: 'text', showIf: saveContextOn },
    {
      key: 'contextType',
      labelKey: 'fContextType',
      kind: 'select',
      options: CONTEXT_TYPE_OPTIONS,
      default: 'TEXT',
      showIf: saveContextOn,
    },
  ],
  script: [{ key: 'script', labelKey: 'fScript', kind: 'code', rows: 18 }],
  llm: [
    { key: 'retryCount', labelKey: 'fRetryCount', kind: 'number', default: '2' },
    { key: 'prompt', labelKey: 'fPrompt', kind: 'textarea', rows: 6 },
  ],
  faq: [{ key: 'announce', labelKey: 'fAnnounce', kind: 'autoText' }],
  transfer: [
    { key: 'transferNumber', labelKey: 'fTransferNumber', kind: 'text' },
    { key: 'transferType', labelKey: 'fTransferType', kind: 'select', options: TRANSFER_TYPE_OPTIONS, default: 'ATTENDED' },
    { key: 'announce', labelKey: 'fAnnounce', kind: 'autoText' },
    { key: 'failedAnnounce', labelKey: 'fFailedAnnounce', kind: 'autoText' },
  ],
  hangup: [],
};

// FAILED + NEXT dùng chung cho input/llm/faq (NEXT = handle 'default' để khớp `next` trong YAML).
const FAILED_NEXT: BranchDescriptor[] = [
  { id: 'failed', label: 'FAILED' },
  { id: 'default', label: 'NEXT' },
];

export const BRANCH_SCHEMA: Record<NodeType, BranchSchema> = {
  start: { mode: 'fixed', fixed: [{ id: 'default', label: 'NEXT' }] },
  announce: { mode: 'fixed', fixed: [{ id: 'default', label: 'NEXT' }] },
  input: { mode: 'fixed', fixed: FAILED_NEXT },
  condition: { mode: 'editable' },
  script: { mode: 'editable' },
  llm: { mode: 'fixed', fixed: FAILED_NEXT },
  faq: { mode: 'fixed', fixed: FAILED_NEXT },
  transfer: { mode: 'fixed', fixed: [{ id: 'default', label: 'NEXT' }] },
  hangup: { mode: 'none' },
};

// 1 nhánh tự do (condition/script) lưu trong node.data.branches.
export interface DataBranch {
  id: string;
  value: string; // biểu thức regex (không kèm ^ $ — chỉ thêm khi hiển thị)
}

// Nhánh "catch-all" (else) của node có nhánh tự do: LUÔN có, không sửa/không xoá.
// Giá trị hiển thị tự tính: khớp mọi thứ TRỪ các nhánh còn lại.
export const CATCH_ALL_ID = 'default';

// Đọc mảng nhánh tự do trong data (an toàn kiểu). Luôn đảm bảo có nhánh catch-all.
export function readBranches(data: Record<string, unknown>): DataBranch[] {
  const raw = data.branches;
  let list: DataBranch[] = [];
  if (Array.isArray(raw)) {
    list = raw
      .filter((b): b is DataBranch => !!b && typeof (b as DataBranch).id === 'string')
      .map((b) => ({ id: b.id, value: typeof b.value === 'string' ? b.value : '' }));
  }
  if (list.length === 0) return [{ id: CATCH_ALL_ID, value: '' }];
  // Thiếu catch-all -> thêm vào đầu (giữ nguyên các nhánh sẵn có).
  if (!list.some((b) => b.id === CATCH_ALL_ID)) {
    list = [{ id: CATCH_ALL_ID, value: '' }, ...list];
  }
  return list;
}

// Regex hiển thị (đã bọc ^ $) cho nhánh catch-all: khớp mọi thứ trừ các nhánh khác.
//   - không có nhánh nào khác  -> ^.*$
//   - có nhánh v1, v2, …       -> ^(?!(?:v1|v2)$).*$
export function catchAllDisplay(branches: DataBranch[]): string {
  const others = branches
    .filter((b) => b.id !== CATCH_ALL_ID)
    .map((b) => b.value.trim())
    .filter((v) => v.length > 0);
  if (others.length === 0) return '^.*$';
  return `^(?!(?:${others.join('|')})$).*$`;
}

// Handle output (chấm nối dây ở đáy node) suy ra TỪ IR:
//   - none      -> [] (không có output)
//   - fixed     -> danh sách cố định theo schema
//   - editable  -> theo node.data.branches (nhãn = value)
// irAdapter dùng hàm này để render handle; panel dùng để biết số nhánh.
export function sourceHandlesFor(node: FlowNode): BranchDescriptor[] {
  const schema = BRANCH_SCHEMA[node.type];
  if (schema.mode === 'none') return [];
  if (schema.mode === 'fixed') return schema.fixed ?? [];
  return readBranches(node.data).map((b) => ({ id: b.id, label: b.value || undefined }));
}

// Sinh dữ liệu mặc định khi thêm node mới (tham số + nhánh tự do nếu có).
export function defaultDataFor(type: NodeType): Record<string, unknown> {
  const data: Record<string, unknown> = { description: '' };
  for (const f of PROPERTY_FIELDS[type]) {
    if (f.default != null) data[f.key] = f.default;
  }
  if (BRANCH_SCHEMA[type].mode === 'editable') {
    // Mặc định chỉ có nhánh catch-all (^.*$), không sửa/không xoá.
    data.branches = [{ id: CATCH_ALL_ID, value: '' }];
  }
  return data;
}
