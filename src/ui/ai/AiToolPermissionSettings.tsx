// 設定の「AI」のページの、AI に任せるメモの操作。操作の種類ごとに、許可しない・毎回聞く・聞かずに行うを選ぶ。

import { AI_TOOL_PERMISSIONS, type AiSettings, type AiToolPermission, type AiToolPermissions } from "../../core/vault/aiSettings";
import { translate } from "../i18n/translate";
import { SettingRow } from "../settings/SettingRow";

const CATEGORIES: Array<keyof AiToolPermissions> = ["read", "edit", "trash", "permanentDelete"];

type AiToolPermissionSettingsProps = { settings: AiSettings; onChange: (settings: AiSettings) => void };

export function AiToolPermissionSettings({ settings, onChange }: AiToolPermissionSettingsProps) {
  return (
    <div className="ai-permissions" role="group" aria-labelledby="ai-permissions-heading">
      <h3 id="ai-permissions-heading">{translate("ai.permissions")}</h3>
      <p className="hint">{translate("ai.permissions.description")}</p>
      {CATEGORIES.map((category) => (
        <SettingRow key={category} controlId={`ai-permission-${category}`} label={translate(`ai.permission.${category}`)}
          hint={category === "permanentDelete" && settings.permissions.permanentDelete === "allow" ? translate("ai.permission.permanentDeleteWarning") : undefined}>
          {(control) => (
            <select {...control} value={settings.permissions[category]}
              onChange={(event) => onChange({ ...settings, permissions: { ...settings.permissions, [category]: event.target.value as AiToolPermission } })}>
              {AI_TOOL_PERMISSIONS.map((permission) => <option key={permission} value={permission}>{translate(`ai.permission.value.${permission}`)}</option>)}
            </select>
          )}
        </SettingRow>
      ))}
    </div>
  );
}
