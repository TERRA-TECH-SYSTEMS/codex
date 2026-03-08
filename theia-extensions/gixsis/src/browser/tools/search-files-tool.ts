// ============================================================================
// CodeEX v5 — Search Files Tool
// Copyright 2026 TerraTech Systems. All rights reserved.
// ============================================================================

import { ToolProvider, ToolRequest } from '@theia/ai-core';
import { FileSearchService } from '@theia/file-search/lib/common/file-search-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';

@injectable()
export class SearchFilesTool implements ToolProvider {
    static ID = 'codex_search_files';

    @inject(FileSearchService)
    protected readonly fileSearchService: FileSearchService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    getTool(): ToolRequest {
        return {
            id: SearchFilesTool.ID,
            name: SearchFilesTool.ID,
            providerName: 'codex-gixsis',
            description: 'Search for files by name pattern in the workspace. Returns matching file paths.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'The file name pattern to search for' },
                    maxResults: { type: 'number', description: 'Maximum number of results (default: 50)' },
                },
                required: ['query'],
            },
            handler: async (argString: string) => {
                const { query, maxResults } = JSON.parse(argString);
                if (!query || query.length < 2) {
                    return JSON.stringify({ error: 'Query must be at least 2 characters' });
                }
                try {
                    const roots = this.workspaceService.tryGetRoots();
                    if (roots.length === 0) {
                        return JSON.stringify({ error: 'No workspace open' });
                    }
                    const rootUris = roots.map(r => r.resource.toString());
                    const results = await this.fileSearchService.find(query, {
                        rootUris,
                        limit: maxResults || 50,
                    });
                    if (results.length === 0) {
                        return `No files matching "${query}"`;
                    }
                    return `${results.length} files found:\n${results.join('\n')}`;
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    return JSON.stringify({ error: `Search failed: ${msg}` });
                }
            },
        };
    }
}
