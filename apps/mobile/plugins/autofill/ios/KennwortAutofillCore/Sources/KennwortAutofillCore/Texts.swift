/// The few words the extension shows, in German and English like the app (messages/*.json): the
/// extension is native UIKit outside the webview, so Paraglide cannot reach it, as Android's
/// strings.xml for its suggestion. Kept here so a test checks both languages have every text.
public enum TextKey: String, CaseIterable, Sendable {
  case title, waiting, noTarget, cancel, notSupported
}

public let texts: [String: [TextKey: String]] = [
  "de": [
    .title: "Mit Kennwort ausfüllen",
    .waiting:
      "Wechsle zu Kennwort, entsperre es und wähle den Eintrag für {host}. Komm dann hierher zurück; Kennwort füllt nur aus, was du dort gewählt hast.",
    .noTarget: "Kennwort erkennt hier keine Website über https und füllt nichts aus.",
    .cancel: "Nicht ausfüllen",
    .notSupported: "Passkeys aus Kennwort gibt es auf dem iPhone noch nicht.",
  ],
  "en": [
    .title: "Fill with Kennwort",
    .waiting:
      "Switch to Kennwort, unlock it and pick the entry for {host}. Then come back here; Kennwort fills only what you picked there.",
    .noTarget: "Kennwort finds no website over https here and fills nothing.",
    .cancel: "Don't fill",
    .notSupported: "Passkeys from Kennwort are not available on the iPhone yet.",
  ],
]

/// German for a German first language, English otherwise
public func text(_ key: TextKey, languages: [String]) -> String {
  let language = languages.first.map { $0.lowercased().hasPrefix("de") ? "de" : "en" } ?? "en"
  return texts[language]?[key] ?? ""
}
