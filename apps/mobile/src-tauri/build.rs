fn main() {
  // Only the shell needs Tauri's build step; the server rules alone build and test without it
  if std::env::var_os("CARGO_FEATURE_SHELL").is_some() {
    tauri_build::build();
    link_ios_autofill();
  }
}

/// Links the Swift plugin of the iOS autofill (plugins/autofill/ios/Plugin) into the app, the way
/// a Tauri plugin crate links its `ios` folder (tauri-plugin 2.x, build/mobile.rs): the package
/// finds the Tauri crate's Swift API under `.tauri/tauri-api`, and swift-rs builds it for the iOS
/// target. Only on a Mac building for iOS; everywhere else this does nothing.
#[cfg(target_os = "macos")]
fn link_ios_autofill() {
  use std::path::PathBuf;
  if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("ios") {
    return;
  }
  let manifest = PathBuf::from(std::env::var_os("CARGO_MANIFEST_DIR").expect("cargo sets it"));
  let plugin = manifest.join("../plugins/autofill/ios/Plugin");
  let api = std::env::var_os("DEP_TAURI_IOS_LIBRARY_PATH").expect("the tauri crate names its Swift API");
  let link = plugin.join(".tauri/tauri-api");
  std::fs::create_dir_all(plugin.join(".tauri")).expect("create .tauri");
  let _ = std::fs::remove_file(&link);
  std::os::unix::fs::symlink(api, &link).expect("link the Tauri Swift API");
  println!("cargo:rerun-if-changed={}", plugin.join("Sources").display());
  println!("cargo:rerun-if-changed={}", manifest.join("../plugins/autofill/ios/KennwortAutofillCore/Sources").display());
  tauri_utils::build::link_apple_library("kennwort-autofill", &plugin);
}

#[cfg(not(target_os = "macos"))]
fn link_ios_autofill() {}
