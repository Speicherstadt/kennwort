#if canImport(CryptoKit)
  import CryptoKit
  import Foundation
  import KennwortAutofillCore

  /// Seals the bridge's answer for the waiting extension: HPKE (RFC 9180) in base mode with
  /// DHKEM(X25519, HKDF-SHA256), HKDF-SHA256 and ChaCha20-Poly1305, as CryptoKit has it since iOS 17.
  /// The extension makes a fresh key pair for each request and keeps the private key in memory
  /// only; the request id is the AAD, so an answer for another request does not open. Apple's own
  /// primitives on Apple's side: packages/crypto (@noble/*) runs in the webview, not here.
  public enum Seal {
    static let suite = HPKE.Ciphersuite.Curve25519_SHA256_ChachaPoly
    static let info = Data("kennwort/ios-autofill-handover/v1".utf8)

    public static func newKey() -> Curve25519.KeyAgreement.PrivateKey {
      Curve25519.KeyAgreement.PrivateKey()
    }

    public static func publicKey(of key: Curve25519.KeyAgreement.PrivateKey) -> String {
      key.publicKey.rawRepresentation.base64EncodedString()
    }

    /// The app's side: the checked answer, sealed to the key in the hand-over request
    public static func seal(_ answer: String, requestId: String, to recipientKey: String)
      -> HandoverAnswer?
    {
      guard let raw = Data(base64Encoded: recipientKey),
        let key = try? Curve25519.KeyAgreement.PublicKey(rawRepresentation: raw),
        var sender = try? HPKE.Sender(recipientKey: key, ciphersuite: suite, info: info),
        let sealed = try? sender.seal(Data(answer.utf8), authenticating: Data(requestId.utf8))
      else { return nil }
      return HandoverAnswer(
        requestId: requestId,
        encapsulatedKey: sender.encapsulatedKey.base64EncodedString(),
        ciphertext: sealed.base64EncodedString()
      )
    }

    /// The extension's side: the answer's text, or nil if it is not for this request and key
    public static func open(
      _ answer: HandoverAnswer, requestId: String, with key: Curve25519.KeyAgreement.PrivateKey
    ) -> String? {
      guard answer.version == Handover.version, answer.requestId == requestId,
        let encapsulated = Data(base64Encoded: answer.encapsulatedKey),
        let sealed = Data(base64Encoded: answer.ciphertext),
        sealed.count <= 2 * Bridge.maxMessage,
        var recipient = try? HPKE.Recipient(
          privateKey: key, ciphersuite: suite, info: info, encapsulatedKey: encapsulated),
        let plain = try? recipient.open(sealed, authenticating: Data(requestId.utf8))
      else { return nil }
      return String(data: plain, encoding: .utf8)
    }
  }
#endif
