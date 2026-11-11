// 設定: テーマを選ぶ・作る・直す・消す。

import { Plus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { newRandomId } from "../../core/crypto/randomId";
import { translate } from "../i18n/translate";
import { SYSTEM_THEME_ID, updateDevicePreferences, useDevicePreferences } from "../preferences/devicePreferences";
import { useDialogs } from "../shared/DialogProvider";
import { BUILT_IN_THEMES, DARK_THEME, LIGHT_THEME } from "../theme/builtInThemes";
import type { CustomTheme } from "../theme/customTheme";
import { useThemeInUse } from "../theme/themeInUse";
import { CustomThemeEditor } from "./CustomThemeEditor";
import { ThemeSample } from "./ThemeSample";

export function ThemeSection() {
  const { themeId, customThemes } = useDevicePreferences();
  const themeInUse = useThemeInUse();
  const dialogs = useDialogs();
  const [editedTheme, setEditedTheme] = useState<CustomTheme | null>(null);
  const selectedCustomTheme = customThemes.find((theme) => theme.id === themeId);

  const startNewTheme = () =>
    setEditedTheme({ id: `custom-${newRandomId()}`, name: translate("theme.newName"), scheme: themeInUse.scheme, colors: themeInUse.colors });
  const saveTheme = (saved: CustomTheme) => {
    updateDevicePreferences({ themeId: saved.id, customThemes: [...customThemes.filter((theme) => theme.id !== saved.id), saved] });
    setEditedTheme(null);
  };
  const removeTheme = async (removed: CustomTheme) => {
    if (await dialogs.confirm({ message: translate("theme.removeConfirm", { name: removed.name }), confirmLabel: translate("theme.remove"), danger: true })) {
      updateDevicePreferences({ themeId: SYSTEM_THEME_ID, customThemes: customThemes.filter((theme) => theme.id !== removed.id) });
    }
  };

  return (
    <section className="settings-section">
      <h2>{translate("settings.theme")}</h2>
      <div className="theme-choices" role="radiogroup" aria-label={translate("settings.theme")}>
        <ThemeChoice id={SYSTEM_THEME_ID} name={translate("theme.name.system")} selectedId={themeId}
          sample={<div className="theme-sample split" aria-hidden="true"><SystemHalf dark={false} /><SystemHalf dark /></div>} />
        {BUILT_IN_THEMES.map((theme) => (
          <ThemeChoice key={theme.id} id={theme.id} name={translate(`theme.name.${theme.id}`)} selectedId={themeId} sample={<ThemeSample colors={theme.colors} />} />
        ))}
        {customThemes.map((theme) => (
          <ThemeChoice key={theme.id} id={theme.id} name={theme.name} selectedId={themeId} sample={<ThemeSample colors={theme.colors} />} />
        ))}
      </div>
      {editedTheme ? (
        <>
          <p>{translate("theme.customHint")}</p>
          <CustomThemeEditor key={editedTheme.id} initialTheme={editedTheme} onSave={saveTheme} onCancel={() => setEditedTheme(null)} />
        </>
      ) : (
        <div className="form-actions">
          {selectedCustomTheme && (
            <>
              <button type="button" className="danger-button" onClick={() => void removeTheme(selectedCustomTheme)}>{translate("theme.remove")}</button>
              <button type="button" className="secondary-button" onClick={() => setEditedTheme(selectedCustomTheme)}>{translate("theme.edit")}</button>
            </>
          )}
          <button type="button" className="secondary-button" onClick={startNewTheme}><Plus size={14} /> {translate("theme.create")}</button>
        </div>
      )}
    </section>
  );
}

function ThemeChoice({ id, name, selectedId, sample }: { id: string; name: string; selectedId: string; sample: ReactNode }) {
  const selected = id === selectedId;
  return (
    <button type="button" role="radio" aria-checked={selected} className={`theme-choice${selected ? " on" : ""}`}
      onClick={() => updateDevicePreferences({ themeId: id })}>
      {sample}
      <span className="theme-choice-name">{name}</span>
    </button>
  );
}

// 「システムに合わせる」の見本の半分。ライトとダークを並べる。
function SystemHalf({ dark }: { dark: boolean }) {
  const { colors } = dark ? DARK_THEME : LIGHT_THEME;
  return <div style={{ background: colors.panel, borderLeft: dark ? `1px solid ${colors.line}` : undefined }} />;
}
