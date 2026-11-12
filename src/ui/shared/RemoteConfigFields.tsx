// 同期先の入力欄。まず種類（S3 互換ストレージか WebDAV）を選び、その種類の欄を入れる。初回の設定と、設定の画面で使う。

import { isWebDavConfig, type RemoteConfig, type S3RemoteConfig, type WebDavRemoteConfig } from "../../core/remote/remoteConfig";
import { type MessageKey, translate } from "../i18n/translate";

export const EMPTY_S3_CONFIG: S3RemoteConfig = {
  kind: "s3", endpoint: "", bucket: "", region: "auto", prefix: "", accessKeyId: "", secretAccessKey: "",
};
const EMPTY_WEBDAV_CONFIG: WebDavRemoteConfig = { kind: "webdav", url: "", username: "", password: "" };
export const EMPTY_REMOTE_CONFIG: RemoteConfig = EMPTY_S3_CONFIG;

const REMOTE_KINDS: Array<{ kind: "s3" | "webdav"; label: MessageKey; empty: RemoteConfig }> = [
  { kind: "s3", label: "remote.kind.s3", empty: EMPTY_S3_CONFIG },
  { kind: "webdav", label: "remote.kind.webdav", empty: EMPTY_WEBDAV_CONFIG },
];

type RemoteConfigFieldsProps = {
  value: RemoteConfig;
  onChange: (value: RemoteConfig) => void;
};

export function RemoteConfigFields({ value, onChange }: RemoteConfigFieldsProps) {
  const selectedKind = isWebDavConfig(value) ? "webdav" : "s3";
  return (
    <>
      <div className="field">
        <span className="field-label" id="remote-kind-label">{translate("remote.kind")}</span>
        <div className="segmented" role="radiogroup" aria-labelledby="remote-kind-label">
          {REMOTE_KINDS.map(({ kind, label, empty }) => (
            // 種類を変えたら、欄は空から始める（別の種類の値は使えない）。
            <button key={kind} type="button" role="radio" aria-checked={selectedKind === kind} className={selectedKind === kind ? "on" : ""}
              onClick={() => selectedKind !== kind && onChange(empty)}>
              {translate(label)}
            </button>
          ))}
        </div>
        <span className="hint">{translate(isWebDavConfig(value) ? "remote.kindHint.webdav" : "remote.kindHint.s3")}</span>
      </div>
      {isWebDavConfig(value) ? <WebDavFields value={value} onChange={onChange} /> : <S3Fields value={value} onChange={onChange} />}
    </>
  );
}

function S3Fields({ value, onChange }: { value: S3RemoteConfig; onChange: (value: S3RemoteConfig) => void }) {
  const update = (field: Exclude<keyof S3RemoteConfig, "kind">) => (event: React.ChangeEvent<HTMLInputElement>) =>
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

function WebDavFields({ value, onChange }: { value: WebDavRemoteConfig; onChange: (value: WebDavRemoteConfig) => void }) {
  const update = (field: Exclude<keyof WebDavRemoteConfig, "kind">) => (event: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [field]: event.target.value });
  return (
    <>
      <div className="field">
        <label htmlFor="remote-webdav-url">{translate("remote.webdavUrl")}</label>
        <input id="remote-webdav-url" value={value.url} onChange={update("url")} placeholder={translate("remote.webdavUrlPlaceholder")} autoComplete="off" spellCheck={false} inputMode="url" />
        <span className="hint">{translate("remote.webdavUrlHint")}</span>
      </div>
      <div className="field-grid">
        <div className="field">
          <label htmlFor="remote-webdav-username">{translate("remote.webdavUsername")}</label>
          <input id="remote-webdav-username" value={value.username} onChange={update("username")} autoComplete="off" spellCheck={false} />
        </div>
        <div className="field">
          <label htmlFor="remote-webdav-password">{translate("remote.webdavPassword")}</label>
          <input id="remote-webdav-password" type="password" value={value.password} onChange={update("password")} autoComplete="off" />
          <span className="hint">{translate("remote.webdavPasswordHint")}</span>
        </div>
      </div>
    </>
  );
}
