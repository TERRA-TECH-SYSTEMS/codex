// ============================================================================
// CodeEX v2 — TerraRuntime Search Command
// Copyright 2026 TerraTech Systems. All rights reserved.
// ============================================================================

use serde::Serialize;
use std::fs;
use walkdir::WalkDir;

/// Matches TypeScript `SearchMatch` in filesystem.ts
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatchResponse {
    pub file: String,
    pub line: usize,
    pub text: String,
    pub match_start: usize,
    pub match_end: usize,
}

fn normalize_path(p: &str) -> String {
    p.replace('\\', "/")
}

const SKIP_DIRS: &[&str] = &[".git", "node_modules", "dist", "target", ".next", "__pycache__"];
const MAX_FILE_SIZE: u64 = 1_048_576; // 1 MB

#[tauri::command]
pub fn search_files(
    path: String,
    query: String,
    case_sensitive: bool,
    max_results: usize,
) -> Result<Vec<(String, Vec<SearchMatchResponse>)>, String> {
    if query.is_empty() {
        return Ok(Vec::new());
    }

    let mut results: Vec<(String, Vec<SearchMatchResponse>)> = Vec::new();
    let mut total = 0usize;

    let search_query = if case_sensitive {
        query.clone()
    } else {
        query.to_lowercase()
    };

    for entry in WalkDir::new(&path)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            if e.file_type().is_dir() {
                !SKIP_DIRS.contains(&name.as_ref())
                    && !(name.starts_with('.') && name != ".env")
            } else {
                true
            }
        })
    {
        if total >= max_results {
            break;
        }

        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        if !entry.file_type().is_file() {
            continue;
        }

        // Skip large files
        if let Ok(meta) = entry.metadata() {
            if meta.len() > MAX_FILE_SIZE {
                continue;
            }
        }

        let file_path = normalize_path(&entry.path().to_string_lossy());

        // Skip binary / unreadable files
        let content = match fs::read_to_string(entry.path()) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let mut matches: Vec<SearchMatchResponse> = Vec::new();

        for (line_idx, line) in content.lines().enumerate() {
            if total >= max_results {
                break;
            }

            let search_line = if case_sensitive {
                line.to_string()
            } else {
                line.to_lowercase()
            };

            let mut start = 0;
            while let Some(pos) = search_line[start..].find(&search_query) {
                if total >= max_results {
                    break;
                }
                let match_start = start + pos;
                let match_end = match_start + query.len();

                matches.push(SearchMatchResponse {
                    file: file_path.clone(),
                    line: line_idx + 1,
                    text: line.to_string(),
                    match_start,
                    match_end,
                });
                total += 1;
                start = match_end;
            }
        }

        if !matches.is_empty() {
            results.push((file_path, matches));
        }
    }

    Ok(results)
}
