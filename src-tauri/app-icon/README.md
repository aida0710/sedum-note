# アプリのアイコンの元

アイコンは、絵 `public/app-artwork.webp`（霧の中のブランコ）から作ります。絵の中のブランコに寄せた正方形を切り抜いて使います（切り抜く範囲は `scripts/app-icon/renderIconImages.mjs` の `ICON_CROP`）。`src-tauri/icons/` と Android の `mipmap-*` の画像、`public/app-icon.png` は、この手順で作ります。画像を直接は直しません。

- Windows・Linux のアプリ: 角丸の四角に切り抜いた絵
- macOS の `icon.icns`: 1024 の中に 824 の角丸を置く（macOS の慣習の余白つき）
- Android のアダプティブアイコン: 背景の層に絵を置き、見える中央の 2/3 に切り抜いた正方形が入るようにする。前景の層は透明
- `public/app-icon.png`（256px）: Web の favicon と、画面の中のアイコン（左の列の名前の横、最初の画面・ロックの画面）

## 作り直す

リポジトリの直下で実行します。

```sh
node scripts/app-icon/renderIconImages.mjs /tmp/sedum-note-app-icon

npx tauri icon /tmp/sedum-note-app-icon/manifest.json
rm -r src-tauri/icons/ios

npx tauri icon /tmp/sedum-note-app-icon/macos.png -o /tmp/sedum-note-macos-icon
cp /tmp/sedum-note-macos-icon/icon.icns src-tauri/icons/icon.icns

npx tauri icon /tmp/sedum-note-app-icon/app-icon.png -o /tmp/sedum-note-legacy-icon
for density in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
  cp /tmp/sedum-note-legacy-icon/android/mipmap-$density/ic_launcher.png \
     /tmp/sedum-note-legacy-icon/android/mipmap-$density/ic_launcher_round.png \
     src-tauri/gen/android/app/src/main/res/mipmap-$density/
done
```

- iOS は対応先ではないので、`ios` の出力は消します。
- Android 7（アダプティブアイコンが無い）が使う `ic_launcher.png` と `ic_launcher_round.png` は、角丸に切り抜いた絵だけから作ったものに差し替えます。`manifest.json` から作ると、背景の層をそのまま使うので、角丸にならずに外側のぼかしまで出ます。
