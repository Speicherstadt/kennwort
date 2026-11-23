import Foundation

/// The one-shot hand-over between the extension and the app through the App Group
/// (docs/plan.md, Entscheidungen "Autofill unter iOS"). An iOS extension cannot open its app, so
/// the person switches to Kennwort, picks an entry and switches back. Each side writes one slot and
/// the other takes it: read and removed in one step, whatever it holds. The request holds no
/// secret; the answer holds the bridge's answer sealed with HPKE to a key only the waiting
/// extension has in memory (KennwortAutofillApple, Seal.swift), so no password lies on the disk in
/// plain text and an answer for an extension that went away opens nowhere.
public enum Handover {
  public static let version = 1
  /// A request older than this is dropped: the person was not waiting on it any more
  public static let maxAge: TimeInterval = 180
  /// Allowed clock skew for a request "from the future" (both sides use the same clock)
  public static let skew: TimeInterval = 5
}

/// What the extension leaves for the app: the bridge's request and the key to seal the answer to
public struct HandoverRequest: Codable, Equatable, Sendable {
  public let version: Int
  public let createdAt: TimeInterval
  public let request: String
  /// Raw X25519 public key, base64
  public let recipientKey: String

  public init(createdAt: TimeInterval, request: String, recipientKey: String) {
    self.version = Handover.version
    self.createdAt = createdAt
    self.request = request
    self.recipientKey = recipientKey
  }
}

/// What the app leaves for the extension: the answer, sealed (RFC 9180, base mode)
public struct HandoverAnswer: Codable, Equatable, Sendable {
  public let version: Int
  public let requestId: String
  public let encapsulatedKey: String
  public let ciphertext: String

  public init(requestId: String, encapsulatedKey: String, ciphertext: String) {
    self.version = Handover.version
    self.requestId = requestId
    self.encapsulatedKey = encapsulatedKey
    self.ciphertext = ciphertext
  }
}

/// A place for one message; the App Group file in the apps, memory in the tests
public struct Slot: Sendable {
  public let read: @Sendable () -> Data?
  public let write: @Sendable (Data) -> Bool
  public let remove: @Sendable () -> Void

  public init(
    read: @escaping @Sendable () -> Data?,
    write: @escaping @Sendable (Data) -> Bool,
    remove: @escaping @Sendable () -> Void
  ) {
    self.read = read
    self.write = write
    self.remove = remove
  }
}

/// The largest slot content either side reads: an answer is at most a bridge message plus framing
private let maxSlot = 2 * Bridge.maxMessage

public func put<T: Encodable>(_ value: T, into slot: Slot) -> Bool {
  guard let data = try? JSONEncoder().encode(value) else { return false }
  return slot.write(data)
}

/// Reads the slot once and empties it, whether its content was valid or not
public func take<T: Decodable>(_ type: T.Type, from slot: Slot) -> T? {
  let data = slot.read()
  slot.remove()
  guard let data, data.count <= maxSlot else { return nil }
  return try? JSONDecoder().decode(type, from: data)
}

/// The request inside a hand-over, if it is current, of this version and valid as bridge.ts reads it
public func freshRequest(_ handover: HandoverRequest, now: TimeInterval) -> FillRequest? {
  guard handover.version == Handover.version,
    handover.createdAt <= now + Handover.skew,
    now - handover.createdAt <= Handover.maxAge,
    let key = Data(base64Encoded: handover.recipientKey), key.count == 32
  else { return nil }
  return parseRequest(handover.request)
}
