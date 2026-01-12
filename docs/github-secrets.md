# GitHub Repository Secrets for CodeEX CI/CD

**Date:** 2026-01-11
**Repository:** TERRA-TECH-SYSTEMS/codex

## Required Secrets

Configure these secrets in GitHub Repository Settings → Secrets and variables → Actions:

### Apple Code Signing

| Secret | Description | How to Get |
|--------|-------------|------------|
| `MACOS_CERTIFICATE` | Base64-encoded .p12 certificate | Export from Keychain Access |
| `MACOS_CERTIFICATE_PWD` | Password for .p12 file | Set when exporting |
| `KEYCHAIN_PWD` | Temporary keychain password | Generate a random string |

### Apple Notarization

| Secret | Description | Value |
|--------|-------------|-------|
| `APPLE_ID` | Apple ID email | tanenankh@gmail.com |
| `APPLE_TEAM_ID` | Developer Team ID | V2F8RR8GSR |
| `APPLE_APP_PASSWORD` | App-specific password | Generate at appleid.apple.com |

## Export Certificate for CI

1. Open **Keychain Access**
2. Find "Developer ID Application: TERRA TECH SYSTEMS"
3. Right-click → Export
4. Save as `.p12` format with a strong password
5. Convert to Base64:
   ```bash
   base64 -i certificate.p12 | pbcopy
   ```
6. Paste the output as `MACOS_CERTIFICATE` secret

## Trigger a Build

### Manual Build
1. Go to Actions tab in GitHub
2. Select "Build and Release CodeEX"
3. Click "Run workflow"
4. Enter version (e.g., 0.2.0)
5. Click "Run workflow"

### Tagged Release
```bash
git tag v0.2.0
git push origin v0.2.0
```

This will:
1. Build all platforms in parallel
2. Sign and notarize macOS builds
3. Create GitHub Release with all artifacts

## Workflow Files

- `.github/workflows/build-release.yml` - Main build workflow

## Build Matrix

| Platform | Runner | Architecture |
|----------|--------|--------------|
| macOS ARM64 | macos-14 | Apple Silicon |
| macOS x64 | macos-13 | Intel |
| Windows | windows-latest | x64 |
| Linux | ubuntu-latest | x64 |
