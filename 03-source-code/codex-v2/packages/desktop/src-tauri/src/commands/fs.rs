// ============================================================================
// CodeEX v2 — TerraRuntime File System Commands
// Copyright 2026 TerraTech Systems. All rights reserved.
// ============================================================================

use serde::Serialize;
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

/// Matches TypeScript `FileStat` in filesystem.ts
#[derive(Serialize)]
pub struct FileStatResponse {
    pub path: String,
    pub name: String,
    #[serde(rename = "type")]
    pub file_type: String,
    pub size: u64,
    pub modified: u64,
    pub created: u64,
}

/// Matches TypeScript `FileNode` in types.ts
#[derive(Serialize)]
pub struct FileNodeResponse {
    pub name: String,
    pub path: String,
    #[serde(rename = "type")]
    pub node_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileNodeResponse>>,
}

fn normalize_path(p: &str) -> String {
    p.replace('\\', "/")
}

const SKIP_DIRS: &[&str] = &[".git", "node_modules", "dist", "target", ".next", "__pycache__"];

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
}

#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent dirs: {}", e))?;
        }
    }
    fs::write(&path, &content).map_err(|e| format!("Failed to write {}: {}", path, e))
}

#[tauri::command]
pub fn delete_path(path: String, recursive: bool) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Ok(());
    }
    if p.is_dir() {
        if recursive {
            fs::remove_dir_all(p).map_err(|e| format!("Failed to delete dir: {}", e))
        } else {
            fs::remove_dir(p).map_err(|e| format!("Failed to delete dir: {}", e))
        }
    } else {
        fs::remove_file(p).map_err(|e| format!("Failed to delete file: {}", e))
    }
}

#[tauri::command]
pub fn create_dir(path: String, recursive: bool) -> Result<(), String> {
    if recursive {
        fs::create_dir_all(&path).map_err(|e| format!("Failed to create dir: {}", e))
    } else {
        fs::create_dir(&path).map_err(|e| format!("Failed to create dir: {}", e))
    }
}

#[tauri::command]
pub fn rename_path(old_path: String, new_path: String) -> Result<(), String> {
    fs::rename(&old_path, &new_path)
        .map_err(|e| format!("Failed to rename {} -> {}: {}", old_path, new_path, e))
}

#[tauri::command]
pub fn path_exists(path: String) -> Result<bool, String> {
    Ok(Path::new(&path).exists())
}

#[tauri::command]
pub fn file_stat(path: String) -> Result<FileStatResponse, String> {
    let p = Path::new(&path);
    let meta = fs::metadata(p).map_err(|e| format!("Failed to stat {}: {}", path, e))?;
    let name = p
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let file_type = if meta.is_dir() {
        "directory"
    } else {
        "file"
    }
    .to_string();
    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let created = meta
        .created()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    Ok(FileStatResponse {
        path: normalize_path(&path),
        name,
        file_type,
        size: meta.len(),
        modified,
        created,
    })
}

#[tauri::command]
pub fn read_dir(path: String, depth: u32) -> Result<Vec<FileNodeResponse>, String> {
    read_dir_recursive(&path, depth).map_err(|e| format!("Failed to read dir {}: {}", path, e))
}

fn read_dir_recursive(dir: &str, depth: u32) -> Result<Vec<FileNodeResponse>, std::io::Error> {
    let mut entries: Vec<FileNodeResponse> = Vec::new();
    let read = fs::read_dir(dir)?;

    let mut items: Vec<(String, String, bool)> = Vec::new();
    for entry in read {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_string();
        let full_path = normalize_path(&entry.path().to_string_lossy());
        let is_dir = entry.file_type()?.is_dir();

        if is_dir && SKIP_DIRS.contains(&name.as_str()) {
            continue;
        }
        // Skip hidden files/dirs starting with . (except common ones)
        if name.starts_with('.') && name != ".env" && name != ".gitignore" {
            continue;
        }

        items.push((name, full_path, is_dir));
    }

    // Sort: directories first, then alphabetical
    items.sort_by(|a, b| {
        if a.2 == b.2 {
            a.0.to_lowercase().cmp(&b.0.to_lowercase())
        } else if a.2 {
            std::cmp::Ordering::Less
        } else {
            std::cmp::Ordering::Greater
        }
    });

    for (name, full_path, is_dir) in items {
        let children = if is_dir && depth > 0 {
            Some(read_dir_recursive(&full_path, depth - 1).unwrap_or_default())
        } else if is_dir {
            Some(Vec::new())
        } else {
            None
        };

        entries.push(FileNodeResponse {
            name,
            path: full_path,
            node_type: if is_dir { "directory" } else { "file" }.to_string(),
            children,
        });
    }

    Ok(entries)
}
