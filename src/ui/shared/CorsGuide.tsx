// バケットに入れてもらう CORS の設定の案内。Web 版の、最初の画面と設定の同期の欄に出す。
// Web 版はブラウザからストレージへつなぐので、この設定が無いと要求が全部断られ、「接続できません」になる。
// アプリは、アプリの側から送るので CORS の設定が要らず、案内も出さない。

import { translate } from "../i18n/translate";
import { isRunningInTauri } from "../platform/runtime";
import { corsRuleJson } from "../settings/corsRule";

export function CorsGuide() {
  if (isRunningInTauri()) {
    return null;
  }
  const rule = corsRuleJson(window.location.origin);
  return (
    <details>
      <summary>{translate("settings.corsTitle")}</summary>
      <p>{translate("settings.corsDescription")}</p>
      <pre>{rule}</pre>
      <div><button type="button" className="secondary-button" onClick={() => void navigator.clipboard.writeText(rule)}>{translate("settings.corsCopy")}</button></div>
    </details>
  );
}
