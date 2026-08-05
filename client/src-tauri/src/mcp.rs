//! MCP bridge — a loopback endpoint that lets an external agent drive the
//! running app through the same tool registry the in-app chat uses (ADR 0025).
//!
//! This server executes nothing itself. The tools are TypeScript over the
//! Storage layer and only work inside the webview, so a request arriving here
//! is handed to the frontend as an event and this thread waits for the
//! frontend to call back through [`mcp_reply`]. That indirection is the whole
//! point of the ADR: one definition of "create a scene", living where the
//! writer's data is already reachable, rather than a second implementation in
//! Rust that would write behind the running app's back.
//!
//! Security floor, per 0025 — not optional polish:
//! - binds `127.0.0.1` only, never a routable interface;
//! - requires a bearer token, generated per launch and written to a file only
//!   the user can read. The endpoint offers read *and write* access to
//!   everything the user has written, so an unauthenticated local port would
//!   be an invitation to any process on the machine.

use std::collections::HashMap;
use std::sync::mpsc::{sync_channel, SyncSender};
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};

/// How long one call may take before the HTTP side gives up. Generous: a tool
/// may be reading a large vault, and the caller is a patient agent rather than
/// a browser. It exists so a webview that never answers (crashed page, closed
/// window) frees the connection instead of hanging it forever.
const CALL_TIMEOUT: Duration = Duration::from_secs(120);

/// In-flight calls, keyed by request id, each waiting for the frontend's reply.
#[derive(Default)]
pub struct Bridge {
  pending: Mutex<HashMap<String, SyncSender<Value>>>,
}

#[derive(Clone, Serialize)]
struct RequestEvent {
  id: String,
  method: String,
  params: Value,
}

/// Called by the webview once it has run a tool. Hands the result back to the
/// blocked HTTP thread. An id with no waiter means the call already timed out.
#[tauri::command]
pub fn mcp_reply(bridge: tauri::State<'_, Bridge>, id: String, result: Value) -> Result<(), String> {
  let sender = {
    let mut pending = bridge.pending.lock().map_err(|e| e.to_string())?;
    pending.remove(&id)
  };
  match sender {
    Some(tx) => {
      let _ = tx.send(result);
      Ok(())
    }
    None => Err(format!("no MCP request is waiting for id {id}")),
  }
}

/// Compares two tokens without returning early on the first differing byte.
fn token_matches(expected: &str, given: &str) -> bool {
  let (a, b) = (expected.as_bytes(), given.as_bytes());
  if a.len() != b.len() {
    return false;
  }
  a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

/// Writes the port and token where a shim can find them: next to the database
/// in the app config dir, readable only by this user.
fn write_handshake(app: &AppHandle, port: u16, token: &str) -> Result<(), String> {
  let dir = app
    .path()
    .app_config_dir()
    .map_err(|e| format!("no app config dir: {e}"))?;
  std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  let path = dir.join("mcp.json");
  let body = serde_json::to_vec_pretty(&json!({ "port": port, "token": token }))
    .map_err(|e| e.to_string())?;
  std::fs::write(&path, body).map_err(|e| e.to_string())?;

  // The token is a credential; on Unix keep it out of other users' reach.
  #[cfg(unix)]
  {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))
      .map_err(|e| e.to_string())?;
  }
  Ok(())
}

fn json_response(status: u16, body: Value) -> tiny_http::Response<std::io::Cursor<Vec<u8>>> {
  let header = tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..])
    .expect("static header is valid");
  tiny_http::Response::from_string(body.to_string())
    .with_header(header)
    .with_status_code(status)
}

/// Forwards one request to the webview and waits for its answer.
fn dispatch(app: &AppHandle, method: String, params: Value) -> Result<Value, String> {
  let id = uuid::Uuid::new_v4().to_string();
  // Bound of 1: the reply is sent once and read once.
  let (tx, rx) = sync_channel::<Value>(1);
  {
    let bridge = app.state::<Bridge>();
    let mut pending = bridge.pending.lock().map_err(|e| e.to_string())?;
    pending.insert(id.clone(), tx);
  }

  let emitted = app.emit(
    "mcp:request",
    RequestEvent { id: id.clone(), method, params },
  );
  if let Err(err) = emitted {
    forget(app, &id);
    return Err(format!("could not reach the app window: {err}"));
  }

  match rx.recv_timeout(CALL_TIMEOUT) {
    Ok(value) => Ok(value),
    Err(_) => {
      forget(app, &id);
      Err("the app window did not answer in time — is a window open?".into())
    }
  }
}

/// Drops a call that will never be answered, so a webview that replies late
/// can't hand its result to whoever reused the id.
fn forget(app: &AppHandle, id: &str) {
  if let Ok(mut pending) = app.state::<Bridge>().pending.lock() {
    pending.remove(id);
  }
}

fn handle(app: &AppHandle, token: &str, mut request: tiny_http::Request) {
  let authorized = request.headers().iter().any(|h| {
    h.field.equiv("Authorization")
      && token_matches(token, h.value.as_str().trim_start_matches("Bearer ").trim())
  });
  if !authorized {
    let _ = request.respond(json_response(401, json!({ "error": "bad or missing token" })));
    return;
  }

  let mut body = String::new();
  if request.as_reader().read_to_string(&mut body).is_err() {
    let _ = request.respond(json_response(400, json!({ "error": "unreadable body" })));
    return;
  }

  let parsed: Value = match serde_json::from_str(&body) {
    Ok(value) => value,
    Err(err) => {
      let _ = request.respond(json_response(400, json!({ "error": format!("bad JSON: {err}") })));
      return;
    }
  };
  let method = parsed.get("method").and_then(Value::as_str).unwrap_or("").to_string();
  if method.is_empty() {
    let _ = request.respond(json_response(400, json!({ "error": "no method given" })));
    return;
  }
  let params = parsed.get("params").cloned().unwrap_or(json!({}));

  let response = match dispatch(app, method, params) {
    Ok(result) => json_response(200, json!({ "result": result })),
    Err(err) => json_response(500, json!({ "error": err })),
  };
  let _ = request.respond(response);
}

/// Starts the bridge on an OS-assigned loopback port and records how to reach
/// it. Failures are returned rather than panicking: the bridge is an extra, and
/// the app must still open for the writer if it can't start.
pub fn start(app: &AppHandle) -> Result<u16, String> {
  let token = format!(
    "{}{}",
    uuid::Uuid::new_v4().simple(),
    uuid::Uuid::new_v4().simple()
  );
  let server = tiny_http::Server::http("127.0.0.1:0")
    .map_err(|e| format!("could not bind the MCP bridge: {e}"))?;
  let port = server
    .server_addr()
    .to_ip()
    .ok_or("MCP bridge bound to a non-IP address")?
    .port();

  write_handshake(app, port, &token)?;

  // One request at a time, deliberately: every call ends up in the same
  // single-threaded webview, so serving them concurrently would only queue
  // them somewhere less visible.
  let app_handle = app.clone();
  std::thread::spawn(move || {
    for request in server.incoming_requests() {
      handle(&app_handle, &token, request);
    }
  });

  Ok(port)
}
