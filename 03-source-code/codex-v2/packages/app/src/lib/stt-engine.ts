// ============================================================================
// CodeEX v2 — Speech-to-Text Engine
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Provides STT (dictation) and transcription via Web Speech API.
// Keyboard shortcut toggle: Ctrl+M (on/off)
// Transcription mode: processes audio files and returns text.
// ============================================================================

export interface STTCallbacks {
  onResult: (text: string, isFinal: boolean) => void;
  onStart: () => void;
  onEnd: () => void;
  onError: (error: string) => void;
}

export interface TranscriptionResult {
  text: string;
  confidence: number;
  duration: number;
}

const SpeechRecognition =
  (globalThis as any).SpeechRecognition ||
  (globalThis as any).webkitSpeechRecognition;

let recognition: any = null;
let isListening = false;
let callbacks: STTCallbacks | null = null;

/** Check if Web Speech API is available in this browser. */
export function isSTTAvailable(): boolean {
  return !!SpeechRecognition;
}

/** Start listening for speech input. Returns false if unavailable. */
export function startListening(cb: STTCallbacks, lang = "en-US"): boolean {
  if (!SpeechRecognition) {
    cb.onError("Speech recognition not supported in this browser.");
    return false;
  }

  if (isListening && recognition) {
    stopListening();
  }

  callbacks = cb;
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = lang;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    isListening = true;
    callbacks?.onStart();
  };

  recognition.onresult = (event: any) => {
    let interimTranscript = "";
    let finalTranscript = "";

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }

    if (finalTranscript) {
      callbacks?.onResult(finalTranscript, true);
    } else if (interimTranscript) {
      callbacks?.onResult(interimTranscript, false);
    }
  };

  recognition.onerror = (event: any) => {
    const msg =
      event.error === "no-speech"
        ? "No speech detected."
        : event.error === "not-allowed"
        ? "Microphone access denied."
        : event.error === "network"
        ? "Network error during speech recognition."
        : `Speech recognition error: ${event.error}`;
    callbacks?.onError(msg);
  };

  recognition.onend = () => {
    isListening = false;
    callbacks?.onEnd();
  };

  try {
    recognition.start();
    return true;
  } catch {
    callbacks?.onError("Failed to start speech recognition.");
    return false;
  }
}

/** Stop listening. */
export function stopListening(): void {
  if (recognition) {
    try {
      recognition.stop();
    } catch {
      // Already stopped
    }
    recognition = null;
  }
  isListening = false;
}

/** Toggle listening on/off. Returns the new state. */
export function toggleListening(cb: STTCallbacks, lang = "en-US"): boolean {
  if (isListening) {
    stopListening();
    return false;
  } else {
    startListening(cb, lang);
    return true;
  }
}

/** Get current listening state. */
export function getListeningState(): boolean {
  return isListening;
}

// ---------------------------------------------------------------------------
// Transcription: Process audio/video files to extract text
// Uses Web Speech API via an AudioContext playback workaround,
// or falls back to a server-side endpoint for real TerraVoice inference.
// ---------------------------------------------------------------------------

/**
 * Transcribe an audio or video file.
 * In browser mode, this uses a TerraVoice-compatible endpoint on TerraForge.
 * Falls back to a placeholder if no endpoint is available.
 */
export async function transcribeFile(
  file: File,
  endpoint = "http://terravoice.local/v1/audio/transcriptions"
): Promise<TranscriptionResult> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("model", "terravoice-1");
  formData.append("response_format", "json");
  formData.append("language", "en");

  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      body: formData,
    });

    if (!resp.ok) {
      throw new Error(`Transcription API returned ${resp.status}`);
    }

    const data = await resp.json();
    return {
      text: data.text || "",
      confidence: data.confidence ?? 0.95,
      duration: data.duration ?? 0,
    };
  } catch (err: any) {
    // Fallback: return error message for now — real TerraVoice endpoint pending on TerraForge
    throw new Error(
      `Transcription failed: ${err.message}. TerraVoice endpoint may not be running on TerraForge.`
    );
  }
}

/**
 * Transcribe from a Blob (e.g., recorded audio).
 */
export async function transcribeBlob(
  blob: Blob,
  fileName = "recording.webm",
  endpoint?: string
): Promise<TranscriptionResult> {
  const file = new File([blob], fileName, { type: blob.type });
  return transcribeFile(file, endpoint);
}
