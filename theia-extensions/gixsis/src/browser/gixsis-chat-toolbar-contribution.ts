// ============================================================================
// CodeEX v5 — Gixsis Chat Toolbar Contribution
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Adds STT (microphone) and TTS (speaker) toolbar buttons to
// the Theia AI Chat panel.
// ============================================================================

import { ChatAgentLocation, ChatService } from '@theia/ai-chat';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { Widget } from '@theia/core/lib/browser';
import { MessageService } from '@theia/core';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { GixsisSTTService } from './gixsis-stt-service';
import { GixsisTTSService } from './gixsis-tts-service';
import { GIXSIS_AGENT_ID } from './gixsis-chat-agent';

const CHAT_WIDGET_ID = 'chat-view-widget';

export namespace GixsisVoiceCommands {
    export const TOGGLE_STT: Command = {
        id: 'gixsis.toggleSTT',
        label: 'Gixsis: Toggle Microphone',
        iconClass: 'codicon codicon-mic',
    };
    export const TOGGLE_TTS: Command = {
        id: 'gixsis.toggleTTS',
        label: 'Gixsis: Read Last Response',
        iconClass: 'codicon codicon-unmute',
    };
}

@injectable()
export class GixsisChatToolbarContribution implements TabBarToolbarContribution, CommandContribution {

    @inject(GixsisSTTService)
    protected readonly sttService!: GixsisSTTService;

    @inject(GixsisTTSService)
    protected readonly ttsService!: GixsisTTSService;

    @inject(ChatService)
    protected readonly chatService!: ChatService;

    @inject(MessageService)
    protected readonly messageService!: MessageService;

    @postConstruct()
    protected init(): void {
        // When STT produces final text, send it as a chat message
        this.sttService.onResult(event => {
            if (event.isFinal && event.text.trim()) {
                this.sendSpeechAsMessage(event.text.trim());
            }
        });
        this.sttService.onError(msg => {
            this.messageService.error(msg);
        });
    }

    protected async sendSpeechAsMessage(text: string): Promise<void> {
        let session = this.chatService.getActiveSession();
        if (!session) {
            session = this.chatService.createSession(ChatAgentLocation.Panel);
        }
        await this.chatService.sendRequest(session.id, {
            text: `@${GIXSIS_AGENT_ID} ${text}`,
        });
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(GixsisVoiceCommands.TOGGLE_STT, {
            execute: () => {
                if (!this.sttService.isAvailable) {
                    this.messageService.warn('Speech recognition not available in this environment.');
                    return;
                }
                const started = this.sttService.toggle();
                if (started) {
                    this.messageService.info('Microphone ON — speak now.');
                }
            },
            isToggled: () => this.sttService.isListening,
        });

        registry.registerCommand(GixsisVoiceCommands.TOGGLE_TTS, {
            execute: () => {
                if (!this.ttsService.isAvailable) {
                    this.messageService.warn('Text-to-speech not available.');
                    return;
                }
                if (this.ttsService.isSpeaking) {
                    this.ttsService.stop();
                    return;
                }
                // Get last assistant response from active session
                const session = this.chatService.getActiveSession();
                if (!session) {
                    this.messageService.info('No active chat session.');
                    return;
                }
                const model = session.model;
                const requests = model.getRequests();
                if (requests.length === 0) {
                    this.messageService.info('No messages to read.');
                    return;
                }
                const lastRequest = requests[requests.length - 1];
                const response = lastRequest.response;
                if (!response) {
                    this.messageService.info('No response to read.');
                    return;
                }
                const text = response.response.asString?.() ?? '';
                if (text) {
                    this.ttsService.speak(text);
                } else {
                    this.messageService.info('Response has no readable text.');
                }
            },
            isToggled: () => this.ttsService.isSpeaking,
        });
    }

    registerToolbarItems(registry: TabBarToolbarRegistry): void {
        registry.registerItem({
            id: GixsisVoiceCommands.TOGGLE_STT.id,
            command: GixsisVoiceCommands.TOGGLE_STT.id,
            tooltip: 'Toggle Microphone (STT)',
            isVisible: widget => this.isChatWidget(widget),
            priority: 10,
        });

        registry.registerItem({
            id: GixsisVoiceCommands.TOGGLE_TTS.id,
            command: GixsisVoiceCommands.TOGGLE_TTS.id,
            tooltip: 'Read Last Response (TTS)',
            isVisible: widget => this.isChatWidget(widget),
            priority: 11,
        });
    }

    protected isChatWidget(widget: Widget | undefined): boolean {
        return widget?.id === CHAT_WIDGET_ID;
    }
}
