# CodeEX Extensions Guide

**Version:** 0.1.0
**Publisher:** TERRA TECH SYSTEMS

---

## Overview

CodeEX includes three core extensions designed to enhance your development workflow with AI capabilities, resource management, and session protection.

---

## Ageixtic Core

### Description
Ageixtic Core provides AI-powered code assistance through integration with Ollama, a local LLM runtime. All AI processing happens on your machine, ensuring privacy and security.

### Features

| Feature | Description |
|---------|-------------|
| Code Completion | AI-powered suggestions as you type |
| Code Explanation | Select code and ask for explanations |
| Refactoring | AI-assisted code refactoring |
| Code Generation | Generate code from natural language |
| Documentation | Auto-generate code documentation |

### Setup

**Step 1: Install Ollama**

macOS:
```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

Windows:
- Download from https://ollama.ai/download

Linux:
```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

**Step 2: Pull a Model**
```bash
ollama pull llama3.1      # General purpose
ollama pull codellama     # Code-focused
ollama pull mistral       # Fast and efficient
```

**Step 3: Start Ollama**
```bash
ollama serve
```

**Step 4: Configure CodeEX**
1. Open Settings (Ctrl+, or Cmd+,)
2. Search for "ageixtic"
3. Set `Ollama Endpoint` to `http://localhost:11434`
4. Set `Default Model` to your preferred model

### Usage

**Inline Completion:**
- Type code and wait for suggestions
- Press Tab to accept, Escape to dismiss

**Command Palette:**
- `Ageixtic: Explain Code` - Explain selected code
- `Ageixtic: Refactor Code` - Refactor selected code
- `Ageixtic: Generate Code` - Generate from prompt
- `Ageixtic: Add Documentation` - Document selected code

**Keyboard Shortcuts:**
| Action | Shortcut |
|--------|----------|
| Trigger Completion | Ctrl+Space |
| Explain Code | Ctrl+Shift+E |
| Generate Code | Ctrl+Shift+G |

### Settings Reference

```json
{
  // Ollama server endpoint
  "ageixtic.ollamaEndpoint": "http://localhost:11434",

  // Default model for code assistance
  "ageixtic.defaultModel": "llama3.1",

  // Enable automatic code completion
  "ageixtic.enableAutoComplete": true,

  // Delay before showing completions (ms)
  "ageixtic.completionDelay": 500,

  // Maximum tokens for completion
  "ageixtic.maxTokens": 1024,

  // Temperature for generation (0-1)
  "ageixtic.temperature": 0.7
}
```

---

## Quota Manager

### Description
Quota Manager tracks your AI token usage across all Ageixtic features, helping you manage resources and stay within limits.

### Features

| Feature | Description |
|---------|-------------|
| Token Counting | Real-time token usage tracking |
| Usage Limits | Set daily and session limits |
| Alerts | Notifications when approaching limits |
| History | View usage history and trends |
| Export | Export usage data to CSV |

### Status Bar

The Quota Manager displays current usage in the status bar:
```
Tokens: 5,234 / 100,000 (5%)
```

Click the status bar item to open the Quota Manager panel.

### Commands

| Command | Description |
|---------|-------------|
| `Quota Manager: Show Usage` | Open usage panel |
| `Quota Manager: Reset Session` | Reset session counter |
| `Quota Manager: Export History` | Export to CSV |
| `Quota Manager: Set Daily Limit` | Configure daily limit |

### Settings Reference

```json
{
  // Daily token limit (0 = unlimited)
  "quotaManager.dailyLimit": 100000,

  // Session token limit (0 = unlimited)
  "quotaManager.sessionLimit": 50000,

  // Warning threshold percentage
  "quotaManager.warningThreshold": 80,

  // Show usage in status bar
  "quotaManager.showInStatusBar": true,

  // Show notification when limit reached
  "quotaManager.notifyOnLimit": true,

  // Action when limit reached: "warn" | "block"
  "quotaManager.limitAction": "warn"
}
```

### Usage Panel

