// ============================================================================
// CodeEX v5 — Edit File Tool
// Copyright 2026 TerraTech Systems. All rights reserved.
// ============================================================================

import { ToolProvider, ToolRequest } from '@theia/ai-core';
import { URI } from '@theia/core';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';

@injectable()
export class EditFileTool implements ToolProvider {
    static ID = 'codex_edit_file';

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    getTool(): ToolRequest {
        return {
            id: EditFileTool.ID,
            name: EditFileTool.ID,
            providerName: 'codex-gixsis',
            description: 'Edit a file by replacing old_text with new_text. The exact old_text must appear in the file.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'The file path to edit' },
                    old_text: { type: 'string', description: 'The exact text to find and replace' },
                    new_text: { type: 'string', description: 'The replacement text' },
                },
                required: ['path', 'old_text', 'new_text'],
            },
            handler: async (argString: string) => {
                const { path, old_text, new_text } = JSON.parse(argString);
                try {
                    const uri = this.resolveUri(path);
                    const file = await this.fileService.read(uri);
                    const content = file.value;

                    if (!content.includes(old_text)) {
                        return JSON.stringify({ error: `old_text not found in ${path}` });
                    }

                    const newContent = content.replace(old_text, new_text);
                    await this.fileService.write(uri, newContent);

                    const oldLines = old_text.split('\n').length;
                    const newLines = new_text.split('\n').length;
                    return JSON.stringify({
                        success: true,
                        file: path,
                        linesChanged: `${oldLines} → ${newLines}`,
                    });
                } catch {
                    return JSON.stringify({ error: `Failed to edit ${path}` });
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
