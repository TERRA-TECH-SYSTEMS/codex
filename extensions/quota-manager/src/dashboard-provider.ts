import * as vscode from 'vscode';
import { QuotaTracker } from './quota-tracker';

export class DashboardProvider implements vscode.WebviewViewProvider {
    private context: vscode.ExtensionContext;
    private quotaTracker: QuotaTracker;
    private webviewView?: vscode.WebviewView;

    constructor(context: vscode.ExtensionContext, quotaTracker: QuotaTracker) {
        this.context = context;
        this.quotaTracker = quotaTracker;
    }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this.webviewView = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri]
        };

        this.updateContent();

        // Refresh every minute
        const interval = setInterval(() => this.updateContent(), 60000);
        webviewView.onDidDispose(() => clearInterval(interval));
    }

    private updateContent() {
        if (!this.webviewView) return;

        const config = vscode.workspace.getConfiguration('quotaManager');
        const dailyLimit = config.get<number>('dailyTokenLimit', 100000);
        const monthlyLimit = config.get<number>('monthlyTokenLimit', 3000000);
        const costPerMillion = config.get<number>('costPerMillionTokens', 0);

        const daily = this.quotaTracker.getDailyUsage();
        const monthly = this.quotaTracker.getMonthlyUsage();
        const total = this.quotaTracker.getTotalUsage();
        const history = this.quotaTracker.getDailyHistory(7);

        const dailyPercent = dailyLimit > 0 ? Math.min(100, (daily.tokens / dailyLimit) * 100) : 0;
        const monthlyPercent = monthlyLimit > 0 ? Math.min(100, (monthly.tokens / monthlyLimit) * 100) : 0;

        const estimatedCost = costPerMillion > 0 ? (total.tokens / 1000000) * costPerMillion : 0;

        this.webviewView.webview.html = this.getHtmlContent(
            daily, monthly, total, history,
            dailyLimit, monthlyLimit, dailyPercent, monthlyPercent,
            estimatedCost, costPerMillion
        );
    }

    private formatTokens(tokens: number): string {
        if (tokens >= 1000000) {
            return `${(tokens / 1000000).toFixed(2)}M`;
        } else if (tokens >= 1000) {
            return `${(tokens / 1000).toFixed(1)}K`;
        }
        return tokens.toString();
    }

    private getHtmlContent(
        daily: { tokens: number; requests: number },
        monthly: { tokens: number; requests: number },
        total: { tokens: number; requests: number },
        history: Array<{ date: string; usage: { tokens: number; requests: number } }>,
        dailyLimit: number,
        monthlyLimit: number,
        dailyPercent: number,
        monthlyPercent: number,
        estimatedCost: number,
        costPerMillion: number
    ): string {
        const historyBars = history.map(h => {
            const maxTokens = Math.max(...history.map(x => x.usage.tokens), 1);
            const height = (h.usage.tokens / maxTokens) * 100;
            const day = new Date(h.date).toLocaleDateString('en-US', { weekday: 'short' });
            return `<div class="bar-container">
                <div class="bar" style="height: ${height}%"></div>
                <div class="bar-label">${day}</div>
            </div>`;
        }).join('');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Quota Dashboard</title>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-sideBar-background);
            padding: 12px;
        }
        .card {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 6px;
            padding: 12px;
            margin-bottom: 12px;
        }
        .card-title {
            font-size: 0.85em;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .stat-value {
            font-size: 1.5em;
            font-weight: bold;
        }
        .stat-secondary {
            font-size: 0.85em;
            color: var(--vscode-descriptionForeground);
        }
        .progress-container {
            margin-top: 8px;
        }
        .progress-bar {
            height: 6px;
            background-color: var(--vscode-progressBar-background);
            border-radius: 3px;
            overflow: hidden;
        }
        .progress-fill {
            height: 100%;
            background-color: var(--vscode-progressBar-foreground, #0078d4);
            transition: width 0.3s ease;
        }
        .progress-fill.warning {
            background-color: var(--vscode-inputValidation-warningBackground, #f0ad4e);
        }
        .progress-fill.error {
            background-color: var(--vscode-inputValidation-errorBackground, #d9534f);
        }
        .progress-label {
            display: flex;
            justify-content: space-between;
            font-size: 0.75em;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
        }
        .chart-container {
            display: flex;
            align-items: flex-end;
            height: 80px;
            gap: 4px;
            padding-top: 8px;
        }
        .bar-container {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            height: 100%;
        }
        .bar {
            width: 100%;
            background-color: var(--vscode-button-background);
            border-radius: 2px 2px 0 0;
            min-height: 2px;
            transition: height 0.3s ease;
        }
        .bar-label {
            font-size: 0.7em;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
        }
        .stat-item {
            text-align: center;
            padding: 8px;
            background-color: var(--vscode-sideBar-background);
            border-radius: 4px;
        }
        .stat-item .value {
            font-size: 1.2em;
            font-weight: bold;
        }
        .stat-item .label {
            font-size: 0.75em;
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="card-title">Today</div>
        <div class="stat-value">${this.formatTokens(daily.tokens)}</div>
        <div class="stat-secondary">${daily.requests} requests</div>
        ${dailyLimit > 0 ? `
        <div class="progress-container">
            <div class="progress-bar">
                <div class="progress-fill ${dailyPercent >= 100 ? 'error' : dailyPercent >= 80 ? 'warning' : ''}"
                     style="width: ${dailyPercent}%"></div>
            </div>
            <div class="progress-label">
                <span>${Math.round(dailyPercent)}%</span>
                <span>${this.formatTokens(dailyLimit)} limit</span>
            </div>
        </div>
        ` : ''}
    </div>

    <div class="card">
        <div class="card-title">This Month</div>
        <div class="stat-value">${this.formatTokens(monthly.tokens)}</div>
        <div class="stat-secondary">${monthly.requests} requests</div>
        ${monthlyLimit > 0 ? `
        <div class="progress-container">
            <div class="progress-bar">
                <div class="progress-fill ${monthlyPercent >= 100 ? 'error' : monthlyPercent >= 80 ? 'warning' : ''}"
                     style="width: ${monthlyPercent}%"></div>
            </div>
            <div class="progress-label">
                <span>${Math.round(monthlyPercent)}%</span>
                <span>${this.formatTokens(monthlyLimit)} limit</span>
            </div>
        </div>
        ` : ''}
    </div>

    <div class="card">
        <div class="card-title">Last 7 Days</div>
        <div class="chart-container">
            ${historyBars}
        </div>
    </div>

    <div class="card">
        <div class="card-title">All Time</div>
        <div class="stats-grid">
            <div class="stat-item">
                <div class="value">${this.formatTokens(total.tokens)}</div>
                <div class="label">Tokens</div>
            </div>
            <div class="stat-item">
                <div class="value">${total.requests}</div>
                <div class="label">Requests</div>
            </div>
            ${costPerMillion > 0 ? `
            <div class="stat-item">
                <div class="value">$${estimatedCost.toFixed(2)}</div>
                <div class="label">Est. Cost</div>
            </div>
            ` : ''}
        </div>
    </div>
</body>
</html>`;
    }
}
