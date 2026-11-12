# Text tools

Sedum Note のプラグインの見本です。メモの「…」のメニューに、次のコマンドを足します。

- Sort the selected lines: 選択した行を、小さい順に並べ替える
- Remove duplicate lines: 選択した行のうち、重なった行を消す（最初のものを残す）
- Count characters: メモの文字数と行数を出す
- Remove trailing spaces: メモの全部の行の、行末の空白を消す

取り込み元は `aida0710/sedum-note/plugins/text-tools` です。プラグインの決まりは [docs/plugins.md](../../docs/plugins.md) にあります。

## 組み立て

```sh
rustup target add wasm32-unknown-unknown
cargo build --release --target wasm32-unknown-unknown
cp target/wasm32-unknown-unknown/release/sedum_note_text_tools.wasm text-tools.wasm
```

`src/lib.rs` を変えたら、組み立て直した `text-tools.wasm` も一緒にコミットします。
