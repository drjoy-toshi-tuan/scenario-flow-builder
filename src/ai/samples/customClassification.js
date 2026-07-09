/**
 * 【Brekeke PBX Module Script】入力_用件 (5択 用件判定)
 *
 * 質問：「1番,予約の日時変更」「2番,予約のキャンセルのみ」「3番,予約の確認」
 *       「4番,初診予約、または転院相談」「5番,その他問い合わせ」
 *
 * 出力 (2系統):
 *   (a) setResult(classification)        ← 分岐用 intent label
 *         変更 / キャンセル / 確認 / 初診予約/転院相談 / その他問い合わせ / "REPEAT" / "NO_RESULT"
 *   (b) setObject("user_classification") ← 次工程(TTS等)用の long label (REPEAT/NO_RESULT は保存しない)
 *
 * 番号→intent:
 *   1 → 変更   2 → キャンセル   3 → 確認   4 → 初診予約/転院相談   5 → その他問い合わせ
 *
 * ============================================================
 * reconcile (照合) 方式
 * ============================================================
 *   strong verb (具体verb) は番号より優先 / weak verb は番号に負ける
 *   ※ option4 は同一 intent でも 初診/転院/新規=strong、予約=weak と
 *      match した token で強弱が変わるため、テンプレの isStrongVerbIntent
 *      (intent単位) ではなく isStrongVerbMatch(n) (token単位) で判定する。
 *
 * 誤判定回避：単音番号+助動詞は ^…$ アンカー完全一致のみ
 *   ○「さんです」→ 確認    ×「田中さんです」→ NO_RESULT
 *   ×「予約に変更」→ 変更   (「に」は途中の助詞、verb 判定で勝つ)
 */

// =============================================================
// 1. 入力取得
// =============================================================
var classification = "NO_RESULT";
var rawInput = $runner.getModuleResult("入力_用件");
var text = "";
if (rawInput && typeof rawInput === "object" && rawInput.text) {
    text = String(rawInput.text);
} else if (typeof rawInput === "string") {
    text = rawInput;
}
text = text == null ? "" : String(text).trim();


// =============================================================
// 2. 正規化
// =============================================================
function normalize(s) {
    if (!s) return "";
    var n = s;
    n = n.replace(/[\r\n\t]/g, "");
    // 全角数字 → 半角
    n = n.replace(/[０-９]/g, function(c) {
        return String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 0x30);
    });
    // 全角英字 → 半角
    n = n.replace(/[Ａ-Ｚａ-ｚ]/g, function(c) {
        return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
    });
    // カタカナ → ひらがな (regex 統一のため)
    n = n.replace(/[\u30A1-\u30F6]/g, function(c) {
        return String.fromCharCode(c.charCodeAt(0) - 0x60);
    });
    // 記号・空白すべて除去
    n = n.replace(/[\s、。,.\-_\/・:;！!？?「」『』（）\(\)　]/g, "");
    return n;
}


// =============================================================
// 3. repeat 判定（意図キーワード共起時は除外）
// =============================================================
function hasRepeatMarker(n) {
    return (
        /(もう(いち|一)(ど|度|かい|回))/.test(n) ||
        /(もういっかい|もういっど)/.test(n) ||
        /(も(いち|一)(ど|度|かい|回))/.test(n) ||
        /(さいど(おねがい|お願い|きかせ|いって)?)/.test(n) ||
        /(再度(おねがい|お願い|きかせ|いって)?)/.test(n) ||
        /(まえ(に)?もど(って|る|して))/.test(n) ||
        /(前(に)?戻(って|る|して))/.test(n) ||
        /(きこえ(ない|ません|なかった|づらい))/.test(n) ||
        /(聞こえ(ない|ません|なかった|づらい))/.test(n) ||
        /(ききと(れない|れません|れなかった|りにくい))/.test(n) ||
        /(聞き取(れない|れません|れなかった|りにくい))/.test(n) ||
        /(くりかえ(し|して|しください))/.test(n) ||
        /(繰り返(し|して|しください))/.test(n)
    );
}

