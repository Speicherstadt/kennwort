//! Which requests may leave the app for the company's server (docs/plan.md, Entscheidungen, "Server
//! der App"). The web app inside the webview keeps `connect-src 'self'`; it hands each API call to
//! the `server_fetch` command (commands.rs), and only what passes here goes out, to the one origin
//! the user set up. The rules mirror packages/client (server-url.ts, server-fetch.ts): HTTPS only,
//! plain HTTP only on this machine, no user info, no other origin, and (in the native client) no
//! redirect. Pure functions, errors as values; the tests below pin each rule.

use url::Url;

/// Why a server address or a request was refused; the code goes to the webview as is
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Refusal {
  InvalidServer,
  InsecureServer,
  NoServer,
  ServerAlreadySet,
  StorageFailed,
  NotTheServer,
  Method,
  Header,
  TooLarge,
  Unreachable,
  Unsupported,
}

impl Refusal {
  pub fn code(self) -> &'static str {
    match self {
      Refusal::InvalidServer => "invalid-server",
      Refusal::InsecureServer => "insecure-server",
      Refusal::NoServer => "no-server",
      Refusal::ServerAlreadySet => "server-already-set",
      Refusal::StorageFailed => "storage-failed",
      Refusal::NotTheServer => "not-the-server",
      Refusal::Method => "method",
      Refusal::Header => "header",
      Refusal::TooLarge => "too-large",
      Refusal::Unreachable => "unreachable",
      Refusal::Unsupported => "unsupported",
    }
  }
}

const LOCAL: [&str; 3] = ["localhost", "127.0.0.1", "[::1]"];
/// The server's own paths (apps/web/src/sw/server-paths.ts); nothing else is ever asked for
const PREFIXES: [&str; 2] = ["/api/", "/auth/"];
const METHODS: [&str; 4] = ["GET", "POST", "PUT", "DELETE"];
/// The headers the API client sets (packages/client/src/session/api.ts, packages/core sync/http.ts)
const HEADERS: [&str; 5] = [
  "accept",
  "authorization",
  "content-type",
  "x-kennwort-device",
  "x-kennwort-device-name",
];
/// Far above the largest JSON the API takes (an import of many entries), well below memory trouble
pub const MAX_BODY: usize = 32 * 1024 * 1024;

fn is_local(url: &Url) -> bool {
  url.host_str().is_some_and(|host| LOCAL.contains(&host))
}

/// The origin of a typed server address, as serverOrigin in packages/client does it
pub fn server_origin(typed: &str) -> Result<String, Refusal> {
  let url = Url::parse(typed.trim()).map_err(|_| Refusal::InvalidServer)?;
  if !url.username().is_empty() || url.password().is_some() || url.host_str().is_none() {
    return Err(Refusal::InvalidServer);
  }
  match url.scheme() {
    "https" => Ok(url.origin().ascii_serialization()),
    "http" if is_local(&url) => Ok(url.origin().ascii_serialization()),
    "http" => Err(Refusal::InsecureServer),
    _ => Err(Refusal::InvalidServer),
  }
}

fn is_server_path(path: &str) -> bool {
  PREFIXES.iter().any(|prefix| path.starts_with(prefix))
}

/// The full address of one API path on the stored origin, or why it may not be asked for
pub fn request_url(origin: &str, path: &str) -> Result<Url, Refusal> {
  // Only a path below /api or /auth: never "//host", a backslash, a fragment or a control
  // character that a parser might read as something other than a path on this origin
  let plain = path.starts_with('/')
    && !path.starts_with("//")
    && !path.contains(['\\', '#'])
    && !path.chars().any(char::is_control);
  if !plain || !is_server_path(path) {
    return Err(Refusal::NotTheServer);
  }
  let base = server_origin(origin)
    .ok()
    .filter(|normal| normal == origin)
    .and_then(|normal| Url::parse(&normal).ok())
    .ok_or(Refusal::NoServer)?;
  let url = base.join(path).map_err(|_| Refusal::NotTheServer)?;
  // After the parser normalised it ("/api/../x" is "/x"): still this origin, still a server path
  if url.origin() != base.origin() || !is_server_path(url.path()) {
    return Err(Refusal::NotTheServer);
  }
  Ok(url)
}

pub fn check_method(method: &str) -> Result<(), Refusal> {
  METHODS.contains(&method).then_some(()).ok_or(Refusal::Method)
}

/// Only the API's own headers, by lower-case name; no line break can smuggle in another one
pub fn check_headers(headers: &[(String, String)]) -> Result<(), Refusal> {
  let fine = |(name, value): &(String, String)| {
    HEADERS.contains(&name.as_str()) && !value.contains(['\r', '\n', '\0'])
  };
  headers.iter().all(fine).then_some(()).ok_or(Refusal::Header)
}

