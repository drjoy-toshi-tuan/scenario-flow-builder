// ─────────────────────────────────────────────────────────────────────────────
// Knowledge cho AI sinh code/prompt chuẩn Brekeke.
//
//   - BREKEKE_SCRIPT_KNOWLEDGE (mặc định): bản CÔ ĐỌNG — API guide $runner/$ivr +
//     vài skeleton ngắn (rút gọn từ script thật). ~3k token/lần gọi (thay vì ~16k
//     nếu nhúng cả 5 script đầy đủ) để tiết kiệm chi phí.
//   - Muốn few-shot ĐẦY ĐỦ (fidelity cao nhất, tốn token): xem './samples' —
//     import { sampleScriptsBlock } và nối vào chuỗi dưới. Script thật vẫn được
//     giữ trong src/ai/samples/ làm tài liệu tham chiếu.
//   - OPENAI_PROMPT_KNOWLEDGE: khung cho prompt của node OpenAI — bổ sung mẫu sau.
// ─────────────────────────────────────────────────────────────────────────────

// API reference chắt lọc từ script thật (custom_classification, Clinical Department
// Classifier, DOB Re-confirmation, Module Result Binder, Phone Normalization).
const BREKEKE_API_GUIDE = `## 実行環境
- スクリプトは AI電話 (Brekekeベース) の Logic ノード「Script」モジュールの本体として実行される。
- 言語: ES5相当の JavaScript（var / function を使う。アロー関数・let/const・テンプレートリテラルは避ける）。
- ブラウザ/Node API（window, document, require, fetch 等）は使用不可。
- 発信者の回答（STT 済みテキスト、または DTMF）を解析し、結果を setResult で返す。

## $runner API
- var logger = $runner.getLogger(); logger.info(msg) / logger.warn(msg) / logger.error(msg)
- $runner.getProperty(name) → ノードのプロパティ値（未設定は null）。例: "module"（参照元モジュール名）, "prompt", "saveXxx2DB"。
- $runner.getModuleResult(moduleName) → 他モジュールの結果。文字列 or { text: "..." } の両方あり得る。必ずガードする:
    var r = $runner.getModuleResult(name);
    var text = (r && typeof r === "object" && r.text) ? String(r.text) : (r == null ? "" : String(r));
    text = text.trim();
- $runner.getObject(name) / $runner.setObject(name, value) → コンテキストオブジェクト。setObject した値は後続で <%name%> として参照可能。
- $runner.get(key) / $runner.set(key, value) → 通話内セッション変数（例: "seq" の連番管理）。
- $runner.setResult(value) → 【最重要】ここで返す文字列がノードの分岐正規表現（^value$）と照合され分岐が決まる。NO_RESULT / REPEAT / INVALID などでも必ず setResult する（リトライ・フォールバック分岐のため）。

## $ivr API
- $ivr.exec("save2db", "save", JSON.stringify({ contextField: { contextName, displayType, value } })) → コンテキストを DB 保存。displayType: CLASSIFICATION | DEPARTMENT | DATE | DATE_OF_BIRTH | PHONE_NUMBER | NUMBER | TEXT。
- $ivr.exec("save2db", "save", JSON.stringify({ utterance: {...} })) → 対話ログ保存。$ivr.exec("save2db", "parseTimestamp", isoString) → ミリ秒。
- $ivr.exec("tts-prompt", "extractTaggedContent", JSON.stringify({ prompt: p, stripTags: true })) → TTSタグ除去。
- $ivr.exec("system-variable", "replaceTemplateVariables", text) → <%変数%> を展開。
- $ivr.play(prompt, true) → TTS 再生。プロンプト内 #data# は算出値へ置換（prompt.split("#data#").join(value)）。
- $ivr.connected() → 接続中か。$ivr.getRID() → リクエストID。$ivr.getOtherNumber() → 発信者番号。外部呼び出し(save2db等)は try/catch で囲む。

## 結果 (setResult) の慣習値
- NO_RESULT: 入力なし/空 / REPEAT: 聞き返し要求 / INVALID: 不正入力(再質問) / TIMEOUT・ERROR(または time_out・error): 参照元異常を透過 / NOT_COVERED: 値は取れたが未該当 / それ以外: intentラベルや正規化値（分岐の正規表現と一致させる）。

## STT 正規化の定石（正規表現照合の前に必ず実施）
- 全角数字→半角、全角英字→半角、カタカナ→ひらがな、記号・空白除去。STT誤認補正（円→年 等）。単音番号＋助動詞は ^…$ 完全一致で誤判定回避。`;

