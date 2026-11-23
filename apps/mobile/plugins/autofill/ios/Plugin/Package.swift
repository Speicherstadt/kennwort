// swift-tools-version:5.9
// The app's side of the iOS autofill as a Tauri iOS plugin (Swift), linked into the app by
// src-tauri/build.rs like a Tauri plugin crate links its `ios` folder: build.rs points
// `.tauri/tauri-api` at the Tauri crate's Swift API (DEP_TAURI_IOS_LIBRARY_PATH) and lets
// swift-rs build this package for the iOS target. Rust registers it in src-tauri/src/autofill.rs.
import PackageDescription

let package = Package(
  name: "kennwort-autofill",
  platforms: [.iOS(.v17)],
  products: [
    .library(name: "kennwort-autofill", type: .static, targets: ["KennwortAutofillPlugin"])
  ],
  dependencies: [
    .package(path: ".tauri/tauri-api"),
    .package(path: "../KennwortAutofillCore"),
  ],
  targets: [
    .target(
      name: "KennwortAutofillPlugin",
      dependencies: [
        .product(name: "Tauri", package: "tauri-api"),
        .product(name: "KennwortAutofillCore", package: "KennwortAutofillCore"),
        .product(name: "KennwortAutofillApple", package: "KennwortAutofillCore"),
      ]
    )
  ]
)
