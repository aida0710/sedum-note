//! Sedum Note のプラグインの見本。選択した行を並べ替える・重なった行を消す・本文の文字数を数える・行末の空白を消す。
//!
//! プラグインは、外の関数を何も取り込まない WebAssembly のモジュール。アプリから JSON の入力を受けて、
//! JSON の出力（書き換えの指示）を返す。決まりは docs/plugins.md。

use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct Input {
  command: String,
  #[serde(default)]
  note: Note,
}

#[derive(Deserialize, Default)]
struct Note {
  #[serde(default)]
  markdown: String,
  #[serde(default)]
  selection: String,
}

#[derive(Serialize, Default)]
struct Output {
  #[serde(rename = "replaceSelection", skip_serializing_if = "Option::is_none")]
  replace_selection: Option<String>,
  #[serde(rename = "replaceBody", skip_serializing_if = "Option::is_none")]
  replace_body: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  message: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  error: Option<String>,
}

fn failure(text: &str) -> Output {
  Output { error: Some(text.to_string()), ..Output::default() }
}

fn sort_lines(selection: &str) -> Output {
  let mut lines: Vec<&str> = selection.lines().collect();
  lines.sort_unstable();
  Output { replace_selection: Some(lines.join("\n")), ..Output::default() }
}

fn remove_duplicate_lines(selection: &str) -> Output {
  let mut kept: Vec<&str> = Vec::new();
  for line in selection.lines() {
    if !kept.contains(&line) {
      kept.push(line);
    }
  }
  Output { replace_selection: Some(kept.join("\n")), ..Output::default() }
}

fn count_characters(markdown: &str) -> Output {
  let characters = markdown.chars().filter(|character| !character.is_whitespace()).count();
  let lines = markdown.lines().filter(|line| !line.trim().is_empty()).count();
  Output { message: Some(format!("{characters} characters, {lines} lines")), ..Output::default() }
}

/// 本文（Markdown）の、行末の空白を消す。行の中身は変えないので、添付へのリンクや、行末のブロックの ID はそのまま残る。
fn trim_trailing_spaces(markdown: &str) -> Output {
  let trimmed: Vec<&str> = markdown.lines().map(|line| line.trim_end_matches([' ', '\t', '\u{3000}'])).collect();
  Output { replace_body: Some(trimmed.join("\n")), ..Output::default() }
}

fn run(input: &[u8]) -> Output {
  let input: Input = match serde_json::from_slice(input) {
    Ok(input) => input,
    Err(_) => return failure("the input is not the expected JSON"),
  };
  match input.command.as_str() {
    "sort-lines" => sort_lines(&input.note.selection),
    "remove-duplicate-lines" => remove_duplicate_lines(&input.note.selection),
    "count-characters" => count_characters(&input.note.markdown),
    "trim-trailing-spaces" => trim_trailing_spaces(&input.note.markdown),
    _ => failure("unknown command"),
  }
}

/// アプリが、入力を置く場所を取るために呼ぶ。
#[no_mangle]
pub extern "C" fn sedum_alloc(length: u32) -> *mut u8 {
  let mut buffer = Vec::<u8>::with_capacity(length as usize);
  let pointer = buffer.as_mut_ptr();
  // 置き場所は、実行が終わるまで手放さない（モジュールは、コマンドを 1 回実行するたびに作り直される）。
  core::mem::forget(buffer);
  pointer
}

/// アプリが、コマンドを実行するために呼ぶ。返す値は、上位 32 ビットが出力の位置、下位 32 ビットが出力の長さ。
///
/// # Safety
/// `pointer` は `sedum_alloc(length)` が返した位置で、そこに `length` バイトの入力が書かれていること。
#[no_mangle]
pub unsafe extern "C" fn sedum_run(pointer: *const u8, length: u32) -> u64 {
  let input = core::slice::from_raw_parts(pointer, length as usize);
  let output = serde_json::to_vec(&run(input)).unwrap_or_default();
  let packed = ((output.as_ptr() as u64) << 32) | output.len() as u64;
  core::mem::forget(output);
  packed
}
