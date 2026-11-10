import { findRemoteConfigProblem, normalizeEndpoint, normalizePrefix, type RemoteConfig } from "../../core/remote/remoteConfig";
import { translate } from "../i18n/translate";

// 入力された同期先を整え、問題があればその文を返す。
export function checkRemoteConfigInput(input: RemoteConfig): { config: RemoteConfig } | { problem: string } {
  const config: RemoteConfig = {
    ...input,
    endpoint: normalizeEndpoint(input.endpoint),
    bucket: input.bucket.trim(),
    region: input.region.trim(),
    prefix: normalizePrefix(input.prefix),
    accessKeyId: input.accessKeyId.trim(),
  };
  const problem = findRemoteConfigProblem(config);
  return problem === null ? { config } : { problem: translate(`remote.problem.${problem}`) };
}
