<div id="codex-logo" align="center">
    <br />
    <img src="./icons/stable/codium_cnl.svg" alt="CodeEX Logo" width="200"/>
    <h1>CodeEX</h1>
    <h3>Ageixtic IDE - VS Code Fork with Built-in AI Integration</h3>
</div>

<div id="badges" align="center">

[![current release](https://img.shields.io/github/release/TERRA-TECH-SYSTEMS/codex.svg)](https://github.com/TERRA-TECH-SYSTEMS/codex/releases)
[![license](https://img.shields.io/github/license/TERRA-TECH-SYSTEMS/codex.svg)](https://github.com/TERRA-TECH-SYSTEMS/codex/blob/main/LICENSE)

</div>

**CodeEX is TerraTech's custom VS Code fork with built-in AGEIXTIC AI integration, local LLM support, and memory hierarchy integration.**

Based on [VSCodium](https://github.com/VSCodium/vscodium) build scripts with custom branding and AGEIXTIC extensions.

## Features

- **Zero Telemetry** - All Microsoft telemetry disabled
- **Open VSX Marketplace** - Access to community extensions
- **AGEIXTIC Integration** - Built-in AI memory and context management
- **Local LLM Support** - Ollama integration for offline AI
- **Quota Management** - RPM/TPM tracking and warnings
- **Session Protection** - Incremental saves and recovery

## Download/Install

Download latest release: [Releases](https://github.com/TERRA-TECH-SYSTEMS/codex/releases)

### macOS

```bash
# Coming soon: Homebrew
# brew install --cask codex
```

### Linux

```bash
# Coming soon: Package managers
```

### Windows

```bash
# Coming soon: WinGet/Chocolatey
```

## Build from Source

### Prerequisites

- Node.js >= 20.x
- Python 3 (for node-gyp)
- Git
- 8GB+ RAM

### macOS

```bash
xcode-select --install
git clone https://github.com/TERRA-TECH-SYSTEMS/codex.git
cd codex
./build.sh
```

### Linux

```bash
sudo apt install build-essential g++ libx11-dev libxkbfile-dev libsecret-1-dev
git clone https://github.com/TERRA-TECH-SYSTEMS/codex.git
cd codex
./build.sh
```

## Extension Marketplace

CodeEX uses [Open VSX](https://open-vsx.org) as the extension marketplace.

**Note:** Microsoft proprietary extensions (C/C++, C# Dev Kit, Live Share, Remote Development) are not available. Community alternatives:
- C/C++: Use `clangd` extension
- C#: Use OmniSharp
- Remote SSH: Use `jeanp413.open-remote-ssh`

## Bundled Extensions

| Extension | Purpose |
|-----------|---------|
| Ageixtic Core | AMH integration, context injection |
| Local LLM Panel | Ollama interface, model selection |
| Quota Manager | RPM/TPM tracking, warnings |
| Session Protector | Incremental saves, recovery |

## Documentation

- [Building from Source](./docs/index.md)
- [Extension Compatibility](./docs/extensions.md)
- [Troubleshooting](./docs/troubleshooting.md)

## License

[MIT License](./LICENSE)

## Credits

- Based on [Microsoft VS Code](https://github.com/microsoft/vscode) (MIT)
- Build system from [VSCodium](https://github.com/VSCodium/vscodium) (MIT)
- Part of the [AGEIXTIC Project](https://ageixtic.ai)

---

*Developed by TerraTech Systems*
