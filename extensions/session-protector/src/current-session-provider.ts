import * as vscode from 'vscode';

export class CurrentSessionProvider implements vscode.TreeDataProvider<CurrentSessionItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<CurrentSessionItem | undefined | null | void> = new vscode.EventEmitter<CurrentSessionItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<CurrentSessionItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor() {
        // Refresh when tabs change
        vscode.window.tabGroups.onDidChangeTabs(() => this.refresh());
        vscode.window.onDidChangeActiveTextEditor(() => this.refresh());
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: CurrentSessionItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: CurrentSessionItem): Promise<CurrentSessionItem[]> {
        if (element) {
            return [];
        }

        const items: CurrentSessionItem[] = [];

        // Count open editors
        let editorCount = 0;
        for (const tabGroup of vscode.window.tabGroups.all) {
            editorCount += tabGroup.tabs.filter(t => t.input instanceof vscode.TabInputText).length;
        }

        // Count terminals
        const terminalCount = vscode.window.terminals.length;

        // Count breakpoints
        const breakpointCount = vscode.debug.breakpoints.length;

        // Add summary items
        items.push(new CurrentSessionItem(
            `${editorCount} open editor${editorCount !== 1 ? 's' : ''}`,
            'editors',
            new vscode.ThemeIcon('file')
        ));

        items.push(new CurrentSessionItem(
            `${terminalCount} terminal${terminalCount !== 1 ? 's' : ''}`,
            'terminals',
            new vscode.ThemeIcon('terminal')
        ));

        items.push(new CurrentSessionItem(
            `${breakpointCount} breakpoint${breakpointCount !== 1 ? 's' : ''}`,
            'breakpoints',
            new vscode.ThemeIcon('debug-breakpoint')
        ));

        // Active file
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            const fileName = activeEditor.document.uri.path.split('/').pop() || 'Unknown';
            items.push(new CurrentSessionItem(
                `Active: ${fileName}`,
                'active',
                new vscode.ThemeIcon('arrow-right')
            ));
        }

        return items;
    }
}

class CurrentSessionItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly itemType: string,
        public readonly iconPath: vscode.ThemeIcon
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.contextValue = itemType;
    }
}
