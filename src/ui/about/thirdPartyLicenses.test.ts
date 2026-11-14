import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { packagesMatching, type ThirdPartyLicenses } from "./thirdPartyLicenses";

const licenses = JSON.parse(readFileSync("public/third-party-licenses.json", "utf8")) as ThirdPartyLicenses;
const listed = new Set(licenses.packages.map((entry) => `${entry.ecosystem}:${entry.name}@${entry.version}`));

// アプリに入る npm のパッケージ（package-lock.json の、開発にだけ使うもの・入れる環境を選ぶ省略可能なもの以外）。
function npmPackagesInLockfile(): string[] {
  const lockfile = JSON.parse(readFileSync("package-lock.json", "utf8")) as { packages: Record<string, { version?: string; dev?: boolean; devOptional?: boolean; optional?: boolean }> };
  return Object.entries(lockfile.packages)
    .filter(([path, entry]) => path !== "" && !entry.dev && !entry.devOptional && !entry.optional)
    .map(([path, entry]) => `npm:${path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length)}@${entry.version}`);
}

function rustCratesInLockfile(): string[] {
  const lockfile = readFileSync("src-tauri/Cargo.lock", "utf8");
  return [...lockfile.matchAll(/\[\[package\]\]\nname = "([^"]+)"\nversion = "([^"]+)"/g)]
    .filter(([, name]) => name !== "sedum-note")
    .map(([, name, version]) => `cargo:${name}@${version}`);
}

describe("ほかの人が作ったソフトウェアのライセンスの一覧", () => {
  it("アプリに入る npm のパッケージと Rust のクレートが、全部載っている（足したら npm run licenses を流し直す）", () => {
    expect(npmPackagesInLockfile().filter((name) => !listed.has(name))).toEqual([]);
    expect(rustCratesInLockfile().filter((name) => !listed.has(name))).toEqual([]);
  });

  it("どのパッケージにも、ライセンスの文が付いている", () => {
    expect(licenses.packages.filter((entry) => entry.textIds.length === 0 || entry.textIds.some((id) => !licenses.texts[id])).map((entry) => entry.name)).toEqual([]);
  });

  it("名前かライセンスで絞り込める", () => {
    const packages = licenses.packages.filter((entry) => entry.name === "react" || entry.name === "yjs");
    expect(packagesMatching(packages, "REACT").map((entry) => entry.name)).toEqual(["react"]);
    expect(packagesMatching(packages, "mit").length).toBe(2);
    expect(packagesMatching(packages, "  ")).toEqual(packages);
  });
});
