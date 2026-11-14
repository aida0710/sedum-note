// 検索する範囲の切り替え。ノートブックかタグの一覧を開いているときは、まずその中を探し、「すべてのメモ」に広げられる。

import { translate } from "../i18n/translate";
import { RadioGroup } from "./RadioGroup";

type SearchScopeSwitchProps = {
  // 開いている一覧（ノートブックかタグ）の名前。
  scopeName: string;
  searchesEverywhere: boolean;
  onChange: (searchesEverywhere: boolean) => void;
};

export function SearchScopeSwitch({ scopeName, searchesEverywhere, onChange }: SearchScopeSwitchProps) {
  return (
    <RadioGroup className="segmented compact search-scope-switch" label={translate("sidebar.searchScope")}>
      <button type="button" role="radio" aria-checked={!searchesEverywhere} title={scopeName} onClick={() => onChange(false)}>
        {translate("sidebar.searchScopeIn", { name: scopeName })}
      </button>
      <button type="button" role="radio" aria-checked={searchesEverywhere} onClick={() => onChange(true)}>{translate("sidebar.searchScopeAll")}</button>
    </RadioGroup>
  );
}
