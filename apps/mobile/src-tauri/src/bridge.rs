//! What crosses between the webview, the stored origin and the platform's HTTP client (docs/plan.md,
//! Entscheidungen, "Server der App"): the webview names only a path, the address is built here on
//! the one stored origin (server.rs), and only a final answer goes back. Pure apart from the origin
//! file; the Tauri commands that use it are in commands.rs.

use std::{fs, path::Path};

use serde::{Deserialize, Serialize};

use crate::server::{
  Refusal, check_body, check_headers, check_method, request_url, server_origin,
};

/// The file in the app's own data directory that holds the origin, nothing else
const ORIGIN_FILE: &str = "server-origin";

/// One API call as the webview hands it over (apps/web/src/mobile/native-send.ts)
#[derive(Debug, Deserialize)]
pub struct ApiRequest {
  pub method: String,
  pub path: String,
  pub headers: Vec<(String, String)>,
  pub body: Option<String>,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct NativeHeader {
  pub name: String,
  pub value: String,
}

/// What the platform's client sends: the full address on the stored origin, checked
#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct NativeRequest {
  pub url: String,
  pub method: String,
  pub headers: Vec<NativeHeader>,
  pub body: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiResponse {
  pub status: u16,
  pub content_type: Option<String>,
  pub body: String,
}

/// The stored origin, if the file holds exactly one valid origin
pub fn read_origin(dir: &Path) -> Option<String> {
  let text = fs::read_to_string(dir.join(ORIGIN_FILE)).ok()?;
  server_origin(&text).ok().filter(|origin| *origin == text)
}

/// Stores the origin of a typed address once; another server means clearing the app's data
pub fn store_origin(dir: &Path, typed: &str) -> Result<String, Refusal> {
  if read_origin(dir).is_some() {
    return Err(Refusal::ServerAlreadySet);
  }
  let origin = server_origin(typed)?;
  fs::create_dir_all(dir)
    .and_then(|()| fs::write(dir.join(ORIGIN_FILE), &origin))
    .map_err(|_| Refusal::StorageFailed)?;
  Ok(origin)
}

/// The checked request for the platform's client, or why it may not go out
pub fn native_request(origin: Option<&str>, request: ApiRequest) -> Result<NativeRequest, Refusal> {
  let origin = origin.ok_or(Refusal::NoServer)?;
  let url = request_url(origin, &request.path)?;
  check_method(&request.method)?;
  check_headers(&request.headers)?;
  check_body(request.body.as_deref())?;
  Ok(NativeRequest {
    url: url.into(),
    method: request.method,
    headers: request
      .headers
      .into_iter()
      .map(|(name, value)| NativeHeader { name, value })
      .collect(),
    body: request.body,
  })
}

/// An answer the webview may see: a final status, never a redirect the client should have refused
pub fn checked_response(response: ApiResponse) -> Result<ApiResponse, Refusal> {
  let fine = (200..=599).contains(&response.status) && !(300..=399).contains(&response.status);
  fine.then_some(response).ok_or(Refusal::Unreachable)
}

#[cfg(test)]
mod tests {
  use super::*;

  const SERVER: &str = "https://kennwort.weber-haustechnik.test";

  fn scratch(name: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("kennwort-mobile-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    dir
  }

  fn request(path: &str) -> ApiRequest {
    ApiRequest {
      method: "PUT".into(),
      path: path.into(),
      headers: vec![("authorization".into(), "Bearer abc".into())],
      body: Some("{}".into()),
    }
  }

  #[test]
  fn stores_the_origin_once() {
    let dir = scratch("once");
    assert_eq!(read_origin(&dir), None);
    assert_eq!(store_origin(&dir, "kennwort"), Err(Refusal::InvalidServer));
    assert_eq!(store_origin(&dir, &format!("{SERVER}/app")), Ok(SERVER.into()));
    assert_eq!(read_origin(&dir), Some(SERVER.into()));
    assert_eq!(store_origin(&dir, "https://evil.test"), Err(Refusal::ServerAlreadySet));
    assert_eq!(read_origin(&dir), Some(SERVER.into()));
    let _ = fs::remove_dir_all(&dir);
  }

  #[test]
  fn reads_nothing_but_an_exact_origin_from_the_file() {
    let dir = scratch("exact");
    fs::create_dir_all(&dir).unwrap();
    for text in [format!("{SERVER}/api"), format!("{SERVER}\n"), "http://evil.test".into()] {
      fs::write(dir.join(ORIGIN_FILE), text.as_str()).unwrap();
      assert_eq!(read_origin(&dir), None, "{text}");
    }
    let _ = fs::remove_dir_all(&dir);
  }

  #[test]
  fn builds_the_request_on_the_stored_origin() {
    let native = native_request(Some(SERVER), request("/api/vaults/abc/records")).unwrap();
    assert_eq!(
      native,
      NativeRequest {
        url: format!("{SERVER}/api/vaults/abc/records"),
        method: "PUT".into(),
        headers: vec![NativeHeader { name: "authorization".into(), value: "Bearer abc".into() }],
        body: Some("{}".into()),
      }
    );
  }

  #[test]
  fn sends_nothing_without_a_server_or_off_its_api() {
    assert_eq!(native_request(None, request("/api/vaults")), Err(Refusal::NoServer));
    assert_eq!(
      native_request(Some(SERVER), request("https://evil.test/api/vaults")),
      Err(Refusal::NotTheServer)
    );
    let cookie = ApiRequest { headers: vec![("cookie".into(), "a=b".into())], ..request("/api/x") };
    assert_eq!(native_request(Some(SERVER), cookie), Err(Refusal::Header));
    let trace = ApiRequest { method: "TRACE".into(), ..request("/api/x") };
    assert_eq!(native_request(Some(SERVER), trace), Err(Refusal::Method));
  }

  #[test]
  fn passes_on_final_answers_only() {
    let answer = |status| ApiResponse { status, content_type: None, body: String::new() };
    assert_eq!(checked_response(answer(200)).map(|r| r.status), Ok(200));
    assert_eq!(checked_response(answer(409)).map(|r| r.status), Ok(409));
    for status in [0, 101, 301, 302, 307, 308, 600] {
      assert_eq!(checked_response(answer(status)).map(|r| r.status), Err(Refusal::Unreachable));
    }
  }
}
