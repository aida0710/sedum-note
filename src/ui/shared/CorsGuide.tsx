// バケットに入れてもらう CORS の設定の案内。最初の画面と、設定の同期の欄に出す。
// この設定が無いと、アプリからストレージへの要求が全部断られ、「接続できません」になる。

import { translate } from "../i18n/translate";
import { corsRuleJson } from "../settings/corsRule";

export function CorsGuide() {
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
