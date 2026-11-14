// 設定: このアプリについて。アイコンの元の絵（切り抜いていないもの）と、アプリの名前・版・ライセンス・データの扱い・
// ソースコードと不具合の報告先。ライセンスとデータの扱いは、このページの中で開く（設定のページの一覧は増やさない）。

import { ChevronLeft } from "lucide-react";
import { useState } from "react";
import { translate } from "../i18n/translate";
import { APP_VERSION } from "../update/appVersion";
import { DataHandlingView } from "./DataHandlingView";
import { ExternalLinkButton } from "./ExternalLinkButton";
import { LicensesView } from "./LicensesView";

// アイコンの元の絵。もらったファイルをそのまま置き、縮めたり切り抜いたりしない（アイコンは src-tauri/app-icon/README.md の手順で別に作る）。
const ARTWORK_URL = `${import.meta.env.BASE_URL}app-artwork.webp`;
const ARTWORK_SIZE = 1024;
const SOURCE_CODE_URL = "https://github.com/aida0710/sedum-note";
const ISSUES_URL = "https://github.com/aida0710/sedum-note/issues";

type AboutView = "overview" | "licenses" | "dataHandling";

// onOpenDataSettings: 設定の「データ」のページ（バックアップの欄がある）へ移る。
export function AboutSection({ onOpenDataSettings }: { onOpenDataSettings: () => void }) {
  const [view, setView] = useState<AboutView>("overview");
  if (view === "overview") {
    return <AboutOverview onOpen={setView} onOpenDataSettings={onOpenDataSettings} />;
  }
  return (
    <>
      <button type="button" className="about-back" aria-label={translate("about.back")} onClick={() => setView("overview")}>
        <ChevronLeft size={16} aria-hidden="true" />{translate("settings.about")}
      </button>
      {view === "licenses" ? <LicensesView /> : <DataHandlingView />}
    </>
  );
}

function AboutOverview({ onOpen, onOpenDataSettings }: { onOpen: (view: AboutView) => void; onOpenDataSettings: () => void }) {
  return (
    <section className="settings-section about-section">
      <h2>{translate("settings.about")}</h2>
      <img className="about-artwork" src={ARTWORK_URL} alt={translate("about.artwork")} width={ARTWORK_SIZE} height={ARTWORK_SIZE} />
      <p className="hint">{translate("about.artworkCredit")}</p>
      <p className="about-name">Sedum Note</p>
      <p>{translate("about.description")}</p>
      <p>{translate("update.currentVersion", { version: APP_VERSION })}</p>
      <p>{translate("about.license")}</p>
      <div className="about-actions">
        <button type="button" className="secondary-button" onClick={() => onOpen("licenses")}>{translate("about.licenses")}</button>
        <button type="button" className="secondary-button" onClick={() => onOpen("dataHandling")}>{translate("about.dataHandling")}</button>
        <ExternalLinkButton url={SOURCE_CODE_URL} label={translate("about.sourceCode")} />
        <ExternalLinkButton url={ISSUES_URL} label={translate("about.reportIssue")} />
      </div>
      <p className="hint">{translate("about.noWarranty")}</p>
      <div>
        <button type="button" className="secondary-button" onClick={onOpenDataSettings}>{translate("about.openBackup")}</button>
      </div>
    </section>
  );
}
