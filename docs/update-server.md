# CodeEX Update Server Configuration

**Date:** 2026-01-11
**Repository:** TERRA-TECH-SYSTEMS/codex

---

## Distribution Channel

CodeEX uses **GitHub Releases** as its update server per the [Application Distribution SOP](/project/sop/APPLICATION_DISTRIBUTION_SOP.md).

---

## Update Endpoints

### Latest Release API
```
https://api.github.com/repos/TERRA-TECH-SYSTEMS/codex/releases/latest
```

### Direct Download URLs

| Platform | URL |
|----------|-----|
| macOS ARM64 | `https://github.com/TERRA-TECH-SYSTEMS/codex/releases/download/v{version}/CodeEX-Ageixtic-IDE-{version}-arm64.dmg` |
| macOS x64 | `https://github.com/TERRA-TECH-SYSTEMS/codex/releases/download/v{version}/CodeEX-Ageixtic-IDE-{version}-x64.dmg` |
| Windows x64 | `https://github.com/TERRA-TECH-SYSTEMS/codex/releases/download/v{version}/CodeEX-Ageixtic-IDE-{version}-win-x64.zip` |
| Linux x64 | `https://github.com/TERRA-TECH-SYSTEMS/codex/releases/download/v{version}/CodeEX-Ageixtic-IDE-{version}-linux-x64.tar.gz` |

---

## Automatic Updates

VS Code/VSCodium-based applications support automatic updates via the `product.json` configuration.

### Configuration for GitHub Releases

Add to `product.json`:

```json
{
  "updateUrl": "https://api.github.com/repos/TERRA-TECH-SYSTEMS/codex/releases/latest",
  "downloadUrl": "https://github.com/TERRA-TECH-SYSTEMS/codex/releases"
}
```

### Note on VSCodium

VSCodium disables Microsoft's update mechanism by default. For custom update handling, consider:
1. Using the built-in extension update mechanism
2. Implementing a custom update checker extension
3. Directing users to the GitHub Releases page

---

## Release Process

### Creating a New Release

1. **Update version numbers**:
   - `application/VERSION`
   - `application/CHANGELOG.md`
   - `application/releases.json`

2. **Tag the release**:
   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

3. **GitHub Actions will automatically**:
   - Build all platforms
   - Sign macOS builds with Developer ID
   - Notarize macOS builds with Apple
   - Create GitHub Release with all artifacts

4. **Verify release**:
   - Check GitHub Actions workflow completed successfully
   - Verify all artifacts are attached to release
   - Test download links

---

## Checksums

All releases include SHA256 checksums generated during the CI build.

### Verify Download (macOS/Linux)
```bash
# Download checksum file
curl -LO https://github.com/TERRA-TECH-SYSTEMS/codex/releases/download/v0.1.0/CodeEX-Ageixtic-IDE-0.1.0-arm64.dmg.sha256

# Verify
shasum -a 256 -c CodeEX-Ageixtic-IDE-0.1.0-arm64.dmg.sha256
```

### Verify Download (Windows PowerShell)
```powershell
(Get-FileHash .\CodeEX-Ageixtic-IDE-0.1.0-win-x64.zip -Algorithm SHA256).Hash
```

---

## Code Signing Status

| Platform | Signed | Notarized |
|----------|--------|-----------|
| macOS ARM64 | Developer ID Application: TERRA TECH SYSTEMS (V2F8RR8GSR) | Apple Notarized |
| macOS x64 | Developer ID Application: TERRA TECH SYSTEMS (V2F8RR8GSR) | Apple Notarized |
| Windows x64 | Pending | N/A |
| Linux x64 | N/A | N/A |

---

## Support

For issues with downloads or updates:
- GitHub Issues: https://github.com/TERRA-TECH-SYSTEMS/codex/issues
- Release Notes: https://github.com/TERRA-TECH-SYSTEMS/codex/releases
