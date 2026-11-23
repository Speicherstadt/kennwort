import Foundation
import XCTest

@testable import KennwortAutofillCore

/// A slot in memory, as the tests' stand-in for the App Group file
private final class Memory: @unchecked Sendable {
  var data: Data?
  lazy var slot = Slot(
    read: { self.data }, write: { self.data = $0; return true }, remove: { self.data = nil })
}

final class HandoverTests: XCTestCase {
  let key = Data(repeating: 7, count: 32).base64EncodedString()
  let request = makeRequest(requestId: "r-1", target: .web(host: "weber-haustechnik.de"), fields: [.username, .password])!

  func testTakesWhatWasPutOnce() {
    let memory = Memory()
    let handover = HandoverRequest(createdAt: 1000, request: requestJSON(request), recipientKey: key)
    XCTAssertTrue(put(handover, into: memory.slot))
    XCTAssertEqual(take(HandoverRequest.self, from: memory.slot), handover)
    XCTAssertNil(take(HandoverRequest.self, from: memory.slot))
  }

  func testEmptiesTheSlotEvenWhenItsContentIsInvalid() {
    let memory = Memory()
    memory.data = Data("garbage".utf8)
    XCTAssertNil(take(HandoverRequest.self, from: memory.slot))
    XCTAssertNil(memory.data)
  }

  func testRefusesAnOversizedSlot() {
    let memory = Memory()
    memory.data = Data(repeating: 32, count: 2 * Bridge.maxMessage + 1)
    XCTAssertNil(take(HandoverAnswer.self, from: memory.slot))
  }

  func testOpensACurrentRequest() {
    let handover = HandoverRequest(createdAt: 1000, request: requestJSON(request), recipientKey: key)
    XCTAssertEqual(freshRequest(handover, now: 1000 + Handover.maxAge), request)
  }

  func testDropsAStaleRequestOrOneFromTheFuture() {
    let handover = HandoverRequest(createdAt: 1000, request: requestJSON(request), recipientKey: key)
    XCTAssertNil(freshRequest(handover, now: 1000 + Handover.maxAge + 1))
    XCTAssertNil(freshRequest(handover, now: 1000 - Handover.skew - 1))
  }

  func testDropsARequestWithoutAUsableKeyOrWithAnInvalidRequest() {
    XCTAssertNil(freshRequest(HandoverRequest(createdAt: 1, request: requestJSON(request), recipientKey: "AAAA"), now: 1))
    XCTAssertNil(freshRequest(HandoverRequest(createdAt: 1, request: "{}", recipientKey: key), now: 1))
  }

  func testDropsAnotherHandoverVersion() throws {
    let json = #"{"version":2,"createdAt":1,"request":"","recipientKey":""}"#
    let handover = try JSONDecoder().decode(HandoverRequest.self, from: Data(json.utf8))
    XCTAssertNil(freshRequest(handover, now: 1))
  }

  func testEveryTextExistsInBothLanguages() {
    for key in TextKey.allCases {
      XCTAssertFalse(text(key, languages: ["de-DE"]).isEmpty, "de \(key)")
      XCTAssertFalse(text(key, languages: ["en-GB"]).isEmpty, "en \(key)")
    }
    XCTAssertEqual(text(.cancel, languages: ["de-AT"]), "Nicht ausfüllen")
    XCTAssertEqual(text(.cancel, languages: ["fr"]), "Don't fill")
  }
}
