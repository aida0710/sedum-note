// 設定: プラグイン。GitHub のリポジトリから取り込み、できること（読むもの・書くもの）を確かめてから入れる。
// 入れたプラグインは、入り切り・更新の確かめ・削除ができる。

import { useState } from "react";
import { type InstalledPlugin, installedPluginFrom } from "../../core/plugins/installedPlugins";
import { PluginManifestError, type PluginRead, type PluginWrite } from "../../core/plugins/pluginManifest";
import { PluginModuleError } from "../../core/plugins/pluginModule";
import { describePluginSource, fetchPluginPackage, parsePluginSource, PluginFetchError, type PluginSource } from "../../core/plugins/pluginSource";
import { describeError } from "../i18n/describeError";
import { type MessageKey, translate } from "../i18n/translate";
import { useDialogs } from "../shared/DialogProvider";
import { preventSubmitByImeKey } from "../shared/imeKeyEvent";
import { ModalDialog } from "../shared/ModalDialog";
import { useAsyncAction } from "../shared/useAsyncAction";
import { useUnsavedSettingsDraft } from "../settings/unsavedSettingsDrafts";
import { sendPluginRequest, usePlugins } from "./pluginAccess";

const READ_LABELS: Record<PluginRead, MessageKey> = {
  "note.title": "plugin.read.title", "note.body": "plugin.read.body", "note.selection": "plugin.read.selection",
};
const WRITE_LABELS: Record<PluginWrite, MessageKey> = {
  "note.selection": "plugin.write.selection", "note.body": "plugin.write.body", "note.append": "plugin.write.append",
  "note.title": "plugin.write.title", message: "plugin.write.message",
};
// コミットとハッシュは長いので、一覧には先頭だけを出す。
const SHORT_HASH_LENGTH = 12;

// 取り込めなかった理由を、利用者に伝える文にする。
function describePluginProblem(error: unknown): string {
  if (error instanceof PluginFetchError) {
    return translate(`plugin.fetchProblem.${error.problem}`);
  }
  if (error instanceof PluginManifestError) {
    return translate("plugin.manifestProblem", { problem: error.problem });
  }
  if (error instanceof PluginModuleError) {
    return translate(error.problem === "has_imports" ? "plugin.moduleHasImports" : "plugin.moduleProblem", { problem: error.problem });
  }
  return describeError(error);
}

async function fetchPlugin(source: PluginSource): Promise<InstalledPlugin> {
  return installedPluginFrom(await fetchPluginPackage(source, sendPluginRequest), source);
}

export function PluginsSection() {
  const { plugins, installPlugin, removePlugin, setPluginEnabled } = usePlugins();
  const dialogs = useDialogs();
  const [sourceText, setSourceText] = useState("");
  useUnsavedSettingsDraft("pluginSource", sourceText.trim() !== "");
  // 取ってきて、入れる前の確認を待っているプラグイン。
  const [reviewing, setReviewing] = useState<InstalledPlugin | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [upToDateId, setUpToDateId] = useState<string | null>(null);
  const fetchForReview = useAsyncAction(async (source: PluginSource) => {
    setProblem(null);
    setUpToDateId(null);
    try {
      setReviewing(await fetchPlugin(source));
    } catch (error) {
      setProblem(describePluginProblem(error));
    }
  });
  const add = () => {
    try {
      void fetchForReview.run(parsePluginSource(sourceText));
    } catch (error) {
      setProblem(describePluginProblem(error));
    }
  };
  // 取り込み元の今のコミットを確かめる。変わっていれば、できることを見せ直してから入れ替える。
  const checkForUpdate = useAsyncAction(async (installed: InstalledPlugin) => {
    setProblem(null);
    setUpToDateId(null);
    try {
      const latest = await fetchPlugin(installed.source);
      if (latest.commitSha === installed.commitSha) {
        setUpToDateId(installed.manifest.id);
      } else {
        setReviewing({ ...latest, enabled: installed.enabled });
      }
    } catch (error) {
      setProblem(describePluginProblem(error));
    }
  });
  const remove = async (plugin: InstalledPlugin) => {
    if (await dialogs.confirm({ message: translate("plugin.uninstallConfirm", { name: plugin.manifest.name }), confirmLabel: translate("plugin.uninstall"), danger: true })) {
      await removePlugin(plugin.manifest.id);
    }
  };
  const installed = plugins ?? [];
  return (
    <section className="settings-section">
      <h2>{translate("settings.plugins")}</h2>
      <p>{translate("plugin.description")}</p>
      <form className="field" onKeyDown={preventSubmitByImeKey} onSubmit={(event) => { event.preventDefault(); add(); }}>
        <label htmlFor="plugin-source">{translate("plugin.source")}</label>
        <div className="field-row">
          <input id="plugin-source" value={sourceText} onChange={(event) => setSourceText(event.target.value)} placeholder="owner/repository/folder@v1.0.0" autoComplete="off" spellCheck={false} />
          <button type="submit" className="secondary-button" disabled={fetchForReview.busy || sourceText.trim() === ""}>{translate("plugin.fetch")}</button>
        </div>
        <span className="hint">{translate("plugin.sourceHint")}</span>
      </form>
      {(fetchForReview.busy || checkForUpdate.busy) && <p className="hint" role="status">{translate("plugin.fetching")}</p>}
      {problem !== null && <div className="form-error" role="alert">{problem}</div>}
      {installed.length === 0 && plugins !== null && <p className="hint">{translate("plugin.none")}</p>}
      <ul className="plugin-list">
        {installed.map((plugin) => (
          <li key={plugin.manifest.id}>
            <div className="plugin-summary">
              <strong>{plugin.manifest.name}</strong> <span className="hint">{plugin.manifest.version}</span>
              <p>{plugin.manifest.description}</p>
              <p className="hint">{describePluginSource(plugin.source)} · {plugin.commitSha.slice(0, SHORT_HASH_LENGTH)}</p>
              {upToDateId === plugin.manifest.id && <p className="form-success" role="status">{translate("plugin.upToDate")}</p>}
            </div>
            <label className="checkbox-line">
              <input type="checkbox" role="switch" className="switch" checked={plugin.enabled} onChange={(event) => void setPluginEnabled(plugin.manifest.id, event.target.checked)} />
              {translate("plugin.enabled")}
            </label>
            <button type="button" className="secondary-button" disabled={checkForUpdate.busy} onClick={() => void checkForUpdate.run(plugin)}>{translate("plugin.checkForUpdate")}</button>
            <button type="button" className="danger-button" onClick={() => void remove(plugin)}>{translate("plugin.uninstall")}</button>
          </li>
        ))}
      </ul>
      {reviewing && (
        <PluginReviewDialog plugin={reviewing} replaces={installed.find((plugin) => plugin.manifest.id === reviewing.manifest.id) ?? null}
          onCancel={() => setReviewing(null)}
          onInstall={async () => {
            await installPlugin(reviewing);
            setReviewing(null);
            setSourceText("");
          }} />
      )}
    </section>
  );
}

