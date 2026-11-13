// 設定の画面の MCP の欄（AI のクライアントからメモを操作する窓口）。PC 版にだけ同梱する。

import { useState } from "react";
import { type McpSettings, newMcpToken } from "../../core/vault/mcpSettings";
import { translate } from "../i18n/translate";
import type { McpGatewayControl } from "./useMcpGateway";
import { MCP_ENDPOINT_URL } from "../platform/mcpGateway";
import { useDialogs } from "../shared/DialogProvider";
import { useAsyncAction } from "../shared/useAsyncAction";
import { SettingCheckboxRow } from "../settings/SettingRow";

export function McpSection({ gateway }: { gateway: McpGatewayControl }) {
  const { settings, errorMessage, updateSettings } = gateway;
  const [tokenShown, setTokenShown] = useState(false);
  const save = useAsyncAction(updateSettings);
  const dialogs = useDialogs();
  if (settings === null) {
    return null;
  }
  const change = (changes: Partial<McpSettings>) => void save.run((current) => ({ ...current, ...changes }));
  // 作り直すと、今のトークンでつないでいるクライアントは、その場で使えなくなる。
  const renewToken = async () => {
    if (await dialogs.confirm({ message: translate("mcp.renewTokenConfirm"), confirmLabel: translate("mcp.renewToken"), danger: true })) {
      change({ token: newMcpToken() });
    }
  };
  const authorizationHeader = `Authorization: Bearer ${tokenShown ? settings.token : "•".repeat(12)}`;
  return (
    <section className="settings-section">
      <h2>{translate("settings.mcp")}</h2>
      <p>{translate("mcp.description")}</p>
      <p>{translate("mcp.privacyWarning")}</p>
      <SettingCheckboxRow controlId="mcp-enabled" label={translate("mcp.enable")} checked={settings.enabled} onChange={(enabled) => change({ enabled })} />
      {(errorMessage ?? save.errorMessage) && <div className="form-error" role="alert">{translate("mcp.startFailed", { reason: errorMessage ?? save.errorMessage ?? "" })}</div>}
      {settings.enabled && (
        <>
          <div className="field">
            <label>{translate("mcp.connection")}</label>
            <pre>{`${MCP_ENDPOINT_URL}\n${authorizationHeader}`}</pre>
            <span className="hint">{translate("mcp.connectionHint")}</span>
          </div>
          <div className="form-actions">
            <button type="button" className="secondary-button" onClick={() => setTokenShown(!tokenShown)}>
              {translate(tokenShown ? "mcp.hideToken" : "mcp.showToken")}
            </button>
            <button type="button" className="secondary-button" onClick={() => void navigator.clipboard.writeText(settings.token)}>{translate("mcp.copyToken")}</button>
            <button type="button" className="danger-button" onClick={() => void renewToken()}>{translate("mcp.renewToken")}</button>
          </div>
          <SettingCheckboxRow controlId="mcp-allow-permanent-delete" label={translate("mcp.allowPermanentDelete")} hint={translate("mcp.allowPermanentDeleteHint")}
            checked={settings.allowPermanentDelete} onChange={(allowPermanentDelete) => change({ allowPermanentDelete })} />
        </>
      )}
    </section>
  );
}