// Skeleton ngắn (hand-written từ script thật) — dạy cấu trúc/idiom chuẩn.
const CONDENSED_SAMPLES = String.raw`### スケルトン1: 回答の分類 → 分岐（最頻ユースケース）
` + '```js\n' + String.raw`var logger = $runner.getLogger();
// 入力取得（string / {text} 両対応）
var r = $runner.getModuleResult("入力_用件");
var text = (r && typeof r === "object" && r.text) ? String(r.text) : (r == null ? "" : String(r));
text = text.trim();

// 正規化（全角→半角、カナ→ひらがな、記号除去）※実際はSTT誤認補正も足す
function normalize(s) {
  if (!s) return "";
  var n = s.replace(/[０-９]/g, function(c){ return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
  n = n.replace(/[ァ-ヶ]/g, function(c){ return String.fromCharCode(c.charCodeAt(0) - 0x60); });
  return n.replace(/[\s、。・「」！？]/g, "");
}

// 判定：番号 → 動詞キーワードの順。単独数字は ^n$ で完全一致（誤判定回避）
function classify(rawText) {
  var n = normalize(rawText);
  if (n.length === 0) return "NO_RESULT";
  if (/(もう(いち|一)(ど|度|かい|回)|繰り返)/.test(n)) return "REPEAT";
  if (/^1$/.test(n) || /1[番万]/.test(n) || /(変更|へんこう)/.test(n)) return "変更";
  if (/^2$/.test(n) || /2[番万]/.test(n) || /(キャンセル|取り消)/.test(n)) return "キャンセル";
  // …他の選択肢も同様に（具体的な動詞は番号より優先させたい場合 reconcile する）
  return "NO_RESULT";
}
var result = classify(text);

// 保存＋出力（NO_RESULT/REPEAT は保存しない）
if (result !== "NO_RESULT" && result !== "REPEAT") {
  try {
    $ivr.exec("save2db", "save", JSON.stringify({
      contextField: { contextName: "classification", displayType: "CLASSIFICATION", value: result }
    }));
  } catch (e) { logger.error(e); }
  $runner.setObject("classification", result);
}
$runner.setResult(result); // ★必ず実行（分岐の照合対象）` + '\n```' + String.raw`

### スケルトン2: 参照元モジュールの結果を変数格納＋DB保存（Module Result Binder型）
` + '```js\n' + String.raw`var logger = $runner.getLogger();
var moduleName = $runner.getProperty("module");         // 参照元モジュール名 or "<%変数%>"
var variableName = $runner.getProperty("variable");     // 格納先（後続で <%変数%> 参照可）
var contextName = $runner.getProperty("contextName");   // DB保存する場合のみ
var contextDisplayType = $runner.getProperty("contextDisplayType");

// "<%name%>" 形式は getObject、それ以外は getModuleResult
var m = moduleName ? moduleName.match(/^<%(.+?)%>$/) : null;
var res = m ? $runner.getObject(m[1]) : $runner.getModuleResult(moduleName);
var val = res ? String(res).trim() : "";

if (!moduleName) { $runner.setResult("NO_RESULT"); }
else if (val === "time_out" || val === "error") { $runner.setResult(val); }
else if (val === "") { $runner.setResult("NO_RESULT"); }
else {
  if (variableName) $runner.setObject(variableName, val);
  if (contextName && contextDisplayType && $ivr.connected()) {
    try {
      if ($ivr.exec("save2db", "save", JSON.stringify({
        contextField: { contextName: contextName, displayType: contextDisplayType, value: val }
      }))) $runner.setObject(contextName, val);
    } catch (e) { logger.error(e); }
  }
  $runner.setResult(val);
}` + '\n```' + String.raw`

### スケルトン3: グループ分け（プロパティで N グループを順にマッチ）
` + '```js\n' + String.raw`var res = $runner.getModuleResult($runner.getProperty("module"));
var val = res == null ? "" : String(res).trim();
var out = "NO_RESULT";
if (val === "TIMEOUT" || val === "ERROR") out = val;
else if (val !== "") {
  out = "NOT_COVERED";                                  // 取れたが未該当のデフォルト
  for (var i = 1; i <= 10; i++) {
    var group = $runner.getProperty("group_" + i);      // "外科;整形外科" などセミコロン区切り
    if (!group) continue;
    var list = group.split(";");
    for (var j = 0; j < list.length; j++) list[j] = list[j].trim();
    if (list.indexOf(val) !== -1) {
      out = $runner.getProperty("result_name_" + i) || ("group_" + i);
      break;
    }
  }
}
$runner.setResult(out);` + '\n```' + String.raw`

### 応用テクニック（必要に応じて）
- 復唱/読み上げ: $ivr.play(prompt.split("#data#").join(value), true) で確認プロンプトを再生。
- 再入対策: $runner.setObject でキャッシュ(JSON)を保存し、次回同一入力なら再利用。
- 電話番号整形: 市外局番テーブルでハイフン挿入、先頭3桁で mobile/landline 判定。`;

export const BREKEKE_SCRIPT_KNOWLEDGE = `${BREKEKE_API_GUIDE}

## 出力ルール
- 出力は完成したスクリプト本体（純 JavaScript）のみ。Markdown・説明・\`\`\` フェンスは付けない。
- 構文エラーがなく（new Function で parse 可能）、上記 API 慣習・下記スケルトンのスタイルに従うこと。

## 参考スケルトン（このスタイル・APIに従うこと）
${CONDENSED_SAMPLES}`;

export const OPENAI_PROMPT_KNOWLEDGE = `
## Bối cảnh node OpenAI
- Prompt chạy trong node OpenAI của flow AI電話: nhận câu trả lời (đã STT) của người gọi
  và phải phân tích/chuẩn hoá nó theo yêu cầu, output khớp với các nhánh của node.
- Prompt nên: nêu vai trò, mô tả input, liệt kê các giá trị output hợp lệ, ràng buộc
  "chỉ trả về 1 trong các giá trị đó, không thêm chữ nào khác".

## Prompt mẫu (DÁN THÊM các mẫu chuẩn vào đây khi có)
(chưa có mẫu — sẽ được bổ sung)
`;
