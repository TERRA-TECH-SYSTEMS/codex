// ============================================================================
// CodeEX v5 — Create File Tool
// Copyright 2026 TerraTech Systems. All rights reserved.
// ============================================================================

import { ToolProvider, ToolRequest } from '@theia/ai-core';
import { URI } from '@theia/core';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';

@injectable()
export class CreateFileTool implements ToolProvider {
    static ID = 'codex_create_file';

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    getTool(): ToolRequest {
        return {
            id: CreateFileTool.ID,
            name: CreateFileTool.ID,
            providerName: 'codex-gixsis',
            description: 'Create a new file with the given content. Fails if the file already exists.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'The file path to create' },
                    content: { type: 'string', description: 'The file content' },
                },
                required: ['path', 'content'],
            },
            handler: async (argString: string) => {
                const { path, content } = JSON.parse(argString);
                try {
                    const uri = this.resolveUri(path);

                    // Check if file exists
                    try {
                        await this.fileService.resolve(uri);
                        return JSON.stringify({ error: `File already exists: ${path}. Use edit_file instead.` });
                    } catch {
                        // File doesn't exist — proceed
                    }

                    await this.fileService.createFile(uri, content);
                    const lines = content.split('\n').length;
                    return JSON.stringify({ success: true, file: path, lines });
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    return JSON.stringify({ error: `Failed to create ${path}: ${msg}` });
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
