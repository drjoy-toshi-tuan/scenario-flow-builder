// ─────────────────────────────────────────────────────────────────────────────
// Script mẫu ĐANG CHẠY trên Brekeke (dùng làm few-shot cho AI gen code chuẩn).
// Import nguyên văn bằng Vite `?raw` để KHÔNG bị lỗi escape ký tự regex (\d, ァ…).
//
// Thêm mẫu mới: bỏ file .js vào thư mục này rồi thêm 1 entry vào SAMPLE_SCRIPTS.
// Muốn giảm token gửi AI: bớt bớt entry trong mảng (giữ mẫu gần với use case nhất).
// ─────────────────────────────────────────────────────────────────────────────

import customClassification from './customClassification.js?raw';
import clinicalDepartmentClassifier from './clinicalDepartmentClassifier.js?raw';
import dobReconfirmation from './dobReconfirmation.js?raw';
import moduleResultBinder from './moduleResultBinder.js?raw';
import phoneNormalization from './phoneNormalization.js?raw';

export interface SampleScript {
  title: string;
  note: string; // 1 dòng mô tả kỹ thuật nổi bật của mẫu
  code: string;
}

export const SAMPLE_SCRIPTS: SampleScript[] = [
  {
    title: '用件判定 (5択 classification)',
    note: 'STT/DTMF番号＋動詞の照合、正規化、REPEAT/NO_RESULT、setResult＋save2db(CLASSIFICATION)',
    code: customClassification,
  },
  {
    title: '診療科分類 (Clinical Department Classifier)',
    note: 'getProperty で参照元モジュール指定、group分け、TIMEOUT/ERROR/NOT_COVERED、save2db(DEPARTMENT)',
    code: clinicalDepartmentClassifier,
  },
  {
    title: '生年月日 復唱 (DOB Re-confirmation)',
    note: '和暦/西暦パース、正規化パイプライン、$ivr.play(#data#)、raw_dob_data キャッシュ、フォールバックチェーン',
    code: dobReconfirmation,
  },
  {
    title: 'Module Result Binder',
    note: '<%変数%> 参照 vs getModuleResult、variable格納、save2db(任意 displayType)',
    code: moduleResultBinder,
  },
  {
    title: '電話番号 正規化 (Phone Normalization)',
    note: '市外局番でハイフン整形、mobile/landline判定、着信番号フォールバック、replaceTemplateVariables',
    code: phoneNormalization,
  },
];

// Ghép mẫu thành 1 khối văn bản (few-shot) cho system prompt.
export function sampleScriptsBlock(): string {
  return SAMPLE_SCRIPTS.map(
    (s, i) =>
      `### サンプル${i + 1}: ${s.title}\n（ポイント: ${s.note}）\n\`\`\`js\n${s.code.trim()}\n\`\`\``,
  ).join('\n\n');
}