The Usage Panel shows:
- Current session usage
- Daily usage with trend
- Weekly/monthly summaries
- Usage by feature breakdown
- Cost estimates (if configured)

---

## Session Protector

### Description
Session Protector automatically saves and restores your workspace state, ensuring you never lose your place even after crashes or restarts.

### Features

| Feature | Description |
|---------|-------------|
| Auto-Save | Periodic automatic session backup |
| State Recovery | Restore open files and positions |
| Cursor Memory | Remember cursor position per file |
| Tab Groups | Preserve tab group layouts |
| Terminal State | Restore terminal sessions |
| Breakpoints | Save and restore debug breakpoints |

### What's Saved

- Open files and their order
- Cursor position in each file
- Selection ranges
- Scroll position
- Tab groups and layout
- Active file
- Terminal sessions (optional)
- Breakpoints (optional)

### Commands

| Command | Description |
|---------|-------------|
| `Session Protector: Save Session` | Manual save |
| `Session Protector: Restore Session` | Restore last session |
| `Session Protector: List Sessions` | View all saved sessions |
| `Session Protector: Delete Session` | Remove a saved session |
| `Session Protector: Export Session` | Export session to file |
| `Session Protector: Import Session` | Import session from file |

### Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Save Session | Ctrl+Shift+S / Cmd+Shift+S |
| Restore Session | Ctrl+Shift+R / Cmd+Shift+R |

### Settings Reference

```json
{
  // Auto-save interval in seconds (0 = disabled)
  "sessionProtector.autoSaveInterval": 300,

  // Maximum number of backup sessions to keep
  "sessionProtector.maxBackups": 10,

  // Restore session on startup
  "sessionProtector.restoreOnStartup": true,

  // Prompt before restoring
  "sessionProtector.promptRestore": false,

  // Include terminal sessions
  "sessionProtector.includeTerminals": true,

  // Include breakpoints
  "sessionProtector.includeBreakpoints": true,

  // Session storage location
  "sessionProtector.storagePath": ""  // Default: workspace .vscode folder
}
```

### Session Files

Sessions are stored in:
- **Workspace**: `.vscode/sessions/`
- **Global**: `~/.config/CodeEX/sessions/` (Linux/macOS) or `%APPDATA%\CodeEX\sessions\` (Windows)

---

## Extension Development

### Creating Custom Extensions

CodeEX supports all VS Code extension APIs. To create custom extensions:

1. Use `yo code` to scaffold a new extension
2. Develop and test in Extension Development Host
3. Package with `vsce package`
4. Install via `codex --install-extension your-extension.vsix`

### Extension API Access

Extensions can access Ageixtic features via the API:

```typescript
// Get Ageixtic API
const ageixtic = vscode.extensions.getExtension('terratech.ageixtic-core');
const api = ageixtic?.exports;

// Use AI completion
const result = await api.complete({
  prompt: "function to calculate fibonacci",
  maxTokens: 500
});

// Get quota usage
const quota = vscode.extensions.getExtension('terratech.quota-manager');
const usage = quota?.exports.getUsage();
```

---

## Troubleshooting Extensions

### Ageixtic Core Not Working

1. **Check Ollama is running:**
   ```bash
   curl http://localhost:11434/api/tags
   ```

2. **Verify model is pulled:**
   ```bash
   ollama list
   ```

3. **Check extension output:**
   - View → Output → Select "Ageixtic Core"

### Quota Manager Shows Incorrect Usage

1. Reset session: Command Palette → "Quota Manager: Reset Session"
2. Check if multiple instances are running
3. Verify storage permissions

### Session Protector Not Restoring

1. Check if sessions exist: Command Palette → "Session Protector: List Sessions"
2. Verify storage path permissions
3. Check for corrupted session files

---

## Support

For extension issues:
- **GitHub Issues**: https://github.com/TERRA-TECH-SYSTEMS/codex/issues
- **Label issues with**: `extension:ageixtic-core`, `extension:quota-manager`, or `extension:session-protector`
