// ============================================================================
// CodeEX v2 — TerraRuntime LSP Commands
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Language Server Protocol process management via stdio pipes.
// Spawns LSP servers, routes JSON-RPC messages through Content-Length framing.
// ============================================================================

use serde::Serialize;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

pub struct LspState {
    pub sessions: Mutex<HashMap<String, LspSession>>,
    pub next_id: Mutex<u32>,
}

pub struct LspSession {
    stdin: Box<dyn Write + Send>,
    #[allow(dead_code)]
    child: Child,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LspMessagePayload {
    lsp_id: String,
    message: String,
}


/// Spawn an LSP server process with piped stdin/stdout.
/// Returns a session ID for subsequent send/kill commands.
#[tauri::command]
pub fn lsp_spawn(
    command: String,
    args: Vec<String>,
    cwd: Option<String>,
    state: tauri::State<'_, LspState>,
    app: AppHandle,
) -> Result<String, String> {
    let mut cmd = Command::new(&command);
    cmd.args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if let Some(dir) = &cwd {
        cmd.current_dir(dir);
    }

    // On Windows, prevent a console window from appearing
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn LSP server '{}': {}", command, e))?;

    let stdin = child
        .stdin
        .take()
        .ok_or("Failed to capture LSP stdin")?;

    let stdout = child
        .stdout
        .take()
        .ok_or("Failed to capture LSP stdout")?;

    let stderr = child
        .stderr
        .take()
        .ok_or("Failed to capture LSP stderr")?;

    // Generate unique session ID
    let mut next_id = state.next_id.lock().map_err(|e| e.to_string())?;
    let lsp_id = format!("lsp-{}", *next_id);
    *next_id += 1;
    drop(next_id);

    // Spawn stdout reader thread — parses LSP Content-Length protocol
    let id_clone = lsp_id.clone();
    let app_stdout = app.clone();
    std::thread::spawn(move || {
        lsp_stdout_reader(stdout, &id_clone, &app_stdout);
    });

    // Spawn stderr reader thread — logs LSP server errors
    let id_clone2 = lsp_id.clone();
    let app_stderr = app.clone();
    std::thread::spawn(move || {
        lsp_stderr_reader(stderr, &id_clone2, &app_stderr);
    });

    // Store session
    let session = LspSession {
        stdin: Box::new(stdin),
        child,
    };

    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    sessions.insert(lsp_id.clone(), session);

    Ok(lsp_id)
}

/// Send a JSON-RPC message to the LSP server's stdin.
/// Automatically wraps with Content-Length header per LSP protocol.
#[tauri::command]
pub fn lsp_send(
    lsp_id: String,
    message: String,
    state: tauri::State<'_, LspState>,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    let session = sessions
        .get_mut(&lsp_id)
        .ok_or_else(|| format!("LSP session {} not found", lsp_id))?;

    let content_length = message.len();
    let framed = format!("Content-Length: {}\r\n\r\n{}", content_length, message);

    session
        .stdin
        .write_all(framed.as_bytes())
        .map_err(|e| format!("Failed to write to LSP stdin: {}", e))?;
    session
        .stdin
        .flush()
        .map_err(|e| format!("Failed to flush LSP stdin: {}", e))?;

    Ok(())
}

/// Kill an LSP server process.
#[tauri::command]
pub fn lsp_kill(
    lsp_id: String,
    state: tauri::State<'_, LspState>,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    if let Some(mut session) = sessions.remove(&lsp_id) {
        let _ = session.child.kill();
    }
    Ok(())
}

/// Read LSP messages from stdout using Content-Length framing.
/// Each complete message is emitted as an "lsp-message" TerraRuntime event.
fn lsp_stdout_reader(
    stdout: std::process::ChildStdout,
    lsp_id: &str,
    app: &AppHandle,
) {
    let mut reader = BufReader::new(stdout);

    loop {
        // Parse headers until we find Content-Length
        let mut content_length: Option<usize> = None;
        let mut header_line = String::new();

        loop {
            header_line.clear();
            match reader.read_line(&mut header_line) {
                Ok(0) => return, // EOF
                Err(_) => return,
                Ok(_) => {}
            }

            let trimmed = header_line.trim();
            if trimmed.is_empty() {
                // Empty line — end of headers
                break;
            }

            // Parse Content-Length header
            if let Some(val) = trimmed.strip_prefix("Content-Length:") {
                if let Ok(len) = val.trim().parse::<usize>() {
                    content_length = Some(len);
                }
            }
        }

        // Read the message body
        let length = match content_length {
            Some(len) => len,
            None => continue, // No Content-Length found, skip
        };

        let mut body = vec![0u8; length];
        match reader.read_exact(&mut body) {
            Ok(_) => {}
            Err(_) => return,
        }

        let message = match String::from_utf8(body) {
            Ok(s) => s,
            Err(_) => continue,
        };

        let payload = LspMessagePayload {
            lsp_id: lsp_id.to_string(),
            message,
        };

        let _ = app.emit("lsp-message", &payload);
    }
}

/// Read LSP stderr and emit as log events.
fn lsp_stderr_reader(
    stderr: std::process::ChildStderr,
    lsp_id: &str,
    app: &AppHandle,
) {
    let reader = BufReader::new(stderr);
    for line in reader.lines() {
        match line {
            Ok(text) => {
                let payload = LspMessagePayload {
                    lsp_id: lsp_id.to_string(),
                    message: text,
                };
                let _ = app.emit("lsp-stderr", &payload);
            }
            Err(_) => break,
        }
    }
}
