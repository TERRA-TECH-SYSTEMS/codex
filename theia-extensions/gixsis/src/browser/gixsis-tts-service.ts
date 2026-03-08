// ============================================================================
// CodeEX v5 — Gixsis Text-to-Speech Service
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Browser SpeechSynthesis API for reading AI responses aloud.
// ============================================================================

import { Emitter, Event } from '@theia/core';
import { injectable } from '@theia/core/shared/inversify';

@injectable()
export class GixsisTTSService {

    protected _isSpeaking = false;
    protected currentUtterance: SpeechSynthesisUtterance | undefined;

    protected readonly onStateChangedEmitter = new Emitter<boolean>();
    readonly onStateChanged: Event<boolean> = this.onStateChangedEmitter.event;

    get isAvailable(): boolean {
        return 'speechSynthesis' in globalThis;
    }

    get isSpeaking(): boolean {
        return this._isSpeaking;
    }

    speak(text: string, lang = 'en-US'): void {
        if (!this.isAvailable) { return; }
        this.stop();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        utterance.rate = 1.0;
        utterance.pitch = 1.0;

        utterance.onstart = () => {
            this._isSpeaking = true;
            this.onStateChangedEmitter.fire(true);
        };
        utterance.onend = () => {
            this._isSpeaking = false;
            this.onStateChangedEmitter.fire(false);
        };
        utterance.onerror = () => {
            this._isSpeaking = false;
            this.onStateChangedEmitter.fire(false);
        };

        this.currentUtterance = utterance;
        speechSynthesis.speak(utterance);
    }

    stop(): void {
        if (this.isAvailable && speechSynthesis.speaking) {
            speechSynthesis.cancel();
        }
        this._isSpeaking = false;
        this.onStateChangedEmitter.fire(false);
    }

    toggle(text: string, lang = 'en-US'): void {
        if (this._isSpeaking) {
            this.stop();
        } else {
            this.speak(text, lang);
        }
    }

    dispose(): void {
        this.stop();
        this.onStateChangedEmitter.dispose();
    }
}
