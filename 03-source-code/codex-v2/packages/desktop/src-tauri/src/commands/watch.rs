// ============================================================================
// CodeEX v2 — TerraRuntime File Watcher Commands
// Copyright 2026 TerraTech Systems. All rights reserved.
// ============================================================================

use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

pub struct WatcherState {
    pub watchers: Mutex<HashMap<String, RecommendedWatcher>>,
}

/// Matches TypeScript `FileWatchEvent` in filesystem.ts
#[derive(Serialize, Clone)]
struct FsWatchPayload {
    #[serde(rename = "type")]
    event_type: String,
    path: String,
    #[serde(rename = "oldPath", skip_serializing_if = "Option::is_none")]
    old_path: Option<String>,
}

fn normalize_path(p: &str) -> String {
    p.replace('\\', "/")
}

#[tauri::command]
pub fn watch_path(
    path: String,
    state: tauri::State<'_, WatcherState>,
    app: AppHandle,
) -> Result<(), String> {
    let mut watchers = state.watchers.lock().map_err(|e| e.to_string())?;

    if watchers.contains_key(&path) {
        return Ok(()); // Already watching
    }

    let app_handle = app.clone();
    let mut watcher = RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                let event_type = match &event.kind {
                    EventKind::Create(_) => "create",
                    EventKind::Modify(mk) => {
                        if matches!(mk, notify::event::ModifyKind::Name(_)) {
                            "rename"
                        } else {
                            "modify"
                        }
                    }
                    EventKind::Remove(_) => "delete",
                    _ => return,
                };

                // Rename events may carry two paths (old, new)
                if event_type == "rename" && event.paths.len() >= 2 {
                    let payload = FsWatchPayload {
                        event_type: "rename".to_string(),
                        path: normalize_path(&event.paths[1].to_string_lossy()),
                        old_path: Some(normalize_path(&event.paths[0].to_string_lossy())),
                    };
                    let _ = app_handle.emit("fs-watch", &payload);
                } else {
                    for p in &event.paths {
                        let payload = FsWatchPayload {
                            event_type: event_type.to_string(),
                            path: normalize_path(&p.to_string_lossy()),
                            old_path: None,
                        };
                        let _ = app_handle.emit("fs-watch", &payload);
                    }
                }
            }
        },
        Config::default(),
    )
    .map_err(|e| format!("Failed to create watcher: {}", e))?;

    watcher
        .watch(std::path::Path::new(&path), RecursiveMode::Recursive)
        .map_err(|e| format!("Failed to watch {}: {}", path, e))?;

    watchers.insert(path, watcher);
    Ok(())
}

#[tauri::command]
pub fn unwatch_path(
    path: String,
    state: tauri::State<'_, WatcherState>,
) -> Result<(), String> {
    let mut watchers = state.watchers.lock().map_err(|e| e.to_string())?;
    watchers.remove(&path);
    // Dropping the watcher automatically stops watching
    Ok(())
}
