var logger = $runner.getLogger();

// ==================================================================
// プロパティの取得
// ==================================================================

// 参照元モジュール名: 結果を取得したいモジュールの名前
var moduleName = $runner.getProperty("module");

// 格納先変数名: 設定した場合、以降のモジュールで <%変数名%> として参照可能
// ※未設定の場合はオブジェクトへの格納をスキップし、結果の取得のみ行う
var variableName = $runner.getProperty("variable");

// DB保存用プロパティ: 両方設定された場合のみDB保存を行う
var contextName = $runner.getProperty("contextName");
var contextDisplayType = $runner.getProperty("contextDisplayType");

// <%変数名%> 形式の場合は getObject、それ以外は getModuleResult で取得
var moduleRes;
var objectVarMatch = moduleName ? moduleName.match(/^<%(.+?)%>$/) : null;
if (objectVarMatch) {
    var objectVarName = objectVarMatch[1];
    moduleRes = $runner.getObject(objectVarName);
    logger.info("[ModuleResultBinder] 変数参照モード: getObject(" + objectVarName + ")");
} else {
    moduleRes = $runner.getModuleResult(moduleName);
}
var moduleResStr = moduleRes ? String(moduleRes).trim() : "";

// ==================================================================
// functions
// ==================================================================


function saveContext2DB(value) {
  if (!contextName || !contextDisplayType || !value) return;

  if (!$ivr.connected()) return;

  var saveRequestData = JSON.stringify({
    contextField: {
      contextName: contextName,
      displayType: contextDisplayType,
      value: value
    }
  });

  try {
    var saveSuccess = $ivr.exec("save2db", "save", saveRequestData);
    if (saveSuccess) {
      $runner.setObject(contextName, value);
    }
  } catch (e) {
    logger.error("[ModuleResultBinder][" + $ivr.getRID() + "] DB保存失敗: " + e);
  }
}

// ==================================================================
// 結果処理
// ==================================================================

// モジュール名が未設定の場合
if (!moduleName) {
    $runner.setResult("NO_RESULT");
    logger.warn("[ModuleResultBinder] プロパティ未設定: module が空です。");
}
// タイムアウト・エラーの場合はそのまま出力
else if (moduleResStr === "time_out" || moduleResStr === "error") {
    $runner.setResult(moduleResStr);
    logger.info("[ModuleResultBinder] モジュール異常終了: " + moduleResStr + " (module=" + moduleName + ")");
}
// モジュール出力が空の場合
else if (moduleResStr === "") {
    $runner.setResult("NO_RESULT");
    logger.info("[ModuleResultBinder] 結果なし: module=" + moduleName + " の出力が空です。");
}
// 正常取得
else {
    if (variableName) {
        $runner.setObject(variableName, moduleResStr);
        logger.info("[ModuleResultBinder] オブジェクト格納: " + variableName + " = " + moduleResStr);
    } else {
        logger.info("[ModuleResultBinder] 変数名未設定のため格納スキップ: 結果=" + moduleResStr);
    }

    saveContext2DB(moduleResStr);

    $runner.setResult(moduleResStr);
    logger.info("[ModuleResultBinder] 正常終了: " + moduleResStr);
}
