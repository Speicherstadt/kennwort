import Foundation

/// An `ASCredentialServiceIdentifier` without AuthenticationServices, so the rules stay testable.
/// iOS names a web page by its URL and an app by a domain from the app's associated domains, which
/// Apple checks against the site's apple-app-site-association file before an app may claim it; it
/// never hands a credential provider the app's bundle id for passwords. So on iOS every target is a
/// host, and the exact host match runs in the webview (matches.ts), as for Android and the extension.
public struct ServiceIdentifier: Equatable, Sendable {
  public enum Kind: Equatable, Sendable { case domain, url, other }
  public let kind: Kind
  public let identifier: String

  public init(kind: Kind, identifier: String) {
    self.kind = kind
    self.identifier = identifier
  }
}

/// The host as the bridge takes it: lower case, without a trailing dot, ASCII only (an IDN arrives
/// in its punycode form), or nil
public func normalizedHost(_ text: String) -> String? {
  var host = text.trimmingCharacters(in: .whitespaces).lowercased()
  if host.hasSuffix(".") { host.removeLast() }
  return isHost(host) && !host.hasPrefix(".") && !host.contains("..") ? host : nil
}

/// The host of an https URL; P-17: a password is never filled into a page served over http
private func httpsHost(_ text: String) -> String? {
  guard let parts = URLComponents(string: text), parts.scheme?.lowercased() == "https",
    let host = parts.host
  else { return nil }
  return normalizedHost(host)
}

private func host(of service: ServiceIdentifier) -> String? {
  switch service.kind {
  case .domain: return normalizedHost(service.identifier)
  case .url: return httpsHost(service.identifier)
  case .other: return nil
  }
}

/// The target of a request, or nil for nothing to fill. iOS may list several identifiers (a page
/// and its frames' hosts, or an app's associated domains). They must all name the same host:
/// otherwise the extension cannot tell which one the person sees, and fills nothing rather than
/// guess. An identifier it cannot read (http, an unknown kind) also stops it.
public func fillTarget(for services: [ServiceIdentifier]) -> FillTarget? {
  let hosts = services.map(host(of:))
  guard let first = hosts.first, let host = first, hosts.allSatisfy({ $0 == host }) else {
    return nil
  }
  return .web(host: host)
}
