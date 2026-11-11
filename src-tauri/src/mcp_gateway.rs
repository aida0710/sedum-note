// MCP（Model Context Protocol）のクライアントからの要求を受ける、このマシンの中だけの窓口。
//
// ここは薄い中継だけを行う。127.0.0.1 で待ち受け、トークンを確かめ、要求を画面（WebView）へ渡して、
// 画面が返した応答をそのまま返す。メモを読む・書く処理は、ロックを解除した画面の側にしか無い
// （src/ui/mcp/）。画面がロックするときに止めるので、ロック中は待ち受けそのものが無い。
//
// 開くのはデスクトップのアプリだけ。利用者が設定で有効にしたときに、画面が mcp_start を呼ぶ。

use std::collections::HashMap;
use std::io::Read;
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use tiny_http::{Header, Method, Request, Response, Server};

// 画面へ要求を渡すイベントの名前。src/ui/platform/mcpGateway.ts と揃える。
const REQUEST_EVENT: &str = "mcp-request";
// 要求を受ける道。
const ENDPOINT_PATH: &str = "/mcp";
// 要求の本文の上限。メモ 1 件の本文を書き換える要求が収まる大きさ。
const MAX_REQUEST_BYTES: u64 = 8 * 1024 * 1024;
// 画面が応答を返すのを待つ時間。窓を最小化していると画面の処理が遅くなるので、長めに取る。
const RESPONSE_TIMEOUT: Duration = Duration::from_secs(60);
// 止める合図を見に行く間隔。
const STOP_POLL_INTERVAL: Duration = Duration::from_millis(200);
// 画面へ渡す要求のヘッダー（MCP が決めているもの）。ほかのヘッダーは渡さない。
const FORWARDED_HEADERS: [&str; 4] = ["accept", "mcp-protocol-version", "mcp-method", "mcp-name"];

type PendingResponses = Arc<Mutex<HashMap<u64, Sender<GatewayResponse>>>>;

struct GatewayResponse {
  status: u16,
  // 空なら本文なし。
  body: String,
}

struct RunningGateway {
  stop: Sender<()>,
  port: u16,
}

#[derive(Default)]
pub struct McpGatewayState {
  running: Mutex<Option<RunningGateway>>,
  pending: PendingResponses,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ForwardedRequest {
  request_id: u64,
  headers: HashMap<String, String>,
  body: String,
}

// 待ち受けを始める。既に動いていれば、止めてから始め直す（トークンを変えたとき）。
#[tauri::command]
pub fn mcp_start(app: AppHandle, state: State<'_, McpGatewayState>, port: u16, token: String) -> Result<(), String> {
  stop_running(&state);
  let server = Server::http(("127.0.0.1", port)).map_err(|error| error.to_string())?;
  let (stop, stopped) = mpsc::channel::<()>();
  let pending = state.pending.clone();
  thread::spawn(move || {
    let mut next_request_id: u64 = 1;
    // 要求は 1 つずつ順に流す（画面の側で、読んでから書くまでの間に別の要求を割り込ませない）。
    while stopped.try_recv().is_err() {
      match server.recv_timeout(STOP_POLL_INTERVAL) {
        Ok(Some(request)) => {
          serve(request, &app, &pending, &token, port, next_request_id);
          next_request_id += 1;
        }
        Ok(None) => {}
        Err(_) => break,
      }
    }
  });
  *state.running.lock().unwrap() = Some(RunningGateway { stop, port });
  Ok(())
}

#[tauri::command]
pub fn mcp_stop(state: State<'_, McpGatewayState>) {
  stop_running(&state);
}

// 動いていれば、待ち受けているポート。
#[tauri::command]
pub fn mcp_running_port(state: State<'_, McpGatewayState>) -> Option<u16> {
  state.running.lock().unwrap().as_ref().map(|gateway| gateway.port)
}

// 画面が、渡された要求への応答を返す。
#[tauri::command]
pub fn mcp_respond(state: State<'_, McpGatewayState>, request_id: u64, status: u16, body: String) {
  if let Some(waiting) = state.pending.lock().unwrap().remove(&request_id) {
    let _ = waiting.send(GatewayResponse { status, body });
  }
}

fn stop_running(state: &State<'_, McpGatewayState>) {
  if let Some(gateway) = state.running.lock().unwrap().take() {
    let _ = gateway.stop.send(());
  }
  state.pending.lock().unwrap().clear();
}

fn serve(mut request: Request, app: &AppHandle, pending: &PendingResponses, token: &str, port: u16, request_id: u64) {
  let response = match check_request(&request, token, port) {
    Err(refusal) => refusal,
    Ok(()) => forward_to_screen(&mut request, app, pending, request_id),
  };
  let mut reply = Response::from_string(response.body).with_status_code(response.status);
  if let Ok(header) = Header::from_bytes("Content-Type", "application/json") {
    reply.add_header(header);
  }
  if response.status == 401 {
    if let Ok(header) = Header::from_bytes("WWW-Authenticate", "Bearer") {
      reply.add_header(header);
    }
  }
  let _ = request.respond(reply);
}

fn refusal(status: u16, message: &str) -> GatewayResponse {
  GatewayResponse { status, body: format!("{{\"error\":\"{message}\"}}") }
}

fn header_value<'a>(request: &'a Request, name: &str) -> Option<&'a str> {
  request
    .headers()
    .iter()
    .find(|header| header.field.as_str().as_str().eq_ignore_ascii_case(name))
    .map(|header| header.value.as_str())
}

