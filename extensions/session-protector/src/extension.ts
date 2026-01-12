import * as vscode from 'vscode';
import { SessionManager } from './session-manager';
import { SessionsProvider } from './sessions-provider';
import { CurrentSessionProvider } from './current-session-provider';

let sessionManager: SessionManager;
let autoSaveInterval: NodeJS.Timeout | undefined;
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
    console.log('Session Protector extension is now active');

    // Initialize session manager
    sessionManager = new SessionManager(context);

    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 40);
    statusBarItem.command = 'sessionProtector.saveSession';
    statusBarItem.text = '$(save) Session';
    statusBarItem.tooltip = 'Click to save session';
    context.subscriptions.push(statusBarItem);

    const config = vscode.workspace.getConfiguration('sessionProtector');
    if (config.get<boolean>('autoSaveEnabled', true)) {
        statusBarItem.show();
    }

    // Register providers
    const sessionsProvider = new SessionsProvider(context, sessionManager);
    const currentSessionProvider = new CurrentSessionProvider();

    vscode.window.registerTreeDataProvider('sessionProtector.sessions', sessionsProvider);
    vscode.window.registerTreeDataProvider('sessionProtector.current', currentSessionProvider);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('sessionProtector.saveSession', async () => {
            const name = await vscode.window.showInputBox({
                prompt: 'Session name (leave empty for auto-name)',
                placeHolder: 'My Session'
            });

            const sessionName = name || `Session ${new Date().toLocaleString()}`;
            await sessionManager.saveSession(sessionName);
            sessionsProvider.refresh();
            updateStatusBar('saved');
            vscode.window.showInformationMessage(`Session "${sessionName}" saved.`);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sessionProtector.restoreSession', async () => {
            const sessions = sessionManager.listSessions();
            if (sessions.length === 0) {
                vscode.window.showInformationMessage('No saved sessions found.');
                return;
            }

            const selected = await vscode.window.showQuickPick(
                sessions.map(s => ({
                    label: s.name,
                    description: new Date(s.timestamp).toLocaleString(),
                    detail: `${s.openEditors.length} editors, ${s.terminals?.length || 0} terminals`,
                    session: s
                })),
                { placeHolder: 'Select a session to restore' }
            );

            if (selected) {
                await sessionManager.restoreSession(selected.session.id);
                vscode.window.showInformationMessage(`Session "${selected.label}" restored.`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sessionProtector.listSessions', () => {
            vscode.commands.executeCommand('workbench.view.extension.session-protector');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sessionProtector.deleteSession', async (item?: any) => {
            if (item && item.sessionId) {
                const confirm = await vscode.window.showWarningMessage(
                    `Delete session "${item.label}"?`,
                    'Delete',
                    'Cancel'
                );
                if (confirm === 'Delete') {
                    sessionManager.deleteSession(item.sessionId);
                    sessionsProvider.refresh();
                    vscode.window.showInformationMessage('Session deleted.');
                }
            } else {
                const sessions = sessionManager.listSessions();
                const selected = await vscode.window.showQuickPick(
                    sessions.map(s => ({ label: s.name, id: s.id })),
                    { placeHolder: 'Select a session to delete' }
                );
                if (selected) {
                    sessionManager.deleteSession(selected.id);
                    sessionsProvider.refresh();
                    vscode.window.showInformationMessage('Session deleted.');
                }
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sessionProtector.exportSession', async () => {
            const sessions = sessionManager.listSessions();
            const selected = await vscode.window.showQuickPick(
                sessions.map(s => ({ label: s.name, session: s })),
                { placeHolder: 'Select a session to export' }
            );

            if (selected) {
                const uri = await vscode.window.showSaveDialog({
                    defaultUri: vscode.Uri.file(`${selected.label.replace(/[^a-z0-9]/gi, '_')}.json`),
                    filters: { 'JSON': ['json'] }
                });
                if (uri) {
                    await vscode.workspace.fs.writeFile(
                        uri,
                        Buffer.from(JSON.stringify(selected.session, null, 2))
                    );
                    vscode.window.showInformationMessage(`Session exported to ${uri.fsPath}`);
                }
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sessionProtector.importSession', async () => {
            const uri = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectMany: false,
                filters: { 'JSON': ['json'] }
            });

            if (uri && uri[0]) {
                try {
                    const content = await vscode.workspace.fs.readFile(uri[0]);
                    const session = JSON.parse(Buffer.from(content).toString());
                    sessionManager.importSession(session);
                    sessionsProvider.refresh();
                    vscode.window.showInformationMessage('Session imported successfully.');
                } catch (error) {
                    vscode.window.showErrorMessage('Failed to import session. Invalid file format.');
                }
            }
        })
    );

    // Restore session command from tree view
    context.subscriptions.push(
        vscode.commands.registerCommand('sessionProtector.restoreSessionById', async (item: any) => {
            if (item && item.sessionId) {
                await sessionManager.restoreSession(item.sessionId);
                vscode.window.showInformationMessage(`Session "${item.label}" restored.`);
            }
        })
    );

    // Setup auto-save
    setupAutoSave(context, sessionsProvider);

    // Listen for config changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('sessionProtector')) {
                setupAutoSave(context, sessionsProvider);
            }
        })
    );

    // Save on close if enabled
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            const config = vscode.workspace.getConfiguration('sessionProtector');
            if (config.get<boolean>('saveOnClose', true)) {
                sessionManager.saveSession('Auto-save (workspace change)');
            }
        })
    );

    // Restore on open if enabled
    const restoreConfig = vscode.workspace.getConfiguration('sessionProtector');
    if (restoreConfig.get<boolean>('restoreOnOpen', false)) {
        const sessions = sessionManager.listSessions();
        if (sessions.length > 0) {
            sessionManager.restoreSession(sessions[0].id);
        }
    }
}

function setupAutoSave(context: vscode.ExtensionContext, sessionsProvider: SessionsProvider) {
    // Clear existing interval
    if (autoSaveInterval) {
        clearInterval(autoSaveInterval);
        autoSaveInterval = undefined;
    }

    const config = vscode.workspace.getConfiguration('sessionProtector');
    const enabled = config.get<boolean>('autoSaveEnabled', true);
    const interval = config.get<number>('autoSaveInterval', 5) * 60 * 1000; // Convert to ms

    if (enabled && interval > 0) {
        statusBarItem.show();
        autoSaveInterval = setInterval(async () => {
            await sessionManager.saveSession('Auto-save');
            sessionsProvider.refresh();
            updateStatusBar('auto-saved');
        }, interval);
    } else {
        statusBarItem.hide();
    }
}

function updateStatusBar(status: 'saved' | 'auto-saved' | 'normal' = 'normal') {
    if (status === 'saved') {
        statusBarItem.text = '$(check) Saved';
        setTimeout(() => {
            statusBarItem.text = '$(save) Session';
        }, 2000);
    } else if (status === 'auto-saved') {
        statusBarItem.text = '$(sync) Auto-saved';
        setTimeout(() => {
            statusBarItem.text = '$(save) Session';
        }, 2000);
    } else {
        statusBarItem.text = '$(save) Session';
    }
}

export function deactivate() {
    if (autoSaveInterval) {
        clearInterval(autoSaveInterval);
    }

    // Final save on deactivation
    const config = vscode.workspace.getConfiguration('sessionProtector');
    if (config.get<boolean>('saveOnClose', true)) {
        sessionManager.saveSession('Auto-save (close)');
    }

    console.log('Session Protector extension deactivated');
}
