// ============================================================================
// CodeEX v2 — TerraRuntime PTY Commands
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Real terminal via portable-pty (ConPTY on Windows, Unix PTY on Linux/macOS).
// ============================================================================

use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

pub struct PtyState {
    pub sessions: Mutex<HashMap<String, PtySession>>,
    pub next_id: Mutex<u32>,
}

pub struct PtySession {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    #[allow(dead_code)]
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PtyOutputPayload {
    pty_id: String,
    data: String,
}

#[tauri::command]
pub fn pty_spawn(
    shell: Option<String>,
    cwd: Option<String>,
    cols: u16,
    rows: u16,
    state: tauri::State<'_, PtyState>,
    app: AppHandle,
) -> Result<String, String> {
    let pty_system = native_pty_system();

    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open PTY: {}", e))?;

    let shell_cmd = shell.unwrap_or_else(|| {
        if cfg!(windows) {
            "powershell.exe".to_string()
        } else {
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string())
        }
    });

    let mut cmd = CommandBuilder::new(&shell_cmd);
    if let Some(dir) = &cwd {
        cmd.cwd(dir);
    }

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn shell: {}", e))?;

    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to clone PTY reader: {}", e))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to take PTY writer: {}", e))?;

    // Generate unique session ID
    let mut next_id = state.next_id.lock().map_err(|e| e.to_string())?;
    let pty_id = format!("pty-{}", *next_id);
    *next_id += 1;
    drop(next_id);

    // Spawn reader thread — emits "pty-output" events to the frontend
    let id_clone = pty_id.clone();
    let app_handle = app.clone();
    std::thread::spawn(move || {
        pty_reader_loop(reader, &id_clone, &app_handle);
    });

    // Store session for write / resize / kill
    let session = PtySession {
        writer,
        master: pair.master,
        child,
    };

    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    sessions.insert(pty_id.clone(), session);

    Ok(pty_id)
}

/// Continuously reads PTY output and emits TerraRuntime events.
fn pty_reader_loop(mut reader: Box<dyn Read + Send>, pty_id: &str, app: &AppHandle) {
    let mut buf = [0u8; 4096];
    loop {
        match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                let data = String::from_utf8_lossy(&buf[..n]).to_string();
                let payload = PtyOutputPayload {
                    pty_id: pty_id.to_string(),
                    data,
                };
                let _ = app.emit("pty-output", &payload);
            }
            Err(_) => break,
        }
    }
}

#[tauri::command]
pub fn pty_write(
    pty_id: String,
    data: String,
    state: tauri::State<'_, PtyState>,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    let session = sessions
        .get_mut(&pty_id)
        .ok_or_else(|| format!("PTY session {} not found", pty_id))?;
    session
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| format!("Failed to write to PTY: {}", e))?;
    session
        .writer
        .flush()
        .map_err(|e| format!("Failed to flush PTY: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn pty_resize(
    pty_id: String,
    cols: u16,
    rows: u16,
    state: tauri::State<'_, PtyState>,
) -> Result<(), String> {
    let sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    let session = sessions
        .get(&pty_id)
        .ok_or_else(|| format!("PTY session {} not found", pty_id))?;
    session
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to resize PTY: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn pty_kill(
    pty_id: String,
    state: tauri::State<'_, PtyState>,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    // Dropping the session closes the master PTY and terminates the child
    sessions.remove(&pty_id);
    Ok(())
}