pub fn check_body(body: Option<&str>) -> Result<(), Refusal> {
  match body {
    Some(text) if text.len() > MAX_BODY => Err(Refusal::TooLarge),
    _ => Ok(()),
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  const SERVER: &str = "https://kennwort.weber-haustechnik.test";

  #[test]
  fn keeps_only_the_origin_of_an_https_address() {
    assert_eq!(
      server_origin(" https://kennwort.weber-haustechnik.test/app?x=1 "),
      Ok(SERVER.into())
    );
    assert_eq!(
      server_origin("https://Kennwort.Weber-Haustechnik.test:8443"),
      Ok(format!("{SERVER}:8443"))
    );
  }

  #[test]
  fn allows_plain_http_only_on_this_machine() {
    for local in ["http://localhost:18100", "http://127.0.0.1:18100", "http://[::1]:18100"] {
      assert_eq!(server_origin(local), Ok(local.into()));
    }
    for remote in ["http://kennwort.weber-haustechnik.test", "http://localhost.evil.test"] {
      assert_eq!(server_origin(remote), Err(Refusal::InsecureServer), "{remote}");
    }
  }

  #[test]
  fn refuses_other_schemes_user_info_and_nonsense() {
    for typed in [
      "kennwort.weber-haustechnik.test",
      "ftp://kennwort.weber-haustechnik.test",
      "javascript:alert(1)",
      "https://anna:geheim@kennwort.weber-haustechnik.test",
      "https://anna@kennwort.weber-haustechnik.test",
      "",
      "https://",
    ] {
      assert_eq!(server_origin(typed), Err(Refusal::InvalidServer), "{typed}");
    }
  }

  #[test]
  fn resolves_api_paths_on_the_stored_origin() {
    let url = request_url(SERVER, "/api/vaults/abc/records?since=3").unwrap();
    assert_eq!(url.as_str(), format!("{SERVER}/api/vaults/abc/records?since=3"));
    let url = request_url(SERVER, "/auth/login-key/challenge").unwrap();
    assert_eq!(url.as_str(), format!("{SERVER}/auth/login-key/challenge"));
  }

  #[test]
  fn refuses_every_path_that_could_leave_the_origin_or_the_api() {
    for path in [
      "https://evil.test/api/x",
      "//evil.test/api/x",
      "/\\evil.test/api/x",
      "/api\\..\\..\\x",
      "api/x",
      "@evil.test/api/",
      "/api/../admin",
      "/api/%2e%2e/admin",
      "/api/x#fragment",
      "/api/x\n",
      "/api/\t/x",
      "/",
      "/index.html",
      "/apix",
      "/api",
    ] {
      assert_eq!(request_url(SERVER, path), Err(Refusal::NotTheServer), "{path}");
    }
  }

  #[test]
  fn needs_a_stored_origin_that_is_one() {
    for origin in ["", "https://kennwort.weber-haustechnik.test/x", "http://evil.test"] {
      assert_eq!(request_url(origin, "/api/vaults"), Err(Refusal::NoServer), "{origin}");
    }
  }

  #[test]
  fn allows_only_the_api_methods() {
    for method in METHODS {
      assert_eq!(check_method(method), Ok(()));
    }
    for method in ["CONNECT", "TRACE", "OPTIONS", "get", "PATCH", "POST\r\nX: y"] {
      assert_eq!(check_method(method), Err(Refusal::Method), "{method}");
    }
  }

  #[test]
  fn allows_only_the_api_headers_without_line_breaks() {
    let header = |name: &str, value: &str| vec![(name.to_string(), value.to_string())];
    assert_eq!(check_headers(&header("authorization", "Bearer abc")), Ok(()));
    assert_eq!(check_headers(&header("x-kennwort-device-name", "Pixel%208")), Ok(()));
    for (name, value) in [
      ("cookie", "a=b"),
      ("host", "evil.test"),
      ("Authorization", "Bearer abc"),
      ("authorization", "Bearer abc\r\nhost: evil.test"),
    ] {
      assert_eq!(check_headers(&header(name, value)), Err(Refusal::Header), "{name}");
    }
  }

  #[test]
  fn caps_the_body() {
    assert_eq!(check_body(None), Ok(()));
    assert_eq!(check_body(Some("{}")), Ok(()));
    assert_eq!(check_body(Some(&"a".repeat(MAX_BODY + 1))), Err(Refusal::TooLarge));
  }
}
