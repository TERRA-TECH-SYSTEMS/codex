import * as vscode from 'vscode';

export interface UsageRecord {
    tokens: number;
    requests: number;
}

export interface SessionRecord {
    id: string;
    timestamp: Date;
    tokens: number;
    model: string;
    duration?: number;
}

export interface UsageData {
    daily: { [date: string]: UsageRecord };
    monthly: { [month: string]: UsageRecord };
    total: UsageRecord;
    sessions: SessionRecord[];
    lastReset: string;
}

export class QuotaTracker {
    private context: vscode.ExtensionContext;
    private data: UsageData;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.data = this.loadData();
        this.cleanOldData();
    }

    private loadData(): UsageData {
        const stored = this.context.globalState.get<UsageData>('quotaManager.usageData');
        if (stored) {
            // Convert date strings back to Date objects for sessions
            stored.sessions = stored.sessions.map(s => ({
                ...s,
                timestamp: new Date(s.timestamp)
            }));
            return stored;
        }
        return this.getEmptyData();
    }

    private getEmptyData(): UsageData {
        return {
            daily: {},
            monthly: {},
            total: { tokens: 0, requests: 0 },
            sessions: [],
            lastReset: new Date().toISOString()
        };
    }

    private saveData() {
        this.context.globalState.update('quotaManager.usageData', this.data);
    }

    private getDateKey(): string {
        return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    }

    private getMonthKey(): string {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM
    }

    private cleanOldData() {
        // Keep only last 90 days of daily data
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 90);
        const cutoffKey = cutoffDate.toISOString().split('T')[0];

        const newDaily: { [date: string]: UsageRecord } = {};
        for (const [date, record] of Object.entries(this.data.daily)) {
            if (date >= cutoffKey) {
                newDaily[date] = record;
            }
        }
        this.data.daily = newDaily;

        // Keep only last 12 months of monthly data
        const monthCutoff = new Date();
        monthCutoff.setMonth(monthCutoff.getMonth() - 12);
        const monthCutoffKey = `${monthCutoff.getFullYear()}-${String(monthCutoff.getMonth() + 1).padStart(2, '0')}`;

        const newMonthly: { [month: string]: UsageRecord } = {};
        for (const [month, record] of Object.entries(this.data.monthly)) {
            if (month >= monthCutoffKey) {
                newMonthly[month] = record;
            }
        }
        this.data.monthly = newMonthly;

        // Keep only last 100 sessions
        if (this.data.sessions.length > 100) {
            this.data.sessions = this.data.sessions.slice(-100);
        }

        this.saveData();
    }

    recordUsage(tokens: number, model: string = 'unknown') {
        const dateKey = this.getDateKey();
        const monthKey = this.getMonthKey();

        // Update daily
        if (!this.data.daily[dateKey]) {
            this.data.daily[dateKey] = { tokens: 0, requests: 0 };
        }
        this.data.daily[dateKey].tokens += tokens;
        this.data.daily[dateKey].requests += 1;

        // Update monthly
        if (!this.data.monthly[monthKey]) {
            this.data.monthly[monthKey] = { tokens: 0, requests: 0 };
        }
        this.data.monthly[monthKey].tokens += tokens;
        this.data.monthly[monthKey].requests += 1;

        // Update total
        this.data.total.tokens += tokens;
        this.data.total.requests += 1;

        // Add session record
        this.data.sessions.push({
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date(),
            tokens,
            model
        });

        this.saveData();
    }

    getDailyUsage(): UsageRecord {
        const dateKey = this.getDateKey();
        return this.data.daily[dateKey] || { tokens: 0, requests: 0 };
    }

    getMonthlyUsage(): UsageRecord {
        const monthKey = this.getMonthKey();
        return this.data.monthly[monthKey] || { tokens: 0, requests: 0 };
    }

    getTotalUsage(): UsageRecord {
        return this.data.total;
    }

    getRecentSessions(limit: number = 20): SessionRecord[] {
        return this.data.sessions.slice(-limit).reverse();
    }

    getDailyHistory(days: number = 7): Array<{ date: string; usage: UsageRecord }> {
        const result: Array<{ date: string; usage: UsageRecord }> = [];
        const today = new Date();

        for (let i = 0; i < days; i++) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateKey = date.toISOString().split('T')[0];
            result.push({
                date: dateKey,
                usage: this.data.daily[dateKey] || { tokens: 0, requests: 0 }
            });
        }

        return result.reverse();
    }

    getMonthlyHistory(months: number = 6): Array<{ month: string; usage: UsageRecord }> {
        const result: Array<{ month: string; usage: UsageRecord }> = [];
        const today = new Date();

        for (let i = 0; i < months; i++) {
            const date = new Date(today);
            date.setMonth(date.getMonth() - i);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            result.push({
                month: monthKey,
                usage: this.data.monthly[monthKey] || { tokens: 0, requests: 0 }
            });
        }

        return result.reverse();
    }

    resetDaily() {
        const dateKey = this.getDateKey();
        delete this.data.daily[dateKey];
        this.saveData();
    }

    resetAll() {
        this.data = this.getEmptyData();
        this.saveData();
    }

    exportData(): UsageData {
        return { ...this.data };
    }
}
