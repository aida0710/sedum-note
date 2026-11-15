---
title: インストール
description: Windows・macOS・Linux・Androidのアプリの入れ方と、Web版の開き方。
---

# インストール

アプリは[GitHub Releases](https://github.com/aida0710/sedum-note/releases/latest)からダウンロードします。ファイル名の`<バージョン>`には、`0.9.0`のようなバージョンが入ります。

| OS | ファイル |
| --- | --- |
| Windows（x64） | `sedum-note_<バージョン>_windows-x64-setup.exe`（インストーラー）か`sedum-note_<バージョン>_windows-x64.msi` |
| macOS（AppleシリコンとIntel） | `sedum-note_<バージョン>_macos-universal.dmg` |
| Linux（x86_64） | `sedum-note_<バージョン>_linux-x86_64.AppImage`、`sedum-note_<バージョン>_linux-amd64.deb`、`sedum-note_<バージョン>_linux-x86_64.rpm`のどれか |
| Android（arm64） | `sedum-note_<バージョン>_android-arm64.apk` |

ダウンロードしたファイルは、同じリリースの`SHA256SUMS`と照らし合わせて確かめられます。

```sh
sha256sum --check --ignore-missing SHA256SUMS
```

## Windows

`windows-x64-setup.exe`を開き、インストーラーの案内に従います。組織で配る場合などは、`.msi`も使えます。

インストーラーは署名していないので、「WindowsによってPCが保護されました」と出たら、「詳細情報」を押してから「実行」を押します。

## macOS

`.dmg`を開き、Sedum Noteを「アプリケーション」フォルダにドラッグします。AppleシリコンとIntelのどちらのMacでも動きます。

Appleの公証を受けていないので、初めて開くときに止められます。「システム設定」の「プライバシーとセキュリティ」で「このまま開く」を押してください。

## Linux

DebianやUbuntuでは`.deb`を、FedoraやopenSUSEでは`.rpm`を入れます。

```sh
sudo apt install ./sedum-note_<バージョン>_linux-amd64.deb
sudo dnf install ./sedum-note_<バージョン>_linux-x86_64.rpm
```

AppImageは実行できるようにしてから起動します。

```sh
chmod +x sedum-note_<バージョン>_linux-x86_64.AppImage
./sedum-note_<バージョン>_linux-x86_64.AppImage
```

## Android

APKをスマホにダウンロードして開きます。ブラウザやファイルのアプリに「不明なアプリのインストール」の許可を求められたら、許可してから入れ直します。

## Web版

インストールは要りません。ブラウザで[https://aida0710.github.io/sedum-note/](https://aida0710.github.io/sedum-note/)を開きます。メモはそのブラウザの中に保存されます。Web版で同期するときは、同期先にCORSの設定が要ります（[Web版](/platform/web)）。

## 更新

PCのアプリは、ロックを解除したときに新しいバージョンがあるかを確かめます。Androidのアプリは新しいバージョンを知らせ、Web版は開くたびに最新のものを読み込みます。詳しくは[アプリの更新](/reference/updates)にあります。
