import type { FlowIR, FlowNode, NodeType } from '../ir/types';
import type { TKey } from './i18n';
import { DEFAULT_CONTEXT_SETTING } from './defaultContextSetting';

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
  | 'code' // editor có tô sáng cú pháp (JS mặc định; language: 'json' cho JSON)
  | 'select' // pull-down
  | 'searchSelect' // pull-down gõ để lọc; option lấy động từ flow (xem optionsFrom)
  | 'pairs' // danh sách Pair (2 ô text + dấu ×) của Context Match Router
  | 'departments' // danh sách set (List khoa khám -> Tên output) của Clinical Department Classifier
  | 'time' // giờ HH:mm:ss — chỉ nhận chữ số, tự chèn ':' theo format
  | 'yesno'; // checkbox 2 lựa chọn あり / なし

// Nguồn option động cho searchSelect (tính từ IR hiện tại, xem optionsForSource).
export type OptionsSource =
  | 'interactionNodes' // tên các node Interaction trong flow
  | 'nodeAndContexts' // node Interaction + tên context đã lưu (Nexus/CDC/MRB)
  | 'subflows'; // danh sách sub flow (cơ chế sẽ bổ sung sau — hiện trống)

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
  optionsFrom?: OptionsSource; // cho searchSelect
  readOnly?: boolean; // hiển thị nhưng không cho sửa (vd holidaySource)
  placeholder?: string; // gợi ý trong ô nhập (vd HH:mm:ss)
  default?: string;
  rows?: number; // cho textarea
  language?: 'js' | 'json'; // cho kind 'code' — mặc định 'js'
  // Nút "AIで生成・修正" cạnh ô nhập (script của Logic / prompt của OpenAI).
  aiGenerate?: 'script' | 'prompt';
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
  name?: string; // tên nhánh cố định (NEXT/FAILED) — cột VALUE, hiển thị ^name$
  label?: string; // nhãn hiển thị (次へ/失敗) — cột LABEL + nhãn trên dây
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

// Có / Không (はい / いいえ) — khác optYes/optNo (あり/なし) về mặt chữ tiếng Nhật.
const YESNO_HAI_OPTIONS: FieldOption[] = [
  { value: 'yes', labelKey: 'optYesHai' },
  { value: 'no', labelKey: 'optNoIie' },
];

const INPUT_TYPE_OPTIONS: FieldOption[] = [
  { value: 'STT', label: 'STT' },
  { value: 'STT_DTMF', label: 'STT & DTMF' },
  { value: 'DTMF', label: 'DTMF' },
];

