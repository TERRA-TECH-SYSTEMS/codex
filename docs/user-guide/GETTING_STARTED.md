# CodeEX - Getting Started Guide

**Version:** 0.1.0
**Publisher:** TERRA TECH SYSTEMS

---

## What is CodeEX?

CodeEX (Ageixtic IDE) is a customized VS Code-based development environment with integrated AI capabilities. Built on VSCodium, it provides a powerful, privacy-focused coding experience with specialized extensions for AI assistance, resource management, and session protection.

---

## System Requirements

### macOS
- macOS 10.15 (Catalina) or later
- Apple Silicon (M1/M2/M3) or Intel processor
- 4GB RAM minimum (8GB recommended)
- 500MB disk space

### Windows
- Windows 10 or later (64-bit)
- 4GB RAM minimum (8GB recommended)
- 500MB disk space

### Linux
- Ubuntu 18.04+ / Debian 10+ / Fedora 32+ / RHEL 8+
- 64-bit processor
- 4GB RAM minimum (8GB recommended)
- 500MB disk space

---

## Installation

### macOS

1. **Download** the DMG file for your processor:
   - Apple Silicon (M1/M2/M3): `CodeEX-Ageixtic-IDE-0.1.0-arm64.dmg`
   - Intel Mac: `CodeEX-Ageixtic-IDE-0.1.0-x64.dmg`

2. **Open** the downloaded DMG file

3. **Drag** CodeEX to your Applications folder

4. **Launch** CodeEX from Applications
   - First launch may show "CodeEX is from an identified developer" - click Open
   - The app is signed and notarized by Apple

### Windows

1. **Download** `CodeEX-Ageixtic-IDE-0.1.0-win-x64.zip`

2. **Extract** the ZIP file to your preferred location (e.g., `C:\Program Files\CodeEX`)

3. **Run** `CodeEX.exe` from the extracted folder

4. **Optional**: Create a desktop shortcut or pin to taskbar

### Linux

1. **Download** `CodeEX-Ageixtic-IDE-0.1.0-linux-x64.tar.gz`

2. **Extract** the archive:
   ```bash
   tar -xzvf CodeEX-Ageixtic-IDE-0.1.0-linux-x64.tar.gz
   ```

3. **Run** CodeEX:
   ```bash
   cd VSCode-linux-x64
   ./codex
   ```

4. **Optional**: Add to your PATH or create a .desktop file

---

## First Launch

When you first launch CodeEX, you'll see the Welcome tab with options to:

1. **Open a folder** - Start working on a project
2. **Clone a repository** - Clone from GitHub, GitLab, etc.
3. **Open a file** - Work on a single file
4. **Customize** - Configure settings and themes

### Recommended First Steps

1. **Set your theme**: File → Preferences → Color Theme
2. **Configure settings**: File → Preferences → Settings
3. **Install additional extensions**: Extensions panel (Ctrl+Shift+X / Cmd+Shift+X)

---

## Included Extensions

CodeEX comes with three specialized extensions pre-installed:

### Ageixtic Core
AI-powered code assistance using Ollama integration.

**Features:**
- Code completion suggestions
- Code explanation
- Refactoring assistance
- Natural language code generation

**Configuration:**
1. Install Ollama on your system (https://ollama.ai)
2. Pull a model: `ollama pull llama3.1`
3. Configure the Ollama endpoint in CodeEX settings

### Quota Manager
Track and manage your AI token usage.

**Features:**
- Real-time token counting
- Usage limits and alerts
- Session and daily quotas
- Usage history

**Status Bar:**
- Shows current token usage in bottom status bar
- Click to view detailed usage statistics

### Session Protector
Preserve and restore your workspace state.

**Features:**
- Automatic session backup
- Open files preservation
- Cursor position memory
- Workspace state recovery

**Auto-save:**
- Sessions are automatically saved every 5 minutes
- Manual save: Ctrl+Shift+P → "Session Protector: Save Session"

---

## Keyboard Shortcuts

### Essential Shortcuts

| Action | Windows/Linux | macOS |
|--------|---------------|-------|
| Command Palette | Ctrl+Shift+P | Cmd+Shift+P |
| Quick Open File | Ctrl+P | Cmd+P |
| Toggle Terminal | Ctrl+` | Cmd+` |
| Toggle Sidebar | Ctrl+B | Cmd+B |
| Find in Files | Ctrl+Shift+F | Cmd+Shift+F |
| Go to Definition | F12 | F12 |
| Peek Definition | Alt+F12 | Option+F12 |
| Format Document | Shift+Alt+F | Shift+Option+F |
| Toggle Comment | Ctrl+/ | Cmd+/ |
| Multi-cursor | Alt+Click | Option+Click |

### Extension Shortcuts

| Action | Shortcut |
|--------|----------|
| AI Assist | Ctrl+Shift+A / Cmd+Shift+A |
| Save Session | Ctrl+Shift+S / Cmd+Shift+S |
| View Token Usage | Ctrl+Shift+Q / Cmd+Shift+Q |

---

## Settings

Access settings via: File → Preferences → Settings (or Ctrl+,)

### Extension Settings

**Ageixtic Core:**
```json
{
  "ageixtic.ollamaEndpoint": "http://localhost:11434",
  "ageixtic.defaultModel": "llama3.1",
  "ageixtic.enableAutoComplete": true
}
```

**Quota Manager:**
```json
{
  "quotaManager.dailyLimit": 100000,
  "quotaManager.warningThreshold": 80,
  "quotaManager.showInStatusBar": true
}
```

**Session Protector:**
```json
{
  "sessionProtector.autoSaveInterval": 300,
  "sessionProtector.maxBackups": 10,
  "sessionProtector.restoreOnStartup": true
}
```

---

## Updating CodeEX

### Check for Updates
1. Help → Check for Updates
2. Or visit: https://github.com/TERRA-TECH-SYSTEMS/codex/releases

### Update Process
1. Download the latest version for your platform
2. Close CodeEX
3. Install the new version (same process as initial install)
4. Your settings and extensions are preserved

---

## Troubleshooting

### macOS: "App is damaged and can't be opened"
This can happen if Gatekeeper quarantine wasn't cleared. Run:
```bash
xattr -cr /Applications/CodeEX.app
```

### macOS: "Cannot be opened because the developer cannot be verified"
CodeEX is signed and notarized. If you see this:
1. Right-click the app → Open
2. Click "Open" in the dialog

### Linux: Missing Dependencies
Install required libraries:
```bash
# Ubuntu/Debian
sudo apt-get install libx11-dev libxkbfile-dev libsecret-1-dev

# Fedora
sudo dnf install libX11-devel libxkbfile-devel libsecret-devel
```

### Ollama Not Connecting
1. Verify Ollama is running: `ollama list`
2. Check endpoint in settings matches Ollama's address
3. Ensure no firewall blocking localhost:11434

### Extension Not Loading
1. Check Output panel for errors: View → Output
2. Select the extension from dropdown
3. Review error messages

---

## Getting Help

- **Documentation**: https://github.com/TERRA-TECH-SYSTEMS/codex/wiki
- **Issues**: https://github.com/TERRA-TECH-SYSTEMS/codex/issues
- **Releases**: https://github.com/TERRA-TECH-SYSTEMS/codex/releases

---

## About TERRA TECH SYSTEMS

CodeEX is developed by TERRA TECH SYSTEMS as part of the Ageixtic ecosystem. Our mission is to provide powerful, privacy-focused development tools with integrated AI capabilities.

**Website**: https://terratech.systems
**Contact**: support@terratech.systems
