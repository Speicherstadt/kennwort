import XCTest

@testable import KennwortAutofillCore

final class ServiceIdentifierTests: XCTestCase {
  private func domain(_ text: String) -> ServiceIdentifier { .init(kind: .domain, identifier: text) }
  private func url(_ text: String) -> ServiceIdentifier { .init(kind: .url, identifier: text) }

  func testTakesTheHostOfAnHttpsPage() {
    XCTAssertEqual(fillTarget(for: [url("https://Portal.Weber-Haustechnik.de:8443/login?x=1")]), .web(host: "portal.weber-haustechnik.de"))
  }

  func testTakesADomainLowerCasedWithoutItsTrailingDot() {
    XCTAssertEqual(fillTarget(for: [domain("Weber-Haustechnik.DE.")]), .web(host: "weber-haustechnik.de"))
  }

  func testFillsNothingIntoAPageOverHttp() {
    XCTAssertNil(fillTarget(for: [url("http://weber-haustechnik.de/login")]))
    XCTAssertNil(fillTarget(for: [url("ftp://weber-haustechnik.de")]))
    XCTAssertNil(fillTarget(for: [url("weber-haustechnik.de")]))
  }

  func testFillsNothingWithoutAnIdentifier() {
    XCTAssertNil(fillTarget(for: []))
  }

  func testFillsNothingForAKindItDoesNotKnow() {
    XCTAssertNil(fillTarget(for: [.init(kind: .other, identifier: "de.weber.monteur")]))
  }

  func testFillsNothingWhenTheIdentifiersNameDifferentHosts() {
    XCTAssertNil(fillTarget(for: [domain("weber-haustechnik.de"), domain("evil.example")]))
    XCTAssertNil(fillTarget(for: [domain("weber-haustechnik.de"), url("http://weber-haustechnik.de")]))
  }

  func testTakesSeveralIdentifiersOfTheSameHost() {
    XCTAssertEqual(
      fillTarget(for: [domain("weber-haustechnik.de"), url("https://weber-haustechnik.de/a")]),
      .web(host: "weber-haustechnik.de"))
  }

  func testRefusesHostsTheBridgeWouldRefuse() {
    XCTAssertNil(normalizedHost("wéber.de"))
    XCTAssertNil(normalizedHost("weber haustechnik.de"))
    XCTAssertNil(normalizedHost(""))
    XCTAssertNil(normalizedHost(".de"))
    XCTAssertNil(normalizedHost("a..de"))
    XCTAssertEqual(normalizedHost("xn--wber-bpa.de"), "xn--wber-bpa.de")
  }
}
