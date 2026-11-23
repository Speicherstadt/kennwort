import Foundation
import XCTest

@testable import KennwortAutofillCore

final class BridgeTests: XCTestCase {
  let request = makeRequest(
    requestId: "8C1E-42", target: .web(host: "weber-haustechnik.de"), fields: [.username, .password])!

  private func object(_ text: String) -> NSDictionary {
    try! JSONSerialization.jsonObject(with: Data(text.utf8)) as! NSDictionary
  }

  func testWritesTheRequestAsBridgeTsReadsIt() {
    let expected: NSDictionary = [
      "version": 1, "requestId": "8C1E-42",
      "target": ["kind": "web", "host": "weber-haustechnik.de"],
      "fields": ["username", "password"],
    ]
    XCTAssertEqual(object(requestJSON(request)), expected)
    let app = makeRequest(requestId: "a", target: .app(id: "de.weber.monteur"), fields: [.password])!
    XCTAssertEqual(
      object(requestJSON(app))["target"] as? NSDictionary, ["kind": "app", "id": "de.weber.monteur"])
  }

  func testReadsBackWhatItWrote() {
    XCTAssertEqual(parseRequest(requestJSON(request)), request)
  }

  func testRefusesARequestBridgeTsWouldRefuse() {
    XCTAssertNil(makeRequest(requestId: "", target: .web(host: "a.de"), fields: [.password]))
    XCTAssertNil(makeRequest(requestId: String(repeating: "a", count: 65), target: .web(host: "a.de"), fields: [.password]))
    XCTAssertNil(makeRequest(requestId: "a b", target: .web(host: "a.de"), fields: [.password]))
    XCTAssertNil(makeRequest(requestId: "a", target: .web(host: "A.de"), fields: [.password]))
    XCTAssertNil(makeRequest(requestId: "a", target: .app(id: "1app"), fields: [.password]))
    XCTAssertNil(makeRequest(requestId: "a", target: .web(host: "a.de"), fields: []))
    XCTAssertNil(makeRequest(requestId: "a", target: .web(host: "a.de"), fields: [.password, .password]))
    XCTAssertNil(parseRequest(#"{"version":2,"requestId":"a","target":{"kind":"web","host":"a.de"},"fields":["password"]}"#))
    XCTAssertNil(parseRequest(#"{"version":1,"requestId":"a","target":{"kind":"web","host":"a.de"},"fields":["pin"]}"#))
    XCTAssertNil(parseRequest(#"{"version":1,"requestId":"a","target":{"kind":"mail","host":"a.de"},"fields":["password"]}"#))
    XCTAssertNil(parseRequest(#"{"version":true,"requestId":"a","target":{"kind":"web","host":"a.de"},"fields":["password"]}"#))
  }

  func testTakesAFillForExactlyThisRequest() {
    let answer = #"{"version":1,"requestId":"8C1E-42","kind":"fill","values":{"username":"anna","password":"Sommer-2026!"}}"#
    XCTAssertEqual(parseAnswer(answer, for: request), .fill([.username: "anna", .password: "Sommer-2026!"]))
  }

  func testTakesACancel() {
    XCTAssertEqual(parseAnswer(#"{"version":1,"requestId":"8C1E-42","kind":"cancel"}"#, for: request), .cancel)
  }

  func testAFillWithoutValuesIsACancel() {
    XCTAssertEqual(parseAnswer(#"{"version":1,"requestId":"8C1E-42","kind":"fill","values":{}}"#, for: request), .cancel)
  }

  func testRefusesAnAnswerForAnotherRequestOrVersion() {
    XCTAssertNil(parseAnswer(#"{"version":1,"requestId":"other","kind":"cancel"}"#, for: request))
    XCTAssertNil(parseAnswer(#"{"version":2,"requestId":"8C1E-42","kind":"cancel"}"#, for: request))
    XCTAssertNil(parseAnswer(#"{"version":"1","requestId":"8C1E-42","kind":"cancel"}"#, for: request))
    XCTAssertNil(parseAnswer(#"{"version":true,"requestId":"8C1E-42","kind":"cancel"}"#, for: request))
    XCTAssertNil(parseAnswer(#"{"requestId":"8C1E-42","kind":"cancel"}"#, for: request))
    XCTAssertNil(parseAnswer(#"{"version":1,"requestId":"8C1E-42","kind":"save"}"#, for: request))
    XCTAssertNil(parseAnswer("not json", for: request))
    XCTAssertNil(parseAnswer("[]", for: request))
  }

  func testRefusesFieldsTheRequestDidNotAskFor() {
    XCTAssertNil(parseAnswer(#"{"version":1,"requestId":"8C1E-42","kind":"fill","values":{"password":"x","totp":"123456"}}"#, for: request))
    XCTAssertNil(parseAnswer(#"{"version":1,"requestId":"8C1E-42","kind":"fill","values":{"password":"x","pin":"1"}}"#, for: request))
    XCTAssertNil(parseAnswer(#"{"version":1,"requestId":"8C1E-42","kind":"fill"}"#, for: request))
  }

  func testRefusesValuesThatAreNotBoundedStrings() {
    XCTAssertNil(parseAnswer(#"{"version":1,"requestId":"8C1E-42","kind":"fill","values":{"password":42}}"#, for: request))
    XCTAssertNil(parseAnswer(#"{"version":1,"requestId":"8C1E-42","kind":"fill","values":{"password":null}}"#, for: request))
    let long = String(repeating: "x", count: Bridge.maxValue + 1)
    XCTAssertNil(parseAnswer(#"{"version":1,"requestId":"8C1E-42","kind":"fill","values":{"password":"\#(long)"}}"#, for: request))
    let atCap = String(repeating: "x", count: Bridge.maxValue)
    XCTAssertEqual(parseAnswer(#"{"version":1,"requestId":"8C1E-42","kind":"fill","values":{"password":"\#(atCap)"}}"#, for: request), .fill([.password: atCap]))
  }

  func testRefusesAMessageOverTheCap() {
    let padding = String(repeating: " ", count: Bridge.maxMessage)
    XCTAssertNil(parseAnswer(#"{"version":1,"requestId":"8C1E-42","kind":"cancel"}"# + padding, for: request))
  }

  func testWritesTheCheckedAnswerBackInTheBridgesForm() {
    let fill = Answer.fill([.password: "Sommer-2026!"])
    XCTAssertEqual(parseAnswer(answerJSON(fill, for: request), for: request), fill)
    XCTAssertEqual(parseAnswer(answerJSON(.cancel, for: request), for: request), .cancel)
  }
}
