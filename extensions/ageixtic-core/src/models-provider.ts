import * as vscode from 'vscode';
import { OllamaClient, OllamaModel } from './ollama-client';

export class ModelsProvider implements vscode.TreeDataProvider<ModelItem> {
    private ollamaClient: OllamaClient;
    private _onDidChangeTreeData: vscode.EventEmitter<ModelItem | undefined | null | void> = new vscode.EventEmitter<ModelItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ModelItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(ollamaClient: OllamaClient) {
        this.ollamaClient = ollamaClient;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ModelItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ModelItem): Promise<ModelItem[]> {
        if (element) {
            return [];
        }

        try {
            const models = await this.ollamaClient.listModels();

            if (models.length === 0) {
                return [new ModelItem('No models found', '', 0, vscode.TreeItemCollapsibleState.None)];
            }

            const config = vscode.workspace.getConfiguration('ageixtic');
            const defaultModel = config.get<string>('defaultModel', 'llama3.1:8b');

            return models.map(model => {
                const item = new ModelItem(
                    model.name,
                    model.digest.substring(0, 12),
                    model.size,
                    vscode.TreeItemCollapsibleState.None
                );

                // Mark default model
                if (model.name === defaultModel) {
                    item.description = `${this.formatSize(model.size)} (default)`;
                    item.iconPath = new vscode.ThemeIcon('star-full');
                } else {
                    item.description = this.formatSize(model.size);
                    item.iconPath = new vscode.ThemeIcon('symbol-misc');
                }

                item.tooltip = `Digest: ${model.digest}\nModified: ${model.modified_at}`;
                item.contextValue = 'model';

                return item;
            });
        } catch (error) {
            return [new ModelItem('Error loading models', '', 0, vscode.TreeItemCollapsibleState.None)];
        }
    }

    private formatSize(bytes: number): string {
        const gb = bytes / (1024 * 1024 * 1024);
        if (gb >= 1) {
            return `${gb.toFixed(1)} GB`;
        }
        const mb = bytes / (1024 * 1024);
        return `${mb.toFixed(0)} MB`;
    }
}

class ModelItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly digest: string,
        public readonly size: number,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
    }
}
