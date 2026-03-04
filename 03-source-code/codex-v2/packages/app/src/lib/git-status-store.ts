// ============================================================================
// CodeEX v2 — Git Status Store
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Reactive store for git file change status, shared between Sidebar (producer)
// and EditorArea (consumer for tab decorations).
// ============================================================================

import { createSignal } from "solid-js";

export interface GitFileChange {
  path: string;
  status: string; // M, A, D, R, C, U, ?
}

const [gitChangedFiles, setGitChangedFiles] = createSignal<GitFileChange[]>([]);
const [gitStagedFiles, setGitStagedFiles] = createSignal<GitFileChange[]>([]);

/** Update the global git changed files list. Called from Sidebar git panel. */
export function updateGitChanges(changes: GitFileChange[], staged: GitFileChange[]): void {
  setGitChangedFiles(changes);
  setGitStagedFiles(staged);
}

/** Get the git status for a specific file path. Returns status code or null. */
export function getFileGitStatus(filePath: string): string | null {
  // Check staged first
  const stagedMatch = gitStagedFiles().find((f) => filePath.endsWith(f.path));
  if (stagedMatch) return stagedMatch.status;
  // Then unstaged
  const changedMatch = gitChangedFiles().find((f) => filePath.endsWith(f.path));
  if (changedMatch) return changedMatch.status;
  return null;
}

/** Get CSS color for a git status code. */
export function getGitStatusColor(status: string | null): string | null {
  if (!status) return null;
  switch (status) {
    case "M": return "var(--accent-orange, #ff9f0a)";
    case "A": case "?": return "var(--accent-green, #30d158)";
    case "D": return "var(--accent-red, #ff453a)";
    case "R": return "var(--accent-blue, #2997ff)";
    case "C": return "var(--accent-teal, #64d2ff)";
    case "U": return "var(--accent-red, #ff453a)";
    default: return null;
  }
}

export { gitChangedFiles, gitStagedFiles };
