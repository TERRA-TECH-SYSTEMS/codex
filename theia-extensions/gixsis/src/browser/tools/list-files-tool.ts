// ============================================================================
// CodeEX v5 — List Files Tool
// Copyright 2026 TerraTech Systems. All rights reserved.
// ============================================================================

import { ToolProvider, ToolRequest } from '@theia/ai-core';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';

@injectable()
export class ListFilesTool implements ToolProvider {
    static ID = 'codex_list_files';

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    getTool(): ToolRequest {
        return {
            id: ListFilesTool.ID,
            name: ListFilesTool.ID,
            providerName: 'codex-gixsis',
            description: 'List files in the workspace root or a subdirectory. Returns file and folder names.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Subdirectory path (defaults to workspace root)' },
                    depth: { type: 'number', description: 'Max depth to recurse (default: 2)' },
                },
            },
            handler: async (argString: string) => {
                const args = JSON.parse(argString);
                try {
                    const roots = this.workspaceService.tryGetRoots();
                    if (roots.length === 0) {
                        return JSON.stringify({ error: 'No workspace open' });
                    }
                    const baseUri = args.path
                        ? roots[0].resource.resolve(args.path)
                        : roots[0].resource;

                    const stat = await this.fileService.resolve(baseUri);
                    if (!stat.children) {
                        return `${baseUri.path.base} (file)`;
                    }

                    const maxDepth = args.depth ?? 2;
                    const lines: string[] = [];
                    const walk = (children: typeof stat.children, indent: string, depth: number) => {
                        if (!children || depth > maxDepth) { return; }
                        for (const child of children) {
                            const icon = child.isDirectory ? '📁' : '📄';
                            lines.push(`${indent}${icon} ${child.name}`);
                            if (child.isDirectory && child.children) {
                                walk(child.children, indent + '  ', depth + 1);
                            }
                        }
                    };
                    walk(stat.children, '', 1);
                    return lines.length > 0 ? lines.join('\n') : '(empty directory)';
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    return JSON.stringify({ error: `Failed to list files: ${msg}` });
                }
            },
        };
    }
}
