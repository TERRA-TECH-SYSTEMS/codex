// ============================================================================
// CodeEX v5 — Grep Files Tool
// Copyright 2026 TerraTech Systems. All rights reserved.
// ============================================================================

import { ToolProvider, ToolRequest } from '@theia/ai-core';
import { SearchInWorkspaceResult } from '@theia/search-in-workspace/lib/common/search-in-workspace-interface';
import { SearchInWorkspaceService } from '@theia/search-in-workspace/lib/browser/search-in-workspace-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';

@injectable()
export class GrepFilesTool implements ToolProvider {
    static ID = 'codex_grep_files';

    @inject(SearchInWorkspaceService)
    protected readonly searchService: SearchInWorkspaceService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    getTool(): ToolRequest {
        return {
            id: GrepFilesTool.ID,
            name: GrepFilesTool.ID,
            providerName: 'codex-gixsis',
            description: 'Search for a text or regex pattern across file contents. Returns matching lines with file paths and line numbers.',
            parameters: {
                type: 'object',
                properties: {
                    pattern: { type: 'string', description: 'The text or regex pattern to search for' },
                    glob: { type: 'string', description: 'File glob pattern to filter (e.g. "*.ts", "*.rs"). Optional.' },
                },
                required: ['pattern'],
            },
            handler: async (argString: string) => {
                const { pattern, glob } = JSON.parse(argString);
                if (!pattern) {
                    return JSON.stringify({ error: 'pattern is required' });
                }
                try {
                    const roots = this.workspaceService.tryGetRoots();
                    if (roots.length === 0) {
                        return JSON.stringify({ error: 'No workspace open' });
                    }

                    const results: string[] = [];
                    const maxResults = 100;

                    await new Promise<void>((resolve, reject) => {
                        this.searchService.search(pattern, {
                            onResult: (_searchId: number, result: SearchInWorkspaceResult) => {
                                if (results.length >= maxResults) { return; }
                                for (const match of result.matches) {
                                    if (results.length >= maxResults) { break; }
                                    const text = typeof match.lineText === 'string' ? match.lineText : match.lineText?.text ?? '';
                                    results.push(`${result.fileUri}:${match.line}: ${text.trim()}`);
                                }
                            },
                            onDone: (_searchId: number, error?: string) => {
                                if (error) { reject(new Error(error)); }
                                else { resolve(); }
                            },
                        }, {
                            include: glob ? [glob] : undefined,
                            useRegExp: true,
                            maxResults,
                        }).catch(reject);
                    });

                    if (results.length === 0) {
                        return `No matches found for pattern: ${pattern}`;
                    }
                    return `${results.length} matches:\n${results.join('\n')}`;
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    return JSON.stringify({ error: `Grep failed: ${msg}` });
                }
            },
        };
    }
}
