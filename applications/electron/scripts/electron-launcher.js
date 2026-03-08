/**
 * CodeEX Electron Launcher — LOCKED ENGINEERING ARTIFACT
 * ========================================================
 * DO NOT REMOVE. DO NOT BYPASS. DO NOT REFACTOR AWAY.
 *
 * This file exists because ELECTRON_RUN_AS_NODE=1 is set by VS Code,
 * Claude Code, and any Electron-based host in their terminal environments.
 * That single variable forces the Electron binary to run as plain Node.js,
 * disabling ALL Electron APIs: app, BrowserWindow, dialog, ipcMain, etc.
 *
 * Without this launcher:
 *   - require('electron') returns a STRING (path to electron.exe)
 *   - process.type is undefined (should be 'browser')
 *   - process.electronBinding is undefined
 *   - app.requestSingleInstanceLock() throws TypeError
 *   - The IDE does not launch. Period.
 *
 * This was the ROOT CAUSE that killed CodeEX v4.
 * Diagnosed and permanently fixed in CodeEX v5, 2026-03-06.
 *
 * LOCKED BY: Tanen Andrews, 2026-03-06
 * ARTIFACT ID: CODEX-LAUNCHER-001
 */

'use strict';

const proc = require('child_process');
const electronPath = require('electron');

// === MANDATORY ENVIRONMENT SANITIZATION ===
// Strip variables that sabotage Electron startup
delete process.env.ELECTRON_RUN_AS_NODE;
delete process.env.NoDefaultCurrentDirectoryInExePath;

// Forward all arguments after this script to the Electron main entry
const child = proc.spawn(electronPath, process.argv.slice(2), {
    stdio: 'inherit',
    windowsHide: false,
    env: process.env
});

child.on('close', function (code, signal) {
    if (code === null) {
        console.error('CodeEX: Electron exited with signal', signal);
        process.exit(1);
    }
    process.exit(code);
});

const handleTerminationSignal = function (signal) {
    process.on(signal, function () {
        if (!child.killed) {
            child.kill(signal);
        }
    });
};

handleTerminationSignal('SIGINT');
handleTerminationSignal('SIGTERM');
