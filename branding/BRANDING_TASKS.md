# CodeEX Branding Tasks

## Document Metadata
| Field | Value |
|-------|-------|
| **Phase** | Phase 2 |
| **Status** | PENDING |
| **Assigned To** | TerraTech Systems (User) |
| **Tools** | Affinity Designer, Affinity Photo |
| **Output Location** | /services/codex/branding/ |

---

## Overview

This checklist outlines all branding assets required for CodeEX IDE. Complete these tasks during **Phase 2** of CodeEX development.

---

## Task 1: Create Application Icon

### 1.1 Design Master Icon
- [ ] Open Affinity Designer
- [ ] Create/finalize CodeEX icon design
- [ ] Ensure icon is recognizable at 16x16 pixels
- [ ] Works on both light and dark system themes
- [ ] Save source file: `branding/codex-icon.afdesign`

### 1.2 Export Icon Source
**Export Location:** `branding/icons/`

| Task | Filename | Dimensions | Format |
|------|----------|------------|--------|
| [ ] | codex-1024.png | 1024x1024 | PNG |
| [ ] | codex-512.png | 512x512 | PNG |
| [ ] | codex-256.png | 256x256 | PNG |
| [ ] | codex-128.png | 128x128 | PNG |
| [ ] | codex-64.png | 64x64 | PNG |
| [ ] | codex-32.png | 32x32 | PNG |
| [ ] | codex-16.png | 16x16 | PNG |

### 1.3 Generate Platform Icons
**macOS (ICNS):**
- [ ] Run iconutil to create `codex.icns` from iconset

**Windows (ICO):**
- [ ] Generate `codex.ico` with 16, 24, 32, 48, 64, 128, 256 sizes

---

## Task 2: Create Logo Files

### 2.1 Design Master Logo
- [ ] Open Affinity Designer
- [ ] Create CodeEX logo design
- [ ] Include both icon-only and icon+text variants
- [ ] Save source file: `branding/codex-logo.afdesign`

### 2.2 Export Logo Variants
**Export Location:** `branding/logos/`

| Task | Filename | Format | Background |
|------|----------|--------|------------|
| [ ] | codex-logo-light.svg | SVG | For light backgrounds |
| [ ] | codex-logo-dark.svg | SVG | For dark backgrounds |
| [ ] | codex-logo-full-light.svg | SVG | Logo + "CodeEX" text (light bg) |
| [ ] | codex-logo-full-dark.svg | SVG | Logo + "CodeEX" text (dark bg) |

**Affinity Designer Export Settings:**
1. File → Export
2. Format: SVG
3. Preset: SVG (for export)
4. Check: Flatten transforms
5. Check: Convert text to curves

---

## Task 3: Create Favicon (for web presence)

### 3.1 Export Favicon Source
**Export Location:** `branding/favicons/`

| Task | Filename | Dimensions | Format |
|------|----------|------------|--------|
| [ ] | favicon-source.png | 1024x1024 | PNG |

### 3.2 Generate All Favicon Sizes
- [ ] Go to https://realfavicongenerator.net
- [ ] Upload `favicon-source.png`
- [ ] Configure settings for each platform
- [ ] Download favicon package
- [ ] Extract to `branding/favicons/`

**Required Output Files:**
| Task | Filename | Size |
|------|----------|------|
| [ ] | favicon.ico | 16, 32, 48 |
| [ ] | favicon-16x16.png | 16x16 |
| [ ] | favicon-32x32.png | 32x32 |
| [ ] | apple-touch-icon.png | 180x180 |
| [ ] | android-chrome-192x192.png | 192x192 |
| [ ] | android-chrome-512x512.png | 512x512 |

---

## Task 4: Create Welcome/Splash Images (Optional)

### 4.1 Welcome Background
- [ ] Create welcome page background (1920x1080)
- [ ] Export as `branding/images/welcome-background.png`

### 4.2 Open Graph Image
- [ ] Create social preview image (1200x630)
- [ ] Include: CodeEX logo, tagline
- [ ] Export as `branding/images/og-image.png`

---

## Task 5: Integrate Icons into Build

### 5.1 Copy Icons to Build Location
After creating all icons:
```bash
# Create icons directory in source
mkdir -p source-code/codex/icons/stable/

# Copy icons
cp branding/icons/codex.icns source-code/codex/icons/stable/
cp branding/icons/codex.ico source-code/codex/icons/stable/
cp branding/icons/codex-512.png source-code/codex/icons/stable/codex.png
```

### 5.2 Rebuild CodeEX
- [ ] Run build with new icons
- [ ] Verify icon appears correctly in:
  - [ ] macOS Dock
  - [ ] macOS Finder
  - [ ] Application switcher (Cmd+Tab)
  - [ ] About dialog

---

## Task 6: Optimize All Files

### 6.1 Optimize Images
- [ ] Run PNGs through TinyPNG or ImageOptim
- [ ] Verify file sizes are reasonable
- [ ] Check total branding folder size

### 6.2 Optimize SVGs
- [ ] Ensure no embedded raster images in SVGs
- [ ] Remove unnecessary metadata
- [ ] Verify SVGs render correctly in browser

---

## Final Checklist

### Files Verification
**icons/**
- [ ] codex-1024.png exists
- [ ] codex.icns exists (macOS)
- [ ] codex.ico exists (Windows)

**logos/**
- [ ] codex-logo-light.svg exists
- [ ] codex-logo-dark.svg exists
- [ ] codex-logo-full-light.svg exists
- [ ] codex-logo-full-dark.svg exists

**favicons/**
- [ ] favicon.ico exists
- [ ] favicon-16x16.png exists
- [ ] favicon-32x32.png exists

### Quality Checks
- [ ] Icon recognizable at 16x16
- [ ] Icon works on light system theme
- [ ] Icon works on dark system theme
- [ ] Logo displays correctly on light backgrounds
- [ ] Logo displays correctly on dark backgrounds
- [ ] No visible compression artifacts

---

## Notify GIXSIS When Complete

When all tasks are complete:
1. Confirm all files are in `/services/codex/branding/`
2. Tell GIXSIS: "CodeEX branding assets are ready"
3. GIXSIS will integrate into build and verify

---

## Reference Links

- **Asset Specifications:** `ASSETS_README.md`
- **Favicon Generator:** https://realfavicongenerator.net
- **Image Optimizer:** https://squoosh.app
- **SVG Optimizer:** https://jakearchibald.github.io/svgomg/
- **ICNS Generator:** macOS `iconutil` command