const VOICE_TYPE_OPTIONS: FieldOption[] = [
  // TEXT hiển thị "Text / テキスト" (song ngữ) — cũng là lựa chọn mặc định.
  { value: 'TEXT', labelKey: 'vtText' },
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

// ── Module của node Logic ──
export const LOGIC_MODULE_CDC = 'Clinic Day Classifier';
export const LOGIC_MODULE_CMR = 'Context Match Router';
export const LOGIC_MODULE_MRB = 'Module Result Binder';
export const LOGIC_MODULE_SCRIPT = 'Script';
// Incoming Classifier: phân loại số gọi đến (非通知/海外/WebRTC/固定/携帯) — không có
// tham số, chỉ có Branch Settings (bộ nhánh mặc định seed khi chọn module).
export const LOGIC_MODULE_IC = 'Incoming Classifier';
// Date Of Call Classifier: so thời điểm gọi với mốc HH:mm:ss (時間前/時間一致/時間後;
// lỗi -> ERROR, đóng vai trò nhánh else giống FAILED).
export const LOGIC_MODULE_DOCC = 'Date Of Call Classifier';
// Clinical Department Classifier: phân loại khoa khám. Tham số gồm module tham chiếu,
// cờ lưu context và các cặp (danh sách khoa -> tên output). Nhánh SINH TỪ output
// (FAILED / NOT_COVERED + mỗi output 1 nhánh), khoá custom.
export const LOGIC_MODULE_CDEPT = 'Clinical Department Classifier';
// Null Check: kiểm tra biến/kết quả có rỗng không — 2 nhánh cố định true/false.
export const LOGIC_MODULE_NULLCHECK = 'Null Check';
// Phone Normalization: chuẩn hoá số điện thoại (kiểm tra số gọi đến /復唱) — 2 nhánh
// cố định INVALID/SUCCESS.
export const LOGIC_MODULE_PHONE_NORM = 'Phone Normalization';
// DOB Re-confirmation: xác nhận lại ngày sinh — 2 nhánh cố định INVALID/SUCCESS.
export const LOGIC_MODULE_DOB_RECONFIRM = 'DOB Re-confirmation';

// Bộ chọn module lưu ở data.moduleType ('module' là THAM SỐ của CDC/MRB — 参照元モジュール).
// Script đứng đầu pulldown (module mặc định, dùng thường xuyên nhất).
const MODULE_OPTIONS: FieldOption[] = [
  { value: LOGIC_MODULE_SCRIPT, label: LOGIC_MODULE_SCRIPT },
  { value: LOGIC_MODULE_PHONE_NORM, label: LOGIC_MODULE_PHONE_NORM },
  { value: LOGIC_MODULE_DOB_RECONFIRM, label: LOGIC_MODULE_DOB_RECONFIRM },
  { value: LOGIC_MODULE_CDC, label: LOGIC_MODULE_CDC },
  { value: LOGIC_MODULE_CDEPT, label: LOGIC_MODULE_CDEPT },
  { value: LOGIC_MODULE_MRB, label: LOGIC_MODULE_MRB },
  { value: LOGIC_MODULE_CMR, label: LOGIC_MODULE_CMR },
  { value: LOGIC_MODULE_NULLCHECK, label: LOGIC_MODULE_NULLCHECK },
  { value: LOGIC_MODULE_IC, label: LOGIC_MODULE_IC },
  { value: LOGIC_MODULE_DOCC, label: LOGIC_MODULE_DOCC },
];

// Module đang chọn của node logic (mặc định Script khi chưa chọn).
export function logicModuleOf(data: Record<string, unknown>): string {
  const v = data.moduleType;
  return typeof v === 'string' && v ? v : LOGIC_MODULE_SCRIPT;
}

// Logic: chỉ hiện ô soạn code khi Module = Script (mặc định khi chưa chọn).
function moduleIsScript(data: Record<string, unknown>): boolean {
  return logicModuleOf(data) === LOGIC_MODULE_SCRIPT;
}
const moduleIsCdc = (d: Record<string, unknown>) => logicModuleOf(d) === LOGIC_MODULE_CDC;
const moduleIsCmr = (d: Record<string, unknown>) => logicModuleOf(d) === LOGIC_MODULE_CMR;
const moduleIsMrb = (d: Record<string, unknown>) => logicModuleOf(d) === LOGIC_MODULE_MRB;
const moduleIsDocc = (d: Record<string, unknown>) => logicModuleOf(d) === LOGIC_MODULE_DOCC;
const moduleIsCdept = (d: Record<string, unknown>) => logicModuleOf(d) === LOGIC_MODULE_CDEPT;
const moduleIsNullCheck = (d: Record<string, unknown>) => logicModuleOf(d) === LOGIC_MODULE_NULLCHECK;
const moduleIsPhoneNorm = (d: Record<string, unknown>) => logicModuleOf(d) === LOGIC_MODULE_PHONE_NORM;
const moduleIsDobReconfirm = (d: Record<string, unknown>) => logicModuleOf(d) === LOGIC_MODULE_DOB_RECONFIRM;
// Phone Normalization: chỉ hiện module tham chiếu khi mode = Re-confirm (復唱).
const phoneNormIsReconfirm = (d: Record<string, unknown>) =>
  moduleIsPhoneNorm(d) && d.mode === 'Re-confirm';

// ── Clinic Day Classifier ──
// Nguồn ngày lễ cố định (nội các Nhật公開) — hiển thị read-only, không cho sửa.
export const HOLIDAY_SOURCE_URL = 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv';

// Mode ngày nghỉ (休診日判定モード) — giá trị hệ thống giữ nguyên tiếng Nhật.
const CLOSED_DAY_MODE_OPTIONS: FieldOption[] = [
  { value: '土日祝日', labelKey: 'cdmSatSunHol' },
  { value: '祝日', labelKey: 'cdmHol' },
  { value: '土日', labelKey: 'cdmSatSun' },
  { value: '日祝日', labelKey: 'cdmSunHol' },
  { value: '土', labelKey: 'cdmSat' },
  { value: '日', labelKey: 'cdmSun' },
  { value: 'なし', labelKey: 'cdmNone' },
];

// Kiểu output (出力結果形式) — giá trị hệ thống giữ tiếng Nhật.
const OUTPUT_TYPE_OPTIONS: FieldOption[] = [
  { value: 'フリーテキスト', labelKey: 'otFreeText' },
  { value: '日時', labelKey: 'otDatetime' },
];

// ── Phone Normalization ──
// Mode (モード): kiểm tra số gọi đến (着信番号確認) hoặc復唱 (Re-confirm).
const PHONE_MODE_OPTIONS: FieldOption[] = [
  { value: 'Incoming Check', labelKey: 'pnModeIncoming' },
  { value: 'Re-confirm', labelKey: 'pnModeReconfirm' },
];
// Kiểu đọc số (読み上げモード): toàn bộ số (全桁) hoặc 4 số cuối (下4桁).
const PHONE_READING_MODE_OPTIONS: FieldOption[] = [
  { value: '全桁', labelKey: 'prmAll' },
  { value: '下4桁', labelKey: 'prmLast4' },
];

// ── DOB Re-confirmation ──
// Kiểu đọc ngày sinh (生年読み上げモード): tự động (自動) / lịch tây (西暦) / lịch Nhật (和暦).
const DATE_READING_MODE_OPTIONS: FieldOption[] = [
  { value: '自動', labelKey: 'drmAuto' },
  { value: '西暦', labelKey: 'drmWestern' },
  { value: '和暦', labelKey: 'drmJapanese' },
];

// Kiểu context của Module Result Binder (khác bộ TEXT/DATE của CDC).
const MRB_CONTEXT_TYPE_OPTIONS: FieldOption[] = [
  'TEXT',
  'DEPARTMENT',
  'CLASSIFICATION',
  'NUMBER',
  'DATE',
  'PHONE_NUMBER',
].map((v) => ({ value: v, label: v }));

const CDC_CONTEXT_TYPE_OPTIONS: FieldOption[] = ['TEXT', 'DATE'].map((v) => ({ value: v, label: v }));

// ── Module của node Save ──
// Save = node lưu dữ liệu, chọn module giống node Logic:
//   - Flag: 2 tham số Status Flag / SMS Flag (hành vi node Flag cũ).
//   - Save Data 2 Dr.JOY: không có tham số.
export const SAVE_MODULE_FLAG = 'Flag';
export const SAVE_MODULE_DRJOY = 'Save Data 2 Dr.JOY';

const SAVE_MODULE_OPTIONS: FieldOption[] = [
  { value: SAVE_MODULE_FLAG, label: SAVE_MODULE_FLAG },
  { value: SAVE_MODULE_DRJOY, label: SAVE_MODULE_DRJOY },
];

// Module đang chọn của node save (mặc định Flag khi chưa chọn — khớp node Flag cũ
// đọc từ file YAML không có moduleType).
export function saveModuleOf(data: Record<string, unknown>): string {
  const v = data.moduleType;
  return typeof v === 'string' && v ? v : SAVE_MODULE_FLAG;
}

const saveModuleIsFlag = (d: Record<string, unknown>) => saveModuleOf(d) === SAVE_MODULE_FLAG;

// Input Type có STT (STT hoặc STT & DTMF) -> mới hiện Voice Type.
function inputHasStt(data: Record<string, unknown>): boolean {
  const v = data.inputType;
  return v === 'STT' || v === 'STT_DTMF' || v == null; // mặc định STT
}

// Nexus: chỉ hiện Tên/Kiểu context khi bật "Lưu context".
function saveContextOn(data: Record<string, unknown>): boolean {
  return data.saveContext === 'yes';
}

// Interaction: chỉ hiện "Repeat Announce" khi bật "Repeat" (復唱).
function repeatOn(data: Record<string, unknown>): boolean {
  return data.repeat === 'yes';
}

// CDC/MRB: chỉ hiện Tên/Kiểu context khi bật "Lưu context" của module tương ứng.
const cdcSaveContextOn = (d: Record<string, unknown>) => moduleIsCdc(d) && d.saveContext2db === 'yes';
const mrbSaveContextOn = (d: Record<string, unknown>) => moduleIsMrb(d) && d.saveContext2DB === 'yes';

export const PROPERTY_FIELDS: Record<NodeType, PropertyField[]> = {
  start: [
    { key: 'acceptanceTime', labelKey: 'fAcceptanceTime', kind: 'yesno', options: YESNO_OPTIONS, default: 'yes' },
    // Context Setting dạng JSON — editor có tô sáng cú pháp + số dòng, seed sẵn
    // bộ context mặc định (xem defaultContextSetting.ts).
    {
      key: 'contextSetting',
      labelKey: 'fContextSetting',
      kind: 'code',
      language: 'json',
      rows: 14,
      default: DEFAULT_CONTEXT_SETTING,
    },
  ],
  announce: [{ key: 'text', labelKey: 'fAnnounce', kind: 'autoText' }],
  interaction: [
    { key: 'announce', labelKey: 'fAnnounce', kind: 'autoText' },
    // Repeat (復唱): ngay dưới Announce; bật -> hiện Repeat Announce (復唱アナウンス).
    { key: 'repeat', labelKey: 'fRepeat', kind: 'yesno', options: YESNO_OPTIONS, default: 'no' },
    { key: 'repeatAnnounce', labelKey: 'fRepeatAnnounce', kind: 'autoText', showIf: repeatOn },
    { key: 'inputType', labelKey: 'fInputType', kind: 'select', options: INPUT_TYPE_OPTIONS, default: 'STT' },
    {
      key: 'voiceType',
      labelKey: 'fVoiceType',
      kind: 'select',
      options: VOICE_TYPE_OPTIONS,
      default: 'TEXT',
      showIf: inputHasStt,
    },
    { key: 'retryCount', labelKey: 'fRetryCount', kind: 'number', default: '2' },
    // Retry Announce luôn nằm ngay dưới Retry Count.
    { key: 'retryAnnounce', labelKey: 'fRetryAnnounce', kind: 'autoText' },
  ],
  nexus: [
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
  logic: [
    { key: 'moduleType', labelKey: 'fModule', kind: 'select', options: MODULE_OPTIONS, default: LOGIC_MODULE_SCRIPT },

    // ── Script ──
    { key: 'script', labelKey: 'fScript', kind: 'code', rows: 18, showIf: moduleIsScript, aiGenerate: 'script' },

    // ── Clinic Day Classifier ──
    { key: 'module', labelKey: 'fRefModule', kind: 'searchSelect', optionsFrom: 'interactionNodes', showIf: moduleIsCdc },
    {
      key: 'holidaySource',
      labelKey: 'fHolidaySource',
      kind: 'text',
      readOnly: true,
      default: HOLIDAY_SOURCE_URL,
      showIf: moduleIsCdc,
    },
    { key: 'customHoliday', labelKey: 'fCustomHoliday', kind: 'text', showIf: moduleIsCdc },
    {
      key: 'closedDayMode',
      labelKey: 'fClosedDayMode',
      kind: 'select',
      options: CLOSED_DAY_MODE_OPTIONS,
      default: '土日祝日',
      showIf: moduleIsCdc,
    },
    { key: 'blockDays', labelKey: 'fBlockDays', kind: 'number', default: '0', showIf: moduleIsCdc },
    {
      key: 'output_type',
      labelKey: 'fOutputType',
      kind: 'select',
      options: OUTPUT_TYPE_OPTIONS,
      default: 'フリーテキスト',
      showIf: moduleIsCdc,
    },
    { key: 'saveContext2db', labelKey: 'fSaveContext', kind: 'yesno', options: YESNO_HAI_OPTIONS, default: 'no', showIf: moduleIsCdc },
    { key: 'contextName', labelKey: 'fContextName', kind: 'text', showIf: cdcSaveContextOn },
    {
      key: 'contextDisplayType',
      labelKey: 'fContextType',
      kind: 'select',
      options: CDC_CONTEXT_TYPE_OPTIONS,
      default: 'TEXT',
      showIf: cdcSaveContextOn,
    },
    // Retry Count / Retry Announce (bộ đôi quen thuộc) — luôn ở CUỐI danh sách CDC.
    { key: 'retryCount', labelKey: 'fRetryCount', kind: 'number', default: '2', showIf: moduleIsCdc },
    { key: 'retryAnnounce', labelKey: 'fRetryAnnounce', kind: 'autoText', showIf: moduleIsCdc },

    // ── Context Match Router ──
    { key: 'nodeContext1', labelKey: 'fNodeContext1', kind: 'searchSelect', optionsFrom: 'nodeAndContexts', showIf: moduleIsCmr },
    { key: 'nodeContext2', labelKey: 'fNodeContext2', kind: 'searchSelect', optionsFrom: 'nodeAndContexts', showIf: moduleIsCmr },
    { key: 'pairs', labelKey: 'fPairs', kind: 'pairs', showIf: moduleIsCmr },

    // ── Date Of Call Classifier ──
    // Mốc thời gian để so sánh (比較時点) — chỉ nhận đúng format HH:mm:ss.
    { key: 'compareTime', labelKey: 'fCompareTime', kind: 'time', placeholder: 'HH:mm:ss', showIf: moduleIsDocc },

    // ── Module Result Binder ──
    { key: 'module', labelKey: 'fMrbModule', kind: 'searchSelect', optionsFrom: 'nodeAndContexts', showIf: moduleIsMrb },
    { key: 'variable', labelKey: 'fVariable', kind: 'text', showIf: moduleIsMrb },
    { key: 'saveContext2DB', labelKey: 'fSaveContext', kind: 'yesno', options: YESNO_HAI_OPTIONS, default: 'no', showIf: moduleIsMrb },
    { key: 'contextName', labelKey: 'fContextName', kind: 'text', showIf: mrbSaveContextOn },
    {
      key: 'contextDisplayType',
      labelKey: 'fContextType',
      kind: 'select',
      options: MRB_CONTEXT_TYPE_OPTIONS,
      default: 'TEXT',
      showIf: mrbSaveContextOn,
    },

    // ── Clinical Department Classifier ──
    // module tham chiếu: nhận node Interaction + context (giống Module Result Binder).
    { key: 'module', labelKey: 'fMrbModule', kind: 'searchSelect', optionsFrom: 'nodeAndContexts', showIf: moduleIsCdept },
    { key: 'saveDepartment2DB', labelKey: 'fSaveContext', kind: 'yesno', options: YESNO_HAI_OPTIONS, default: 'no', showIf: moduleIsCdept },
    // Danh sách set (List khoa khám -> Tên output). Nhánh sinh tự động từ Tên output.
    { key: 'departments', labelKey: 'fClinicalDeptList', kind: 'departments', showIf: moduleIsCdept },

    // ── Null Check ──
    // key tham chiếu: nhận node Interaction + context (giống Module Result Binder).
    { key: 'key', labelKey: 'fMrbModule', kind: 'searchSelect', optionsFrom: 'nodeAndContexts', showIf: moduleIsNullCheck },

    // ── Phone Normalization ──
    { key: 'mode', labelKey: 'fMode', kind: 'select', options: PHONE_MODE_OPTIONS, default: 'Incoming Check', showIf: moduleIsPhoneNorm },
    { key: 'prompt', labelKey: 'fAnnounce', kind: 'autoText', showIf: moduleIsPhoneNorm },
    // module tham chiếu: chỉ hiện khi mode = Re-confirm (復唱).
    { key: 'module', labelKey: 'fMrbModule', kind: 'searchSelect', optionsFrom: 'nodeAndContexts', showIf: phoneNormIsReconfirm },
    {
      key: 'phoneReadingMode',
      labelKey: 'fPhoneReadingMode',
      kind: 'select',
      options: PHONE_READING_MODE_OPTIONS,
      default: '全桁',
      showIf: moduleIsPhoneNorm,
    },
    { key: 'saveAdditionalPhoneNumber2DB', labelKey: 'fSaveContext', kind: 'yesno', options: YESNO_HAI_OPTIONS, default: 'no', showIf: moduleIsPhoneNorm },

    // ── DOB Re-confirmation ──
    { key: 'prompt', labelKey: 'fAnnounce', kind: 'autoText', showIf: moduleIsDobReconfirm },
    { key: 'module', labelKey: 'fMrbModule', kind: 'searchSelect', optionsFrom: 'nodeAndContexts', showIf: moduleIsDobReconfirm },
    {
      key: 'dateReadingMode',
      labelKey: 'fDateReadingMode',
      kind: 'select',
      options: DATE_READING_MODE_OPTIONS,
      default: '自動',
      showIf: moduleIsDobReconfirm,
    },
    { key: 'saveDOB2db', labelKey: 'fSaveContext', kind: 'yesno', options: YESNO_HAI_OPTIONS, default: 'no', showIf: moduleIsDobReconfirm },
  ],
  openai: [
    // Prompt đứng đầu, sau đó mới tới Retry Count / Retry Announce.
    { key: 'prompt', labelKey: 'fPrompt', kind: 'textarea', rows: 6, aiGenerate: 'prompt' },
    { key: 'retryCount', labelKey: 'fRetryCount', kind: 'number', default: '2' },
    // Retry Announce luôn nằm ngay dưới Retry Count.
    { key: 'retryAnnounce', labelKey: 'fRetryAnnounce', kind: 'autoText' },
  ],
  faq: [{ key: 'announce', labelKey: 'fAnnounce', kind: 'autoText' }],
  transfer: [
    { key: 'transferNumber', labelKey: 'fTransferNumber', kind: 'text' },
    { key: 'transferType', labelKey: 'fTransferType', kind: 'select', options: TRANSFER_TYPE_OPTIONS, default: 'ATTENDED' },
    { key: 'announce', labelKey: 'fAnnounce', kind: 'autoText' },
  ],
  // Save: chọn module như node Logic — Flag hiện Status/SMS Flag, Save Data 2 Dr.JOY không tham số.
  save: [
    { key: 'moduleType', labelKey: 'fModule', kind: 'select', options: SAVE_MODULE_OPTIONS, default: SAVE_MODULE_FLAG },
    { key: 'statusFlag', labelKey: 'fStatusFlag', kind: 'number', showIf: saveModuleIsFlag },
    { key: 'smsFlag', labelKey: 'fSmsFlag', kind: 'number', showIf: saveModuleIsFlag },
  ],
  // Jump: chọn sub flow để nhảy tới (danh sách sub flow sẽ bổ sung sau).
  jump: [{ key: 'subflow', labelKey: 'fSubflow', kind: 'searchSelect', optionsFrom: 'subflows' }],
  hangup: [],
};

// Nhánh cố định: VALUE (name, hiển thị ^name$); LABEL mặc định là 次へ / 失敗 —
// cũng là nhãn hiện trên dây.
//   - Nhánh NEXT  = handle 'default' (khớp `next` trong YAML) — VALUE hiển thị ^.*$
//     (khớp mọi kết quả; trước đây hiển thị ^NEXT$).
//   - Nhánh FAILED = handle 'failed' — VALUE giữ ^FAILED$.
export const NEXT_BRANCH_LABEL = '次へ';
export const FAILED_BRANCH_LABEL = '失敗';
// Nhãn nhánh "ngoài đối tượng" của Clinical Department Classifier.
export const NOT_COVERED_BRANCH_LABEL = '対象外';

const NEXT_ONLY: BranchDescriptor[] = [{ id: 'default', name: '.*', label: NEXT_BRANCH_LABEL }];
// FAILED + NEXT dùng chung cho interaction/openai/faq/transfer.
const FAILED_NEXT: BranchDescriptor[] = [
  { id: 'failed', name: 'FAILED', label: FAILED_BRANCH_LABEL },
  { id: 'default', name: '.*', label: NEXT_BRANCH_LABEL },
];

export const BRANCH_SCHEMA: Record<NodeType, BranchSchema> = {
  start: { mode: 'fixed', fixed: NEXT_ONLY },
  announce: { mode: 'fixed', fixed: NEXT_ONLY },
  interaction: { mode: 'fixed', fixed: FAILED_NEXT },
  nexus: { mode: 'editable' },
  logic: { mode: 'editable' },
  openai: { mode: 'fixed', fixed: FAILED_NEXT },
  faq: { mode: 'fixed', fixed: FAILED_NEXT },
  // Transfer: nhánh FAILED (nối máy thất bại) nằm trên nhánh NEXT.
  transfer: { mode: 'fixed', fixed: FAILED_NEXT },
  // Save: chỉ có nhánh NEXT.
  save: { mode: 'fixed', fixed: NEXT_ONLY },
  // Jump: nhánh tự do (thêm được nhánh) giống nexus/logic.
  jump: { mode: 'editable' },
  hangup: { mode: 'none' },
};

// 1 nhánh tự do (condition/script) lưu trong node.data.branches.
export interface DataBranch {
  id: string;
  value: string; // biểu thức regex (không kèm ^ $ — chỉ thêm khi hiển thị)
  label?: string; // nhãn hiển thị trên dây (thay cho value); rỗng -> dùng value
}

// Nhánh "catch-all" (else) của node có nhánh tự do: LUÔN có, không xoá được.
// Giá trị hiển thị tự tính: khớp mọi thứ TRỪ các nhánh còn lại.
export const CATCH_ALL_ID = 'default';

// Node có value catch-all SỬA ĐƯỢC (vẫn không xoá được — luôn giữ nhánh else):
//   - Nexus: cho người dùng tự đặt điều kiện thay vì để catch-all tự tính.
//   - Logic module Module Result Binder.
// Các loại còn lại giữ read-only (tự tính ^(?!…)$.*$, hoặc value cố định theo module).
export function catchAllEditable(type: NodeType, data: Record<string, unknown>): boolean {
  return type === 'nexus' || (type === 'logic' && logicModuleOf(data) === LOGIC_MODULE_MRB);
}

// Bộ nhánh mặc định khi node logic chuyển sang module Clinic Day Classifier:
//   ^NON_BUSINESS_DAY$ → 休診日, ^不明$ → 不明, catch-all → 診療日.
export const CDC_DEFAULT_BRANCHES: readonly DataBranch[] = [
  { id: CATCH_ALL_ID, value: '', label: '診療日' },
  { id: 'b0', value: 'NON_BUSINESS_DAY', label: '休診日' },
  { id: 'b1', value: '不明', label: '不明' },
] as const;

// Incoming Classifier: catch-all (その他) + 5 loại số gọi đến — bộ nhánh CỐ ĐỊNH,
// value lẫn label đều không sửa được.
export const IC_FIXED_BRANCHES: readonly DataBranch[] = [
  { id: CATCH_ALL_ID, value: '', label: 'その他' },
  { id: 'b0', value: '非通知', label: '非通知' },
  { id: 'b1', value: '海外', label: '海外' },
  { id: 'b2', value: 'WebRTC', label: 'WebRTC' },
  { id: 'b3', value: '固定', label: '固定' },
  { id: 'b4', value: '携帯', label: '携帯' },
] as const;

// Date Of Call Classifier: catch-all chính là nhánh ^ERROR$ (vai trò giống FAILED,
// label エラー) + 3 kết quả so sánh thời gian.
export const DOCC_FIXED_BRANCHES: readonly DataBranch[] = [
  { id: CATCH_ALL_ID, value: 'ERROR', label: 'エラー' },
  { id: 'b0', value: '時間後', label: '時間後' },
  { id: 'b1', value: '時間一致', label: '時間一致' },
  { id: 'b2', value: '時間前', label: '時間前' },
] as const;

// Null Check: 2 nhánh cố định — true (Null) là nhánh else (trên cùng), false (Not Null).
// Value/label khoá cứng, không thêm/xoá/sửa.
export const NULL_CHECK_FIXED_BRANCHES: readonly DataBranch[] = [
  { id: CATCH_ALL_ID, value: 'true', label: 'Null' },
  { id: 'b0', value: 'false', label: 'Not Null' },
] as const;

// Phone Normalization / DOB Re-confirmation: 2 nhánh cố định — INVALID (else, trên cùng)
// + SUCCESS. Value/label khoá cứng, không thêm/xoá/sửa.
export const INVALID_SUCCESS_FIXED_BRANCHES: readonly DataBranch[] = [
  { id: CATCH_ALL_ID, value: 'INVALID', label: 'INVALID' },
  { id: 'b0', value: 'SUCCESS', label: 'SUCCESS' },
] as const;

// Module có bộ nhánh CỐ ĐỊNH: value + label khoá cứng, không thêm/xoá nhánh. Đổi sang
// các module này thì data.branches bị THAY HẲN bằng bộ chuẩn (xem flowStore.setDraftField)
// — không giữ nhánh của module trước (tránh DOCC mang nhầm nhánh của IC).
export const MODULE_FIXED_BRANCHES: Record<string, readonly DataBranch[]> = {
  [LOGIC_MODULE_IC]: IC_FIXED_BRANCHES,
  [LOGIC_MODULE_DOCC]: DOCC_FIXED_BRANCHES,
  [LOGIC_MODULE_NULLCHECK]: NULL_CHECK_FIXED_BRANCHES,
  [LOGIC_MODULE_PHONE_NORM]: INVALID_SUCCESS_FIXED_BRANCHES,
  [LOGIC_MODULE_DOB_RECONFIRM]: INVALID_SUCCESS_FIXED_BRANCHES,
};

// 1 set (List khoa khám -> Tên output) của Clinical Department Classifier.
export interface ClinicalDepartment {
  list: string; // "Khoa1;Khoa2;…"
  output: string; // Tên output — cũng là value & label của nhánh tương ứng
}

// Đọc danh sách set từ các key phẳng clinical_department_1 / result_name_1, … (liên
// tục từ 1). Luôn có ít nhất 1 set để panel hiển thị ô nhập.
export function readClinicalDepartments(data: Record<string, unknown>): ClinicalDepartment[] {
  const list: ClinicalDepartment[] = [];
  for (let i = 1; ; i++) {
    const dep = data[`clinical_department_${i}`];
    const out = data[`result_name_${i}`];
    if (dep === undefined && out === undefined) break;
    list.push({
      list: typeof dep === 'string' ? dep : '',
      output: typeof out === 'string' ? out : '',
    });
  }
  return list.length > 0 ? list : [{ list: '', output: '' }];
}

// Bộ nhánh SINH TỪ property của Clinical Department Classifier:
//   FAILED (default, trên cùng) · NOT_COVERED · mỗi Tên output 1 nhánh (value = label = output).
// id ở đây chỉ là mẫu — effectiveBranches sẽ gán lại id ổn định theo value.
export function clinicalDepartmentBranches(data: Record<string, unknown>): readonly DataBranch[] {
  const outputs = readClinicalDepartments(data)
    .map((d) => d.output.trim())
    .filter((v) => v.length > 0);
  const list: DataBranch[] = [
    { id: CATCH_ALL_ID, value: 'FAILED', label: FAILED_BRANCH_LABEL },
    { id: 'b0', value: 'NOT_COVERED', label: NOT_COVERED_BRANCH_LABEL },
  ];
  outputs.forEach((name, i) => list.push({ id: `out${i}`, value: name, label: name }));
  return list;
}

// Bộ nhánh cố định của node (null nếu node dùng nhánh tự do bình thường). Clinical
// Department Classifier có bộ nhánh cố định nhưng ĐỘNG (sinh từ property).
export function fixedModuleBranches(
  type: NodeType,
  data: Record<string, unknown>,
): readonly DataBranch[] | null {
  if (type !== 'logic') return null;
  const mod = logicModuleOf(data);
  if (mod === LOGIC_MODULE_CDEPT) return clinicalDepartmentBranches(data);
  return MODULE_FIXED_BRANCHES[mod] ?? null;
}

// Bộ nhánh mặc định theo module — seed khi đổi module ở panel NẾU node chưa có nhánh
// tuỳ biến (khác bộ cố định ở trên: CDC seed xong người dùng vẫn sửa được).
export const MODULE_DEFAULT_BRANCHES: Record<string, readonly DataBranch[]> = {
  [LOGIC_MODULE_CDC]: CDC_DEFAULT_BRANCHES,
};

// Ép chuỗi nhập về định dạng HH:mm:ss (ô kind 'time'): chỉ giữ chữ số (tối đa 6),
// tự chèn ':' sau mỗi cặp — gõ/dán gì cũng ra dạng 12:34:56 (có thể dở dang khi đang gõ).
export function formatTimeInput(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '').slice(0, 6);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 6)];
  return parts.filter((p) => p.length > 0).join(':');
}

