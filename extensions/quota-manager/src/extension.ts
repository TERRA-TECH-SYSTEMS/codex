import * as vscode from 'vscode';
import { QuotaTracker } from './quota-tracker';
import { DashboardProvider } from './dashboard-provider';
import { SessionsProvider } from './sessions-provider';

let quotaTracker: QuotaTracker;
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
    console.log('Quota Manager extension is now active');

    // Initialize quota tracker
    quotaTracker = new QuotaTracker(context);

    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
    statusBarItem.command = 'quotaManager.showDashboard';
    context.subscriptions.push(statusBarItem);
    updateStatusBar();

    // Register providers
    const dashboardProvider = new DashboardProvider(context, quotaTracker);
    const sessionsProvider = new SessionsProvider(context, quotaTracker);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('quotaManager.dashboard', dashboardProvider)
    );
    vscode.window.registerTreeDataProvider('quotaManager.sessions', sessionsProvider);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('quotaManager.showDashboard', () => {
            vscode.commands.executeCommand('workbench.view.extension.quota-manager');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('quotaManager.resetDaily', async () => {
            const confirm = await vscode.window.showWarningMessage(
                'Reset daily usage statistics?',
                'Yes',
                'No'
            );
            if (confirm === 'Yes') {
                quotaTracker.resetDaily();
                updateStatusBar();
                vscode.window.showInformationMessage('Daily usage reset.');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('quotaManager.resetAll', async () => {
            const confirm = await vscode.window.showWarningMessage(
                'Reset ALL usage statistics? This cannot be undone.',
                'Yes, Reset All',
                'Cancel'
            );
            if (confirm === 'Yes, Reset All') {
                quotaTracker.resetAll();
                updateStatusBar();
                sessionsProvider.refresh();
                vscode.window.showInformationMessage('All usage data reset.');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('quotaManager.exportData', async () => {
            const data = quotaTracker.exportData();
            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file('quota-usage.json'),
                filters: { 'JSON': ['json'] }
            });
            if (uri) {
                await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(data, null, 2)));
                vscode.window.showInformationMessage(`Usage data exported to ${uri.fsPath}`);
            }
        })
    );

    // Listen for token usage events from AGEIXTIC extension
    context.subscriptions.push(
        vscode.commands.registerCommand('quotaManager.recordUsage', (tokens: number, model: string) => {
            quotaTracker.recordUsage(tokens, model);
            updateStatusBar();
            checkLimits();
        })
    );

    // Update status bar periodically
    const interval = setInterval(() => updateStatusBar(), 60000);
    context.subscriptions.push({ dispose: () => clearInterval(interval) });

    // Show status bar based on config
    const config = vscode.workspace.getConfiguration('quotaManager');
    if (config.get<boolean>('showStatusBar', true)) {
        statusBarItem.show();
    }

    // Listen for config changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('quotaManager.showStatusBar')) {
                const show = vscode.workspace.getConfiguration('quotaManager').get<boolean>('showStatusBar', true);
                if (show) {
                    statusBarItem.show();
                } else {
                    statusBarItem.hide();
                }
            }
        })
    );
}

function updateStatusBar() {
    const usage = quotaTracker.getDailyUsage();
    const config = vscode.workspace.getConfiguration('quotaManager');
    const limit = config.get<number>('dailyTokenLimit', 100000);

    const formatted = formatTokens(usage.tokens);

    if (limit > 0) {
        const percentage = Math.round((usage.tokens / limit) * 100);
        statusBarItem.text = `$(graph) ${formatted} (${percentage}%)`;

        if (percentage >= 100) {
            statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        } else if (percentage >= config.get<number>('warnAtPercentage', 80)) {
            statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else {
            statusBarItem.backgroundColor = undefined;
        }
    } else {
        statusBarItem.text = `$(graph) ${formatted}`;
        statusBarItem.backgroundColor = undefined;
    }

    statusBarItem.tooltip = `Daily: ${formatted} tokens\nRequests: ${usage.requests}\nClick to view dashboard`;
}

function checkLimits() {
    const config = vscode.workspace.getConfiguration('quotaManager');
    const dailyLimit = config.get<number>('dailyTokenLimit', 100000);
    const warnAt = config.get<number>('warnAtPercentage', 80);
    const usage = quotaTracker.getDailyUsage();

    if (dailyLimit > 0) {
        const percentage = (usage.tokens / dailyLimit) * 100;

        if (percentage >= 100) {
            vscode.window.showErrorMessage(
                `Daily token limit reached (${formatTokens(usage.tokens)} / ${formatTokens(dailyLimit)})`
            );
        } else if (percentage >= warnAt && percentage < warnAt + 5) {
            vscode.window.showWarningMessage(
                `Token usage at ${Math.round(percentage)}% of daily limit`
            );
        }
    }
}

function formatTokens(tokens: number): string {
    if (tokens >= 1000000) {
        return `${(tokens / 1000000).toFixed(1)}M`;
    } else if (tokens >= 1000) {
        return `${(tokens / 1000).toFixed(1)}K`;
    }
    return tokens.toString();
}

export function deactivate() {
    console.log('Quota Manager extension deactivated');
}

// Export for other extensions to use
export function getQuotaTracker(): QuotaTracker {
    return quotaTracker;
}
