# CodeEX Brand Assets

## Document Metadata
| Field | Value |
|-------|-------|
| **Component** | Brand Assets |
| **Category** | Design / Branding |
| **Last Updated** | 2026-01-11 |

---

## Folder Structure

```
branding/
├── logos/                    # Main brand logos (SVG)
│   ├── codex-logo-dark.svg           # Logo for dark backgrounds
│   ├── codex-logo-light.svg          # Logo for light backgrounds
│   ├── codex-logo-full-dark.svg      # Logo + "CodeEX" text (dark bg)
│   └── codex-logo-full-light.svg     # Logo + "CodeEX" text (light bg)
│
├── icons/                    # App icons (high quality PNG/ICNS)
│   ├── codex.icns                    # macOS app icon
│   ├── codex.ico                     # Windows app icon
│   ├── codex-512.png                 # 512x512
│   ├── codex-256.png                 # 256x256
│   ├── codex-128.png                 # 128x128
│   └── codex-64.png                  # 64x64
│
├── favicons/                 # Browser favicons (for web presence)
│   ├── favicon.ico                   # Multi-size ICO (16, 32, 48)
│   ├── favicon-16x16.png             # 16x16
│   ├── favicon-32x32.png             # 32x32
│   ├── apple-touch-icon.png          # 180x180
│   ├── android-chrome-192x192.png    # 192x192
│   └── android-chrome-512x512.png    # 512x512
│
├── images/                   # General images
│   ├── welcome-background.png        # Welcome page background
│   ├── splash-screen.png             # Splash screen (if applicable)
│   └── og-image.png                  # Social preview (1200x630)
│
└── README.md                 # This file
```

---

## VS Code / CodeEX Branding Customization Points

### 1. Application Icon

**Location in Build:** `resources/` folder during build process

| Platform | File | Format | Sizes |
|----------|------|--------|-------|
| macOS | codex.icns | ICNS | 16, 32, 64, 128, 256, 512, 1024 |
| Windows | codex.ico | ICO | 16, 24, 32, 48, 64, 128, 256 |
| Linux | codex.png | PNG | Various sizes |

**How to create ICNS (macOS):**
```bash
# From a 1024x1024 PNG source
mkdir codex.iconset
sips -z 16 16     codex-1024.png --out codex.iconset/icon_16x16.png
sips -z 32 32     codex-1024.png --out codex.iconset/icon_16x16@2x.png
sips -z 32 32     codex-1024.png --out codex.iconset/icon_32x32.png
sips -z 64 64     codex-1024.png --out codex.iconset/icon_32x32@2x.png
sips -z 128 128   codex-1024.png --out codex.iconset/icon_128x128.png
sips -z 256 256   codex-1024.png --out codex.iconset/icon_128x128@2x.png
sips -z 256 256   codex-1024.png --out codex.iconset/icon_256x256.png
sips -z 512 512   codex-1024.png --out codex.iconset/icon_256x256@2x.png
sips -z 512 512   codex-1024.png --out codex.iconset/icon_512x512.png
sips -z 1024 1024 codex-1024.png --out codex.iconset/icon_512x512@2x.png
iconutil -c icns codex.iconset
```

### 2. Product Configuration (product.json)

**Already configured in prepare_vscode.sh:**
```json
{
  "nameShort": "CodeEX",
  "nameLong": "CodeEX - Ageixtic IDE",
  "applicationName": "codex",
  "darwinBundleIdentifier": "ai.terratech.codex",
  "win32AppUserModelId": "TerraTech.CodeEX"
}
```

### 3. Welcome Page

**Location:** `src/vs/workbench/contrib/welcomeGettingStarted/`

Custom welcome content can be added to show CodeEX/AGEIXTIC branding on first launch.

### 4. About Dialog

Shows application name, version, and commit info. Automatically uses product.json values.

---

## Color System

### CodeEX Brand Colors (Proposed)

| Color | Hex | Usage |
|-------|-----|-------|
| Primary | TBD | Logo, primary actions |
| Secondary | TBD | Accents |
| Background Dark | TBD | Dark theme base |
| Background Light | TBD | Light theme base |

### AGEIXTIC Brand Colors (Reference)

| Color | Hex | Usage |
|-------|-----|-------|
| Primary | #000000 | Logo, headings |
| White | #FFFFFF | Text on dark |

---

## File Specifications

### Application Icon Source

**Requirements:**
- Master size: 1024x1024 pixels (minimum)
- Format: PNG-24 with transparency
- Clear, recognizable at 16x16 pixels
- Works on both light and dark system themes

**Design Guidelines:**
- Simple, bold shapes
- Avoid fine details (lost at small sizes)
- Consider rounded corners for macOS consistency
- Test at 16x16, 32x32, 128x128 before finalizing

### Logo Files (SVG)

**Requirements:**
- ViewBox defined (e.g., `viewBox="0 0 200 50"`)
- No embedded raster images
- Use `currentColor` for CSS color control where possible
- Optimized (remove metadata)

**Example SVG Structure:**
```svg
<svg viewBox="0 0 200 50" xmlns="http://www.w3.org/2000/svg">
  <path fill="currentColor" d="M..."/>
</svg>
```

---

## Build Integration

### Where Icons Go in VSCodium Build

After creating icon files, they need to be placed in:

```
codex/
├── icons/
│   └── stable/
│       ├── codex.icns          # macOS
│       ├── codex.ico           # Windows
│       └── codex.png           # Linux (multiple sizes)
```

The `prepare_vscode.sh` script references these during the build process.

### Icon Replacement Script (Example)

```bash
# Copy branded icons to build location
cp branding/icons/codex.icns icons/stable/
cp branding/icons/codex.ico icons/stable/
cp branding/icons/codex-512.png icons/stable/codex.png
```

---

## Quality Checklist

### Before Build

- [ ] App icon created at 1024x1024 source
- [ ] ICNS generated for macOS
- [ ] ICO generated for Windows
- [ ] PNGs exported for Linux
- [ ] Logo SVGs created (light/dark variants)
- [ ] All icons tested at small sizes (16x16, 32x32)
- [ ] Icons work on both light and dark system themes

### Image Optimization Tools

- **PNG:** TinyPNG, ImageOptim
- **SVG:** SVGO, SVGOMG
- **ICNS:** iconutil (macOS built-in)
- **ICO:** ImageMagick, online converters

---

## Related Documentation

- [CODEX.md](../CODEX.md) - Main CodeEX service documentation
- [BRANDING_TASKS.md](BRANDING_TASKS.md) - Branding task checklist
- [prepare_vscode.sh](../source-code/codex/prepare_vscode.sh) - Build script with branding
