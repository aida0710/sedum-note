// アプリに入れている、ほかの人が作ったソフトウェアのライセンスの一覧（public/third-party-licenses.json）。
// 一覧は scripts/licenses/collectThirdPartyLicenses.mjs が作る。1MB ほどあるので、ライセンスの画面を開いたときにだけ読む。

export type ThirdPartyPackage = {
  ecosystem: "npm" | "cargo";
  name: string;
  version: string;
  // パッケージが宣言しているライセンス（SPDX の式）。宣言していなければ null。
  license: string | null;
  // ソースコードの置き場所。
  repository: string;
  // ライセンスの文（texts のキー）。
  textIds: string[];
  // パッケージにライセンスの文が入っておらず、標準の文を当てたときの、そのライセンスの名前。
  standardText: string | null;
};

export type ThirdPartyLicenses = {
  packages: ThirdPartyPackage[];
  texts: Record<string, string>;
};

const THIRD_PARTY_LICENSES_URL = `${import.meta.env.BASE_URL}third-party-licenses.json`;

export async function loadThirdPartyLicenses(): Promise<ThirdPartyLicenses> {
  const response = await fetch(THIRD_PARTY_LICENSES_URL);
  if (!response.ok) {
    throw new Error(`third-party licenses: ${response.status}`);
  }
  return (await response.json()) as ThirdPartyLicenses;
}

// 名前かライセンスに、打った言葉が入っているもの（大文字と小文字は区別しない）。
export function packagesMatching(packages: ThirdPartyPackage[], query: string): ThirdPartyPackage[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return packages;
  }
  return packages.filter((entry) => {
    const haystack = `${entry.name} ${entry.license ?? ""}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}
