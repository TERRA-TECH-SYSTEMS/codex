// ============================================================================
// CodeEX v5 — Gixsis Speech-to-Text Service
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Ported from CodeEX v2 stt-engine.ts. Web Speech API dictation +
// TerraVoice transcription endpoint.
// ============================================================================

import { Emitter, Event } from '@theia/core';
import { injectable } from '@theia/core/shared/inversify';

export interface STTEvent {
    text: string;
    isFinal: boolean;
}

const SpeechRecognitionAPI =
    (globalThis as any).SpeechRecognition ||
    (globalThis as any).webkitSpeechRecognition;

@injectable()
export class GixsisSTTService {

    protected recognition: any = null;
    protected _isListening = false;

    protected readonly onResultEmitter = new Emitter<STTEvent>();
    readonly onResult: Event<STTEvent> = this.onResultEmitter.event;

    protected readonly onStateChangedEmitter = new Emitter<boolean>();
    readonly onStateChanged: Event<boolean> = this.onStateChangedEmitter.event;

    protected readonly onErrorEmitter = new Emitter<string>();
    readonly onError: Event<string> = this.onErrorEmitter.event;

    get isAvailable(): boolean {
        return !!SpeechRecognitionAPI;
    }

    get isListening(): boolean {
        return this._isListening;
    }

    start(lang = 'en-US'): boolean {
        if (!SpeechRecognitionAPI) {
            this.onErrorEmitter.fire('Speech recognition not supported.');
            return false;
        }
        if (this._isListening) {
            this.stop();
        }

        this.recognition = new SpeechRecognitionAPI();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = lang;
        this.recognition.maxAlternatives = 1;

        this.recognition.onstart = () => {
            this._isListening = true;
            this.onStateChangedEmitter.fire(true);
        };

        this.recognition.onresult = (event: any) => {
            let interimTranscript = '';
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }
            if (finalTranscript) {
                this.onResultEmitter.fire({ text: finalTranscript, isFinal: true });
            } else if (interimTranscript) {
                this.onResultEmitter.fire({ text: interimTranscript, isFinal: false });
            }
        };

        this.recognition.onerror = (event: any) => {
            const msg = event.error === 'no-speech' ? 'No speech detected.'
                : event.error === 'not-allowed' ? 'Microphone access denied.'
                : event.error === 'network' ? 'Network error during recognition.'
                : `Speech error: ${event.error}`;
            this.onErrorEmitter.fire(msg);
        };

        this.recognition.onend = () => {
            this._isListening = false;
            this.onStateChangedEmitter.fire(false);
        };

        try {
            this.recognition.start();
            return true;
        } catch {
            this.onErrorEmitter.fire('Failed to start speech recognition.');
            return false;
        }
    }

    stop(): void {
        if (this.recognition) {
            try { this.recognition.stop(); } catch { /* already stopped */ }
            this.recognition = null;
        }
        this._isListening = false;
        this.onStateChangedEmitter.fire(false);
    }

    toggle(lang = 'en-US'): boolean {
        if (this._isListening) {
            this.stop();
            return false;
        }
        return this.start(lang);
    }

    dispose(): void {
        this.stop();
        this.onResultEmitter.dispose();
        this.onStateChangedEmitter.dispose();
        this.onErrorEmitter.dispose();
    }
}
