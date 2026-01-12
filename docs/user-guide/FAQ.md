# CodeEX - Frequently Asked Questions

**Version:** 0.1.0
**Publisher:** TERRA TECH SYSTEMS

---

## General Questions

### What is CodeEX?
CodeEX (Ageixtic IDE) is a privacy-focused code editor based on VSCodium with integrated AI capabilities. It provides local AI assistance through Ollama, meaning your code never leaves your machine.

### How is CodeEX different from VS Code?
CodeEX is based on VSCodium (the open-source build of VS Code without Microsoft telemetry) with added:
- Pre-installed AI extensions (Ageixtic Core)
- Resource management (Quota Manager)
- Session protection (Session Protector)
- TerraTech branding and customization

### Is CodeEX free?
Yes, CodeEX is free and open source. The included AI features require Ollama, which is also free.

### What operating systems are supported?
- macOS 10.15+ (Apple Silicon and Intel)
- Windows 10+ (64-bit)
- Linux (64-bit, major distributions)

---

## Installation Questions

### Why does macOS say the app is from an "unidentified developer"?
CodeEX is signed with an Apple Developer ID and notarized by Apple. If you see this warning, try:
1. Right-click the app → Open → Click "Open" in the dialog
2. Or: System Preferences → Security & Privacy → Click "Open Anyway"

### Can I install CodeEX alongside VS Code?
Yes, CodeEX and VS Code can coexist. They use separate configuration directories and won't conflict.

### Where are settings stored?
| OS | Location |
|----|----------|
| macOS | `~/Library/Application Support/CodeEX/` |
| Windows | `%APPDATA%\CodeEX\` |
| Linux | `~/.config/CodeEX/` |

### Can I migrate my VS Code settings?
Yes, you can copy your VS Code settings:
```bash
# macOS
cp -r ~/Library/Application\ Support/Code/User/* ~/Library/Application\ Support/CodeEX/User/

# Linux
cp -r ~/.config/Code/User/* ~/.config/CodeEX/User/

# Windows (PowerShell)
Copy-Item -Recurse "$env:APPDATA\Code\User\*" "$env:APPDATA\CodeEX\User\"
```

---

## AI Features Questions

### Do I need an internet connection for AI features?
No! Ollama runs locally on your machine. Once you've downloaded a model, all AI processing happens offline.

### What AI models are recommended?
| Model | Size | Best For |
|-------|------|----------|
| llama3.1:8b | 4.7GB | General coding, explanations |
| codellama:7b | 3.8GB | Code completion, generation |
| mistral:7b | 4.1GB | Fast responses, good quality |
| deepseek-coder:6.7b | 3.8GB | Specialized code assistance |

### How much RAM do I need for AI features?
- 8GB RAM: Can run 7B models
- 16GB RAM: Can run 13B models comfortably
- 32GB+ RAM: Can run larger models like 34B

### Can I use a remote Ollama server?
Yes, change the endpoint in settings:
```json
{
  "ageixtic.ollamaEndpoint": "http://your-server:11434"
}
```

### Are my prompts sent anywhere?
No. All AI requests go only to your configured Ollama endpoint (localhost by default). No data is sent to external servers.

---

## Extension Questions

### Can I install additional VS Code extensions?
Yes! CodeEX supports the Open VSX registry. Install extensions via:
- Extensions panel (Ctrl+Shift+X)
- Command line: `codex --install-extension <extension-id>`
- VSIX files: `codex --install-extension path/to/extension.vsix`

### Can I use the Microsoft VS Code Marketplace?
CodeEX uses Open VSX by default (the open-source extension registry). Some Microsoft-exclusive extensions may not be available.

### How do I disable the pre-installed extensions?
1. Open Extensions panel (Ctrl+Shift+X)
2. Find the extension
3. Click the gear icon → Disable

### Can I uninstall the pre-installed extensions?
The core extensions (Ageixtic Core, Quota Manager, Session Protector) are bundled with CodeEX. You can disable them but not uninstall them.

---

## Performance Questions

### CodeEX is slow to start. How can I speed it up?
1. Disable unused extensions
2. Reduce the number of workspace folders
3. Exclude large folders from file watching:
   ```json
   {
     "files.watcherExclude": {
       "**/node_modules/**": true,
       "**/.git/**": true
     }
   }
   ```

### AI completions are slow. What can I do?
1. Use a smaller model (7B instead of 13B)
2. Reduce `ageixtic.maxTokens`
3. Increase `ageixtic.completionDelay` to trigger less frequently
4. Ensure Ollama has sufficient RAM

### High CPU usage during AI operations?
This is normal during AI inference. To reduce:
1. Use a smaller model
2. Disable auto-completion: `"ageixtic.enableAutoComplete": false`
3. Use manual triggers instead

---

## Troubleshooting

### "Cannot find Ollama" error
1. Verify Ollama is installed: `ollama --version`
2. Start Ollama: `ollama serve`
3. Check endpoint in settings matches Ollama's address
4. Try: `curl http://localhost:11434/api/tags`

### Extensions not loading
1. Check Output panel: View → Output
2. Select the extension from the dropdown
3. Look for error messages
4. Try: Developer: Reload Window

### Session not restoring
1. Verify session exists: "Session Protector: List Sessions"
2. Check file permissions in session storage directory
3. Look for errors in Output panel → Session Protector

### Settings not applying
1. Check for JSON syntax errors in settings.json
2. Reload the window: Ctrl+Shift+P → "Developer: Reload Window"
3. Check if settings are workspace or user level

### Crashes on startup
1. Start in safe mode: `codex --disable-extensions`
2. Check logs in:
   - macOS: `~/Library/Logs/CodeEX/`
   - Linux: `~/.config/CodeEX/logs/`
   - Windows: `%APPDATA%\CodeEX\logs\`
3. Try resetting settings: rename the User folder

---

## Updates and Maintenance

### How do I check for updates?
Help → Check for Updates

Or visit: https://github.com/TERRA-TECH-SYSTEMS/codex/releases

### Will updates preserve my settings?
Yes, your settings, extensions, and sessions are stored separately from the application and are preserved during updates.

### How do I rollback to a previous version?
1. Download the previous version from GitHub Releases
2. Reinstall (your settings are preserved)

---

## Privacy and Security

### What data does CodeEX collect?
CodeEX does not collect any telemetry. Unlike VS Code, there are no Microsoft services integrated.

### Are my AI prompts logged?
By default, no. You can enable logging for debugging:
```json
{
  "ageixtic.debugLogging": true
}
```

### Is my code secure?
- All AI processing is local (via Ollama)
- No code is sent to external servers
- CodeEX is based on the open-source VSCodium
- Source code is available for audit

---

## Getting Help

### Where can I report bugs?
GitHub Issues: https://github.com/TERRA-TECH-SYSTEMS/codex/issues

### Where can I request features?
GitHub Discussions: https://github.com/TERRA-TECH-SYSTEMS/codex/discussions

### Is there a community forum?
Join the discussion on GitHub: https://github.com/TERRA-TECH-SYSTEMS/codex/discussions

---

## License

CodeEX is released under the MIT License. See LICENSE file for details.

The included extensions are also MIT licensed:
- Ageixtic Core - MIT
- Quota Manager - MIT
- Session Protector - MIT