// Đọc mảng nhánh tự do trong data (an toàn kiểu). Luôn đảm bảo có nhánh catch-all.
export function readBranches(data: Record<string, unknown>): DataBranch[] {
  const raw = data.branches;
  let list: DataBranch[] = [];
  if (Array.isArray(raw)) {
    list = raw
      .filter((b): b is DataBranch => !!b && typeof (b as DataBranch).id === 'string')
      .map((b) => {
        const branch: DataBranch = { id: b.id, value: typeof b.value === 'string' ? b.value : '' };
        // Chỉ giữ label khi có giá trị -> không rải label rỗng khắp IR/YAML.
        if (typeof b.label === 'string' && b.label !== '') branch.label = b.label;
        return branch;
      });
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

// ── Pair (Context Match Router) ─────────────────────────────────────────────
// 1 Pair = 2 output cần khớp nhau (Node-Context 1 × Node-Context 2). Pair thứ n
// sinh nhánh value ^Pair{n}$ ở Branch Settings (label do người dùng đặt).
export interface ContextPair {
  left: string;
  right: string;
}

// Đọc danh sách Pair trong data (an toàn kiểu). Luôn có ít nhất Pair 1.
export function readPairs(data: Record<string, unknown>): ContextPair[] {
  const raw = data.pairs;
  let list: ContextPair[] = [];
  if (Array.isArray(raw)) {
    list = raw
      .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
      .map((p) => ({
        left: typeof p.left === 'string' ? p.left : '',
        right: typeof p.right === 'string' ? p.right : '',
      }));
  }
  return list.length > 0 ? list : [{ left: '', right: '' }];
}

// Node logic đang ở module Context Match Router? (nhánh sinh từ Pair, khoá thêm/xoá tay)
export function isPairBranchNode(type: NodeType, data: Record<string, unknown>): boolean {
  return type === 'logic' && logicModuleOf(data) === LOGIC_MODULE_CMR;
}

// Danh sách nhánh "hiệu lực" của node:
//   - Module có bộ nhánh CỐ ĐỊNH (IC/DOCC): LUÔN trả về bộ chuẩn — value/label khoá
//     cứng, data.branches lệch (vd còn sót nhánh module trước) cũng bị đè lại.
//   - CMR: CHỈ các nhánh sinh từ Pair (pair1, pair2, …; value 1, 2, … hiển thị ^1$),
//     KHÔNG có nhánh catch-all loại trừ; label giữ từ data.branches.
//   - còn lại: đọc thẳng data.branches.
export function effectiveBranches(type: NodeType, data: Record<string, unknown>): DataBranch[] {
  const branches = readBranches(data);
  const fixed = fixedModuleBranches(type, data);
  if (fixed) {
    // Khớp nhánh cố định với nhánh sẵn có theo VALUE (file YAML đánh id theo thứ tự
    // b1, b2… nên không so theo id được) — GIỮ id trong data để dây nối không lệch
    // handle; nhánh không khớp (data sai/thiếu) nhận id trống kế tiếp.
    const byValue = new Map<string, DataBranch>();
    for (const b of branches) {
      if (b.id !== CATCH_ALL_ID && !byValue.has(b.value)) byValue.set(b.value, b);
    }
    const matched = fixed.map((f) => ({
      f,
      old: f.id === CATCH_ALL_ID ? branches.find((b) => b.id === CATCH_ALL_ID) : byValue.get(f.value),
    }));
    const usedIds = new Set(matched.map(({ f, old }) => (f.id === CATCH_ALL_ID ? CATCH_ALL_ID : old?.id)));
    let n = 0;
    return matched.map(({ f, old }) => {
      let id: string;
      if (f.id === CATCH_ALL_ID) id = CATCH_ALL_ID;
      else if (old) id = old.id;
      else {
        do id = `b${n++}`;
        while (usedIds.has(id));
        usedIds.add(id);
      }
      const branch: DataBranch = { id, value: f.value };
      if (f.label) branch.label = f.label;
      return branch;
    });
  }
  if (!isPairBranchNode(type, data)) return branches;
  const byId = new Map(branches.map((b) => [b.id, b]));
  return readPairs(data).map((_, i) => {
    const id = `pair${i + 1}`;
    const old = byId.get(id);
    const branch: DataBranch = { id, value: `${i + 1}` };
    if (old?.label) branch.label = old.label;
    return branch;
  });
}

// ── Option động cho searchSelect ─────────────────────────────────────────────
// Duyệt TOÀN BỘ node trong tài liệu: main flow + mọi sub flow. Truyền vào đây
// TÀI LIỆU ĐẦY ĐỦ (store.assembleDoc()) để option lấy được xuyên flow.
export function allNodes(ir: FlowIR | null): FlowNode[] {
  if (!ir) return [];
  return [...ir.nodes, ...(ir.subflows ?? []).flatMap((s) => s.nodes)];
}

// Tên các node Interaction trong tài liệu (ưu tiên label, fallback id).
export function interactionNodeNames(ir: FlowIR | null): string[] {
  return allNodes(ir)
    .filter((n) => n.type === 'interaction')
    .map((n) => n.label.trim() || n.id);
}

// Tên context đã được tạo & lưu trong tài liệu: Nexus (saveContext), Clinic Day
// Classifier (saveContext2db) và Module Result Binder (saveContext2DB).
export function savedContextNames(ir: FlowIR | null): string[] {
  const names: string[] = [];
  for (const n of allNodes(ir)) {
    const d = n.data;
    const name = typeof d.contextName === 'string' ? d.contextName.trim() : '';
    if (!name) continue;
    if (n.type === 'nexus' && d.saveContext === 'yes') names.push(name);
    if (n.type === 'logic' && logicModuleOf(d) === LOGIC_MODULE_CDC && d.saveContext2db === 'yes') names.push(name);
    if (n.type === 'logic' && logicModuleOf(d) === LOGIC_MODULE_MRB && d.saveContext2DB === 'yes') names.push(name);
  }
  return names;
}

// Option cho từng nguồn (loại trùng, giữ thứ tự xuất hiện).
export function optionsForSource(source: OptionsSource, ir: FlowIR | null): string[] {
  switch (source) {
    case 'interactionNodes':
      return [...new Set(interactionNodeNames(ir))];
    case 'nodeAndContexts':
      return [...new Set([...interactionNodeNames(ir), ...savedContextNames(ir)])];
    case 'subflows':
      // Node Jump trỏ tới sub flow theo TÊN (danh sách sub flow trong cùng file).
      return [...new Set((ir?.subflows ?? []).map((s) => s.name))];
  }
}

// 1 nhóm option trong pulldown (có tiêu đề tuỳ chọn). Nguồn 'nodeAndContexts' chia
// 2 nhóm Node / Context để pulldown hiển thị tiêu đề + mục con (giống panel setting).
export interface OptionGroup {
  labelKey?: TKey; // tiêu đề nhóm (bỏ trống -> không hiện tiêu đề, 1 nhóm phẳng)
  items: string[];
}

export function optionGroupsForSource(source: OptionsSource, ir: FlowIR | null): OptionGroup[] {
  switch (source) {
    case 'interactionNodes':
      return [{ items: [...new Set(interactionNodeNames(ir))] }];
    case 'nodeAndContexts':
      return [
        { labelKey: 'ogNodeGroup', items: [...new Set(interactionNodeNames(ir))] },
        { labelKey: 'ogContextGroup', items: [...new Set(savedContextNames(ir))] },
      ];
    case 'subflows':
      return [{ items: [...new Set((ir?.subflows ?? []).map((s) => s.name))] }];
  }
}

// Handle output (chấm nối dây ở đáy node) suy ra TỪ IR:
//   - none      -> [] (không có output)
//   - fixed     -> danh sách cố định theo schema
//   - editable  -> theo nhánh hiệu lực (CMR sinh từ Pair; còn lại data.branches)
// irAdapter dùng hàm này để render handle; panel dùng để biết số nhánh.
export function sourceHandlesFor(node: FlowNode): BranchDescriptor[] {
  const schema = BRANCH_SCHEMA[node.type];
  if (schema.mode === 'none') return [];
  if (schema.mode === 'fixed') return schema.fixed ?? [];
  // Nhãn trên dây/handle: ưu tiên label do người dùng đặt, fallback về value.
  return effectiveBranches(node.type, node.data).map((b) => ({
    id: b.id,
    label: b.label?.trim() || b.value || undefined,
  }));
}

// Sinh dữ liệu mặc định khi thêm node mới (tham số + nhánh tự do nếu có).
// Field có showIf chỉ seed khi điều kiện đúng với data đang dựng — tránh rải
// tham số của module chưa chọn (vd tham số CDC trên node logic đang là Script).
export function defaultDataFor(type: NodeType): Record<string, unknown> {
  const data: Record<string, unknown> = { description: '' };
  for (const f of PROPERTY_FIELDS[type]) {
    if (f.default == null) continue;
    if (f.showIf && !f.showIf(data)) continue;
    data[f.key] = f.default;
  }
  if (BRANCH_SCHEMA[type].mode === 'editable') {
    // Mặc định chỉ có nhánh catch-all (^.*$), không sửa/không xoá.
    data.branches = [{ id: CATCH_ALL_ID, value: '' }];
  }
  return data;
}
