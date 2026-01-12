import * as vscode from 'vscode';

export interface EditorState {
    uri: string;
    viewColumn: number;
    selection?: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
    scrollPosition?: number;
}

export interface TerminalState {
    name: string;
    cwd?: string;
}

export interface BreakpointState {
    uri: string;
    line: number;
    condition?: string;
}

export interface Session {
    id: string;
    name: string;
    timestamp: string;
    workspaceFolders: string[];
    openEditors: EditorState[];
    activeEditor?: string;
    terminals?: TerminalState[];
    breakpoints?: BreakpointState[];
}

export class SessionManager {
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    private getSessions(): Session[] {
        return this.context.globalState.get<Session[]>('sessionProtector.sessions', []);
    }

    private saveSessions(sessions: Session[]) {
        this.context.globalState.update('sessionProtector.sessions', sessions);
    }

    async saveSession(name: string): Promise<Session> {
        const config = vscode.workspace.getConfiguration('sessionProtector');
        const includeTerminals = config.get<boolean>('includeTerminals', true);
        const includeBreakpoints = config.get<boolean>('includeBreakpoints', true);
        const maxSessions = config.get<number>('maxSessions', 10);

        // Capture current state
        const openEditors: EditorState[] = [];
        let activeEditorUri: string | undefined;

        // Get all open tab groups
        for (const tabGroup of vscode.window.tabGroups.all) {
            for (const tab of tabGroup.tabs) {
                const tabInput = tab.input;
                if (tabInput instanceof vscode.TabInputText) {
                    const tabUri = tabInput.uri.toString();
                    const editor: EditorState = {
                        uri: tabUri,
                        viewColumn: tabGroup.viewColumn
                    };

                    // Get selection if this is the active editor
                    const textEditor = vscode.window.visibleTextEditors.find(
                        e => e.document.uri.toString() === tabUri
                    );
                    if (textEditor) {
                        editor.selection = {
                            start: {
                                line: textEditor.selection.start.line,
                                character: textEditor.selection.start.character
                            },
                            end: {
                                line: textEditor.selection.end.line,
                                character: textEditor.selection.end.character
                            }
                        };
                        editor.scrollPosition = textEditor.visibleRanges[0]?.start.line;
                    }

                    openEditors.push(editor);

                    if (tab.isActive) {
                        activeEditorUri = tabUri;
                    }
                }
            }
        }

        // Get workspace folders
        const workspaceFolders = vscode.workspace.workspaceFolders?.map(f => f.uri.toString()) || [];

        // Get terminal state (limited - can't get full command history)
        const terminals: TerminalState[] = [];
        if (includeTerminals) {
            for (const terminal of vscode.window.terminals) {
                terminals.push({
                    name: terminal.name
                });
            }
        }

        // Get breakpoints
        const breakpoints: BreakpointState[] = [];
        if (includeBreakpoints) {
            for (const bp of vscode.debug.breakpoints) {
                if (bp instanceof vscode.SourceBreakpoint) {
                    breakpoints.push({
                        uri: bp.location.uri.toString(),
                        line: bp.location.range.start.line,
                        condition: bp.condition
                    });
                }
            }
        }

        const session: Session = {
            id: `session-${Date.now()}`,
            name,
            timestamp: new Date().toISOString(),
            workspaceFolders,
            openEditors,
            activeEditor: activeEditorUri,
            terminals,
            breakpoints
        };

        // Get existing sessions and add new one
        let sessions = this.getSessions();

        // Remove old auto-save sessions if this is an auto-save
        if (name.startsWith('Auto-save')) {
            sessions = sessions.filter(s => !s.name.startsWith('Auto-save'));
        }

        sessions.unshift(session);

        // Limit number of sessions
        if (sessions.length > maxSessions) {
            sessions = sessions.slice(0, maxSessions);
        }

        this.saveSessions(sessions);
        return session;
    }

    async restoreSession(sessionId: string): Promise<boolean> {
        const sessions = this.getSessions();
        const session = sessions.find(s => s.id === sessionId);

        if (!session) {
            return false;
        }

        const config = vscode.workspace.getConfiguration('sessionProtector');
        const includeBreakpoints = config.get<boolean>('includeBreakpoints', true);

        // Open editors
        for (const editor of session.openEditors) {
            try {
                const uri = vscode.Uri.parse(editor.uri);
                const doc = await vscode.workspace.openTextDocument(uri);
                const textEditor = await vscode.window.showTextDocument(doc, {
                    viewColumn: editor.viewColumn,
                    preserveFocus: true,
                    preview: false
                });

                // Restore selection
                if (editor.selection) {
                    const selection = new vscode.Selection(
                        new vscode.Position(editor.selection.start.line, editor.selection.start.character),
                        new vscode.Position(editor.selection.end.line, editor.selection.end.character)
                    );
                    textEditor.selection = selection;
                }

                // Restore scroll position
                if (editor.scrollPosition !== undefined) {
                    const range = new vscode.Range(
                        new vscode.Position(editor.scrollPosition, 0),
                        new vscode.Position(editor.scrollPosition, 0)
                    );
                    textEditor.revealRange(range, vscode.TextEditorRevealType.AtTop);
                }
            } catch (error) {
                console.error(`Failed to open editor: ${editor.uri}`, error);
            }
        }

        // Focus active editor
        if (session.activeEditor) {
            try {
                const uri = vscode.Uri.parse(session.activeEditor);
                const doc = await vscode.workspace.openTextDocument(uri);
                await vscode.window.showTextDocument(doc);
            } catch (error) {
                console.error('Failed to focus active editor', error);
            }
        }

        // Restore breakpoints
        if (includeBreakpoints && session.breakpoints) {
            const newBreakpoints: vscode.SourceBreakpoint[] = [];
            for (const bp of session.breakpoints) {
                const uri = vscode.Uri.parse(bp.uri);
                const position = new vscode.Position(bp.line, 0);
                const location = new vscode.Location(uri, position);
                newBreakpoints.push(new vscode.SourceBreakpoint(location, true, bp.condition));
            }
            vscode.debug.addBreakpoints(newBreakpoints);
        }

        return true;
    }

    listSessions(): Session[] {
        return this.getSessions();
    }

    deleteSession(sessionId: string): boolean {
        let sessions = this.getSessions();
        const originalLength = sessions.length;
        sessions = sessions.filter(s => s.id !== sessionId);

        if (sessions.length < originalLength) {
            this.saveSessions(sessions);
            return true;
        }
        return false;
    }

    importSession(session: Session) {
        // Generate new ID to avoid conflicts
        session.id = `session-${Date.now()}-imported`;
        session.name = `${session.name} (imported)`;
        session.timestamp = new Date().toISOString();

        const sessions = this.getSessions();
        sessions.unshift(session);
        this.saveSessions(sessions);
    }

    clearAllSessions() {
        this.saveSessions([]);
    }
}
