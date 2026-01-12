# CodeEX - Ageixtic IDE

A customized VS Code-based IDE by TERRA TECH SYSTEMS with integrated AI capabilities.

## Features

- **Ageixtic Core** - Ollama AI integration for code assistance
- **Quota Manager** - Token usage tracking and limits
- **Session Protector** - Workspace state preservation

## Downloads

All releases are available at [GitHub Releases](https://github.com/TERRA-TECH-SYSTEMS/codex/releases).

| Platform | Download |
|----------|----------|
| macOS Apple Silicon | [CodeEX-Ageixtic-IDE-0.1.0-arm64.dmg](https://github.com/TERRA-TECH-SYSTEMS/codex/releases/download/v0.1.0/CodeEX-Ageixtic-IDE-0.1.0-arm64.dmg) |
| macOS Intel | [CodeEX-Ageixtic-IDE-0.1.0-x64.dmg](https://github.com/TERRA-TECH-SYSTEMS/codex/releases/download/v0.1.0/CodeEX-Ageixtic-IDE-0.1.0-x64.dmg) |
| Windows x64 | [CodeEX-Ageixtic-IDE-0.1.0-win-x64.zip](https://github.com/TERRA-TECH-SYSTEMS/codex/releases/download/v0.1.0/CodeEX-Ageixtic-IDE-0.1.0-win-x64.zip) |
| Linux x64 | [CodeEX-Ageixtic-IDE-0.1.0-linux-x64.tar.gz](https://github.com/TERRA-TECH-SYSTEMS/codex/releases/download/v0.1.0/CodeEX-Ageixtic-IDE-0.1.0-linux-x64.tar.gz) |

> **Note:** macOS builds are signed with Developer ID and notarized by Apple.

## Installation

### macOS
1. Download the DMG file
2. Open the DMG
3. Drag CodeEX to Applications
4. Launch from Applications folder

## Building from Source

See [docs/apple-dev.md](docs/apple-dev.md) for code signing setup.

### Prerequisites
- Node.js 20+
- Python 3.11+
- Rust (for CLI)

### Build
```bash
cd source-code/codex
./get_repo.sh
./build.sh
```

## License

MIT License - TERRA TECH SYSTEMS

## Version

Current: 0.1.0
