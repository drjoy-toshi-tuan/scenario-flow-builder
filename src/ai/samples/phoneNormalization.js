// ==================================================================
// 1. 定数定義および市外局番リスト (Area Code List)
// ==================================================================
var logger = $runner.getLogger();

// 市外局番リスト (総務省の番号計画に基づく)
var AREA_2 = ["03", "06"];
var AREA_3 = ["011", "017", "018", "019", "022", "023", "024", "025", "026", "027", "028", "029", "042", "043", "044", "045", "046", "047", "048", "049", "052", "053", "054", "055", "058", "059", "072", "073", "075", "076", "077", "078", "079", "082", "083", "084", "086", "087", "088", "089", "092", "093", "095", "096", "097", "098", "099"];
var AREA_4 = ["0123", "0126", "0134", "0138", "0143", "0144", "0154", "0155", "0157", "0166", "0172", "0176", "0178", "0185", "0186", "0191", "0193", "0197", "0198", "0225", "0226", "0229", "0234", "0235", "0238", "0242", "0246", "0248", "0254", "0256", "0257", "0258", "0263", "0265", "0266", "0267", "0268", "0270", "0274", "0276", "0277", "0280", "0282", "0283", "0284", "0285", "0289", "0294", "0296", "0297", "0299", "0422", "0428", "0436", "0438", "0439", "0463", "0465", "0466", "0467", "0470", "0475", "0476", "0479", "0480", "0493", "0494", "0495", "0532", "0533", "0537", "0538", "0544", "0545", "0547", "0550", "0555", "0557", "0558", "0561", "0562", "0563", "0564", "0565", "0566", "0568", "0569", "0572", "0574", "0575", "0577", "0584", "0586", "0587", "0594", "0595", "0596", "0598", "0721", "0725", "0739", "0742", "0743", "0744", "0745", "0748", "0749", "0761", "0766", "0770", "0771", "0773", "0774", "0776", "0778", "0794", "0797", "0798", "0823", "0827", "0833", "0834", "0835", "0836", "0848", "0852", "0853", "0857", "0859", "0863", "0865", "0868", "0877", "0884", "0895", "0897", "0898", "0930", "0940", "0942", "0944", "0947", "0948", "0949", "0955", "0956", "0957", "0965", "0968", "0972", "0973", "0977", "0979", "0982", "0985", "0986", "0994", "0996"];
var AREA_5 = ["04992", "04994", "01456", "01457", "01632", "01634", "01635"];

// ==================================================================
// 2. ユーティリティ関数 (Utility Functions)
// ==================================================================

function getPhoneType(digits) {
    var pre = String(digits).substring(0, 3);
    return ["090", "080", "070", "060"].indexOf(pre) !== -1 ? "mobile" : "landline";
}

function saveUtterance(promptText, startTime, endTime) {
    // ★ プラットフォーム標準の抽出を使用（tts_g / tts_ai など全タグに対応）
    //   他モジュールと統一。tts_ai: などのタグが utterance に残る問題を回避。
    var textContent = $ivr.exec("tts-prompt", "extractTaggedContent", JSON.stringify({ prompt: promptText, stripTags: true }));
    if (!textContent || textContent.trim() === "") return;
    try {
        var seqNumber = $runner.get("seq") ? parseInt(String($runner.get("seq")), 10) : 1;
        var utterance = {
            seq: seqNumber,
            messageType: 0,
            text: textContent,
            utteranceType: "MESSAGE",
            startMsec: $ivr.exec("save2db", "parseTimestamp", startTime.toISOString()),
            endMsec: $ivr.exec("save2db", "parseTimestamp", endTime.toISOString())
        };
        var saved = $ivr.exec("save2db", "save", JSON.stringify({ utterance: utterance }));
        if (saved) {
            $runner.set("seq", seqNumber + 1);
            logger.info("[PhoneProcess] Utterance saved. seq=" + seqNumber);
        } else {
            logger.error("[PhoneProcess] Utterance save failed.");
        }
    } catch (e) {
        logger.error("[PhoneProcess] Utterance save error: " + e);
    }
}

