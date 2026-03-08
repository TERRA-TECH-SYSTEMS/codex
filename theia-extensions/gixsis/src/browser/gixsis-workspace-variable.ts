// ============================================================================
// CodeEX v5 — Gixsis Workspace Configuration Variable
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// AIVariableContribution that reads workspace instructions from the root.
// ONLY reads gixsis.md — sovereign configuration for Gixsis.
//
// CLAUDE.md is Claude Code's workspace config and must NEVER be read by
// Gixsis. Claude is a mentor in the workforce hierarchy, not an authority
// over sovereign systems. Contamination via CLAUDE.md fallback was the
// root cause of verbose, hallucinated chat responses.
//
// Registered as {{gixsis-config}} in prompt templates.
// ============================================================================

import {
    AIVariable,
    AIVariableContribution,
    AIVariableContext,
    AIVariableResolutionRequest,
    AIVariableResolver,
    AIVariableService,
    ResolvedAIVariable,
} from '@theia/ai-core';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { inject, injectable } from '@theia/core/shared/inversify';

const GIXSIS_CONFIG_VARIABLE: AIVariable = {
    id: 'gixsis-workspace-config',
    name: 'gixsis-config',
    description: 'Loads sovereign workspace instructions (gixsis.md) from workspace root',
};

/** Only gixsis.md — CLAUDE.md must NEVER influence Gixsis. */
const INSTRUCTION_FILES = ['gixsis.md'];

/**
 * Maximum characters for workspace config injected into the system prompt.
 * gixsis.md should be a small, focused file with workspace-specific instructions.
 * Cap enforced as a safety net to prevent context overflow on n_ctx=4096 models.
 */
const MAX_CONFIG_CHARS = 4000;

@injectable()
export class GixsisWorkspaceVariable implements AIVariableContribution, AIVariableResolver {

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    registerVariables(service: AIVariableService): void {
        service.registerResolver(GIXSIS_CONFIG_VARIABLE, this);
    }

    canResolve(request: AIVariableResolutionRequest, _context: AIVariableContext): number {
        return request.variable.name === GIXSIS_CONFIG_VARIABLE.name ? 1 : 0;
    }

    async resolve(
        request: AIVariableResolutionRequest,
        _context: AIVariableContext,
    ): Promise<ResolvedAIVariable | undefined> {
        if (request.variable.name !== GIXSIS_CONFIG_VARIABLE.name) {
            return undefined;
        }

        const roots = this.workspaceService.tryGetRoots();
        if (roots.length === 0) {
            return { variable: request.variable, value: '' };
        }

        const root = roots[0].resource;

        for (const filename of INSTRUCTION_FILES) {
            try {
                const uri = root.resolve(filename);
                const content = await this.fileService.readFile(uri);
                let value = content.value.toString();

                // Enforce context budget — prevent system prompt overflow
                if (value.length > MAX_CONFIG_CHARS) {
                    value = value.slice(0, MAX_CONFIG_CHARS)
                        + '\n\n[... workspace instructions truncated for context budget ...]';
                }

                return {
                    variable: request.variable,
                    value,
                };
            } catch {
                // File not found — try next
            }
        }

        // gixsis.md not found — graceful fallback (empty = no workspace config)
        return { variable: request.variable, value: '' };
    }
}
