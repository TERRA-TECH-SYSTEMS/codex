// ============================================================================
// CodeEX v5 — Glob Files Tool
// Copyright 2026 TerraTech Systems. All rights reserved.
// ============================================================================

import { ToolProvider, ToolRequest } from '@theia/ai-core';
import { FileSearchService } from '@theia/file-search/lib/common/file-search-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';

@injectable()
export class GlobFilesTool implements ToolProvider {
    static ID = 'codex_glob_files';

    @inject(FileSearchService)
    protected readonly fileSearchService: FileSearchService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    getTool(): ToolRequest {
        return {
            id: GlobFilesTool.ID,
            name: GlobFilesTool.ID,
            providerName: 'codex-gixsis',
            description: 'Find files matching a glob pattern. Returns file paths. Use for discovering files by name pattern.',
            parameters: {
                type: 'object',
                properties: {
                    pattern: { type: 'string', description: 'The glob pattern to match (e.g. "src/**/*.tsx", "*.json", "**/test*")' },
                    path: { type: 'string', description: 'Base directory to search from. Defaults to workspace root.' },
                },
                required: ['pattern'],
            },
            handler: async (argString: string) => {
                const { pattern, path } = JSON.parse(argString);
                if (!pattern) {
                    return JSON.stringify({ error: 'pattern is required' });
                }
                try {
                    const roots = this.workspaceService.tryGetRoots();
                    if (roots.length === 0) {
                        return JSON.stringify({ error: 'No workspace open' });
                    }
                    const rootUris = path
                        ? [roots[0].resource.resolve(path).toString()]
                        : roots.map(r => r.resource.toString());

                    const results = await this.fileSearchService.find('', {
                        rootUris,
                        includePatterns: [pattern],
                        limit: 200,
                    });

                    if (results.length === 0) {
                        return `No files matching: ${pattern}`;
                    }
                    return `${results.length} files:\n${results.join('\n')}`;
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    return JSON.stringify({ error: `Glob search failed: ${msg}` });
                }
            },
        };
    }
}
