// ============================================================================
// CodeEX v5 — Git Diff Tool
// Copyright 2026 TerraTech Systems. All rights reserved.
// ============================================================================

import { ToolProvider, ToolRequest } from '@theia/ai-core';
import { ScmService } from '@theia/scm/lib/browser/scm-service';
import { inject, injectable } from '@theia/core/shared/inversify';

@injectable()
export class GitDiffTool implements ToolProvider {
    static ID = 'codex_git_diff';

    @inject(ScmService)
    protected readonly scmService: ScmService;

    getTool(): ToolRequest {
        return {
            id: GitDiffTool.ID,
            name: GitDiffTool.ID,
            providerName: 'codex-gixsis',
            description: 'Show diff of changes in the working directory via the SCM provider.',
            parameters: {
                type: 'object',
                properties: {
                    staged: { type: 'boolean', description: 'If true, show staged changes instead of unstaged' },
                },
            },
            handler: async (argString: string) => {
                const args = JSON.parse(argString);
                try {
                    const repos = this.scmService.repositories;
                    if (repos.length === 0) {
                        return 'No SCM repository found.';
                    }

                    const lines: string[] = [];
                    for (const repo of repos) {
                        for (const group of repo.provider.groups) {
                            const isStaged = group.id.includes('index') || group.id.includes('staged');
                            if (args.staged && !isStaged) { continue; }
                            if (!args.staged && isStaged) { continue; }

                            for (const resource of group.resources) {
                                const letter = resource.decorations?.letter ?? '?';
                                lines.push(`${letter} ${resource.sourceUri.path.toString()}`);
                            }
                        }
                    }

                    return lines.length > 0
                        ? `${args.staged ? 'Staged' : 'Unstaged'} changes:\n${lines.join('\n')}`
                        : `(no ${args.staged ? 'staged' : 'unstaged'} changes)`;
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    return JSON.stringify({ error: `git diff failed: ${msg}` });
                }
            },
        };
    }
}
