import * as vscode from 'vscode';
import * as https from 'https';
import * as http from 'http';

export interface OllamaModel {
    name: string;
    size: number;
    digest: string;
    modified_at: string;
}

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export class OllamaClient {
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    private getConfig() {
        const config = vscode.workspace.getConfiguration('ageixtic');
        const useCloud = config.get<boolean>('useCloud', false);
        const endpoint = useCloud
            ? config.get<string>('cloudEndpoint', 'http://162.250.127.70:11434')
            : config.get<string>('ollamaEndpoint', 'http://localhost:11434');
        const model = config.get<string>('defaultModel', 'llama3.1:8b');
        const maxTokens = config.get<number>('maxTokens', 4096);
        const temperature = config.get<number>('temperature', 0.7);

        return { endpoint, model, maxTokens, temperature, useCloud };
    }

    async checkConnection(): Promise<boolean> {
        const { endpoint } = this.getConfig();

        return new Promise((resolve) => {
            const url = new URL(endpoint);
            const options = {
                hostname: url.hostname,
                port: url.port || (url.protocol === 'https:' ? 443 : 80),
                path: '/api/tags',
                method: 'GET',
                timeout: 5000
            };

            const protocol = url.protocol === 'https:' ? https : http;
            const req = protocol.request(options, (res) => {
                resolve(res.statusCode === 200);
            });

            req.on('error', () => resolve(false));
            req.on('timeout', () => {
                req.destroy();
                resolve(false);
            });
            req.end();
        });
    }

    async listModels(): Promise<OllamaModel[]> {
        const { endpoint } = this.getConfig();

        return new Promise((resolve, reject) => {
            const url = new URL(endpoint);
            const options = {
                hostname: url.hostname,
                port: url.port || (url.protocol === 'https:' ? 443 : 80),
                path: '/api/tags',
                method: 'GET'
            };

            const protocol = url.protocol === 'https:' ? https : http;
            const req = protocol.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        resolve(parsed.models || []);
                    } catch {
                        reject(new Error('Invalid response from Ollama'));
                    }
                });
            });

            req.on('error', reject);
            req.end();
        });
    }

    async streamChat(
        prompt: string,
        onChunk: (chunk: string) => void,
        messages: ChatMessage[] = []
    ): Promise<void> {
        const { endpoint, model, maxTokens, temperature } = this.getConfig();

        const allMessages: ChatMessage[] = [
            {
                role: 'system',
                content: 'You are AGEIXTIC, an AI assistant integrated into CodeEX IDE. You help developers with coding questions, code review, refactoring, and documentation. Be concise and helpful.'
            },
            ...messages,
            { role: 'user', content: prompt }
        ];

        const body = JSON.stringify({
            model,
            messages: allMessages,
            stream: true,
            options: {
                num_predict: maxTokens,
                temperature
            }
        });

        return new Promise((resolve, reject) => {
            const url = new URL(endpoint);
            const options = {
                hostname: url.hostname,
                port: url.port || (url.protocol === 'https:' ? 443 : 80),
                path: '/api/chat',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body)
                }
            };

            const protocol = url.protocol === 'https:' ? https : http;
            const req = protocol.request(options, (res) => {
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                    return;
                }

                res.on('data', (chunk) => {
                    const lines = chunk.toString().split('\n').filter((line: string) => line.trim());
                    for (const line of lines) {
                        try {
                            const parsed = JSON.parse(line);
                            if (parsed.message?.content) {
                                onChunk(parsed.message.content);
                            }
                            if (parsed.done) {
                                resolve();
                            }
                        } catch {
                            // Ignore parse errors for incomplete chunks
                        }
                    }
                });

                res.on('end', resolve);
                res.on('error', reject);
            });

            req.on('error', reject);
            req.write(body);
            req.end();
        });
    }

    async generate(prompt: string): Promise<string> {
        const { endpoint, model, maxTokens, temperature } = this.getConfig();

        const body = JSON.stringify({
            model,
            prompt,
            stream: false,
            options: {
                num_predict: maxTokens,
                temperature
            }
        });

        return new Promise((resolve, reject) => {
            const url = new URL(endpoint);
            const options = {
                hostname: url.hostname,
                port: url.port || (url.protocol === 'https:' ? 443 : 80),
                path: '/api/generate',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body)
                }
            };

            const protocol = url.protocol === 'https:' ? https : http;
            const req = protocol.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        resolve(parsed.response || '');
                    } catch {
                        reject(new Error('Invalid response from Ollama'));
                    }
                });
            });

            req.on('error', reject);
            req.write(body);
            req.end();
        });
    }
}
