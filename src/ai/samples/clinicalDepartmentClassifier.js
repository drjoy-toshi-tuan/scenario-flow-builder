var logger = $runner.getLogger();

// ==================================================================
// プロパティの取得
// ==================================================================

// 参照元モジュール名: 診療科名を取得したいSTTモジュールの名前
var sourceModule = $runner.getProperty("module");

// DB保存フラグ
var saveDepartment2DB = String($runner.getProperty("saveDepartment2DB") || "").toLowerCase() === "yes";

// ==================================================================
// 初期化
// ==================================================================

// マッチなしの場合のデフォルト結果
var finalRes = "NO_RESULT";

// ==================================================================
// モジュール名チェック
// ==================================================================

if (sourceModule === null || sourceModule === undefined || String(sourceModule).trim() === "") {
    logger.warn("[ClinicalDeptClassifier] プロパティ未設定: module が空です。");
    $runner.setResult(finalRes);
    throw new Error("module property is required");
}
sourceModule = String(sourceModule).trim();

// ==================================================================
// モジュール結果の取得・分類処理
// ==================================================================

// 参照元モジュールから結果を取得
var rawRes = $runner.getModuleResult(sourceModule);

if (rawRes === null || rawRes === undefined) {
    logger.warn("[ClinicalDeptClassifier] 結果なし: module=" + sourceModule + " が null/undefined を返しました。");

} else {
    var convertedRes = String(rawRes).trim();

    // タイムアウト・エラーの場合はそのまま出力
    if (convertedRes === "TIMEOUT" || convertedRes === "ERROR") {
        finalRes = convertedRes;
        logger.info("[ClinicalDeptClassifier] モジュール異常終了: " + convertedRes + " (module=" + sourceModule + ")");

    } else if (convertedRes === "") {
        logger.warn("[ClinicalDeptClassifier] 結果なし: module=" + sourceModule + " の出力が空です。");

    } else {

        // オブジェクト clinical_department にSTT取得値をセット
        $runner.setObject("clinical_department", convertedRes);
        logger.info("[ClinicalDeptClassifier] clinical_department セット: " + convertedRes);

        if (saveDepartment2DB) {
            try {
                var saveSuccess = $ivr.exec("save2db", "save", JSON.stringify({
                    contextField: {
                        contextName: "clinicalDepartment",
                        displayType: "DEPARTMENT",
                        value: convertedRes
                    }
                }));
                if (saveSuccess) {
                    logger.info("[ClinicalDeptClassifier] DB保存成功: " + convertedRes);
                } else {
                    logger.error("[ClinicalDeptClassifier] DB保存失敗!");
                }
            } catch (e) {
                logger.error("[ClinicalDeptClassifier] DB保存エラー: " + e);
            }
        }

        // 値は取得できたがどのグループにもマッチしない場合のデフォルト
        finalRes = "NOT_COVERED";

        // プロパティ clinical_department_1〜10 と result_name_1〜10 を順番にチェック
        for (var i = 1; i <= 10; i++) {
            // 診療科グループ（セミコロン区切りで複数指定可）
            var deptProp   = $runner.getProperty("clinical_department_" + i);
            // 上記グループにマッチした場合の出力結果名
            var resultProp = $runner.getProperty("result_name_" + i);

            if (deptProp === null || deptProp === undefined) {
                continue;
            }

            var deptStr = String(deptProp).trim();
            if (deptStr === "") {
                continue;
            }

            // セミコロン区切りをリスト化し、前後の空白を除去
            var deptList = deptStr.split(";");
            for (var j = 0; j < deptList.length; j++) {
                deptList[j] = deptList[j].trim();
            }

            if (deptList.indexOf(convertedRes) !== -1) {
                // result_name_i が未設定の場合は "group_N" をフォールバックとして使用
                if (resultProp !== null && resultProp !== undefined && String(resultProp).trim() !== "") {
                    finalRes = String(resultProp).trim();
                } else {
                    finalRes = "group_" + i;
                    logger.warn("[ClinicalDeptClassifier] result_name_" + i + " 未設定のためフォールバック使用: " + finalRes);
                }
                break;
            }
        }

        logger.info("[ClinicalDeptClassifier] 振り分け結果: " + finalRes);
    }
}

// ==================================================================
// 結果出力
// ==================================================================

$runner.setResult(finalRes);