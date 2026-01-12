#!/usr/bin/env node
/**
 * CodeEX Icon Generator
 * Generates PNG icons at all required sizes from SVG source
 * Per SOP: kebab-case naming convention
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const BRANDING_DIR = __dirname;
const ICON_SVG = path.join(BRANDING_DIR, 'icons', 'codex-icon.svg');
const FAVICON_SVG = path.join(BRANDING_DIR, 'favicons', 'codex-favicon.svg');
const ICONS_DIR = path.join(BRANDING_DIR, 'icons');
const FAVICONS_DIR = path.join(BRANDING_DIR, 'favicons');

// Icon sizes for app icons
const ICON_SIZES = [1024, 512, 256, 128, 64, 32, 16];

// Favicon sizes
const FAVICON_SIZES = [512, 192, 180, 32, 16];

// Generate a light mode version (white bg, black logo)
async function generateLightPNG(svgPath, outputPath, size) {
    // Read SVG and modify for light mode
    let svg = fs.readFileSync(svgPath, 'utf8');
    // Force light mode colors
    svg = svg.replace(/@media \(prefers-color-scheme: dark\)[^}]+\{[^}]+\}/g, '');

    await sharp(Buffer.from(svg))
        .resize(size, size)
        .png()
        .toFile(outputPath);

    console.log(`Generated: ${path.basename(outputPath)} (${size}x${size})`);
}

// Generate a dark mode version (dark bg, white logo)
async function generateDarkPNG(svgPath, outputPath, size) {
    // Read SVG and modify for dark mode
    let svg = fs.readFileSync(svgPath, 'utf8');
    // Force dark mode colors
    svg = svg.replace('.bg { fill: #FFFFFF; }', '.bg { fill: #1E1E1E; }');
    svg = svg.replace(/\.(?:logo|icon|favicon)-fill \{ fill: #000000; \}/g, (match) => {
        return match.replace('#000000', '#FFFFFF');
    });

    await sharp(Buffer.from(svg))
        .resize(size, size)
        .png()
        .toFile(outputPath);

    console.log(`Generated: ${path.basename(outputPath)} (${size}x${size})`);
}

async function main() {
    console.log('CodeEX Icon Generator');
    console.log('=====================\n');

    // Generate app icons (light mode - standard)
    console.log('Generating app icons (light mode)...');
    for (const size of ICON_SIZES) {
        const outputPath = path.join(ICONS_DIR, `codex-icon-${size}.png`);
        await generateLightPNG(ICON_SVG, outputPath, size);
    }

    // Generate app icons (dark mode)
    console.log('\nGenerating app icons (dark mode)...');
    for (const size of ICON_SIZES) {
        const outputPath = path.join(ICONS_DIR, `codex-icon-${size}-dark.png`);
        await generateDarkPNG(ICON_SVG, outputPath, size);
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
        await generateLightPNG(FAVICON_SVG, outputPath, size);
    }

    console.log('\nDone! Icons generated successfully.');
    console.log('\nNext steps:');
    console.log('1. Use codex-icon-1024.png to generate codex.icns (macOS)');
    console.log('2. Use codex-icon-256.png to generate codex.ico (Windows)');
    console.log('3. Copy icons to source-code/codex/icons/stable/');
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
