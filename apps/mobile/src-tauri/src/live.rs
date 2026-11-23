//! The live streams of the app (K-708; docs/plan.md, Entscheidungen, "Live-Sync in der App"): the
//! same narrowness as the request bridge (server.rs, bridge.rs), for the two SSE streams the server
//! has and nothing else. The webview names a path; it must be one of those streams, on the stored
//! origin, with only `accept` and `authorization`. What comes back is checked event by event: only
//! the events the server sends, each no larger than MAX_EVENT, and no more than the rate a bucket
//! allows. Past either limit the stream ends; the webview opens it again after a pause. Pure
//! functions and data, errors as values; commands.rs and ServerPlugin.kt carry it.

use serde::{Deserialize, Serialize};
use url::Url;

use crate::bridge::NativeHeader;
use crate::server::{Refusal, request_url};

/// Event name plus data, far above the largest the server sends (`record`: two ids and a number)
pub const MAX_EVENT: usize = 4 * 1024;
/// A burst as large as an import of many entries gets out before the stream ends, then a steady
/// rate far above what a team writes; a server that floods the app is cut off
pub const BURST: u32 = 200;
pub const PER_SECOND: u32 = 20;

/// The events the two streams send (apps/server: sync/routes.ts, notifications/routes.ts)
const EVENTS: [&str; 4] = ["ready", "record", "notification", "ping"];
/// The only headers a stream needs (sync/http.ts watchVault, notifications-api.ts)
const HEADERS: [&str; 2] = ["accept", "authorization"];
const NOTIFICATIONS: &str = "/api/notifications/events";

fn is_vault_id(id: &str) -> bool {
  (1..=64).contains(&id.len())
    && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// One of the two SSE paths, exactly: no query, no other segment
fn is_stream_path(path: &str) -> bool {
  if path == NOTIFICATIONS {
    return true;
  }
  path
    .strip_prefix("/api/vaults/")
    .and_then(|rest| rest.strip_suffix("/events"))
    .is_some_and(is_vault_id)
}

/// One live stream as the webview asks for it (apps/web/src/mobile/native-stream.ts)
#[derive(Debug, Deserialize)]
pub struct StreamRequest {
  pub path: String,
  pub headers: Vec<(String, String)>,
}

/// What the platform's client opens: the full address on the stored origin, checked
#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct NativeStream {
  pub id: u32,
  pub url: String,
  pub headers: Vec<NativeHeader>,
}

fn check_stream_headers(headers: &[(String, String)]) -> Result<(), Refusal> {
  let fine = |(name, value): &(String, String)| {
    HEADERS.contains(&name.as_str())
      && !value.contains(['\r', '\n', '\0'])
      && (name != "accept" || value == "text/event-stream")
  };
  headers.iter().all(fine).then_some(()).ok_or(Refusal::Header)
}

pub fn stream_url(origin: &str, path: &str) -> Result<Url, Refusal> {
  if !is_stream_path(path) {
    return Err(Refusal::NotTheServer);
  }
  let url = request_url(origin, path)?;
  // Still exactly that path after the parser had it
  (url.path() == path && url.query().is_none()).then_some(url).ok_or(Refusal::NotTheServer)
}

/// The checked stream for the platform's client, or why it may not be opened
pub fn native_stream(
  origin: Option<&str>,
  id: u32,
  request: StreamRequest,
) -> Result<NativeStream, Refusal> {
  let origin = origin.ok_or(Refusal::NoServer)?;
  let url = stream_url(origin, &request.path)?;
  check_stream_headers(&request.headers)?;
  let mut headers: Vec<NativeHeader> = request
    .headers
    .into_iter()
    .filter(|(name, _)| name != "accept")
    .map(|(name, value)| NativeHeader { name, value })
    .collect();
  headers.push(NativeHeader { name: "accept".into(), value: "text/event-stream".into() });
  Ok(NativeStream { id, url: url.into(), headers })
}

/// What the platform's client reports (ServerPlugin.kt): an event, or the end of the stream
#[derive(Debug, Deserialize)]
pub struct NativeMessage {
  pub event: Option<String>,
  pub data: Option<String>,
  pub end: Option<String>,
}