// 意図キーワード guard：repeat マーカーと共起したら REPEAT ではなく intent
function hasIntentKeyword(n) {
    return /(変更|へんこう|変えた|かえた|ずらす|ずらし|ずらせ|ずらして|日時|時間|キャンセル|きゃんせる|きゃんそる|こんそーる|きゃみそーる|取り消|取消|とりけし|やめ|確認|かくにん|ちぇっく|確かめ|たしかめ|何時|なんじ|初診|しょしん|新規|しんき|はじめて|初めて|転院|てんいん|紹介状|予約|よやく|その他|そのた|そのほか|ほかの|相談|そうだん|問い合わせ|問合せ|といあわせ|質問|しつもん)/.test(n);
}

function isRepeat(n) {
    if (!hasRepeatMarker(n)) return false;
    if (hasIntentKeyword(n)) return false;
    return true;
}


// =============================================================
// 4. 番号判定 (Phase A) → intent string or null
// =============================================================
var SUFFIX = "(です|だ|でお?ねがい(します)?|でお願い(します)?|でいい(です)?|がいい(です)?|おねがい(します)?|お願い(します)?|になります|のほう|に|ね|よ)?";

function classifyByNumber(rawText, normText) {
    // 単独の数字
    if (rawText === "1" || normText === "1") return "変更";
    if (rawText === "2" || normText === "2") return "キャンセル";
    if (rawText === "3" || normText === "3") return "確認";
    if (rawText === "4" || normText === "4") return "初診予約/転院相談";
    if (rawText === "5" || normText === "5") return "その他問い合わせ";

    // 単音番号 + 助動詞語尾 (完全一致のみ)
    if (new RegExp("^(1|いち|一|ひとつ)" + SUFFIX + "$").test(normText)) return "変更";
    if (new RegExp("^(2|に|にい|にー|にぃ|にーー|二|ふたつ)" + SUFFIX + "$").test(normText)) return "キャンセル";
    if (new RegExp("^(3|さん|さーん|さあん|三|みっつ)" + SUFFIX + "$").test(normText)) return "確認";
    if (new RegExp("^(4|よん|よーん|し|しー|四|よっつ)" + SUFFIX + "$").test(normText)) return "初診予約/転院相談";
    if (new RegExp("^(5|ご|ごー|五|いつつ)" + SUFFIX + "$").test(normText)) return "その他問い合わせ";

    // 番号系パターン (「番」→「万」「判」「版」「晩」STT 誤認対応。2は「位」も)
    var num1Re = /(^|[^0-9])(1[番万判版晩]|1ばん|1ばー?ん|いちばー?ん|一[番万判版晩]|ひとばん)/;
    var num2Re = /(^|[^0-9])(2[番万判版晩位]|2ばん|2ばー?ん|にばー?ん|二[番万判版晩位]|ふたばん)/;
    var num3Re = /(^|[^0-9])(3[番万判版晩]|3ばん|3ばー?ん|さんばー?ん|三[番万判版晩])/;
    var num4Re = /(^|[^0-9])(4[番万判版晩]|4ばん|4ばー?ん|よばん|よばー?ん|よんばん|よんばー?ん|四[番万判版晩]|しばん|しばー?ん)/;
    var num5Re = /(^|[^0-9])(5[番万判版晩]|5ばん|5ばー?ん|ごばー?ん|五[番万判版晩]|ごばん)/;

    if (num1Re.test(normText)) return "変更";
    if (num2Re.test(normText)) return "キャンセル";
    if (num3Re.test(normText)) return "確認";
    if (num4Re.test(normText)) return "初診予約/転院相談";
    if (num5Re.test(normText)) return "その他問い合わせ";

    return null;
}


