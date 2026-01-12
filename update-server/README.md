# CodeEX Auto-Update Server

This folder contains the update manifest for CodeEX automatic updates.

## How It Works

1. CodeEX checks the update endpoint on startup
2. Compares current version with manifest version
3. If newer version available, prompts user to download

## Deployment

Host these files at `https://codex.terratech.systems/`:

```
/releases/
  CodeEX-Ageixtic-IDE-{version}-arm64.dmg
  CodeEX-Ageixtic-IDE-{version}-x64.dmg
  CodeEX-Ageixtic-IDE-{version}-win.exe
  CodeEX-Ageixtic-IDE-{version}-linux.AppImage
/api/
  update/darwin-arm64 -> returns update-manifest.json
  update/darwin-x64 -> returns update-manifest-x64.json
  update/win32-x64 -> returns update-manifest-win.json
  update/linux-x64 -> returns update-manifest-linux.json
```

## Generate SHA256 Hash

```bash
shasum -a 256 CodeEX-Ageixtic-IDE-0.1.0-arm64.dmg
```

## Configure in product.json

Set `updateUrl` to: `https://codex.terratech.systems/api/update`

## Manual Update (Current)

Until the update server is deployed, users can:
1. Check releases at https://github.com/TERRA-TECH-SYSTEMS/codex/releases
2. Download the latest DMG
3. Drag to Applications (replacing existing)
