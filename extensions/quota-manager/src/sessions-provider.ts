import * as vscode from 'vscode';
import { QuotaTracker, SessionRecord } from './quota-tracker';

export class SessionsProvider implements vscode.TreeDataProvider<SessionItem> {
    private quotaTracker: QuotaTracker;
    private context: vscode.ExtensionContext;
    private _onDidChangeTreeData: vscode.EventEmitter<SessionItem | undefined | null | void> = new vscode.EventEmitter<SessionItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<SessionItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(context: vscode.ExtensionContext, quotaTracker: QuotaTracker) {
        this.context = context;
        this.quotaTracker = quotaTracker;
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

        const sessions = this.quotaTracker.getRecentSessions(20);

        if (sessions.length === 0) {
            return [new SessionItem('No recent sessions', '', 0, new Date())];
        }

        return sessions.map(session => {
            const item = new SessionItem(
                this.formatTokens(session.tokens) + ' tokens',
                session.model,
                session.tokens,
                new Date(session.timestamp)
            );
            item.description = session.model;
            item.tooltip = `Model: ${session.model}\nTokens: ${session.tokens}\nTime: ${new Date(session.timestamp).toLocaleString()}`;
            item.iconPath = new vscode.ThemeIcon('symbol-number');
            return item;
        });
    }

    private formatTokens(tokens: number): string {
        if (tokens >= 1000) {
            return `${(tokens / 1000).toFixed(1)}K`;
        }
        return tokens.toString();
    }
}

class SessionItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly model: string,
        public readonly tokens: number,
        public readonly timestamp: Date
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'session';
    }
}
