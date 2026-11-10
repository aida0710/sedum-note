# Linux 版（deb）を入れ、tauri-driver と WebKitWebDriver で操作できるようにした確認用の環境。
# 組み立ては run-driver.sh が行う。deb と tauri-driver（cargo install tauri-driver）を同じフォルダに置く。
FROM ubuntu:26.04
COPY memo-app.deb /tmp/
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    /tmp/memo-app.deb webkitgtk-webdriver xvfb fonts-noto-cjk ca-certificates libegl1 && rm -rf /var/lib/apt/lists/*
COPY tauri-driver /usr/local/bin/tauri-driver
