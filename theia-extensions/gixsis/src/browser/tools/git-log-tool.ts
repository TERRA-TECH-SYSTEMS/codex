// ============================================================================
// CodeEX v5 — Git Log Tool
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Reports the current SCM commit message and repository info.
// Full git log with history requires shell execution (use run_command).
// ============================================================================

import { ToolProvider, ToolRequest } from '@theia/ai-core';
import { ScmService } from '@theia/scm/lib/browser/scm-service';
import { inject, injectable } from '@theia/core/shared/inversify';

@injectable()
export class GitLogTool implements ToolProvider {
    static ID = 'codex_git_log';

    @inject(ScmService)
    protected readonly scmService: ScmService;

    getTool(): ToolRequest {
        return {
            id: GitLogTool.ID,
            name: GitLogTool.ID,
            providerName: 'codex-gixsis',
            description: 'Show current SCM repository info and status summary. For full git log history, use the shell execution tool with "git log".',
            parameters: {
                type: 'object',
                properties: {
                    count: { type: 'number', description: 'Not used in SCM mode. Use shell execution for full log.' },
                },
            },
            handler: async () => {
                try {
                    const repos = this.scmService.repositories;
                    if (repos.length === 0) {
                        return 'No SCM repository found.';
                    }

                    const lines: string[] = [];
                    for (const repo of repos) {
                        const provider = repo.provider;
                        lines.push(`Repository: ${provider.label} (${provider.rootUri})`);

                        // Count changes by group
                        for (const group of provider.groups) {
                            if (group.resources.length > 0) {
                                lines.push(`  ${group.label}: ${group.resources.length} file(s)`);
                            }
                        }

                        // Current input (commit message draft)
                        if (repo.input.value) {
                            lines.push(`  Draft message: ${repo.input.value}`);
                        }
                    }

                    return lines.length > 0 ? lines.join('\n') : '(no repository info)';
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    return JSON.stringify({ error: `git info failed: ${msg}` });
                }
            },
        };
    }
}
