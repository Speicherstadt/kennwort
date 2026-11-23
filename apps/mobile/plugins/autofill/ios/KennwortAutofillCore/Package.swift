// swift-tools-version:5.9
// The pure core of the iOS autofill (docs/plan.md, Entscheidungen "Autofill unter iOS"): the
// bridge's JSON, the service identifiers and the one-shot hand-over, on Foundation alone, so
// `swift test` runs it on Linux too. KennwortAutofillApple adds what only Apple's SDKs have
// (CryptoKit's HPKE, the App Group container); it compiles to nothing elsewhere.
import PackageDescription

let package = Package(
  name: "KennwortAutofillCore",
  platforms: [.iOS(.v17), .macOS(.v14)],
  products: [
    .library(name: "KennwortAutofillCore", targets: ["KennwortAutofillCore"]),
    .library(name: "KennwortAutofillApple", targets: ["KennwortAutofillApple"]),
  ],
  targets: [
    .target(name: "KennwortAutofillCore"),
    .target(name: "KennwortAutofillApple", dependencies: ["KennwortAutofillCore"]),
    .testTarget(
      name: "KennwortAutofillCoreTests",
      dependencies: ["KennwortAutofillCore", "KennwortAutofillApple"]
    ),
  ]
)
