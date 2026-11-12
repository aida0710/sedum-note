// プラグインのコマンドを実行できなかった理由を、利用者に伝える文にする。

import { PluginModuleError } from "../../core/plugins/pluginModule";
import { PluginResultError } from "../../core/plugins/pluginRun";
import { describeError } from "../i18n/describeError";
import { translate } from "../i18n/translate";
import { PluginChangedError } from "./runPluginCommand";
import { PluginTimeoutError } from "./runPluginModule";

export function describePluginRunError(error: unknown): string {
  if (error instanceof PluginTimeoutError) {
    return translate("plugin.timedOut");
  }
  if (error instanceof PluginChangedError) {
    return translate("plugin.changed");
  }
  if (error instanceof PluginResultError) {
    return error.problem === "reported_error" ? translate("plugin.reportedError", { detail: error.detail }) : translate("plugin.badResult");
  }
  if (error instanceof PluginModuleError) {
    return translate("plugin.moduleProblem", { problem: error.problem });
  }
  return describeError(error);
}