// =============================================================
// 5. 内容判定 (Phase B) → intent string or null
// =============================================================
// 重要：STRONG (具体verb) を先に、WEAK (予約/catch-all) を最後に。
function classifyByVerb(n) {
    // --- 変更 (STRONG) ---
    if (/(変更|へんこう|変えた|かえた|ずらす|ずらし|ずらせ|ずらして)/.test(n)) return "変更";
    // --- キャンセル (STRONG / STT誤認 こんそーる等) ---
    if (/(キャンセル|きゃんせる|きゃんそる|こんそーる|きゃみそーる|取り消|取消|とりけし|やめたい|やめる)/.test(n)) return "キャンセル";
    // --- 確認 (STRONG) ---
    if (/(確認|かくにん|ちぇっく|確かめ|たしかめ|何時|なんじ)/.test(n)) return "確認";
    // --- 初診予約/転院相談 (STRONG token: 初診/転院/新規)。転院 は 相談 より先 ---
    if (/(初診|しょしん|新規予約|新規|しんき|はじめて|初めて|転院|てんいん|紹介状)/.test(n)) return "初診予約/転院相談";
    // --- 初診予約/転院相談 (WEAK token: 予約 単独 = 新規予約のパス)。番号には負ける ---
    if (/(予約|よやく)/.test(n)) return "初診予約/転院相談";
    // --- その他問い合わせ (WEAK / catch-all) ---
    if (/(その他|そのた|そのほか|ほかの|相談|そうだん|問い合わせ|問合せ|といあわせ|質問|しつもん)/.test(n)) return "その他問い合わせ";

    return null;
}


// =============================================================
// 6. 統合 (reconcile)
// =============================================================
// ★ token単位の強弱判定 (テンプレの isStrongVerbIntent を置換)
//   strong = 番号より優先すべき具体verb。予約/その他/相談 は含めない(=weak)
function isStrongVerbMatch(n) {
    return /(変更|へんこう|変えた|かえた|ずらす|ずらし|ずらせ|ずらして|キャンセル|きゃんせる|きゃんそる|こんそーる|きゃみそーる|取り消|取消|とりけし|やめたい|やめる|確認|かくにん|ちぇっく|確かめ|たしかめ|何時|なんじ|初診|しょしん|新規予約|新規|しんき|はじめて|初めて|転院|てんいん|紹介状)/.test(n);
}

function reconcile(numIntent, verbIntent, strongMatch) {
    if (numIntent && verbIntent) {
        if (strongMatch) return verbIntent; // 具体verb → verb 勝ち
        return numIntent;                   // weak verb → 番号勝ち
    }
    if (numIntent) return numIntent;
    if (verbIntent) return verbIntent;
    return "NO_RESULT"; // 両方 null → NO_RESULT
}


// =============================================================
// 6.5 user_classification 変換 (setObject 用 long label)
// =============================================================
function toUserClassification(c) {
    if (c === "変更")              return "予約の日時変更";
    if (c === "キャンセル")        return "予約のキャンセル";
    if (c === "確認")              return "予約の確認";
    if (c === "初診予約/転院相談")  return "初診予約、または転院相談";
    if (c === "その他問い合わせ")   return "その他のお問い合わせ";
    return c;
}


// =============================================================
// 7. 判定パイプライン
// =============================================================
function classify(rawText) {
    var n = normalize(rawText);
    if (n.length === 0) return "NO_RESULT";
    if (isRepeat(n)) return "REPEAT";
    var numIntent = classifyByNumber(rawText, n);
    var verbIntent = classifyByVerb(n);
    return reconcile(numIntent, verbIntent, isStrongVerbMatch(n));
}

classification = classify(text);


// =============================================================
// 8. 保存・出力
// =============================================================
if (classification !== "NO_RESULT" && classification !== "REPEAT") {
    var userClassification = toUserClassification(classification);

    // (a) classification を save2db + setObject
    var contextField = {
        contextName: "classification",
        displayType: "CLASSIFICATION",
        value: classification
    };
    try {
        $ivr.exec("save2db", "save", JSON.stringify({ contextField: contextField }));
    } catch (e) { /* silent */ }
    $runner.setObject("classification", classification);

    // (b) user_classification を setObject (次工程の TTS 等で使用)
    $runner.setObject("user_classification", userClassification);
}

// setResult は常に実行 (jump setting が REPEAT/NO_RESULT で retry できるよう)
$runner.setResult(classification);