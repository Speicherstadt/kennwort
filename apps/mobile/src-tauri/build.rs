fn main() {
  // Only the shell needs Tauri's build step; the server rules alone build and test without it
  if std::env::var_os("CARGO_FEATURE_SHELL").is_some() {
    tauri_build::build()
  }
}
