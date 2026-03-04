// ============================================================================
// CodeEX v2 — TerraRuntime Desktop Entry Point
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// TerraRuntime desktop application: registers all Rust commands for the SolidJS frontend.
// ============================================================================

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use commands::lsp::LspState;
use commands::pty::PtyState;
use commands::watch::WatcherState;
use std::collections::HashMap;
use std::sync::Mutex;

/// One-shot command execution for agent tools (separate from PTY).
/// Uses tokio::process::Command to capture stdout + stderr.
#[tauri::command]
async fn run_command(command: String, cwd: Option<String>) -> Result<String, String> {
    let output = if cfg!(windows) {
        let mut cmd = tokio::process::Command::new("powershell.exe");
        cmd.args(["-NoProfile", "-Command", &command]);
        if let Some(dir) = &cwd {
            cmd.current_dir(dir);
        }
        cmd.output().await
    } else {
        let mut cmd = tokio::process::Command::new("/bin/sh");
        cmd.args(["-c", &command]);
        if let Some(dir) = &cwd {
            cmd.current_dir(dir);
        }
        cmd.output().await
    };

    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let stderr = String::from_utf8_lossy(&out.stderr);
            let mut result = stdout.to_string();
            if !stderr.is_empty() {
                if !result.is_empty() {
                    result.push('\n');
                }
                result.push_str(&stderr);
            }
            Ok(result)
        }
        Err(e) => Err(format!("Failed to run command: {}", e)),
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(WatcherState {
            watchers: Mutex::new(HashMap::new()),
        })
        .manage(PtyState {
            sessions: Mutex::new(HashMap::new()),
            next_id: Mutex::new(1),
        })
        .manage(LspState {
            sessions: Mutex::new(HashMap::new()),
            next_id: Mutex::new(1),
        })
        .invoke_handler(tauri::generate_handler![
            // File system
            commands::fs::read_file,
            commands::fs::write_file,
            commands::fs::delete_path,
            commands::fs::create_dir,
            commands::fs::rename_path,
            commands::fs::path_exists,
            commands::fs::file_stat,
            commands::fs::read_dir,
            // Search
            commands::search::search_files,
            // File watcher
            commands::watch::watch_path,
            commands::watch::unwatch_path,
            // PTY
            commands::pty::pty_spawn,
            commands::pty::pty_write,
            commands::pty::pty_resize,
            commands::pty::pty_kill,
            // LSP (Language Server Protocol)
            commands::lsp::lsp_spawn,
            commands::lsp::lsp_send,
            commands::lsp::lsp_kill,
            // One-shot command execution (agent tools)
            run_command,
        ])
        .run(tauri::generate_context!())
        .expect("error while running CodeEX");
}
