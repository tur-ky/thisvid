//! `main.rs` — Tauri application entry point.
//!
//! Kept minimal: all logic lives in `lib.rs` for testability.
//! On Windows, `#![windows_subsystem = "windows"]` prevents a console window
//! from appearing when the app is launched normally.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    thisvid_lib::run();
}