/// What goes to the webview: an event, or the end with a fixed word
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum StreamMessage {
  Event { event: String, data: String },
  End { reason: &'static str },
}

/// A token bucket in milliseconds: BURST at most, PER_SECOND back
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Bucket {
  /// Tokens times 1000, so the refill stays in whole numbers
  milli: u64,
  at: u64,
}

impl Bucket {
  pub fn full(now_ms: u64) -> Self {
    Bucket { milli: u64::from(BURST) * 1000, at: now_ms }
  }
}

/// Takes one token, or none is left: the server sends faster than any team writes
pub fn take(bucket: Bucket, now_ms: u64) -> Result<Bucket, Refusal> {
  let elapsed = now_ms.saturating_sub(bucket.at);
  let refilled = (bucket.milli + elapsed * u64::from(PER_SECOND)).min(u64::from(BURST) * 1000);
  refilled.checked_sub(1000).map(|milli| Bucket { milli, at: now_ms }).ok_or(Refusal::TooLarge)
}

/// One event the server sent, if the app may pass it on; `ping` is counted but not passed on
pub fn checked_event(event: &str, data: &str) -> Result<Option<StreamMessage>, Refusal> {
  if event.len() + data.len() > MAX_EVENT {
    return Err(Refusal::TooLarge);
  }
  if !EVENTS.contains(&event) || data.contains(['\r', '\n', '\0']) {
    return Err(Refusal::Unreachable);
  }
  Ok((event != "ping").then(|| StreamMessage::Event { event: event.into(), data: data.into() }))
}

/// The state of one stream between the platform's client and the webview
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Gate {
  Open(Bucket),
  Closed,
}

/// One message of the platform's client through the gate: the new state and what the webview gets
pub fn pass(gate: Gate, message: NativeMessage, now_ms: u64) -> (Gate, Option<StreamMessage>) {
  let Gate::Open(bucket) = gate else {
    return (Gate::Closed, None);
  };
  let end = |reason| (Gate::Closed, Some(StreamMessage::End { reason }));
  if message.end.is_some() {
    // Only a fixed word goes on; the client's own text is not read
    return end("closed");
  }
  let (Some(event), Some(data)) = (message.event, message.data) else {
    return end(Refusal::Unreachable.code());
  };
  match take(bucket, now_ms).and_then(|next| checked_event(&event, &data).map(|out| (next, out))) {
    Ok((next, out)) => (Gate::Open(next), out),
    Err(refusal) => end(refusal.code()),
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  const SERVER: &str = "https://kennwort.weber-haustechnik.test";
  const VAULT: &str = "/api/vaults/q3Xk-_9aZ/events";

  fn request(path: &str, headers: &[(&str, &str)]) -> StreamRequest {
    StreamRequest {
      path: path.into(),
      headers: headers.iter().map(|(n, v)| (n.to_string(), v.to_string())).collect(),
    }
  }

  fn event(event: &str, data: &str) -> NativeMessage {
    NativeMessage { event: Some(event.into()), data: Some(data.into()), end: None }
  }

  #[test]
  fn opens_only_the_two_live_streams() {
    for path in [NOTIFICATIONS, VAULT] {
      assert_eq!(stream_url(SERVER, path).unwrap().as_str(), format!("{SERVER}{path}"));
    }
  }

  #[test]
  fn refuses_every_other_path() {
    for path in [
      "/api/notifications/events?x=1",
      "/api/notifications/events/",
      "/api/notifications",
      "/api/vaults//events",
      "/api/vaults/a/b/events",
      "/api/vaults/../events",
      "/api/vaults/%2e%2e/events",
      "/api/vaults/a.b/events",
      "/api/vaults/a/records",
      "/api/vaults/a/events#x",
      "/api/vaults/a/events?since=1",
      "/auth/events",
      "//evil.test/api/notifications/events",
      "https://evil.test/api/notifications/events",
      "/api/sync",
    ] {
      assert_eq!(stream_url(SERVER, path), Err(Refusal::NotTheServer), "{path}");
    }
    let long = format!("/api/vaults/{}/events", "a".repeat(65));
    assert_eq!(stream_url(SERVER, &long), Err(Refusal::NotTheServer));
  }

  #[test]
  fn opens_on_the_stored_origin_only() {
    let ok = || request(NOTIFICATIONS, &[("authorization", "Bearer abc")]);
    assert_eq!(native_stream(None, 1, ok()), Err(Refusal::NoServer));
    assert_eq!(native_stream(Some("http://evil.test"), 1, ok()), Err(Refusal::NoServer));
    let native = native_stream(Some(SERVER), 7, ok()).unwrap();
    assert_eq!(native.id, 7);
    assert_eq!(native.url, format!("{SERVER}{NOTIFICATIONS}"));
    assert_eq!(
      native.headers,
      vec![
        NativeHeader { name: "authorization".into(), value: "Bearer abc".into() },
        NativeHeader { name: "accept".into(), value: "text/event-stream".into() },
      ]
    );
  }

  #[test]
  fn allows_only_the_stream_headers() {
    for headers in [
      vec![("cookie", "a=b")],
      vec![("content-type", "application/json")],
      vec![("accept", "application/json")],
      vec![("authorization", "Bearer a\r\nhost: evil.test")],
      vec![("Authorization", "Bearer abc")],
    ] {
      assert_eq!(
        native_stream(Some(SERVER), 1, request(VAULT, &headers)),
        Err(Refusal::Header),
        "{headers:?}"
      );
    }
  }

  #[test]
  fn passes_the_servers_events_and_drops_pings() {
    let gate = Gate::Open(Bucket::full(0));
    let (gate, out) = pass(gate, event("ready", ""), 0);
    assert_eq!(out, Some(StreamMessage::Event { event: "ready".into(), data: String::new() }));
    let data = r#"{"entryId":"abc","version":3}"#;
    let (gate, out) = pass(gate, event("record", data), 0);
    assert_eq!(out, Some(StreamMessage::Event { event: "record".into(), data: data.into() }));
    let (gate, out) = pass(gate, event("ping", ""), 0);
    assert_eq!(out, None);
    assert!(matches!(gate, Gate::Open(_)));
  }

  #[test]
  fn ends_on_an_unknown_event_or_a_line_break() {
    for message in [
      event("open", ""),
      event("record", "a\nevent: x"),
      NativeMessage { event: Some("record".into()), data: None, end: None },
    ] {
      let (gate, out) = pass(Gate::Open(Bucket::full(0)), message, 0);
      assert_eq!(gate, Gate::Closed);
      assert_eq!(out, Some(StreamMessage::End { reason: "unreachable" }));
    }
  }

  #[test]
  fn caps_the_size_of_an_event() {
    let fits = "a".repeat(MAX_EVENT - "record".len());
    assert!(checked_event("record", &fits).is_ok());
    let big = "a".repeat(MAX_EVENT - "record".len() + 1);
    let (gate, out) = pass(Gate::Open(Bucket::full(0)), event("record", &big), 0);
    assert_eq!(gate, Gate::Closed);
    assert_eq!(out, Some(StreamMessage::End { reason: "too-large" }));
  }

  #[test]
  fn caps_the_rate_with_a_burst_then_a_steady_flow() {
    let mut bucket = Bucket::full(0);
    for _ in 0..BURST {
      bucket = take(bucket, 0).unwrap();
    }
    assert_eq!(take(bucket, 0), Err(Refusal::TooLarge));
    // One token back every 1000 / PER_SECOND ms, never more than BURST
    let step = u64::from(1000 / PER_SECOND);
    assert_eq!(take(bucket, step - 1), Err(Refusal::TooLarge));
    assert!(take(bucket, step).is_ok());
    assert_eq!(
      take(Bucket::full(0), 3_600_000).map(|b| b.milli),
      Ok((u64::from(BURST) - 1) * 1000)
    );
  }

  #[test]
  fn a_flood_ends_the_stream() {
    let mut gate = Gate::Open(Bucket::full(0));
    let mut last = None;
    for _ in 0..=BURST {
      (gate, last) = pass(gate, event("notification", ""), 10);
    }
    assert_eq!(gate, Gate::Closed);
    assert_eq!(last, Some(StreamMessage::End { reason: "too-large" }));
  }

  #[test]
  fn ends_once_and_stays_closed() {
    let ended =
      NativeMessage { event: None, data: None, end: Some("java.io.IOException: x".into()) };
    let (gate, out) = pass(Gate::Open(Bucket::full(0)), ended, 0);
    assert_eq!((gate, out), (Gate::Closed, Some(StreamMessage::End { reason: "closed" })));
    assert_eq!(pass(Gate::Closed, event("ready", ""), 0), (Gate::Closed, None));
  }

  #[test]
  fn the_webview_sees_a_tagged_message() {
    let out = serde_json::to_string(&StreamMessage::End { reason: "closed" }).unwrap();
    assert_eq!(out, r#"{"kind":"end","reason":"closed"}"#);
    let out =
      serde_json::to_string(&StreamMessage::Event { event: "ready".into(), data: String::new() })
        .unwrap();
    assert_eq!(out, r#"{"kind":"event","event":"ready","data":""}"#);
  }
}
