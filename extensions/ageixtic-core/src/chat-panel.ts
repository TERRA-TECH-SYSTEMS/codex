import * as vscode from 'vscode';
import { OllamaClient, ChatMessage } from './ollama-client';

export class ChatPanelProvider implements vscode.WebviewViewProvider {
    private context: vscode.ExtensionContext;
    private ollamaClient: OllamaClient;
    private webviewView?: vscode.WebviewView;
    private chatHistory: ChatMessage[] = [];

    constructor(context: vscode.ExtensionContext, ollamaClient: OllamaClient) {
        this.context = context;
        this.ollamaClient = ollamaClient;
    }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this.webviewView = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri]
        };

        webviewView.webview.html = this.getHtmlContent();

        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'send':
                    await this.handleUserMessage(message.text);
                    break;
                case 'clear':
                    this.chatHistory = [];
                    this.postMessage({ command: 'cleared' });
                    break;
            }
        });
    }

    private async handleUserMessage(text: string) {
        // Add user message to history
        this.chatHistory.push({ role: 'user', content: text });
        this.postMessage({ command: 'userMessage', text });

        // Stream AI response
        this.postMessage({ command: 'startResponse' });

        try {
            let fullResponse = '';
            await this.ollamaClient.streamChat(text, (chunk) => {
                fullResponse += chunk;
                this.postMessage({ command: 'responseChunk', text: chunk });
            }, this.chatHistory.slice(0, -1)); // Exclude the message we just added

            // Add assistant response to history
            this.chatHistory.push({ role: 'assistant', content: fullResponse });
            this.postMessage({ command: 'endResponse' });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.postMessage({ command: 'error', text: errorMessage });
        }
    }

    private postMessage(message: any) {
        this.webviewView?.webview.postMessage(message);
    }

    private getHtmlContent(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AGEIXTIC Chat</title>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-sideBar-background);
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        .chat-container {
            flex: 1;
            overflow-y: auto;
            padding: 10px;
        }
        .message {
            margin-bottom: 12px;
            padding: 8px 12px;
            border-radius: 8px;
            max-width: 90%;
        }
        .user-message {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            margin-left: auto;
        }
        .assistant-message {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-widget-border);
        }
        .message-header {
            font-size: 0.85em;
            opacity: 0.7;
            margin-bottom: 4px;
        }
        .message-content {
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        .message-content code {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 2px 4px;
            border-radius: 3px;
            font-family: var(--vscode-editor-font-family);
        }
        .message-content pre {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 8px;
            border-radius: 4px;
            overflow-x: auto;
            margin: 8px 0;
        }
        .input-container {
            padding: 10px;
            border-top: 1px solid var(--vscode-widget-border);
            display: flex;
            gap: 8px;
        }
        #messageInput {
            flex: 1;
            padding: 8px;
            border: 1px solid var(--vscode-input-border);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 4px;
            font-family: inherit;
            font-size: inherit;
            resize: none;
        }
        #messageInput:focus {
            outline: 1px solid var(--vscode-focusBorder);
        }
        button {
            padding: 8px 16px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-family: inherit;
        }
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .typing-indicator {
            display: none;
            padding: 8px 12px;
            color: var(--vscode-descriptionForeground);
        }
        .typing-indicator.visible {
            display: block;
        }
        .error-message {
            color: var(--vscode-errorForeground);
            background-color: var(--vscode-inputValidation-errorBackground);
            padding: 8px;
            border-radius: 4px;
            margin: 8px 0;
        }
        .toolbar {
            padding: 8px;
            border-bottom: 1px solid var(--vscode-widget-border);
            display: flex;
            justify-content: flex-end;
        }
        .toolbar button {
            padding: 4px 8px;
            font-size: 0.85em;
        }
    </style>
</head>
<body>
    <div class="toolbar">
        <button id="clearBtn" title="Clear chat">Clear</button>
    </div>
    <div class="chat-container" id="chatContainer">
        <div class="message assistant-message">
            <div class="message-header">AGEIXTIC</div>
            <div class="message-content">Hello! I'm AGEIXTIC, your AI coding assistant. How can I help you today?</div>
        </div>
    </div>
    <div class="typing-indicator" id="typingIndicator">AGEIXTIC is thinking...</div>
    <div class="input-container">
        <textarea id="messageInput" rows="2" placeholder="Ask AGEIXTIC..."></textarea>
        <button id="sendBtn">Send</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const chatContainer = document.getElementById('chatContainer');
        const messageInput = document.getElementById('messageInput');
        const sendBtn = document.getElementById('sendBtn');
        const clearBtn = document.getElementById('clearBtn');
        const typingIndicator = document.getElementById('typingIndicator');

        let currentResponse = null;

        function addMessage(role, content) {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message ' + (role === 'user' ? 'user-message' : 'assistant-message');

            const headerDiv = document.createElement('div');
            headerDiv.className = 'message-header';
            headerDiv.textContent = role === 'user' ? 'You' : 'AGEIXTIC';

            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';
            contentDiv.textContent = content;

            messageDiv.appendChild(headerDiv);
            messageDiv.appendChild(contentDiv);
            chatContainer.appendChild(messageDiv);

            chatContainer.scrollTop = chatContainer.scrollHeight;
            return contentDiv;
        }

        function sendMessage() {
            const text = messageInput.value.trim();
            if (!text) return;

            vscode.postMessage({ command: 'send', text });
            messageInput.value = '';
            sendBtn.disabled = true;
        }

        sendBtn.addEventListener('click', sendMessage);

        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        clearBtn.addEventListener('click', () => {
            vscode.postMessage({ command: 'clear' });
        });

        window.addEventListener('message', (event) => {
            const message = event.data;

            switch (message.command) {
                case 'userMessage':
                    addMessage('user', message.text);
                    break;

                case 'startResponse':
                    typingIndicator.classList.add('visible');
                    currentResponse = addMessage('assistant', '');
                    break;

                case 'responseChunk':
                    if (currentResponse) {
                        currentResponse.textContent += message.text;
                        chatContainer.scrollTop = chatContainer.scrollHeight;
                    }
                    break;

                case 'endResponse':
                    typingIndicator.classList.remove('visible');
                    sendBtn.disabled = false;
                    currentResponse = null;
                    break;

                case 'error':
                    typingIndicator.classList.remove('visible');
                    sendBtn.disabled = false;
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'error-message';
                    errorDiv.textContent = 'Error: ' + message.text;
                    chatContainer.appendChild(errorDiv);
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                    break;

                case 'cleared':
                    chatContainer.innerHTML = '';
                    addMessage('assistant', 'Chat cleared. How can I help you?');
                    break;
            }
        });
    </script>
</body>
</html>`;
    }
}
