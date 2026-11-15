#!/bin/bash
# GitHub Pages に置くサイトを組み立てる。Web 版のアプリを /sedum-note/ に、ドキュメント（pages/）を /sedum-note/docs/ に置く。
# Pages は 1 回の配置でサイト全体が入れ替わるので、ドキュメントだけを直したときも、Web 版を一緒に組み立てて置く。
# Web 版は、渡したリリースのタグ（かそのコミット）の画面にする（main の画面を置くと、保存の形式を変えている途中の画面が、使っている人の
# 手元のデータに当たる）。ドキュメントは、この作業ツリーのものにする。
# 使い方: scripts/ci/build-pages-site.sh <Web 版のタグかコミット> <出力するフォルダ>
set -eu

app_revision="$1"
site_directory="$2"
app_tree="$(mktemp -d)/app"

git worktree add --detach "$app_tree" "$app_revision"
(cd "$app_tree" && npm ci && npm run build -- --base /sedum-note/)
(cd pages && npm ci && npm run build)

mkdir -p "$site_directory"
cp -R "$app_tree/dist/." "$site_directory/"
cp -R pages/.vitepress/dist "$site_directory/docs"
git worktree remove --force "$app_tree"
