// ============================================================================
// CodeEX v5 — Read File Tool
// Copyright 2026 TerraTech Systems. All rights reserved.
// ============================================================================

import { ToolProvider, ToolRequest } from '@theia/ai-core';
import { URI } from '@theia/core';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';

@injectable()
export class ReadFileTool implements ToolProvider {
    static ID = 'codex_read_file';

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    getTool(): ToolRequest {
        return {
            id: ReadFileTool.ID,
            name: ReadFileTool.ID,
            providerName: 'codex-gixsis',
            description: 'Read the contents of a file by path. Returns the full file content.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'The file path to read' },
                },
                required: ['path'],
            },
            handler: async (argString: string) => {
                const { path } = JSON.parse(argString);
                try {
                    const uri = this.resolveUri(path);
                    const content = await this.fileService.read(uri);
                    return content.value;
                } catch {
                    return JSON.stringify({ error: `File not found: ${path}` });
                }
            },
        };
    }

    private resolveUri(path: string): URI {
        const roots = this.workspaceService.tryGetRoots();
        if (roots.length > 0 && !path.startsWith('/') && !/^[a-zA-Z]:/.test(path)) {
            return roots[0].resource.resolve(path);
        }
        return new URI(path);
    }
}
