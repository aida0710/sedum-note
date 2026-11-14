// アプリのアイコン（public/app-icon.svg。Web の favicon と同じもの）。左の列の名前の横と、最初の画面・ロックの画面で使う。

// Web 版は /sedum-note/ の下に置くので、置き場所の頭を付ける。
const APP_ICON_URL = `${import.meta.env.BASE_URL}app-icon.svg`;

export function AppIcon({ size, className }: { size: number; className?: string }) {
  return <img className={className} src={APP_ICON_URL} alt="" width={size} height={size} />;
}
