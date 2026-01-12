import * as vscode from 'vscode';

interface HistoryEntry {
    id: string;
    title: string;
    timestamp: Date;
    messages: Array<{ role: string; content: string }>;
}

export class HistoryProvider implements vscode.TreeDataProvider<HistoryItem> {
    private context: vscode.ExtensionContext;
    private _onDidChangeTreeData: vscode.EventEmitter<HistoryItem | undefined | null | void> = new vscode.EventEmitter<HistoryItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<HistoryItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: HistoryItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: HistoryItem): Promise<HistoryItem[]> {
        if (element) {
            return [];
        }

        const history = this.context.globalState.get<HistoryEntry[]>('ageixtic.chatHistory', []);

        if (history.length === 0) {
            return [new HistoryItem('No chat history', '', vscode.TreeItemCollapsibleState.None)];
        }

        return history.map(entry => {
            const item = new HistoryItem(
                entry.title || 'Chat session',
                entry.id,
                vscode.TreeItemCollapsibleState.None
            );
            item.description = new Date(entry.timestamp).toLocaleDateString();
            item.tooltip = `${entry.messages.length} messages`;
            item.iconPath = new vscode.ThemeIcon('comment-discussion');
            return item;
        }).reverse(); // Show most recent first
    }

    async saveSession(title: string, messages: Array<{ role: string; content: string }>) {
        const history = this.context.globalState.get<HistoryEntry[]>('ageixtic.chatHistory', []);

        const entry: HistoryEntry = {
            id: Date.now().toString(),
            title,
            timestamp: new Date(),
            messages
        };

        history.push(entry);

        // Keep only last 50 sessions
        if (history.length > 50) {
            history.shift();
        }

        await this.context.globalState.update('ageixtic.chatHistory', history);
        this.refresh();
    }

    async clearHistory() {
        await this.context.globalState.update('ageixtic.chatHistory', []);
        this.refresh();
    }
}

class HistoryItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly sessionId: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        this.contextValue = sessionId ? 'historyEntry' : 'placeholder';
    }
}
