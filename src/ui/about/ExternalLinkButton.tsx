// 外のページ（GitHub など）をブラウザで開くボタン。開けなかったら、ボタンの下に理由を出す。

import { openExternalUrl } from "../platform/openExternalUrl";
import { useAsyncAction } from "../shared/useAsyncAction";

export function ExternalLinkButton({ url, label, className = "secondary-button" }: { url: string; label: string; className?: string }) {
  const open = useAsyncAction(() => openExternalUrl(url));
  return (
    <>
      <button type="button" className={className} onClick={() => void open.run(undefined)}>{label}</button>
      {open.errorMessage && <div className="form-error" role="alert">{open.errorMessage}</div>}
    </>
  );
}