// このマシンの中の MCP のクライアントからの要求かを確かめる。
fn check_request(request: &Request, token: &str, port: u16) -> Result<(), GatewayResponse> {
  // ブラウザで開いたページからの要求には Origin が付く。MCP のクライアントは付けないので、付いていれば断る
  // （開いている Web ページが 127.0.0.1 を叩いて、メモを読むのを防ぐ）。
  if header_value(request, "origin").is_some() {
    return Err(refusal(403, "requests from web pages are not accepted"));
  }
  // 別の名前をこのマシンへ向ける手口（DNS リバインディング）で届いた要求を断る。
  let host = header_value(request, "host").unwrap_or("");
  if host != format!("127.0.0.1:{port}") && host != format!("localhost:{port}") {
    return Err(refusal(403, "unexpected host"));
  }
  let presented = header_value(request, "authorization").and_then(|value| value.strip_prefix("Bearer ")).unwrap_or("");
  if !same_token(presented, token) {
    return Err(refusal(401, "missing or wrong token"));
  }
  if request.url() != ENDPOINT_PATH {
    return Err(refusal(404, "unknown path"));
  }
  if *request.method() != Method::Post {
    return Err(refusal(405, "only POST is supported"));
  }
  Ok(())
}

// 比べるのにかかる時間から、合っている文字数が漏れないようにする。
fn same_token(presented: &str, expected: &str) -> bool {
  let presented = presented.as_bytes();
  let expected = expected.as_bytes();
  if presented.len() != expected.len() || expected.is_empty() {
    return false;
  }
  presented.iter().zip(expected).fold(0u8, |difference, (left, right)| difference | (left ^ right)) == 0
}

fn forward_to_screen(request: &mut Request, app: &AppHandle, pending: &PendingResponses, request_id: u64) -> GatewayResponse {
  let mut body = String::new();
  if request.as_reader().take(MAX_REQUEST_BYTES + 1).read_to_string(&mut body).is_err() {
    return refusal(400, "the request body is not text");
  }
  if body.len() as u64 > MAX_REQUEST_BYTES {
    return refusal(413, "the request is too large");
  }
  let headers = FORWARDED_HEADERS
    .iter()
    .filter_map(|name| header_value(request, name).map(|value| (name.to_string(), value.to_string())))
    .collect();
  let (respond, response) = mpsc::channel();
  pending.lock().unwrap().insert(request_id, respond);
  if app.emit(REQUEST_EVENT, ForwardedRequest { request_id, headers, body }).is_err() {
    pending.lock().unwrap().remove(&request_id);
    return refusal(503, "the app window is not available");
  }
  match response.recv_timeout(RESPONSE_TIMEOUT) {
    Ok(response) => response,
    Err(RecvTimeoutError::Timeout) | Err(RecvTimeoutError::Disconnected) => {
      pending.lock().unwrap().remove(&request_id);
      refusal(504, "the app did not answer in time (it may be locked)")
    }
  }
}
