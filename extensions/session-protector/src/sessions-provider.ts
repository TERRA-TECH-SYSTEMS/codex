import * as vscode from 'vscode';
import { SessionManager, Session } from './session-manager';

export class SessionsProvider implements vscode.TreeDataProvider<SessionItem> {
    private context: vscode.ExtensionContext;
    private sessionManager: SessionManager;
    private _onDidChangeTreeData: vscode.EventEmitter<SessionItem | undefined | null | void> = new vscode.EventEmitter<SessionItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<SessionItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(context: vscode.ExtensionContext, sessionManager: SessionManager) {
        this.context = context;
        this.sessionManager = sessionManager;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: SessionItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: SessionItem): Promise<SessionItem[]> {
        if (element) {
            return [];
        }

        const sessions = this.sessionManager.listSessions();

        if (sessions.length === 0) {
            const emptyItem = new SessionItem('No saved sessions', '', new Date().toISOString(), 0, 0);
            emptyItem.contextValue = 'empty';
            return [emptyItem];
        }

        return sessions.map(session => {
            const item = new SessionItem(
                session.name,
                session.id,
                session.timestamp,
                session.openEditors.length,
                session.terminals?.length || 0
            );

            item.description = this.formatDate(new Date(session.timestamp));
            item.tooltip = this.getTooltip(session);
            item.contextValue = 'session';
            item.iconPath = session.name.startsWith('Auto-save')
                ? new vscode.ThemeIcon('sync')
                : new vscode.ThemeIcon('archive');

            return item;
        });
    }

    private formatDate(date: Date): string {
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    }

    private getTooltip(session: Session): string {
        const lines = [
            `Name: ${session.name}`,
            `Saved: ${new Date(session.timestamp).toLocaleString()}`,
            `Editors: ${session.openEditors.length}`,
            `Terminals: ${session.terminals?.length || 0}`,
            `Breakpoints: ${session.breakpoints?.length || 0}`
        ];

        if (session.openEditors.length > 0) {
            lines.push('', 'Open files:');
            session.openEditors.slice(0, 5).forEach(e => {
                const uri = vscode.Uri.parse(e.uri);
                lines.push(`  • ${uri.path.split('/').pop()}`);
            });
            if (session.openEditors.length > 5) {
                lines.push(`  ... and ${session.openEditors.length - 5} more`);
            }
        }

        return lines.join('\n');
    }
}

export class SessionItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly sessionId: string,
        public readonly timestamp: string,
        public readonly editorCount: number,
        public readonly terminalCount: number
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);

        if (sessionId) {
            this.command = {
                command: 'sessionProtector.restoreSessionById',
                title: 'Restore Session',
                arguments: [this]
            };
        }
    }
}