/**
 * 日本の電話番号形式にハイフンを挿入する
 * @param {string} digits 数字のみの文字列
 * @return {string} ハイフン付きの番号
 */
function formatJapanesePhone(digits) {
    var d = String(digits).replace(/^\+81/, "0").replace(/\D/g, "");
    var len = d.length;

    if (len === 11) {
        return d.substring(0, 3) + "-" + d.substring(3, 7) + "-" + d.substring(7);
    } 

    if (len === 10) {
        var p5 = d.substring(0, 5);
        var p4 = d.substring(0, 4);
        var p3 = d.substring(0, 3);
        var p2 = d.substring(0, 2);

        if (AREA_5.indexOf(p5) !== -1) return p5 + "-" + d.substring(5, 6) + "-" + d.substring(6);
        if (AREA_4.indexOf(p4) !== -1) return p4 + "-" + d.substring(4, 6) + "-" + d.substring(6);
        if (AREA_3.indexOf(p3) !== -1) return p3 + "-" + d.substring(3, 6) + "-" + d.substring(6);
        if (AREA_2.indexOf(p2) !== -1) return p2 + "-" + d.substring(2, 6) + "-" + d.substring(6);
        
        return d.substring(0, 3) + "-" + d.substring(3, 6) + "-" + d.substring(6);
    }
    return d;
}

/**
 * 読み上げ用に数字の間にスペースを挿入する (AmiVoice 1文字読み対策)
 * @param {string} dStr 数字文字列
 * @return {string} スペース区切りの文字列
 */
function toSpacedDigits(dStr) {
    if (!dStr) return "";
    return dStr.split("").join(" ");
}

/**
 * 設定されたモード(phoneReadingMode)に基づいて確認用数値を生成する
 * @param {string} digits 数字のみの文字列
 * @return {string} 整形済み文字列
 */
function getPhoneConfirmValue(digits) {
    var mode = $runner.getProperty("phoneReadingMode"); // 全桁 or 下4桁

    if (mode === "下4桁") {
        var last4 = digits.slice(-4);
        return toSpacedDigits(last4); // 例: "1 2 3 4"
    } 
    
    // デフォルトは全桁表示
    return formatJapanesePhone(digits); // 例: "090-1234-5678"
}

// ==================================================================
// 3. メイン実行ブロック (Main Execution)
// ==================================================================

// ガイダンス (プロンプト内で #data# を電話番号に置換して再生)
var prompt = $runner.getProperty("prompt") || "";
var saveAdditionalPhoneNumber2DB = String($runner.getProperty("saveAdditionalPhoneNumber2DB") || "").toLowerCase() === "yes";

// デフォルト結果を先行設定（処理中にエラーが発生した場合のフォールバック）
$runner.setResult("NO_RESULT");

// モジュール結果(STT/DTMF)の取得
var moduleName = $runner.getProperty("module");
var moduleRes = $runner.getModuleResult(moduleName);
var moduleDigits = moduleRes ? String(moduleRes).replace(/\D/g, "") : "";

/**
 * [CASE A] モジュール出力がある場合 (STT/DTMF優先)
 * #data# を整形済み番号に置換してプロンプトを再生し、setResult で返す。
 */
