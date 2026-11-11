# アプリのアイコンの元

`src-tauri/icons/` と Android の `mipmap-*` の画像は、ここの SVG から `tauri icon` で作ります。画像を直接は直しません。

- `../../public/app-icon.svg`: Windows・Linux のアプリと、Web の favicon
- `macos.svg`: macOS の `icon.icns`（1024 の中に 824 の角丸を置く、macOS の慣習の余白つき）
- `android-background.svg`・`android-foreground.svg`: Android のアダプティブアイコン
- `manifest.json`: `tauri icon` に渡す、上の SVG の組み合わせ

## 作り直す

リポジトリの直下で実行します。

```sh
npx tauri icon src-tauri/app-icon/manifest.json
rm -r src-tauri/icons/ios

npx tauri icon src-tauri/app-icon/macos.svg -o /tmp/sedum-note-macos-icon
cp /tmp/sedum-note-macos-icon/icon.icns src-tauri/icons/icon.icns

npx tauri icon public/app-icon.svg -o /tmp/sedum-note-legacy-icon
for density in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
  cp /tmp/sedum-note-legacy-icon/android/mipmap-$density/ic_launcher.png \
     /tmp/sedum-note-legacy-icon/android/mipmap-$density/ic_launcher_round.png \
     src-tauri/gen/android/app/src/main/res/mipmap-$density/
done
```

- iOS は対応先ではないので、`ios` の出力は消します。
- Android 7（アダプティブアイコンが無い）が使う `ic_launcher.png` と `ic_launcher_round.png` は、`public/app-icon.svg` だけから作ったものに差し替えます。`manifest.json` から作ると、前景を切り抜かずに重ねるので絵柄がはみ出します。
