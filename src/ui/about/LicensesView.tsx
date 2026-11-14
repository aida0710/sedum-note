// このアプリについて > ライセンス。このアプリ自身のライセンス（Apache License 2.0 の全文）と、絵のライセンス、
// アプリに入れている、ほかの人が作ったソフトウェアのライセンス（名前・版・ライセンス・ソースの置き場所・ライセンスの文）。

import { useEffect, useState } from "react";
import appLicenseText from "../../../LICENSE?raw";
import { translate } from "../i18n/translate";
import { ExternalLinkButton } from "./ExternalLinkButton";
import { loadThirdPartyLicenses, packagesMatching, type ThirdPartyLicenses, type ThirdPartyPackage } from "./thirdPartyLicenses";

type LoadState = { state: "loading" } | { state: "ready"; licenses: ThirdPartyLicenses } | { state: "failed" };

export function LicensesView() {
  const [load, setLoad] = useState<LoadState>({ state: "loading" });
  const [query, setQuery] = useState("");
  useEffect(() => {
    let current = true;
    loadThirdPartyLicenses()
      .then((licenses) => current && setLoad({ state: "ready", licenses }))
      .catch(() => current && setLoad({ state: "failed" }));
    return () => {
      current = false;
    };
  }, []);
  return (
    <>
      <section className="settings-section">
        <h2>{translate("about.licenses")}</h2>
        <h3>Sedum Note</h3>
        <p>{translate("about.appLicense")}</p>
        <p>{translate("about.artworkLicense")}</p>
        <details className="license-text">
          <summary>{translate("about.showLicenseText")}</summary>
          <pre>{appLicenseText}</pre>
        </details>
      </section>
      <section className="settings-section">
        <h3>{translate("about.thirdParty")}</h3>
        <p className="hint">{translate("about.thirdPartyDescription")}</p>
        {load.state === "loading" && <p role="status">{translate("about.thirdPartyLoading")}</p>}
        {load.state === "failed" && <div className="form-error" role="alert">{translate("about.thirdPartyFailed")}</div>}
        {load.state === "ready" && (
          <>
            <input type="search" className="license-search" aria-label={translate("about.thirdPartySearch")} placeholder={translate("about.thirdPartySearch")}
              value={query} onChange={(event) => setQuery(event.target.value)} />
            <ThirdPartyPackageList licenses={load.licenses} packages={packagesMatching(load.licenses.packages, query)} />
          </>
        )}
      </section>
    </>
  );
}

function ThirdPartyPackageList({ licenses, packages }: { licenses: ThirdPartyLicenses; packages: ThirdPartyPackage[] }) {
  return (
    <>
      <p className="hint" role="status">{translate("about.thirdPartyCount", { count: packages.length })}</p>
      <ul className="license-list">
        {packages.map((entry) => <ThirdPartyPackageItem key={`${entry.ecosystem}:${entry.name}@${entry.version}`} entry={entry} texts={licenses.texts} />)}
      </ul>
    </>
  );
}

// 1 つのパッケージ。ライセンスの文は長いので、開いたときにだけ描く（800 件ほどあり、全部描くと重い）。
function ThirdPartyPackageItem({ entry, texts }: { entry: ThirdPartyPackage; texts: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <details className="license-text" onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary>
          <span className="license-package-name">{entry.name}</span> {entry.version}
          <span className="license-package-license">{entry.license ?? translate("about.licenseUnknown")}</span>
        </summary>
        {open && (
          <div className="license-package-detail">
            <ExternalLinkButton url={entry.repository} label={translate("about.openSource")} className="text-button" />
            {entry.standardText && <p className="hint">{translate("about.standardTextNotice", { license: entry.standardText })}</p>}
            {entry.textIds.map((id) => <pre key={id}>{texts[id]}</pre>)}
          </div>
        )}
      </details>
    </li>
  );
}