if (moduleName) {
    var mPre = moduleDigits.substring(0, 3);
    var isMobile = ["090", "080", "070", "060", "050"].indexOf(mPre) !== -1;
    // 日本の国内番号は必ず先頭が "0"。先頭0が無い場合は桁数が合っても不正扱い。
    // 例: "9012345678"(10桁だが先頭0なし）→ INVALID
    var startsWithZero = moduleDigits.charAt(0) === "0";

    if (moduleDigits.length === 0) {
        $runner.setResult("NO_RESULT");
        logger.info("[PhoneProcess] Module Result Flow: NO_RESULT");
    } else if (startsWithZero && ((isMobile && moduleDigits.length === 11) || (!isMobile && moduleDigits.length === 10))) {
        var finalResult = formatJapanesePhone(moduleDigits);
        var finalPromptA = prompt.replaceAll("#data#", finalResult);
        finalPromptA = $ivr.exec("system-variable", "replaceTemplateVariables", finalPromptA);
        var startTimeA = new Date();
        if (finalPromptA) {
            $ivr.play(finalPromptA, true);
        }
        var endTimeA = new Date();
        saveUtterance(finalPromptA, startTimeA, endTimeA);
        if (saveAdditionalPhoneNumber2DB) {
            try {
                var saveSuccess = $ivr.exec("save2db", "save", JSON.stringify({
                    contextField: {
                        contextName: "additionalPhoneNumber",
                        displayType: "PHONE_NUMBER",
                        value: moduleDigits
                    }
                }));
                if (saveSuccess) {
                    $runner.setObject("additionalPhoneNumber", moduleDigits);
                    logger.info("[PhoneProcess] Module Flow: DB Context Saved (" + moduleDigits + ")");
                } else {
                    logger.error("[PhoneProcess] Module Flow: DB Save Failed (" + moduleDigits + ")");
                }
            } catch (e) {
                logger.error("[PhoneProcess] DB Save Error: " + e);
            }
        }
        $runner.setObject("phone_type", getPhoneType(moduleDigits));
        $runner.setResult(finalResult);
        logger.info("[PhoneProcess] Module Result Flow: " + finalResult + " (Input: " + moduleDigits + ")");
    } else {
        $runner.setResult("INVALID");
        logger.info("[PhoneProcess] Module Result Flow: INVALID (Input: " + moduleDigits + ")");
    }
}
/**
 * [CASE B] モジュール出力がない場合 (着信番号処理)
 * incomingPhoneプロパティまたはIVR取得番号をDB保存し、<%incoming_phone%> をプロンプトに展開して再生する。
 */
else {
    var incomingRaw = $runner.getProperty(".incomingPhone") || $ivr.getOtherNumber();
    var incomingDigits = String(incomingRaw).replace(/^\+81/, "0").replace(/\D/g, "");

    if (incomingDigits) {
        // 1. Context保存 (saveAdditionalPhoneNumber2DB が yes の場合のみ)
        if (saveAdditionalPhoneNumber2DB) {
            try {
                var contextField = {
                    contextName: "additionalPhoneNumber",
                    displayType: "PHONE_NUMBER",
                    value: incomingDigits
                };
                var saveSuccess = $ivr.exec("save2db", "save", JSON.stringify({ contextField: contextField }));
                if (saveSuccess) {
                    $runner.setObject("additionalPhoneNumber", incomingDigits);
                    logger.info("[PhoneProcess] Incoming Flow: DB Context Saved (" + incomingDigits + ")");
                } else {
                    logger.error("[PhoneProcess] Incoming Flow: DB Save Failed (" + incomingDigits + ")");
                }
            } catch (e) {
                logger.error("[PhoneProcess] DB Save Error: " + e);
            }
        }

        // 2. 読み上げ用Objectの生成 (phoneReadingModeに基づく)
        // ※下4桁モードの場合はスペース区切りになり、AmiVoiceが1文字ずつ読み上げる。
        var displayValue = getPhoneConfirmValue(incomingDigits);

        // プロンプト内で <%incoming_phone%> として使用可能
        $runner.setObject("incoming_phone", displayValue);
        $runner.setObject("phone_type", getPhoneType(incomingDigits));

        var finalPromptB = $ivr.exec("system-variable", "replaceTemplateVariables", prompt);
        var startTimeB = new Date();
        if (finalPromptB) {
            $ivr.play(finalPromptB, true);
        }
        var endTimeB = new Date();
        saveUtterance(finalPromptB, startTimeB, endTimeB);

        $runner.setResult("INCOMING_PROCESSED");
        logger.info("[PhoneProcess] Incoming Flow Display: " + displayValue);
    }
}