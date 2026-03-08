// ============================================================================
// CodeEX v5 — Git Status Tool
// Copyright 2026 TerraTech Systems. All rights reserved.
// ============================================================================

import { ToolProvider, ToolRequest } from '@theia/ai-core';
import { ScmService } from '@theia/scm/lib/browser/scm-service';
import { inject, injectable } from '@theia/core/shared/inversify';

@injectable()
export class GitStatusTool implements ToolProvider {
    static ID = 'codex_git_status';

    @inject(ScmService)
    protected readonly scmService: ScmService;

    getTool(): ToolRequest {
        return {
            id: GitStatusTool.ID,
            name: GitStatusTool.ID,
            providerName: 'codex-gixsis',
            description: 'Show the working tree status: staged changes, unstaged changes, and untracked files.',
            parameters: {
                type: 'object',
                properties: {},
            },
            handler: async () => {
                try {
                    const repos = this.scmService.repositories;
                    if (repos.length === 0) {
                        return 'No SCM repository found in workspace.';
                    }

                    const lines: string[] = [];
                    for (const repo of repos) {
                        const groups = repo.provider.groups;
                        for (const group of groups) {
                            if (group.resources.length > 0) {
                                lines.push(`[${group.label}]`);
                                for (const resource of group.resources) {
                                    const letter = resource.decorations?.letter ?? '?';
                                    lines.push(`  ${letter} ${resource.sourceUri.path.toString()}`);
                                }
                            }
                        }
                    }

                    return lines.length > 0 ? lines.join('\n') : '(clean working tree)';
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    return JSON.stringify({ error: `git status failed: ${msg}` });
                }
            },
        };
    }
}
