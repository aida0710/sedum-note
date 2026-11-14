// 設定: このアプリについて。アイコンの元の絵（切り抜いていないもの）と、アプリの名前・版・公開しているページ。

import { translate } from "../i18n/translate";
import { openExternalUrl } from "../platform/openExternalUrl";
import { useAsyncAction } from "../shared/useAsyncAction";
import { APP_VERSION } from "../update/appVersion";

// アイコンの元の絵。もらったファイルをそのまま置き、縮めたり切り抜いたりしない（アイコンは src-tauri/app-icon/README.md の手順で別に作る）。
const ARTWORK_URL = `${import.meta.env.BASE_URL}app-artwork.webp`;
const ARTWORK_SIZE = 1024;
const SOURCE_CODE_URL = "https://github.com/aida0710/sedum-note";

export function AboutSection() {
  const openSourceCode = useAsyncAction(() => openExternalUrl(SOURCE_CODE_URL));
  return (
    <section className="settings-section about-section">
      <h2>{translate("settings.about")}</h2>
      <img className="about-artwork" src={ARTWORK_URL} alt={translate("settings.aboutArtwork")} width={ARTWORK_SIZE} height={ARTWORK_SIZE} />
      <p className="about-name">Sedum Note</p>
      <p>{translate("settings.aboutDescription")}</p>
      <p>{translate("update.currentVersion", { version: APP_VERSION })}</p>
      <p>{translate("settings.aboutLicense")}</p>
      <div>
        <button type="button" className="secondary-button" onClick={() => void openSourceCode.run(undefined)}>{translate("settings.aboutSourceCode")}</button>
      </div>
      {openSourceCode.errorMessage && <div className="form-error" role="alert">{openSourceCode.errorMessage}</div>}
    </section>
  );
}
