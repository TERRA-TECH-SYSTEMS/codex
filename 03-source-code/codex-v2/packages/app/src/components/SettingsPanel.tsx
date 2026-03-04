// ============================================================================
// CodeEX v2 — Settings Panel
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// User preferences for TerraForge host, editor, appearance, and behavior.
// Settings persist to localStorage via centralized settings-store.
// ============================================================================

import { createSignal, For, createMemo, onCleanup } from "solid-js";
import { settings, updateSettings, updateSettingsBatch, resetSettings, getDefaults, exportSettingsAsJSON, importSettingsFromJSON, syncToFile, syncFromFile, syncStatus, lastSyncTime, syncError, clearSyncProfile, getLastSyncProfile } from "~/lib/settings-store";
import { setTerraForgeHost } from "~/lib/terraforge-client";
import { setTheme, getActiveThemeId } from "~/lib/theme";
import { getThemes, activeThemeId, onThemesChanged, getCommunityThemes, installCommunityTheme, isCommunityThemeInstalled, type ThemeDefinition } from "~/lib/theme-registry";
import { snippetFiles, addSnippetFile, removeSnippetFile, getUserSnippetCount, updateSnippetInFile, addSnippetToFile, removeSnippetFromFile, type SnippetFile, type UserSnippetDef } from "~/lib/user-snippets";
import { userProfile, authStatus, getUserInitials, logout } from "~/lib/auth-store";

interface Props {
  onClose: () => void;
}

type SettingsCategory = "account" | "editor" | "appearance" | "behavior" | "keybindings" | "snippets" | "json" | "sync" | "terraforge" | "about";

