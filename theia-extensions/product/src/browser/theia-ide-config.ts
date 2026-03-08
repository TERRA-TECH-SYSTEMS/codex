/********************************************************************************
 * Copyright (C) 2026 EclipseSource and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { nls } from '@theia/core/lib/common/nls';

export type BrandingVariant = 'stable' | 'next';

export function getBrandingVariant(): BrandingVariant {
    try {
        const config = FrontendApplicationConfigProvider.get() as Record<string, unknown>;
        return (config['brandingVariant'] as BrandingVariant) ?? 'stable';
    } catch {
        return 'stable';
    }
}

/**
 * CodeEX Branding Overrides
 * =========================
 * Replaces third-party branding strings from upstream Theia packages
 * with CodeEX / TerraTech Systems equivalents at runtime via nls translations.
 */
const CODEX_NLS_OVERRIDES: Record<string, string> = {
    // AI banner on Welcome page
    'theia/getting-started/ai/header': 'AI-Powered Development is available in CodeEX!',
    'theia/getting-started/ai/openAIChatView': 'Open the AI Chat View to get started',
    'theia/getting-started/ai/features': `
CodeEX includes integrated AI assistance powered by the Gixsis model,
offering intelligent code completion, chat-based development support,
and context-aware suggestions.\\
AI features are available to authorized accounts.
For more details, please visit the [documentation]({0}).
`,
    // Help section links
    'theia/getting-started/apiComparator': 'Extension API Compatibility',
    // GitHub Copilot status bar and commands — rebrand to generic AI Assistant
    'theia/ai/copilot/commands/signIn': 'Sign in to AI Assistant',
    'theia/ai/copilot/commands/signOut': 'Sign out of AI Assistant',
    'theia/ai/copilot/statusBar/signedIn': 'Signed in to AI Assistant as {0}. Click to sign out.',
    'theia/ai/copilot/statusBar/signedOut': 'AI Assistant: Not signed in. Click to sign in.',
    'theia/ai/copilot/signOut/confirmMessage': 'Are you sure you want to sign out of the AI Assistant?',
    'theia/ai/copilot/auth/success': 'Successfully signed in to AI Assistant!',
    // Language Model configuration panel
    'theia/ai/ide/configureProvider': `
## AI Assistant — Powered by Gixsis

AI features are built into CodeEX and available to authorized accounts.

Open **Settings** to enable AI features.
`,
    'theia/ai/ide/noLanguageModelProviders': `
## AI Assistant — Powered by Gixsis

Sign in with your CodeEX account to access AI features.
`,
    'theia/ai/ide/bypassHint': 'Sign in to access AI features',
    'theia/ai/ide/chatDisabledMessage/title': 'AI Features are Disabled',
    'theia/ai/ide/chatDisabledMessage/steps': `
1. Open **Settings** and search for "AI Features"
2. Enable the AI features toggle
3. Sign in with your CodeEX account
`,
    'theia/ai/ide/chatDisabledMessage/features': `
CodeEX AI features include:
- Intelligent code completion
- Chat-based development assistance
- Context-aware suggestions
- Terminal AI assistance
`,
    // AI Chat welcome message
    'theia/ai/ide/chatWelcomeMessage': `
## Ask the Ageixtic IDE Ageixt

Use *@AgeixtName* to talk to a specialized ageixt, like *@Gixsis*, *@Gixsis Code*, or *@Cain*.

Attach context with *#{3}*, *#{4}*, *#{5}*, or click {6}.
`,
};

export function applyBranding(): void {
    const variant = getBrandingVariant();
    if (variant !== 'stable') {
        document.body.setAttribute('data-theia-branding', variant);
    }

    // Inject CodeEX branding overrides into nls localization
    if (!nls.localization) {
        nls.localization = {
            languageId: nls.defaultLocale,
            translations: {},
        };
    }
    for (const [key, value] of Object.entries(CODEX_NLS_OVERRIDES)) {
        nls.localization.translations[key] = value;
    }
}
