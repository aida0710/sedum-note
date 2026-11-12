import { findRemoteConfigProblem, isWebDavConfig, normalizeEndpoint, normalizePrefix, type RemoteConfig } from "../../core/remote/remoteConfig";
import { translate } from "../i18n/translate";

// 入力された同期先を整える（前後の空白や、末尾の「/」を落とす）。
function normalizedRemoteConfig(input: RemoteConfig): RemoteConfig {
  if (isWebDavConfig(input)) {
    return { ...input, url: input.url.trim(), username: input.username.trim() };
  }
  return {
    ...input,
    endpoint: normalizeEndpoint(input.endpoint),
    bucket: input.bucket.trim(),
    region: input.region.trim(),
    prefix: normalizePrefix(input.prefix),
    accessKeyId: input.accessKeyId.trim(),
  };
}

// 入力された同期先を整え、問題があればその文を返す。
export function checkRemoteConfigInput(input: RemoteConfig): { config: RemoteConfig } | { problem: string } {
  const config = normalizedRemoteConfig(input);
  const problem = findRemoteConfigProblem(config);
  return problem === null ? { config } : { problem: translate(`remote.problem.${problem}`) };
}