type PluginReviewDialogProps = {
  plugin: InstalledPlugin;
  // 同じ ID の、いま入っているプラグイン（更新のとき）。新しく入れるなら null。
  replaces: InstalledPlugin | null;
  onInstall: () => Promise<void>;
  onCancel: () => void;
};

// 入れる前の確認。プラグインが読むもの・書くもの・足すコマンドと、取り込み元のコミットを見せる。
function PluginReviewDialog({ plugin, replaces, onInstall, onCancel }: PluginReviewDialogProps) {
  const { manifest } = plugin;
  const install = useAsyncAction(onInstall);
  const title = translate(replaces ? "plugin.reviewUpdateTitle" : "plugin.reviewTitle", { name: manifest.name });
  return (
    <ModalDialog label={title} title={title} description={manifest.description} className="plugin-review" onClose={onCancel}>
      <dl className="plugin-facts">
        <dt>{translate("plugin.version")}</dt>
        <dd>{replaces && replaces.manifest.version !== manifest.version ? `${replaces.manifest.version} → ${manifest.version}` : manifest.version}{manifest.author && ` · ${manifest.author}`}</dd>
        <dt>{translate("plugin.sourceLabel")}</dt>
        <dd>{describePluginSource(plugin.source)}<br /><code>{plugin.commitSha}</code></dd>
        <dt>{translate("plugin.moduleHash")}</dt>
        <dd><code>{plugin.moduleSha256}</code></dd>
        <dt>{translate("plugin.reads")}</dt>
        <dd>{manifest.reads.length === 0 ? translate("plugin.nothing") : <ul>{manifest.reads.map((read) => <li key={read}>{translate(READ_LABELS[read])}</li>)}</ul>}</dd>
        <dt>{translate("plugin.writes")}</dt>
        <dd>{manifest.writes.length === 0 ? translate("plugin.nothing") : <ul>{manifest.writes.map((write) => <li key={write}>{translate(WRITE_LABELS[write])}</li>)}</ul>}</dd>
        <dt>{translate("plugin.commands")}</dt>
        <dd><ul>{manifest.commands.map((command) => <li key={command.id}>{command.title}{command.description && <span className="hint"> — {command.description}</span>}</li>)}</ul></dd>
      </dl>
      <p className="hint">{translate("plugin.sandboxNote")}</p>
      {install.errorMessage && <div className="form-error" role="alert">{install.errorMessage}</div>}
      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={onCancel}>{translate("common.cancel")}</button>
        <button type="button" className="primary-button" disabled={install.busy} onClick={() => void install.run(undefined)}>
          {translate(replaces ? "plugin.update" : "plugin.install")}
        </button>
      </div>
    </ModalDialog>
  );
}
