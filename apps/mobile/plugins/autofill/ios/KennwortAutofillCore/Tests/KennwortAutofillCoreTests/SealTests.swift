#if canImport(CryptoKit)
  import XCTest
  import KennwortAutofillApple
  import KennwortAutofillCore

  /// Runs on a Mac only (CryptoKit)
  final class SealTests: XCTestCase {
    let answer = #"{"kind":"fill","requestId":"r-1","values":{"password":"Sommer-2026!"},"version":1}"#

    func testOpensWhatWasSealedForThisRequestAndKey() throws {
      let key = Seal.newKey()
      let sealed = try XCTUnwrap(Seal.seal(answer, requestId: "r-1", to: Seal.publicKey(of: key)))
      XCTAssertFalse(sealed.ciphertext.contains("Sommer"))
      XCTAssertEqual(Seal.open(sealed, requestId: "r-1", with: key), answer)
    }

    func testOpensNothingForAnotherKeyOrRequest() throws {
      let key = Seal.newKey()
      let sealed = try XCTUnwrap(Seal.seal(answer, requestId: "r-1", to: Seal.publicKey(of: key)))
      XCTAssertNil(Seal.open(sealed, requestId: "r-1", with: Seal.newKey()))
      XCTAssertNil(Seal.open(sealed, requestId: "r-2", with: key))
      let moved = HandoverAnswer(requestId: "r-2", encapsulatedKey: sealed.encapsulatedKey, ciphertext: sealed.ciphertext)
      XCTAssertNil(Seal.open(moved, requestId: "r-2", with: key))
    }

    func testSealsToNoKeyThatIsNotOne() {
      XCTAssertNil(Seal.seal(answer, requestId: "r-1", to: "AAAA"))
    }
  }
#endif