export function SettingsPanel(props: Props) {
  const [category, setCategory] = createSignal<SettingsCategory>("account");
  const [settingsSearch, setSettingsSearch] = createSignal("");
  const [settingsScope, setSettingsScope] = createSignal<"user" | "workspace">("user");

  // When search is active, show the category that contains matching settings
  const isSearchActive = () => settingsSearch().length > 0;
  const shouldShowCategory = (catId: SettingsCategory) => {
    if (!isSearchActive()) return category() === catId;
    // Show all categories when searching (content filtering done per-row)
    return true;
  };
  const shouldShowRow = (label: string, desc?: string) => {
    if (!isSearchActive()) return true;
    const q = settingsSearch().toLowerCase();
    return label.toLowerCase().includes(q) || (desc ?? "").toLowerCase().includes(q);
  };

  const handleUpdate = (key: string, value: any) => {
    updateSettings(key as any, value);
    if (key === "terraforgeHost") setTerraForgeHost(value as string);
    if (key === "theme") setTheme(value as ThemeMode);
  };

  const categories: { id: SettingsCategory; label: string; icon: string }[] = [
    { id: "account", label: "Account", icon: "\u{1F464}" },
    { id: "editor", label: "Editor", icon: "E" },
    { id: "appearance", label: "Appearance", icon: "A" },
    { id: "behavior", label: "Behavior", icon: "B" },
    { id: "keybindings", label: "Keybindings", icon: "K" },
    { id: "snippets", label: "Snippets", icon: "S" },
    { id: "json", label: "JSON Editor", icon: "{}" },
    { id: "sync", label: "Sync", icon: "\u21C4" },
    { id: "terraforge", label: "TerraForge", icon: "T" },
    { id: "about", label: "About", icon: "i" },
  ];

  return (
    <div class="settings-overlay" onClick={props.onClose}>
      <div class="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div class="settings-header">
          <span class="settings-title">Settings</span>
          <div class="settings-scope-tabs">
            <button
              class={`settings-scope-tab ${settingsScope() === "user" ? "active" : ""}`}
              onClick={() => setSettingsScope("user")}
            >User</button>
            <button
              class={`settings-scope-tab ${settingsScope() === "workspace" ? "active" : ""}`}
              onClick={() => setSettingsScope("workspace")}
            >Workspace</button>
          </div>
          <div class="settings-search-box">
            <svg class="settings-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input
              class="settings-search-input"
              type="text"
              placeholder="Search settings..."
              value={settingsSearch()}
              onInput={(e) => setSettingsSearch(e.currentTarget.value)}
            />
            {settingsSearch() && (
              <button class="settings-search-clear" onClick={() => setSettingsSearch("")}>&times;</button>
            )}
          </div>
          <button class="settings-close" onClick={props.onClose}>&times;</button>
        </div>

        <div class="settings-layout">
          {/* Category Sidebar */}
          <div class="settings-categories">
            <For each={categories}>
              {(cat) => (
                <button
                  class={`settings-cat-btn ${category() === cat.id ? "active" : ""}`}
                  onClick={() => setCategory(cat.id)}
                >
                  <span class="settings-cat-icon">{cat.icon}</span>
                  <span class="settings-cat-label">{cat.label}</span>
                </button>
              )}
            </For>
          </div>

          {/* Settings Content */}
          <div class="settings-body">
            {/* Account Settings */}
            {shouldShowCategory("account") && (
              <div class="settings-content">
                <div class="settings-section">
                  <div class="settings-section-title">Profile</div>
                  <div class="account-profile-card">
                    <div class="account-profile-avatar">
                      {userProfile()?.avatar ? (
                        <img class="account-profile-img" src={userProfile()!.avatar!} alt="Avatar" />
                      ) : (
                        <span class="account-profile-initials">{getUserInitials(userProfile())}</span>
                      )}
                    </div>
                    <div class="account-profile-info">
                      <div class="account-profile-name">{userProfile()?.name ?? "User"}</div>
                      <div class="account-profile-email">{userProfile()?.email ?? ""}</div>
                      {userProfile()?.preferredUsername && (
                        <div class="account-profile-username">@{userProfile()!.preferredUsername}</div>
                      )}
                    </div>
                  </div>
                </div>

                <div class="settings-section">
                  <div class="settings-section-title">Details</div>
                  <div class="account-details">
                    {userProfile()?.organization && (
                      <div class="account-detail-row">
                        <span class="account-detail-label">Organization</span>
                        <span class="account-detail-value">{userProfile()!.organization}</span>
                      </div>
                    )}
                    {userProfile()?.roles && userProfile()!.roles!.length > 0 && (
                      <div class="account-detail-row">
                        <span class="account-detail-label">Roles</span>
                        <span class="account-detail-value">{userProfile()!.roles!.join(", ")}</span>
                      </div>
                    )}
                    <div class="account-detail-row">
                      <span class="account-detail-label">Email Verified</span>
                      <span class="account-detail-value">{userProfile()?.emailVerified ? "Yes" : "No"}</span>
                    </div>
                    {userProfile()?.locale && (
                      <div class="account-detail-row">
                        <span class="account-detail-label">Locale</span>
                        <span class="account-detail-value">{userProfile()!.locale}</span>
                      </div>
                    )}
                    <div class="account-detail-row">
                      <span class="account-detail-label">Status</span>
                      <span class={`account-detail-value account-status-${authStatus()}`}>{authStatus()}</span>
                    </div>
                  </div>
                </div>

                <div class="settings-section">
                  <div class="settings-section-title">Session</div>
                  <div class="account-actions">
                    <button class="account-action-btn account-signout-btn" onClick={() => logout({ redirectToLogin: true })}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                      Sign Out
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Editor Settings */}
            {shouldShowCategory("editor") && (
              <div class="settings-content">
                <div class="settings-section">
                  <div class="settings-section-title">Font &amp; Display</div>

                  <div class="settings-row">
                    <div class="settings-label-group">
                      <label class="settings-label">Font Size</label>
                      <span class="settings-desc">Editor font size in pixels</span>
                    </div>
                    <input
                      class="settings-input small"
                      type="number"
                      min={10}
                      max={24}
                      value={settings().fontSize}
                      onInput={(e) => handleUpdate("fontSize", parseInt(e.currentTarget.value) || 13)}
                    />
                  </div>

                  <div class="settings-row">
                    <div class="settings-label-group">
                      <label class="settings-label">Tab Size</label>
                      <span class="settings-desc">Number of spaces per tab</span>
                    </div>
                    <input
                      class="settings-input small"
                      type="number"
                      min={1}
                      max={8}
                      value={settings().tabSize}
                      onInput={(e) => handleUpdate("tabSize", parseInt(e.currentTarget.value) || 2)}
                    />
                  </div>

                  <div class="settings-row">
                    <div class="settings-label-group">
                      <label class="settings-label">Line Numbers</label>
                      <span class="settings-desc">Show line numbers in the gutter</span>
                    </div>
                    <button
                      class={`settings-toggle ${settings().lineNumbers ? "on" : ""}`}
                      onClick={() => handleUpdate("lineNumbers", !settings().lineNumbers)}
                    >
                      <span class="toggle-knob" />
                    </button>
                  </div>

                  <div class="settings-row">
                    <div class="settings-label-group">
                      <label class="settings-label">Word Wrap</label>
                      <span class="settings-desc">Wrap lines that exceed viewport width</span>
                    </div>
                    <button
                      class={`settings-toggle ${settings().wordWrap ? "on" : ""}`}
                      onClick={() => handleUpdate("wordWrap", !settings().wordWrap)}
                    >
                      <span class="toggle-knob" />
                    </button>
                  </div>

                  <div class="settings-row">
                    <div class="settings-label-group">
                      <label class="settings-label">Cursor Blink</label>
                      <span class="settings-desc">Enable cursor blinking animation</span>
                    </div>
                    <button
                      class={`settings-toggle ${settings().cursorBlink ? "on" : ""}`}
                      onClick={() => handleUpdate("cursorBlink", !settings().cursorBlink)}
                    >
                      <span class="toggle-knob" />
                    </button>
                  </div>

                  <div class="settings-row">
                    <div class="settings-label-group">
                      <label class="settings-label">Minimap</label>
                      <span class="settings-desc">Show minimap code overview on the right</span>
                    </div>
                    <button
                      class={`settings-toggle ${settings().minimap ? "on" : ""}`}
                      onClick={() => handleUpdate("minimap", !settings().minimap)}
                    >
                      <span class="toggle-knob" />
                    </button>
                  </div>
                </div>

                <div class="settings-section">
                  <div class="settings-section-title">Formatting</div>

                  <div class="settings-row">
                    <div class="settings-label-group">
                      <label class="settings-label">Bracket Pair Colorization</label>
                      <span class="settings-desc">Color matching bracket pairs by depth</span>
                    </div>
                    <button
                      class={`settings-toggle ${settings().bracketColorization ? "on" : ""}`}
                      onClick={() => handleUpdate("bracketColorization", !settings().bracketColorization)}
                    >
                      <span class="toggle-knob" />
                    </button>
                  </div>

                  <div class="settings-row">
                    <div class="settings-label-group">
                      <label class="settings-label">Render Whitespace</label>
                      <span class="settings-desc">Visualize spaces and tabs</span>
                    </div>
                    <select
                      class="settings-select"
                      value={settings().renderWhitespace}
                      onChange={(e) => handleUpdate("renderWhitespace", e.currentTarget.value)}
                    >
                      <option value="none">None</option>
                      <option value="boundary">Boundary</option>
                      <option value="all">All</option>
                    </select>
                  </div>

                  <div class="settings-row">
                    <div class="settings-label-group">
                      <label class="settings-label">Sticky Scroll</label>
                      <span class="settings-desc">Pin scope headers at the top of the editor</span>
                    </div>
                    <button
                      class={`settings-toggle ${settings().stickyScroll ? "on" : ""}`}
                      onClick={() => handleUpdate("stickyScroll", !settings().stickyScroll)}
                    >
                      <span class="toggle-knob" />
                    </button>
                  </div>
                </div>

                <div class="settings-section">
                  <div class="settings-section-title">Formatting</div>

                  <div class="settings-row">
                    <div class="settings-label-group">
                      <label class="settings-label">Format on Save</label>
                      <span class="settings-desc">Automatically format file when saving</span>
                    </div>
                    <button
                      class={`settings-toggle ${settings().formatOnSave ? "on" : ""}`}
                      onClick={() => handleUpdate("formatOnSave", !settings().formatOnSave)}
                    >
                      <span class="toggle-knob" />
                    </button>
                  </div>

                  <div class="settings-row">
                    <div class="settings-label-group">
                      <label class="settings-label">Format on Paste</label>
                      <span class="settings-desc">Automatically format pasted content</span>
                    </div>
                    <button
                      class={`settings-toggle ${settings().formatOnPaste ? "on" : ""}`}
                      onClick={() => handleUpdate("formatOnPaste", !settings().formatOnPaste)}
                    >
                      <span class="toggle-knob" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Appearance Settings */}
            {shouldShowCategory("appearance") && (() => {
              const [themeFilter, setThemeFilter] = createSignal("");
              const [themeList, setThemeList] = createSignal(getThemes());
              const unsub = onThemesChanged(() => setThemeList(getThemes()));
              onCleanup(unsub);

              const darkThemes = createMemo(() =>
                themeList().filter(t => t.type === "dark" && (
                  !themeFilter() || t.name.toLowerCase().includes(themeFilter().toLowerCase())
                ))
              );
              const lightThemes = createMemo(() =>
                themeList().filter(t => t.type === "light" && (
                  !themeFilter() || t.name.toLowerCase().includes(themeFilter().toLowerCase())
                ))
              );

              const previewColors = (t: ThemeDefinition) => [
                t.colors.bgBase, t.colors.bgSurface, t.colors.accentBlue,
                t.colors.accentPurple, t.colors.accentGreen, t.colors.textPrimary,
              ];

              return (
                <div class="settings-content">
                  <div class="settings-section">
                    <div class="settings-section-title">Color Theme</div>
                    <input
                      class="theme-search"
                      type="text"
                      placeholder="Search themes..."
                      value={themeFilter()}
                      onInput={(e) => setThemeFilter(e.currentTarget.value)}
                    />

                    <div class="theme-grid">
                      {darkThemes().length > 0 && (
                        <div class="theme-group-label">Dark Themes ({darkThemes().length})</div>
                      )}
                      <For each={darkThemes()}>
                        {(t) => (
                          <div
                            class={`theme-card ${activeThemeId() === t.id ? "active" : ""}`}
                            onClick={() => setTheme(t.id)}
                          >
                            <div class="theme-preview" style={{ background: t.colors.bgBase }}>
                              <div class="theme-preview-bar" style={{ background: t.colors.bgSurface }}>
                                <span style={{ color: t.colors.textSecondary, "font-size": "9px" }}>{t.name}</span>
                              </div>
                              <div class="theme-preview-dots">
                                <For each={previewColors(t)}>
                                  {(c) => <span class="theme-dot" style={{ background: c }} />}
                                </For>
                              </div>
                            </div>
                            <div class="theme-card-label">{t.name}</div>
                            {activeThemeId() === t.id && <span class="theme-active-badge">Active</span>}
                          </div>
                        )}
                      </For>

                      {lightThemes().length > 0 && (
                        <div class="theme-group-label">Light Themes ({lightThemes().length})</div>
                      )}
                      <For each={lightThemes()}>
                        {(t) => (
                          <div
                            class={`theme-card ${activeThemeId() === t.id ? "active" : ""}`}
                            onClick={() => setTheme(t.id)}
                          >
                            <div class="theme-preview" style={{ background: t.colors.bgBase }}>
                              <div class="theme-preview-bar" style={{ background: t.colors.bgSurface }}>
                                <span style={{ color: t.colors.textSecondary, "font-size": "9px" }}>{t.name}</span>
                              </div>
                              <div class="theme-preview-dots">
                                <For each={previewColors(t)}>
                                  {(c) => <span class="theme-dot" style={{ background: c }} />}
                                </For>
                              </div>
                            </div>
                            <div class="theme-card-label">{t.name}</div>
                            {activeThemeId() === t.id && <span class="theme-active-badge">Active</span>}
                          </div>
                        )}
                      </For>
                    </div>
                  </div>

                  <div class="settings-section">
                    <div class="settings-section-title">Display</div>

                    <div class="settings-row">
                      <div class="settings-label-group">
                        <label class="settings-label">Smooth Scrolling</label>
                        <span class="settings-desc">Animate scroll in the editor</span>
                      </div>
                      <button
                        class={`settings-toggle ${settings().smoothScrolling ? "on" : ""}`}
                        onClick={() => handleUpdate("smoothScrolling", !settings().smoothScrolling)}
                      >
                        <span class="toggle-knob" />
                      </button>
                    </div>
                  </div>

                  <div class="settings-section">
                    <div class="settings-section-title">Community Themes — TerraForge Exchange</div>
                    <div class="theme-grid">
                      <For each={getCommunityThemes()}>
                        {(ct) => (
                          <div class={`theme-card ${ct.installed ? "active" : ""}`}>
                            <div class="theme-preview" style={{ background: ct.previewColors.bg }}>
                              <div class="theme-preview-bar" style={{ background: ct.previewColors.bg, "border-bottom": `1px solid ${ct.previewColors.accent}33` }}>
                                <span style={{ color: ct.previewColors.fg, "font-size": "9px" }}>{ct.name}</span>
                              </div>
                              <div class="theme-preview-dots">
                                <span class="theme-dot" style={{ background: ct.previewColors.bg }} />
                                <span class="theme-dot" style={{ background: ct.previewColors.fg }} />
                                <span class="theme-dot" style={{ background: ct.previewColors.accent }} />
                              </div>
                            </div>
                            <div class="theme-card-label">{ct.name}</div>
                            <div class="community-theme-meta">
                              <span class="community-theme-dl">{(ct.downloads / 1000).toFixed(1)}K</span>
                              <span class="community-theme-rating">{"\u2605"} {ct.rating}</span>
                            </div>
                            <button
                              class={`community-theme-btn ${ct.installed ? "installed" : ""}`}
                              disabled={ct.installed}
                              onClick={(e) => {
                                e.stopPropagation();
                                installCommunityTheme(ct);
                                setThemeList(getThemes());
                              }}
                            >
                              {ct.installed ? "Installed" : "Install"}
                            </button>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Behavior Settings */}
            {shouldShowCategory("behavior") && (
              <div class="settings-content">
                <div class="settings-section">
                  <div class="settings-section-title">Save</div>

                  <div class="settings-row">
                    <div class="settings-label-group">
                      <label class="settings-label">Auto Save</label>
                      <span class="settings-desc">Automatically save files after changes</span>
                    </div>
                    <button
                      class={`settings-toggle ${settings().autoSave ? "on" : ""}`}
                      onClick={() => handleUpdate("autoSave", !settings().autoSave)}
                    >
                      <span class="toggle-knob" />
                    </button>
                  </div>

                  <div class="settings-row">
                    <div class="settings-label-group">
                      <label class="settings-label">Auto Save Delay</label>
                      <span class="settings-desc">Milliseconds to wait before auto-saving</span>
                    </div>
                    <input
                      class="settings-input small"
                      type="number"
                      min={500}
                      max={10000}
                      step={500}
                      value={settings().autoSaveDelay}
                      onInput={(e) => handleUpdate("autoSaveDelay", parseInt(e.currentTarget.value) || 1000)}
                    />
                  </div>
                </div>

                <div class="settings-section">
                  <div class="settings-section-title">Danger Zone</div>
                  <div class="settings-row">
                    <div class="settings-label-group">
                      <label class="settings-label">Reset All Settings</label>
                      <span class="settings-desc">Restore all settings to their defaults</span>
                    </div>
                    <button
                      class="settings-reset-btn"
                      onClick={() => { resetSettings(); setTheme("dark"); }}
                    >
                      Reset
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* JSON Settings Editor */}
            {/* Snippets Editor */}
            {shouldShowCategory("snippets") && (() => {
              const [snippetEditorText, setSnippetEditorText] = createSignal("");
              const [snippetEditorName, setSnippetEditorName] = createSignal("");
              const [snippetEditorError, setSnippetEditorError] = createSignal("");
              const [snippetEditorSaved, setSnippetEditorSaved] = createSignal(false);
              const [expandedSnippetFile, setExpandedSnippetFile] = createSignal<string | null>(null);
              const [editingSnippet, setEditingSnippet] = createSignal<{ file: string; index: number } | null>(null);
              const [editPrefix, setEditPrefix] = createSignal("");
              const [editDesc, setEditDesc] = createSignal("");
              const [editScope, setEditScope] = createSignal("");
              const [editBody, setEditBody] = createSignal("");
              const [addingToFile, setAddingToFile] = createSignal<string | null>(null);
              const [newPrefix, setNewPrefix] = createSignal("");
              const [newDesc, setNewDesc] = createSignal("");
              const [newScope, setNewScope] = createSignal("");
              const [newBody, setNewBody] = createSignal("");

              const startEditSnippet = (fileName: string, index: number, s: UserSnippetDef) => {
                setEditingSnippet({ file: fileName, index });
                setEditPrefix(s.prefix);
                setEditDesc(s.description);
                setEditScope(s.scope ?? "");
                setEditBody(s.body);
              };

              const saveEditSnippet = () => {
                const editing = editingSnippet();
                if (!editing) return;
                updateSnippetInFile(editing.file, editing.index, {
                  prefix: editPrefix().trim(),
                  description: editDesc().trim(),
                  scope: editScope().trim() || undefined,
                  body: editBody(),
                });
                setEditingSnippet(null);
              };

              const handleAddSnippetToFile = (fileName: string) => {
                const prefix = newPrefix().trim();
                if (!prefix) return;
                addSnippetToFile(fileName, {
                  prefix,
                  description: newDesc().trim() || prefix,
                  scope: newScope().trim() || undefined,
                  body: newBody() || `\${}`,
                });
                setAddingToFile(null);
                setNewPrefix(""); setNewDesc(""); setNewScope(""); setNewBody("");
              };

              const defaultSnippetTemplate = `{
  "Example Snippet": {
    "prefix": "example",
    "body": [
      "function \${1:name}(\${2:params}) {",
      "  \${3:// body}",
      "}"
    ],
    "description": "Insert an example function",
    "scope": "typescript,javascript"
  }
}`;

              const handleCreateSnippet = () => {
                const name = snippetEditorName().trim();
                const text = snippetEditorText().trim();
                if (!name) { setSnippetEditorError("File name is required"); return; }
                if (!text) { setSnippetEditorError("Snippet content is required"); return; }
                const fileName = name.endsWith(".code-snippets") ? name : `${name}.code-snippets`;
                try {
                  JSON.parse(text);
                } catch (e: any) {
                  setSnippetEditorError(`Invalid JSON: ${e.message}`);
                  return;
                }
                addSnippetFile(fileName, text);
                setSnippetEditorName("");
                setSnippetEditorText("");
                setSnippetEditorError("");
                setSnippetEditorSaved(true);
                setTimeout(() => setSnippetEditorSaved(false), 2000);
              };

              return (
                <div class="settings-content">
                  <div class="settings-section">
                    <div class="settings-section-title">User Snippets ({getUserSnippetCount()} snippets in {snippetFiles().length} files)</div>

                    {/* Loaded snippet files */}
                    <For each={snippetFiles()}>
                      {(file) => (
                        <div class="snippet-file-group">
                          <div
                            class="snippet-file-header"
                            onClick={() => setExpandedSnippetFile(prev => prev === file.name ? null : file.name)}
                          >
                            <span class="snippet-file-arrow" style={{ transform: expandedSnippetFile() === file.name ? "rotate(90deg)" : "rotate(0deg)" }}>&#9654;</span>
                            <span class="snippet-file-name">{file.name}</span>
                            <span class="snippet-file-count">{file.snippets.length}</span>
                            <button
                              class="snippet-file-remove"
                              onClick={(e) => { e.stopPropagation(); removeSnippetFile(file.name); }}
                              title="Remove snippet file"
                            >&times;</button>
                          </div>
                          {expandedSnippetFile() === file.name && (
                            <div class="snippet-entries">
                              <For each={file.snippets}>
                                {(s, idx) => (
                                  <>
                                    {editingSnippet()?.file === file.name && editingSnippet()?.index === idx() ? (
                                      <div class="snippet-edit-form">
                                        <div class="snippet-edit-row">
                                          <label class="snippet-edit-label">Prefix</label>
                                          <input class="snippet-edit-input" type="text" value={editPrefix()} onInput={(e) => setEditPrefix(e.currentTarget.value)} />
                                        </div>
                                        <div class="snippet-edit-row">
                                          <label class="snippet-edit-label">Description</label>
                                          <input class="snippet-edit-input" type="text" value={editDesc()} onInput={(e) => setEditDesc(e.currentTarget.value)} />
                                        </div>
                                        <div class="snippet-edit-row">
                                          <label class="snippet-edit-label">Scope</label>
                                          <input class="snippet-edit-input" type="text" value={editScope()} onInput={(e) => setEditScope(e.currentTarget.value)} placeholder="e.g. typescript,javascript" />
                                        </div>
                                        <div class="snippet-edit-row">
                                          <label class="snippet-edit-label">Body</label>
                                          <textarea class="snippet-edit-body" value={editBody()} onInput={(e) => setEditBody(e.currentTarget.value)} rows={3} spellcheck={false} />
                                        </div>
                                        <div class="snippet-edit-actions">
                                          <button class="json-btn json-btn-primary" onClick={saveEditSnippet}>Save</button>
                                          <button class="json-btn" onClick={() => setEditingSnippet(null)}>Cancel</button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div class="snippet-entry">
                                        <span class="snippet-prefix">{s.prefix}</span>
                                        <span class="snippet-desc">{s.description}</span>
                                        {s.scope && <span class="snippet-scope">{s.scope}</span>}
                                        <button
                                          class="snippet-inline-btn snippet-edit-btn"
                                          onClick={() => startEditSnippet(file.name, idx(), s)}
                                          title="Edit Snippet"
                                        >{"\u270E"}</button>
                                        <button
                                          class="snippet-inline-btn snippet-delete-btn"
                                          onClick={() => removeSnippetFromFile(file.name, idx())}
                                          title="Remove Snippet"
                                        >&times;</button>
                                      </div>
                                    )}
                                  </>
                                )}
                              </For>
                              {/* Add snippet to file */}
                              {addingToFile() === file.name ? (
                                <div class="snippet-edit-form">
                                  <div class="snippet-edit-row">
                                    <label class="snippet-edit-label">Prefix</label>
                                    <input class="snippet-edit-input" type="text" value={newPrefix()} onInput={(e) => setNewPrefix(e.currentTarget.value)} placeholder="trigger" autofocus />
                                  </div>
                                  <div class="snippet-edit-row">
                                    <label class="snippet-edit-label">Description</label>
                                    <input class="snippet-edit-input" type="text" value={newDesc()} onInput={(e) => setNewDesc(e.currentTarget.value)} placeholder="Description" />
                                  </div>
                                  <div class="snippet-edit-row">
                                    <label class="snippet-edit-label">Scope</label>
                                    <input class="snippet-edit-input" type="text" value={newScope()} onInput={(e) => setNewScope(e.currentTarget.value)} placeholder="typescript,javascript" />
                                  </div>
                                  <div class="snippet-edit-row">
                                    <label class="snippet-edit-label">Body</label>
                                    <textarea class="snippet-edit-body" value={newBody()} onInput={(e) => setNewBody(e.currentTarget.value)} rows={3} spellcheck={false} placeholder="Snippet body..." />
                                  </div>
                                  <div class="snippet-edit-actions">
                                    <button class="json-btn json-btn-primary" onClick={() => handleAddSnippetToFile(file.name)}>Add</button>
                                    <button class="json-btn" onClick={() => setAddingToFile(null)}>Cancel</button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  class="snippet-add-inline"
                                  onClick={() => setAddingToFile(file.name)}
                                >
                                  + Add Snippet
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </For>

                    {snippetFiles().length === 0 && (
                      <div class="snippet-empty">No custom snippets loaded. Create one below or add .code-snippets files to .codex/snippets/ in your workspace.</div>
                    )}
                  </div>

                  <div class="settings-section">
                    <div class="settings-section-title">Create New Snippet File</div>

                    <div class="snippet-create-row">
                      <input
                        class="snippet-name-input"
                        type="text"
                        placeholder="my-snippets.code-snippets"
                        value={snippetEditorName()}
                        onInput={(e) => setSnippetEditorName(e.currentTarget.value)}
                      />
                      <button class="json-btn json-btn-primary" onClick={handleCreateSnippet}>Add</button>
                      <button class="json-btn" onClick={() => setSnippetEditorText(defaultSnippetTemplate)}>Template</button>
                    </div>

                    {snippetEditorError() && <div class="json-error">{snippetEditorError()}</div>}
                    {snippetEditorSaved() && <div class="snippet-saved">Snippet file added</div>}

                    <textarea
                      class="json-editor"
                      value={snippetEditorText()}
                      onInput={(e) => setSnippetEditorText(e.currentTarget.value)}
                      placeholder={`Paste VS Code snippet JSON here...\n\nFormat:\n{\n  "Snippet Name": {\n    "prefix": "trigger",\n    "body": ["line1", "line2"],\n    "description": "Description",\n    "scope": "typescript,javascript"\n  }\n}`}
                      spellcheck={false}
                    />
                  </div>
                </div>
              );
            })()}

            {shouldShowCategory("json") && (() => {
              const [jsonText, setJsonText] = createSignal(JSON.stringify(settings(), null, 2));
              const [jsonError, setJsonError] = createSignal("");
              const [jsonSaved, setJsonSaved] = createSignal(false);

              const handleJsonApply = () => {
                try {
                  const parsed = JSON.parse(jsonText());
                  const defaults = getDefaults();
                  const valid: Partial<typeof defaults> = {};

                  for (const key of Object.keys(defaults) as (keyof typeof defaults)[]) {
                    if (key in parsed) {
                      (valid as any)[key] = parsed[key];
                    }
                  }

                  updateSettingsBatch(valid);
                  if (valid.theme) setTheme(valid.theme);
                  if (valid.terraforgeHost) setTerraForgeHost(valid.terraforgeHost as string);
                  setJsonError("");
                  setJsonSaved(true);
                  setTimeout(() => setJsonSaved(false), 2000);
                } catch (err: any) {
                  setJsonError(err.message || "Invalid JSON");
                }
              };

              const handleJsonReset = () => {
                setJsonText(JSON.stringify(getDefaults(), null, 2));
                setJsonError("");
              };

              const handleJsonRefresh = () => {
                setJsonText(JSON.stringify(settings(), null, 2));
                setJsonError("");
              };

              return (
                <div class="settings-content">
                  <div class="settings-section">
                    <div class="settings-section-title">Settings JSON</div>
                    <span class="settings-desc" style={{ "margin-bottom": "8px", display: "block" }}>
                      Edit settings directly as JSON. Changes apply when you click "Apply".
                    </span>
                    <div class="json-editor-toolbar">
                      <button class="json-btn" onClick={handleJsonRefresh}>Refresh</button>
                      <button class="json-btn" onClick={handleJsonReset}>Reset to Defaults</button>
                      <button class="json-btn json-btn-primary" onClick={handleJsonApply}>
                        {jsonSaved() ? "\u2713 Applied" : "Apply"}
                      </button>
                    </div>
                    {jsonError() && <div class="json-error">{jsonError()}</div>}
                    <textarea
                      class="json-editor"
                      value={jsonText()}
                      onInput={(e) => {
                        setJsonText(e.currentTarget.value);
                        setJsonError("");
                        setJsonSaved(false);
                      }}
                      spellcheck={false}
                    />
                  </div>
                </div>
              );
            })()}

            {/* TerraForge Settings */}
            {shouldShowCategory("terraforge") && (
              <div class="settings-content">
                <div class="settings-section">
                  <div class="settings-section-title">TerraForge Engine</div>

                  <div class="settings-row">
                    <div class="settings-label-group">
                      <label class="settings-label">Host URL</label>
                      <span class="settings-desc">TerraForge inference endpoint</span>
                    </div>
                    <input
                      class="settings-input"
                      type="text"
                      value={settings().terraforgeHost}
                      onInput={(e) => handleUpdate("terraforgeHost", e.currentTarget.value)}
                      placeholder="http://terraforge.local"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* About */}
            {shouldShowCategory("keybindings") && (() => {
              const [kbQuery, setKbQuery] = createSignal("");
              const allBindings = [
                { id: "commandPalette", label: "Command Palette", keys: "Ctrl+Shift+P", category: "General" },
                { id: "quickOpen", label: "Quick Open", keys: "Ctrl+P", category: "General" },
                { id: "settings", label: "Settings", keys: "Ctrl+,", category: "General" },
                { id: "keyboardHelp", label: "Keyboard Shortcuts", keys: "Ctrl+Shift+/", category: "General" },
                { id: "newFile", label: "New File", keys: "Ctrl+N", category: "General" },
                { id: "saveFile", label: "Save File", keys: "Ctrl+S", category: "General" },
                { id: "goToLine", label: "Go to Line", keys: "Ctrl+G", category: "General" },
                { id: "goToSymbol", label: "Go to Symbol", keys: "Ctrl+Shift+O", category: "General" },
                { id: "goToDefinition", label: "Go to Definition", keys: "F12", category: "General" },
                { id: "renameSymbol", label: "Rename Symbol", keys: "F2", category: "General" },
                { id: "findReferences", label: "Find All References", keys: "Shift+F12", category: "General" },
                { id: "codeAction", label: "Quick Fix / Code Action", keys: "Ctrl+.", category: "General" },
                { id: "searchInFiles", label: "Search in Files", keys: "Ctrl+Shift+F", category: "General" },
                { id: "replaceInFiles", label: "Replace in Files", keys: "Ctrl+Shift+H", category: "General" },
                { id: "toggleSidebar", label: "Toggle Sidebar", keys: "Ctrl+B", category: "View" },
                { id: "focusExplorer", label: "Focus Explorer", keys: "Ctrl+Shift+E", category: "View" },
                { id: "focusGit", label: "Focus Source Control", keys: "Ctrl+Shift+G", category: "View" },
                { id: "toggleTerminal", label: "Toggle Terminal", keys: "Ctrl+`", category: "View" },
                { id: "togglePanel", label: "Toggle Panel", keys: "Ctrl+J", category: "View" },
                { id: "toggleProblems", label: "Toggle Problems", keys: "Ctrl+Shift+M", category: "View" },
                { id: "toggleOutput", label: "Toggle Output", keys: "Ctrl+Shift+U", category: "View" },
                { id: "focusChat", label: "Focus Gixsis Chat", keys: "Ctrl+Escape", category: "View" },
                { id: "voiceInput", label: "Toggle Voice Input", keys: "Ctrl+M", category: "View" },
                { id: "zoomIn", label: "Zoom In", keys: "Ctrl+=", category: "View" },
                { id: "zoomOut", label: "Zoom Out", keys: "Ctrl+-", category: "View" },
                { id: "zoomReset", label: "Reset Zoom", keys: "Ctrl+0", category: "View" },
                { id: "selectNext", label: "Select Next Occurrence", keys: "Ctrl+D", category: "Editor" },
                { id: "toggleComment", label: "Toggle Comment", keys: "Ctrl+/", category: "Editor" },
                { id: "moveLineUp", label: "Move Line Up", keys: "Alt+Up", category: "Editor" },
                { id: "moveLineDown", label: "Move Line Down", keys: "Alt+Down", category: "Editor" },
                { id: "dupLineUp", label: "Duplicate Line Up", keys: "Shift+Alt+Up", category: "Editor" },
                { id: "dupLineDown", label: "Duplicate Line Down", keys: "Shift+Alt+Down", category: "Editor" },
                { id: "find", label: "Find in File", keys: "Ctrl+F", category: "Editor" },
                { id: "replace", label: "Find & Replace", keys: "Ctrl+H", category: "Editor" },
                { id: "formatDoc", label: "Format Document", keys: "Shift+Alt+F", category: "Editor" },
                { id: "debugStart", label: "Start / Continue Debug", keys: "F5", category: "Debug" },
                { id: "debugStop", label: "Stop Debugging", keys: "Shift+F5", category: "Debug" },
                { id: "toggleBreakpoint", label: "Toggle Breakpoint", keys: "F9", category: "Debug" },
                { id: "stepOver", label: "Step Over", keys: "F10", category: "Debug" },
                { id: "stepInto", label: "Step Into", keys: "F11", category: "Debug" },
                { id: "stepOut", label: "Step Out", keys: "Shift+F11", category: "Debug" },
                { id: "debugPanel", label: "Toggle Debug Panel", keys: "Ctrl+Shift+D", category: "Debug" },
                { id: "closeTab", label: "Close Tab", keys: "Ctrl+W", category: "Tabs" },
                { id: "reopenTab", label: "Reopen Closed Tab", keys: "Ctrl+Shift+T", category: "Tabs" },
                { id: "copyPath", label: "Copy File Path", keys: "Ctrl+Shift+C", category: "Tabs" },
                { id: "nextTab", label: "Next Tab", keys: "Ctrl+Tab", category: "Tabs" },
                { id: "prevTab", label: "Previous Tab", keys: "Ctrl+Shift+Tab", category: "Tabs" },
              ];

              const filtered = () => {
                const q = kbQuery().toLowerCase();
                if (!q) return allBindings;
                return allBindings.filter((b) => b.label.toLowerCase().includes(q) || b.keys.toLowerCase().includes(q) || b.category.toLowerCase().includes(q));
              };

              const categories = () => {
                const cats = new Set(filtered().map((b) => b.category));
                return Array.from(cats);
              };

              return (
                <div class="settings-content">
                  <div class="settings-section">
                    <div class="settings-section-title">Keyboard Shortcuts</div>
                    <div class="settings-row">
                      <input
                        class="kb-search"
                        type="text"
                        placeholder="Search keybindings..."
                        value={kbQuery()}
                        onInput={(e) => setKbQuery(e.currentTarget.value)}
                      />
                    </div>
                    <div class="kb-list">
                      <For each={categories()}>
                        {(cat) => (
                          <>
                            <div class="kb-cat-header">{cat}</div>
                            <For each={filtered().filter((b) => b.category === cat)}>
                              {(binding) => (
                                <div class="kb-row">
                                  <span class="kb-label">{binding.label}</span>
                                  <span class="kb-keys">
                                    <For each={binding.keys.split("+")}>
                                      {(key, i) => (
                                        <>
                                          <kbd class="kb-key">{key}</kbd>
                                          {i() < binding.keys.split("+").length - 1 && <span class="kb-plus">+</span>}
                                        </>
                                      )}
                                    </For>
                                  </span>
                                  <button class="kb-edit-btn" title="Edit Keybinding">
                                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M13.23 1h-1.46L3.52 9.25l-.16.22L1 13.59 2.41 15l4.12-2.36.22-.16L15 4.23V2.77L13.23 1zM2.41 13.59l1.51-3 1.45 1.45-2.96 1.55zm3.83-2.06L4.47 9.76l8-8 1.77 1.77-8 8z"/></svg>
                                  </button>
                                </div>
                              )}
                            </For>
                          </>
                        )}
                      </For>
                    </div>
                    <div class="kb-note">
                      Custom keybinding remapping coming in a future update
                    </div>
                  </div>
                </div>
              );
            })()}

            {shouldShowCategory("sync") && (() => {
              const [syncImportText, setSyncImportText] = createSignal("");
              const [syncFeedback, setSyncFeedback] = createSignal("");

              const handleExportClipboard = () => {
                const json = exportSettingsAsJSON();
                navigator.clipboard.writeText(json).then(() => {
                  setSyncFeedback("Settings copied to clipboard");
                  setTimeout(() => setSyncFeedback(""), 3000);
                }).catch(() => {
                  setSyncFeedback("Failed to copy to clipboard");
                });
              };

              const handleExportDownload = () => {
                const json = exportSettingsAsJSON();
                const blob = new Blob([json], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `codex-settings-${new Date().toISOString().split("T")[0]}.json`;
                a.click();
                URL.revokeObjectURL(url);
                setSyncFeedback("Settings exported");
                setTimeout(() => setSyncFeedback(""), 3000);
              };

              const handleImportClipboard = () => {
                const text = syncImportText();
                if (!text.trim()) { setSyncFeedback("Paste settings JSON first"); return; }
                const ok = importSettingsFromJSON(text);
                setSyncFeedback(ok ? "Settings imported successfully — reload to apply all changes" : "Import failed — invalid format");
                if (ok) setSyncImportText("");
                setTimeout(() => setSyncFeedback(""), 5000);
              };

              const handleSyncToFile = async () => {
                const ok = await syncToFile();
                setSyncFeedback(ok ? "Synced to file" : "Sync failed");
                setTimeout(() => setSyncFeedback(""), 3000);
              };

              const handleSyncFromFile = async () => {
                const ok = await syncFromFile();
                setSyncFeedback(ok ? "Synced from file — reload to apply all changes" : "Sync failed");
                setTimeout(() => setSyncFeedback(""), 5000);
              };

              const lastProfile = getLastSyncProfile();

              return (
                <div class="settings-content">
                  <div class="settings-section">
                    <div class="settings-section-title">Settings Sync</div>

                    <div class="sync-status-bar">
                      <span class="sync-status-label">Status:</span>
                      <span class={`sync-status-value sync-status-${syncStatus()}`}>
                        {syncStatus() === "idle" ? "Not synced" : syncStatus() === "syncing" ? "Syncing..." : syncStatus() === "synced" ? "Synced" : "Error"}
                      </span>
                      {lastSyncTime() && <span class="sync-last-time">Last: {new Date(lastSyncTime()).toLocaleString()}</span>}
                    </div>

                    {syncError() && <div class="sync-error">{syncError()}</div>}
                    {syncFeedback() && <div class="sync-feedback">{syncFeedback()}</div>}

                    <div class="sync-section-label">Export Settings</div>
                    <div class="sync-actions">
                      <button class="sync-btn" onClick={handleExportClipboard}>Copy to Clipboard</button>
                      <button class="sync-btn" onClick={handleExportDownload}>Download JSON</button>
                      <button class="sync-btn sync-btn-primary" onClick={handleSyncToFile}>Sync to File</button>
                    </div>

                    <div class="sync-section-label">Import Settings</div>
                    <div class="sync-actions">
                      <button class="sync-btn sync-btn-primary" onClick={handleSyncFromFile}>Sync from File</button>
                    </div>
                    <textarea
                      class="sync-import-textarea"
                      placeholder="Paste settings JSON here to import..."
                      value={syncImportText()}
                      onInput={(e) => setSyncImportText(e.currentTarget.value)}
                      rows={6}
                    />
                    <div class="sync-actions">
                      <button class="sync-btn" onClick={handleImportClipboard}>Import from Paste</button>
                    </div>

                    {lastProfile && (
                      <div class="sync-profile-info">
                        <div class="sync-section-label">Last Sync Profile</div>
                        <div class="sync-profile-row"><span>Machine:</span><span>{lastProfile.machine}</span></div>
                        <div class="sync-profile-row"><span>Time:</span><span>{new Date(lastProfile.timestamp).toLocaleString()}</span></div>
                        <div class="sync-profile-row"><span>Theme:</span><span>{lastProfile.activeTheme}</span></div>
                        <button class="sync-btn sync-btn-danger" onClick={() => { clearSyncProfile(); setSyncFeedback("Sync profile cleared"); setTimeout(() => setSyncFeedback(""), 3000); }}>Clear Sync Profile</button>
                      </div>
                    )}

                    <div class="sync-note">Settings sync exports your editor settings, extensions state, active theme, and snippets as a portable JSON profile. Use file sync for cross-device synchronization via shared storage.</div>
                  </div>
                </div>
              );
            })()}

            {shouldShowCategory("about") && (
              <div class="settings-content">
                <div class="settings-section">
                  <div class="settings-section-title">About CodeEX</div>
                  <div class="settings-about">
                    <div class="about-row"><span>CodeEX</span><span>v2.0.0-alpha</span></div>
                    <div class="about-row"><span>Runtime</span><span>SolidJS + CodeMirror 6</span></div>
                    <div class="about-row"><span>Desktop</span><span>TerraRuntime 2.x</span></div>
                    <div class="about-row"><span>AI Engine</span><span>TerraForge + Gixsis</span></div>
                    <div class="about-row"><span>Agent</span><span>Gixsis (29 tools)</span></div>
                    <div class="about-divider" />
                    <div class="about-brand">TerraTech Systems</div>
                    <div class="about-copyright">Copyright 2026. All rights reserved.</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .settings-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(8px);
        }
        .settings-panel {
          width: 640px;
          max-height: 80vh;
          background: var(--bg-card);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-elevated);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .settings-header {
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 var(--space-4);
          border-bottom: 1px solid var(--border-subtle);
          flex-shrink: 0;
        }
        .settings-title {
          font-size: var(--text-md);
          font-weight: 600;
          color: var(--text-primary);
        }
        .settings-scope-tabs {
          display: flex;
          gap: 0;
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          overflow: hidden;
        }
        .settings-scope-tab {
          padding: 3px 12px;
          font-size: var(--text-xs);
          font-family: var(--font-ui);
          background: transparent;
          border: none;
          color: var(--text-tertiary);
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
        }
        .settings-scope-tab:hover { color: var(--text-primary); background: var(--bg-hover); }
        .settings-scope-tab.active {
          color: var(--text-primary);
          background: var(--accent-blue);
          color: white;
        }
        .settings-search-box {
          flex: 1;
          display: flex;
          align-items: center;
          gap: var(--space-1);
          margin: 0 var(--space-3);
          background: var(--bg-input, var(--bg-base));
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          padding: 0 var(--space-2);
          height: 28px;
        }
        .settings-search-box:focus-within { border-color: var(--accent-blue); }
        .settings-search-icon { color: var(--text-tertiary); flex-shrink: 0; }
        .settings-search-input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          color: var(--text-primary);
          font-family: var(--font-ui);
          font-size: var(--text-sm);
        }
        .settings-search-clear {
          width: 18px; height: 18px;
          display: flex; align-items: center; justify-content: center;
          background: transparent; border: none; border-radius: var(--radius-sm);
          color: var(--text-tertiary); cursor: pointer; font-size: 14px;
        }
        .settings-search-clear:hover { color: var(--text-primary); }
        .settings-close {
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          border-radius: var(--radius-sm);
          color: var(--text-tertiary);
          font-size: 18px;
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
          flex-shrink: 0;
        }
        .settings-close:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
        .settings-layout {
          display: flex;
          flex: 1;
          overflow: hidden;
        }
        .settings-categories {
          width: 140px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: var(--space-2);
          border-right: 1px solid var(--border-subtle);
          background: var(--bg-base);
        }
        .settings-cat-btn {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          height: 32px;
          padding: 0 var(--space-3);
          background: transparent;
          border: none;
          border-radius: var(--radius-sm);
          color: var(--text-tertiary);
          font-size: var(--text-sm);
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
          text-align: left;
        }
        .settings-cat-btn:hover {
          background: var(--bg-hover);
          color: var(--text-secondary);
        }
        .settings-cat-btn.active {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
        .settings-cat-icon {
          width: 18px;
          height: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-mono);
          font-size: 11px;
          font-weight: 700;
          color: var(--accent-blue);
          background: rgba(41, 151, 255, 0.1);
          border-radius: 3px;
          flex-shrink: 0;
        }
        .settings-cat-label {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .settings-body {
          flex: 1;
          overflow-y: auto;
          padding: var(--space-4);
        }
        .settings-content {
          display: flex;
          flex-direction: column;
          gap: var(--space-5);
        }
        .settings-section-title {
          font-size: var(--text-xs);
          font-weight: 600;
          color: var(--text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: var(--space-3);
        }
        .settings-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          min-height: 40px;
          padding: var(--space-1) 0;
        }
        .settings-label-group {
          display: flex;
          flex-direction: column;
          gap: 1px;
          flex: 1;
          min-width: 0;
        }
        .settings-label {
          font-size: var(--text-sm);
          color: var(--text-secondary);
        }
        .settings-desc {
          font-size: 11px;
          color: var(--text-disabled);
        }
        .settings-input {
          width: 200px;
          height: 32px;
          padding: 0 var(--space-3);
          background: var(--bg-input);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          color: var(--text-primary);
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          outline: none;
          transition: border-color var(--duration-fast) var(--ease-out);
          flex-shrink: 0;
        }
        .settings-input:focus {
          border-color: var(--accent-blue);
        }
        .settings-input.small {
          width: 64px;
          text-align: center;
        }
        .settings-select {
          width: 140px;
          height: 32px;
          padding: 0 var(--space-3);
          background: var(--bg-input);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          color: var(--text-primary);
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          outline: none;
          cursor: pointer;
          flex-shrink: 0;
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%23a1a1a6'%3E%3Cpath d='M3 5l3 3 3-3'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 8px center;
          padding-right: 28px;
        }
        .settings-select:focus {
          border-color: var(--accent-blue);
        }
        .settings-toggle {
          width: 40px;
          height: 22px;
          border-radius: 11px;
          border: none;
          background: var(--border-default);
          cursor: pointer;
          position: relative;
          transition: background var(--duration-normal) var(--ease-out);
          padding: 0;
          flex-shrink: 0;
        }
        .settings-toggle.on {
          background: var(--accent-blue);
        }
        .toggle-knob {
          display: block;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: white;
          position: absolute;
          top: 2px;
          left: 2px;
          transition: transform var(--duration-normal) var(--ease-out);
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        }
        .settings-toggle.on .toggle-knob {
          transform: translateX(18px);
        }
        .settings-reset-btn {
          height: 32px;
          padding: 0 var(--space-4);
          background: rgba(255, 69, 58, 0.1);
          border: 1px solid rgba(255, 69, 58, 0.3);
          border-radius: var(--radius-sm);
          color: #ff453a;
          font-size: var(--text-xs);
          font-weight: 600;
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
          flex-shrink: 0;
        }
        .settings-reset-btn:hover {
          background: rgba(255, 69, 58, 0.2);
          border-color: rgba(255, 69, 58, 0.5);
        }
        .settings-about {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        .about-row {
          display: flex;
          justify-content: space-between;
          font-size: var(--text-sm);
        }
        .about-row span:first-child {
          color: var(--text-tertiary);
        }
        .about-row span:last-child {
          color: var(--text-secondary);
          font-family: var(--font-mono);
          font-size: var(--text-xs);
        }
        .about-divider {
          height: 1px;
          background: var(--border-subtle);
          margin: var(--space-2) 0;
        }
        .about-brand {
          font-size: var(--text-sm);
          font-weight: 600;
          color: var(--accent-blue);
          text-align: center;
        }
        .about-copyright {
          font-size: var(--text-xs);
          color: var(--text-disabled);
          text-align: center;
        }
        .kb-search {
          width: 100%;
          height: 28px;
          background: var(--bg-input);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          color: var(--text-primary);
          font-family: var(--font-ui);
          font-size: var(--text-xs);
          padding: 0 var(--space-2);
          outline: none;
          box-sizing: border-box;
        }
        .kb-search:focus {
          border-color: var(--accent-blue);
        }
        .kb-list {
          max-height: 360px;
          overflow-y: auto;
          margin-top: var(--space-2);
        }
        .kb-cat-header {
          font-size: 10px;
          font-weight: 600;
          color: var(--text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: var(--space-2) 0 var(--space-1) 0;
          border-bottom: 1px solid var(--border-subtle);
          margin-top: var(--space-2);
        }
        .kb-cat-header:first-child {
          margin-top: 0;
        }
        .kb-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 30px;
          padding: 0 var(--space-2);
          border-radius: var(--radius-sm);
          transition: background var(--duration-fast) var(--ease-out);
        }
        .kb-row:hover {
          background: var(--bg-hover);
        }
        .kb-label {
          font-size: var(--text-xs);
          color: var(--text-secondary);
        }
        .kb-keys {
          display: flex;
          align-items: center;
          gap: 3px;
          flex-shrink: 0;
        }
        .kb-key {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 22px;
          height: 20px;
          padding: 0 5px;
          background: var(--bg-base);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--text-primary);
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
        }
        .kb-plus {
          font-size: 10px;
          color: var(--text-disabled);
        }
        .kb-edit-btn {
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          border-radius: var(--radius-sm);
          color: var(--text-disabled);
          cursor: pointer;
          opacity: 0;
          transition: all var(--duration-fast) var(--ease-out);
          flex-shrink: 0;
          margin-left: var(--space-2);
        }
        .kb-row:hover .kb-edit-btn { opacity: 1; }
        .kb-edit-btn:hover { color: var(--accent-blue); background: var(--bg-hover); }
        .kb-note {
          font-size: var(--text-xs);
          color: var(--text-disabled);
          text-align: center;
          font-style: italic;
          padding: var(--space-3) 0;
        }

        /* Theme Picker */
        .theme-search {
          width: 100%;
          padding: 6px 10px;
          background: var(--bg-input);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          color: var(--text-primary);
          font-size: var(--text-sm);
          margin-bottom: var(--space-3);
          outline: none;
        }
        .theme-search:focus {
          border-color: var(--accent-blue);
        }
        .theme-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          max-height: 340px;
          overflow-y: auto;
          padding: 2px;
        }
        .theme-group-label {
          width: 100%;
          font-size: var(--text-xs);
          color: var(--text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          padding: var(--space-2) 0 var(--space-1) 0;
        }
        .theme-card {
          width: 120px;
          border: 2px solid var(--border-subtle);
          border-radius: var(--radius-md);
          cursor: pointer;
          overflow: hidden;
          transition: border-color var(--duration-fast) var(--ease-out);
          position: relative;
        }
        .theme-card:hover {
          border-color: var(--border-strong);
        }
        .theme-card.active {
          border-color: var(--accent-blue);
        }
        .theme-preview {
          height: 60px;
          padding: 4px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .theme-preview-bar {
          border-radius: 3px;
          padding: 3px 6px;
          display: flex;
          align-items: center;
        }
        .theme-preview-dots {
          display: flex;
          gap: 3px;
          padding: 0 2px;
        }
        .theme-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          display: inline-block;
        }
        .theme-card-label {
          font-size: 10px;
          color: var(--text-secondary);
          padding: 4px 6px;
          text-align: center;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .theme-active-badge {
          position: absolute;
          top: 3px;
          right: 3px;
          font-size: 8px;
          background: var(--accent-blue);
          color: #fff;
          padding: 1px 4px;
          border-radius: 3px;
        }
        .community-theme-meta {
          display: flex;
          justify-content: center;
          gap: var(--space-2);
          font-size: 9px;
          color: var(--text-disabled);
          padding: 0 4px 2px;
        }
        .community-theme-dl {
          color: var(--text-tertiary);
        }
        .community-theme-rating {
          color: var(--accent-orange);
        }
        .community-theme-btn {
          width: calc(100% - 8px);
          height: 22px;
          margin: 0 4px 4px;
          background: var(--accent-blue);
          border: none;
          border-radius: var(--radius-sm);
          color: white;
          font-size: 10px;
          font-weight: 600;
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
        }
        .community-theme-btn:hover:not(:disabled) {
          filter: brightness(1.1);
        }
        .community-theme-btn.installed {
          background: var(--bg-hover);
          color: var(--accent-green);
          cursor: default;
        }

        /* JSON Settings Editor */
        .json-editor-toolbar {
          display: flex;
          gap: var(--space-2);
          margin-bottom: var(--space-2);
        }
        .json-btn {
          height: 26px;
          padding: 0 var(--space-3);
          background: var(--bg-input);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          color: var(--text-primary);
          font-size: var(--text-xs);
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
        }
        .json-btn:hover { background: var(--bg-hover); }
        .json-btn-primary {
          background: var(--accent-blue);
          border-color: var(--accent-blue);
          color: #fff;
        }
        .json-btn-primary:hover { opacity: 0.9; }
        .json-error {
          padding: var(--space-2);
          margin-bottom: var(--space-2);
          background: rgba(255, 69, 58, 0.1);
          border: 1px solid rgba(255, 69, 58, 0.3);
          border-radius: var(--radius-sm);
          color: var(--accent-red);
          font-size: var(--text-xs);
          font-family: var(--font-mono);
        }
        .json-editor {
          width: 100%;
          min-height: 320px;
          padding: var(--space-3);
          background: var(--bg-base);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
          color: var(--text-primary);
          font-family: var(--font-mono);
          font-size: var(--text-sm);
          line-height: 1.6;
          resize: vertical;
          outline: none;
          tab-size: 2;
        }
        .json-editor:focus {
          border-color: var(--accent-blue);
        }

        /* Snippet Editor */
        .snippet-file-group {
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          margin-bottom: var(--space-1);
          overflow: hidden;
        }
        .snippet-file-header {
          display: flex;
          align-items: center;
          gap: var(--space-1);
          height: 32px;
          padding: 0 var(--space-2);
          cursor: pointer;
          transition: background var(--duration-fast) var(--ease-out);
          background: var(--bg-card);
        }
        .snippet-file-header:hover {
          background: var(--bg-hover);
        }
        .snippet-file-arrow {
          font-size: 8px;
          color: var(--text-tertiary);
          transition: transform var(--duration-fast) var(--ease-out);
          width: 12px;
          text-align: center;
        }
        .snippet-file-name {
          flex: 1;
          font-family: var(--font-mono);
          font-size: 12px;
          color: var(--text-primary);
        }
        .snippet-file-count {
          font-size: 10px;
          background: var(--bg-surface);
          color: var(--text-tertiary);
          border-radius: 8px;
          padding: 0 6px;
          height: 16px;
          display: flex;
          align-items: center;
        }
        .snippet-file-remove {
          background: none;
          border: none;
          color: var(--text-disabled);
          font-size: 14px;
          cursor: pointer;
          padding: 0 4px;
          opacity: 0;
          transition: opacity var(--duration-fast), color var(--duration-fast);
        }
        .snippet-file-header:hover .snippet-file-remove {
          opacity: 1;
        }
        .snippet-file-remove:hover {
          color: var(--accent-red);
        }
        .snippet-entries {
          padding: var(--space-1) 0;
          border-top: 1px solid var(--border-subtle);
        }
        .snippet-entry {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: 2px var(--space-3);
          font-size: 11px;
        }
        .snippet-prefix {
          font-family: var(--font-mono);
          font-weight: 600;
          color: var(--accent-blue);
          min-width: 80px;
        }
        .snippet-desc {
          color: var(--text-secondary);
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .snippet-scope {
          font-size: 10px;
          color: var(--text-disabled);
          background: var(--bg-surface);
          padding: 0 4px;
          border-radius: 4px;
        }
        .snippet-empty {
          padding: var(--space-2) 0;
          font-size: 12px;
          color: var(--text-disabled);
          font-style: italic;
        }
        .snippet-inline-btn {
          width: 18px;
          height: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          color: var(--text-disabled);
          cursor: pointer;
          border-radius: var(--radius-sm);
          font-size: 12px;
          opacity: 0;
          transition: opacity var(--duration-fast) var(--ease-out);
          flex-shrink: 0;
        }
        .snippet-entry:hover .snippet-inline-btn {
          opacity: 1;
        }
        .snippet-edit-btn:hover {
          color: var(--accent-orange);
          background: var(--bg-hover);
        }
        .snippet-delete-btn:hover {
          color: var(--accent-red);
          background: var(--bg-hover);
        }
        .snippet-edit-form {
          padding: var(--space-2) var(--space-3);
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          margin: 2px 0;
        }
        .snippet-edit-row {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          margin-bottom: var(--space-1);
        }
        .snippet-edit-label {
          width: 70px;
          font-size: 10px;
          color: var(--text-tertiary);
          text-align: right;
          flex-shrink: 0;
        }
        .snippet-edit-input {
          flex: 1;
          height: 24px;
          padding: 0 var(--space-2);
          background: var(--bg-input);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          color: var(--text-primary);
          font-size: 11px;
          font-family: var(--font-mono);
        }
        .snippet-edit-input:focus {
          outline: none;
          border-color: var(--accent-blue);
        }
        .snippet-edit-body {
          flex: 1;
          padding: var(--space-1) var(--space-2);
          background: var(--bg-input);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          color: var(--text-primary);
          font-size: 11px;
          font-family: var(--font-mono);
          resize: vertical;
          min-height: 60px;
        }
        .snippet-edit-body:focus {
          outline: none;
          border-color: var(--accent-blue);
        }
        .snippet-edit-actions {
          display: flex;
          gap: var(--space-1);
          justify-content: flex-end;
          margin-top: var(--space-1);
        }
        .snippet-add-inline {
          width: 100%;
          padding: 4px;
          background: transparent;
          border: 1px dashed var(--border-subtle);
          border-radius: var(--radius-sm);
          color: var(--text-disabled);
          font-size: 11px;
          cursor: pointer;
          text-align: center;
          margin-top: 2px;
        }
        .snippet-add-inline:hover {
          color: var(--accent-blue);
          border-color: var(--accent-blue);
          background: rgba(41, 151, 255, 0.05);
        }
        .snippet-create-row {
          display: flex;
          gap: var(--space-1);
          margin-bottom: var(--space-2);
        }
        .snippet-name-input {
          flex: 1;
          height: 28px;
          background: var(--bg-input);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          color: var(--text-primary);
          font-family: var(--font-mono);
          font-size: 12px;
          padding: 0 var(--space-2);
          outline: none;
        }
        .snippet-name-input:focus {
          border-color: var(--accent-blue);
        }
        .snippet-saved {
          background: rgba(48, 209, 88, 0.1);
          color: var(--accent-green);
          padding: var(--space-1) var(--space-2);
          border-radius: var(--radius-sm);
          font-size: 12px;
          margin-bottom: var(--space-2);
        }

        /* Settings Sync */
        .sync-status-bar {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2);
          background: var(--bg-input);
          border-radius: var(--radius-sm);
          margin-bottom: var(--space-3);
          font-size: 12px;
        }
        .sync-status-label { color: var(--text-tertiary); }
        .sync-status-value { font-weight: 600; }
        .sync-status-idle { color: var(--text-secondary); }
        .sync-status-syncing { color: var(--accent-blue); }
        .sync-status-synced { color: var(--accent-green); }
        .sync-status-error { color: var(--accent-red); }
        .sync-last-time { color: var(--text-tertiary); margin-left: auto; font-size: 11px; }
        .sync-error {
          background: rgba(255, 69, 58, 0.1);
          color: var(--accent-red);
          padding: var(--space-1) var(--space-2);
          border-radius: var(--radius-sm);
          font-size: 12px;
          margin-bottom: var(--space-2);
        }
        .sync-feedback {
          background: rgba(48, 209, 88, 0.1);
          color: var(--accent-green);
          padding: var(--space-1) var(--space-2);
          border-radius: var(--radius-sm);
          font-size: 12px;
          margin-bottom: var(--space-2);
        }
        .sync-section-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--text-tertiary);
          margin: var(--space-3) 0 var(--space-1);
        }
        .sync-actions {
          display: flex;
          gap: var(--space-2);
          margin-bottom: var(--space-2);
          flex-wrap: wrap;
        }
        .sync-btn {
          background: var(--bg-input);
          border: 1px solid var(--border-subtle);
          color: var(--text-secondary);
          padding: var(--space-1) var(--space-3);
          border-radius: var(--radius-sm);
          font-size: 12px;
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
        }
        .sync-btn:hover { background: var(--bg-hover); color: var(--text-primary); border-color: var(--border-default); }
        .sync-btn-primary { color: var(--accent-blue); border-color: var(--accent-blue); }
        .sync-btn-primary:hover { background: rgba(41, 151, 255, 0.1); }
        .sync-btn-danger { color: var(--accent-red); border-color: var(--accent-red); margin-top: var(--space-2); }
        .sync-btn-danger:hover { background: rgba(255, 69, 58, 0.1); }
        .sync-import-textarea {
          width: 100%;
          min-height: 100px;
          background: var(--bg-input);
          border: 1px solid var(--border-subtle);
          color: var(--text-primary);
          border-radius: var(--radius-sm);
          padding: var(--space-2);
          font-family: "JetBrains Mono", monospace;
          font-size: 11px;
          resize: vertical;
          margin-bottom: var(--space-2);
          box-sizing: border-box;
        }
        .sync-import-textarea:focus { border-color: var(--accent-blue); outline: none; }
        .sync-profile-info {
          margin-top: var(--space-3);
          padding: var(--space-2);
          background: var(--bg-input);
          border-radius: var(--radius-sm);
        }
        .sync-profile-row {
          display: flex;
          justify-content: space-between;
          padding: 2px 0;
          font-size: 12px;
        }
        .sync-profile-row span:first-child { color: var(--text-tertiary); }
        .sync-profile-row span:last-child { color: var(--text-secondary); }
        .sync-note {
          font-size: 11px;
          color: var(--text-disabled);
          font-style: italic;
          margin-top: var(--space-3);
          line-height: 1.5;
        }

        /* Account Settings */
        .account-profile-card {
          display: flex;
          align-items: center;
          gap: var(--space-4);
          padding: var(--space-4);
          background: var(--bg-base);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
        }
        .account-profile-avatar {
          width: 56px;
          height: 56px;
          min-width: 56px;
          border-radius: 50%;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .account-profile-img {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          object-fit: cover;
        }
        .account-profile-initials {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          font-weight: 700;
          color: var(--text-primary);
          background: var(--bg-hover);
          border: 2px solid var(--border-subtle);
        }
        .account-profile-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
          overflow: hidden;
        }
        .account-profile-name {
          font-size: var(--text-md);
          font-weight: 600;
          color: var(--text-primary);
        }
        .account-profile-email {
          font-size: var(--text-sm);
          color: var(--text-secondary);
        }
        .account-profile-username {
          font-size: var(--text-xs);
          color: var(--text-tertiary);
          font-family: var(--font-mono);
        }
        .account-details {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        .account-detail-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--space-2) 0;
          border-bottom: 1px solid var(--border-subtle);
        }
        .account-detail-row:last-child {
          border-bottom: none;
        }
        .account-detail-label {
          font-size: var(--text-sm);
          color: var(--text-tertiary);
        }
        .account-detail-value {
          font-size: var(--text-sm);
          color: var(--text-primary);
        }
        .account-status-authenticated {
          color: var(--accent-green, #30d158);
        }
        .account-status-expired {
          color: var(--accent-red, #ff453a);
        }
        .account-status-refreshing {
          color: var(--accent-orange, #ff9f0a);
        }
        .account-status-unauthenticated {
          color: var(--text-tertiary);
        }
        .account-actions {
          display: flex;
          gap: var(--space-3);
        }
        .account-action-btn {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-4);
          background: var(--bg-base);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          color: var(--text-secondary);
          font-family: var(--font-ui);
          font-size: var(--text-sm);
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
        }
        .account-action-btn:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
        .account-signout-btn:hover {
          color: var(--accent-red, #ff453a);
          border-color: var(--accent-red, #ff453a);
        }
      `}</style>
    </div>
  );
}
