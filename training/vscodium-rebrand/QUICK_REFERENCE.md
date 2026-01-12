# VSCodium Rebrand Quick Reference

**Topic:** Custom IDE from VSCodium Base
**Last Updated:** 2026-01-12
**SOP Compliance:** Parity First (Option 3)

---

## Approach Overview

Per SOP **Parity First** principle, the approved method for creating a custom IDE:

1. **Download** pre-built VSCodium release
2. **Rebrand** (rename app, update metadata)
3. **Install** bundled extensions
4. **Sign & Notarize** (macOS only)
5. **Package** for distribution

This approach is preferred over building from source because:
- VSCodium build infrastructure is complex
- Pre-built releases are tested and stable
- Rebranding is straightforward
- Faster CI/CD pipeline

---

## Platform-Specific Rebranding

### macOS

**Files to modify:**
- `Contents/Info.plist` - App metadata

**Commands:**
```bash
# Rename app bundle
mv "VSCodium.app" "CodeEX.app"

# Update Info.plist
/usr/libexec/PlistBuddy -c "Set :CFBundleName 'CodeEX'" Info.plist
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName 'CodeEX - Ageixtic IDE'" Info.plist
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier 'com.terratech.codex'" Info.plist
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString '0.1.0'" Info.plist
```

**Code Signing:**
```bash
# Sign nested binaries first
find "$APP_PATH" \( -name "*.node" -o -name "*.dylib" \) -type f | while read file; do
  codesign --force --options runtime --timestamp --sign "$CERT_NAME" "$file"
done

# Sign frameworks
find "$APP_PATH/Contents/Frameworks" -name "*.framework" -type d | while read fw; do
  codesign --force --deep --options runtime --timestamp --sign "$CERT_NAME" "$fw"
done

# Sign main app
codesign --force --deep --options runtime --timestamp --sign "$CERT_NAME" "$APP_PATH"
```

### Windows

**Files to modify:**
- `resources/app/product.json` - Product metadata

**PowerShell:**
```powershell
$productPath = "resources/app/product.json"
$product = Get-Content $productPath | ConvertFrom-Json
$product.nameShort = "CodeEX"
$product.nameLong = "CodeEX - Ageixtic IDE"
$product.applicationName = "codex"
$product.win32AppId = "{{CODEX-AGEIXTIC-IDE}}"
$product | ConvertTo-Json -Depth 10 | Set-Content $productPath
```

### Linux

**Files to modify:**
- `resources/app/product.json` - Product metadata

**Bash:**
```bash
PRODUCT_PATH="resources/app/product.json"
jq '.nameShort = "CodeEX" | .nameLong = "CodeEX - Ageixtic IDE" | .applicationName = "codex"' \
  "$PRODUCT_PATH" > tmp.json && mv tmp.json "$PRODUCT_PATH"

# Rename binary
mv codium codex
```

---

## Installing Bundled Extensions

Extensions go in: `resources/app/extensions/` (Windows/Linux) or `Contents/Resources/app/extensions/` (macOS)

```bash
for ext in extensions/*/; do
  if [ -f "$ext/package.json" ]; then
    ext_name=$(basename "$ext")
    cp -r "$ext" "$EXT_DIR/$ext_name/"
  fi
done
```

---

## VSCodium Version Selection

Check latest releases: https://github.com/VSCodium/vscodium/releases

**Download URLs:**
```
https://github.com/VSCodium/vscodium/releases/download/{VERSION}/VSCodium-darwin-arm64-{VERSION}.zip
https://github.com/VSCodium/vscodium/releases/download/{VERSION}/VSCodium-darwin-x64-{VERSION}.zip
https://github.com/VSCodium/vscodium/releases/download/{VERSION}/VSCodium-win32-x64-{VERSION}.zip
https://github.com/VSCodium/vscodium/releases/download/{VERSION}/VSCodium-linux-x64-{VERSION}.tar.gz
```

---

## CI/CD Workflow

See: `.github/workflows/build-release.yml`

**Triggers:**
- Tag push (`v*`)
- Manual dispatch with version inputs

**Jobs:**
1. `build-macos-arm64` - Apple Silicon (includes signing & notarization)
2. `build-macos-x64` - Intel Mac (includes signing & notarization)
3. `build-windows` - Windows x64
4. `build-linux` - Linux x64
5. `create-release` - Creates GitHub Release (tag push only)

---

## Full Documentation

- **Apple Developer Guide:** `training/apple-developer/QUICK_REFERENCE.md`
- **Code Signing Guide:** `training/code-signing/QUICK_REFERENCE.md`
- **GitHub Actions Guide:** `training/github-actions/QUICK_REFERENCE.md`
- **CodeEX Extensions:** `services/codex/extensions/`
