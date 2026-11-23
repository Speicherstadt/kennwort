// No console window on Windows in release; the desktop build only serves `tauri dev`
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  kennwort_mobile_lib::run();
}
