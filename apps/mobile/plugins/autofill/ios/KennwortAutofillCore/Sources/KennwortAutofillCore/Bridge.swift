import Foundation

/// The Swift side of the bridge's JSON, version 1 (packages/client/src/autofill/bridge.ts), as the
/// Kotlin side writes it (BridgeJson.kt). A request carries no secret. An answer is checked here
/// once more, whatever the webview parsed: it must answer this request, carry the bridge's version
/// and only fields the request asked for; anything else is refused, never guessed.
public enum Bridge {
  public static let version = 1
  /// As autofill.rs caps a message: two fields of at most 4096 characters and the frame
  public static let maxMessage = 64 * 1024
  public static let maxValue = 4096
}

/// Where to fill, as the bridge names it
public enum FillTarget: Equatable, Sendable {
  case web(host: String)
  case app(id: String)
}

public enum FillField: String, CaseIterable, Codable, Sendable {
  case username, password, totp
}

public struct FillRequest: Equatable, Sendable {
  public let requestId: String
  public let target: FillTarget
  public let fields: [FillField]
}

public enum Answer: Equatable, Sendable {
  case fill([FillField: String])
  case cancel
}

// MARK: - Checks shared with bridge.ts

private func only(_ text: String, max: Int, _ allowed: (Unicode.Scalar) -> Bool) -> Bool {
  !text.isEmpty && text.unicodeScalars.count <= max && text.unicodeScalars.allSatisfy(allowed)
}

private func isAsciiLetter(_ c: Unicode.Scalar) -> Bool {
  ("a"..."z").contains(c) || ("A"..."Z").contains(c)
}

private func isDigit(_ c: Unicode.Scalar) -> Bool { ("0"..."9").contains(c) }

/// `^[A-Za-z0-9-]{1,64}$`
public func isRequestId(_ text: String) -> Bool {
  only(text, max: 64) { isAsciiLetter($0) || isDigit($0) || $0 == "-" }
}

/// `^[a-z0-9.-]{1,253}$`
public func isHost(_ text: String) -> Bool {
  only(text, max: 253) { ("a"..."z").contains($0) || isDigit($0) || $0 == "." || $0 == "-" }
}

/// `^[A-Za-z][A-Za-z0-9_.]{0,254}$`
public func isAppId(_ text: String) -> Bool {
  guard let first = text.unicodeScalars.first, isAsciiLetter(first) else { return false }
  return only(text, max: 255) { isAsciiLetter($0) || isDigit($0) || $0 == "_" || $0 == "." }
}

// MARK: - Wire types

private struct WireTarget: Codable {
  let kind: String
  let host: String?
  let id: String?
}

private struct WireRequest: Codable {
  let version: Int
  let requestId: String
  let target: WireTarget
  let fields: [String]
}

private struct WireAnswer: Decodable {
  let version: Int
  let requestId: String
  let kind: String
  let values: [String: String]?
}

private func wire(_ target: FillTarget) -> WireTarget {
  switch target {
  case .web(let host): return WireTarget(kind: "web", host: host, id: nil)
  case .app(let id): return WireTarget(kind: "app", host: nil, id: id)
  }
}

private func parseTarget(_ target: WireTarget) -> FillTarget? {
  switch target.kind {
  case "web": return target.host.flatMap { isHost($0) ? .web(host: $0) : nil }
  case "app": return target.id.flatMap { isAppId($0) ? .app(id: $0) : nil }
  default: return nil
  }
}

// MARK: - Requests

/// A request for this target and these fields, or nil if any part would not pass bridge.ts
public func makeRequest(requestId: String, target: FillTarget, fields: [FillField]) -> FillRequest? {
  guard isRequestId(requestId), !fields.isEmpty, Set(fields).count == fields.count else { return nil }
  switch target {
  case .web(let host) where !isHost(host): return nil
  case .app(let id) where !isAppId(id): return nil
  default: return FillRequest(requestId: requestId, target: target, fields: fields)
  }
}

/// The request as the webview reads it (parseFillRequest in bridge.ts)
public func requestJSON(_ request: FillRequest) -> String {
  let body = WireRequest(
    version: Bridge.version,
    requestId: request.requestId,
    target: wire(request.target),
    fields: request.fields.map(\.rawValue)
  )
  let encoder = JSONEncoder()
  encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
  // Encoding strings and an Int cannot fail
  return String(decoding: (try? encoder.encode(body)) ?? Data(), as: UTF8.self)
}

/// A request read back (the app reads what the extension wrote), with every check of bridge.ts
public func parseRequest(_ text: String) -> FillRequest? {
  guard text.utf8.count <= Bridge.maxMessage,
    let body = try? JSONDecoder().decode(WireRequest.self, from: Data(text.utf8)),
    body.version == Bridge.version,
    let target = parseTarget(body.target)
  else { return nil }
  let fields = body.fields.compactMap(FillField.init(rawValue:))
  guard fields.count == body.fields.count else { return nil }
  return makeRequest(requestId: body.requestId, target: target, fields: fields)
}

// MARK: - Answers

/// The answer to exactly this request, or nil for anything else: another id or version, an
/// unknown kind, a field the request did not ask for, a value that is not a bounded string
public func parseAnswer(_ text: String, for request: FillRequest) -> Answer? {
  guard text.utf8.count <= Bridge.maxMessage,
    let body = try? JSONDecoder().decode(WireAnswer.self, from: Data(text.utf8)),
    body.version == Bridge.version,
    body.requestId == request.requestId
  else { return nil }
  switch body.kind {
  case "cancel": return .cancel
  case "fill": return body.values.flatMap { fillValues($0, asked: request.fields) }
  default: return nil
  }
}

private func fillValues(_ values: [String: String], asked: [FillField]) -> Answer? {
  var kept: [FillField: String] = [:]
  for (name, value) in values {
    guard let field = FillField(rawValue: name), asked.contains(field),
      // bridge.ts counts UTF-16 code units (String.length), not grapheme clusters
      value.utf16.count <= Bridge.maxValue
    else { return nil }
    kept[field] = value
  }
  return kept.isEmpty ? .cancel : .fill(kept)
}

/// The answer in the bridge's own form, so only what was checked crosses to the extension
public func answerJSON(_ answer: Answer, for request: FillRequest) -> String {
  var body: [String: Any] = ["version": Bridge.version, "requestId": request.requestId]
  switch answer {
  case .cancel:
    body["kind"] = "cancel"
  case .fill(let values):
    body["kind"] = "fill"
    body["values"] = Dictionary(uniqueKeysWithValues: values.map { ($0.key.rawValue, $0.value) })
  }
  let data = try? JSONSerialization.data(withJSONObject: body, options: [.sortedKeys])
  return String(decoding: data ?? Data(), as: UTF8.self)
}
