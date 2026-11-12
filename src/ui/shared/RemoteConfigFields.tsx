// 同期先（S3 互換ストレージ）の入力欄。初回の設定と、設定の画面で使う。

import type { RemoteConfig } from "../../core/remote/remoteConfig";
import { translate } from "../i18n/translate";

export const EMPTY_REMOTE_CONFIG: RemoteConfig = {
  endpoint: "", bucket: "", region: "auto", prefix: "", accessKeyId: "", secretAccessKey: "",
};

type RemoteConfigFieldsProps = {
  value: RemoteConfig;
  onChange: (value: RemoteConfig) => void;
};

export function RemoteConfigFields({ value, onChange }: RemoteConfigFieldsProps) {
  const update = (field: keyof RemoteConfig) => (event: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [field]: event.target.value });
  return (
    <>
      <div className="field">
        <label htmlFor="remote-endpoint">{translate("remote.endpoint")}</label>
        <input id="remote-endpoint" value={value.endpoint} onChange={update("endpoint")} placeholder={translate("remote.endpointPlaceholder")} autoComplete="off" spellCheck={false} inputMode="url" />
        <span className="hint">{translate("remote.endpointHint")}</span>
      </div>
      <div className="field-grid">
        <div className="field">
          <label htmlFor="remote-bucket">{translate("remote.bucket")}</label>
          <input id="remote-bucket" value={value.bucket} onChange={update("bucket")} autoComplete="off" spellCheck={false} />
        </div>
        <div className="field">
          <label htmlFor="remote-region">{translate("remote.region")}</label>
          <input id="remote-region" value={value.region} onChange={update("region")} autoComplete="off" spellCheck={false} />
          <span className="hint">{translate("remote.regionHint")}</span>
        </div>
      </div>
      <div className="field">
        <label htmlFor="remote-prefix">{translate("remote.prefix")}</label>
        <input id="remote-prefix" value={value.prefix} onChange={update("prefix")} autoComplete="off" spellCheck={false} />
        <span className="hint">{translate("remote.prefixHint")}</span>
      </div>
      <div className="field-grid">
        <div className="field">
          <label htmlFor="remote-access-key">{translate("remote.accessKeyId")}</label>
          <input id="remote-access-key" value={value.accessKeyId} onChange={update("accessKeyId")} autoComplete="off" spellCheck={false} />
        </div>
        <div className="field">
          <label htmlFor="remote-secret-key">{translate("remote.secretAccessKey")}</label>
          <input id="remote-secret-key" type="password" value={value.secretAccessKey} onChange={update("secretAccessKey")} autoComplete="off" />
        </div>
      </div>
    </>
  );
}
