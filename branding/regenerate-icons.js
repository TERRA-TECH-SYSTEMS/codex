#!/usr/bin/env node
/**
 * CodeEX Icon Regenerator
 * Generates PNG icons at all required sizes from the new logo SVG files
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const BRANDING_DIR = __dirname;
const LOGO_LIGHT = path.join(BRANDING_DIR, 'logos', 'codex-logo-light.svg');
const LOGO_DARK = path.join(BRANDING_DIR, 'logos', 'codex-logo-dark.svg');
const ICONS_DIR = path.join(BRANDING_DIR, 'icons');
const FAVICONS_DIR = path.join(BRANDING_DIR, 'favicons');

// Icon sizes for app icons
const ICON_SIZES = [1024, 512, 256, 128, 64, 32, 16];

// Favicon sizes
const FAVICON_SIZES = [512, 192, 180, 32, 16];

async function generatePNG(svgPath, outputPath, size) {
    const svg = fs.readFileSync(svgPath);

    await sharp(svg)
        .resize(size, size)
        .png()
        .toFile(outputPath);

    console.log(`Generated: ${path.basename(outputPath)} (${size}x${size})`);
}

async function main() {
    console.log('CodeEX Icon Regenerator');
    console.log('=======================\n');
    console.log('Using new logos from logos/ directory\n');

    // Verify source files exist
    if (!fs.existsSync(LOGO_LIGHT)) {
        console.error(`Error: ${LOGO_LIGHT} not found`);
        process.exit(1);
    }
    if (!fs.existsSync(LOGO_DARK)) {
        console.error(`Error: ${LOGO_DARK} not found`);
        process.exit(1);
    }

    // Ensure output directories exist
    if (!fs.existsSync(ICONS_DIR)) fs.mkdirSync(ICONS_DIR, { recursive: true });
    if (!fs.existsSync(FAVICONS_DIR)) fs.mkdirSync(FAVICONS_DIR, { recursive: true });

    // Generate app icons (light mode - white background, black logo)
    console.log('Generating app icons (light mode)...');
    for (const size of ICON_SIZES) {
        const outputPath = path.join(ICONS_DIR, `codex-icon-${size}.png`);
        await generatePNG(LOGO_LIGHT, outputPath, size);
    }

    // Generate app icons (dark mode - black background, white logo)
    console.log('\nGenerating app icons (dark mode)...');
    for (const size of ICON_SIZES) {
        const outputPath = path.join(ICONS_DIR, `codex-icon-${size}-dark.png`);
        await generatePNG(LOGO_DARK, outputPath, size);
    }

    // Generate favicons (light mode)
    console.log('\nGenerating favicons (light mode)...');
    for (const size of FAVICON_SIZES) {
        let filename;
        if (size === 180) {
            filename = 'apple-touch-icon.png';
        } else if (size === 192) {
            filename = 'android-chrome-192x192.png';
        } else if (size === 512) {
            filename = 'android-chrome-512x512.png';
        } else {
            filename = `favicon-${size}x${size}.png`;
        }
        const outputPath = path.join(FAVICONS_DIR, filename);
        await generatePNG(LOGO_LIGHT, outputPath, size);
    }

    // Copy the logo SVG as the icon source SVG for future reference
    const iconSvgDest = path.join(ICONS_DIR, 'codex-icon.svg');
    fs.copyFileSync(LOGO_LIGHT, iconSvgDest);
    console.log(`\nCopied logo as: icons/codex-icon.svg`);

    console.log('\nDone! Icons generated successfully.');
    console.log('\nNext steps:');
    console.log('1. Generate codex.icns from codex-icon-1024.png for macOS');
    console.log('2. Run: sips -s format icns icons/codex-icon-1024.png --out icons/codex.icns');
    console.log('3. Copy icons to VSCodium build: codex-build/icons/stable/');
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
