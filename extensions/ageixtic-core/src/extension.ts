import * as vscode from 'vscode';
import { OllamaClient } from './ollama-client';
import { ChatPanelProvider } from './chat-panel';
import { HistoryProvider } from './history-provider';
import { ModelsProvider } from './models-provider';

let ollamaClient: OllamaClient;

export function activate(context: vscode.ExtensionContext) {
    console.log('AGEIXTIC Core extension is now active');

    // Initialize Ollama client
    ollamaClient = new OllamaClient(context);

    // Register webview provider for chat panel
    const chatPanelProvider = new ChatPanelProvider(context, ollamaClient);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('ageixtic.chatPanel', chatPanelProvider)
    );

    // Register tree data providers
    const historyProvider = new HistoryProvider(context);
    const modelsProvider = new ModelsProvider(ollamaClient);

    vscode.window.registerTreeDataProvider('ageixtic.history', historyProvider);
    vscode.window.registerTreeDataProvider('ageixtic.models', modelsProvider);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('ageixtic.showPanel', () => {
            vscode.commands.executeCommand('workbench.view.extension.ageixtic');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('ageixtic.askAI', async () => {
            const input = await vscode.window.showInputBox({
                prompt: 'Ask AGEIXTIC AI',
                placeHolder: 'Type your question...'
            });
            if (input) {
                await handleAIQuery(input, context);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('ageixtic.explainCode', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No active editor');
                return;
            }
            const selection = editor.document.getText(editor.selection);
            if (!selection) {
                vscode.window.showWarningMessage('No code selected');
                return;
            }
            const prompt = `Explain the following code:\n\n\`\`\`\n${selection}\n\`\`\``;
            await handleAIQuery(prompt, context);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('ageixtic.refactorCode', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No active editor');
                return;
            }
            const selection = editor.document.getText(editor.selection);
            if (!selection) {
                vscode.window.showWarningMessage('No code selected');
                return;
            }
            const prompt = `Refactor the following code to improve readability, performance, and maintainability. Provide the refactored code with explanations:\n\n\`\`\`\n${selection}\n\`\`\``;
            await handleAIQuery(prompt, context);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('ageixtic.generateDocs', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No active editor');
                return;
            }
            const selection = editor.document.getText(editor.selection);
            if (!selection) {
                vscode.window.showWarningMessage('No code selected');
                return;
            }
            const languageId = editor.document.languageId;
            const prompt = `Generate documentation for the following ${languageId} code. Include JSDoc/docstring comments as appropriate:\n\n\`\`\`${languageId}\n${selection}\n\`\`\``;
            await handleAIQuery(prompt, context);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('ageixtic.checkConnection', async () => {
            await checkConnection();
        })
    );

    // Show welcome message on first install
    const hasShownWelcome = context.globalState.get('ageixtic.hasShownWelcome');
    if (!hasShownWelcome) {
        vscode.window.showInformationMessage(
            'AGEIXTIC Core installed! Configure your Ollama endpoint in settings.',
            'Open Settings'
        ).then(selection => {
            if (selection === 'Open Settings') {
                vscode.commands.executeCommand('workbench.action.openSettings', 'ageixtic');
            }
        });
        context.globalState.update('ageixtic.hasShownWelcome', true);
    }

    // Check connection on startup
    checkConnection();
}

async function handleAIQuery(prompt: string, context: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel('AGEIXTIC AI');
    outputChannel.show();
    outputChannel.appendLine('AGEIXTIC AI Response');
    outputChannel.appendLine('='.repeat(50));
    outputChannel.appendLine('');

    try {
        await ollamaClient.streamChat(prompt, (chunk) => {
            outputChannel.append(chunk);
        });
        outputChannel.appendLine('');
        outputChannel.appendLine('');
        outputChannel.appendLine('='.repeat(50));
        outputChannel.appendLine('Response complete.');
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        outputChannel.appendLine(`Error: ${errorMessage}`);
        vscode.window.showErrorMessage(`AGEIXTIC AI Error: ${errorMessage}`);
    }
}

async function checkConnection() {
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = '$(sync~spin) AGEIXTIC...';
    statusBarItem.show();

    try {
        const isConnected = await ollamaClient.checkConnection();
        if (isConnected) {
            statusBarItem.text = '$(check) AGEIXTIC';
            statusBarItem.tooltip = 'Connected to Ollama';
            vscode.window.showInformationMessage('AGEIXTIC: Connected to Ollama successfully!');
        } else {
            statusBarItem.text = '$(warning) AGEIXTIC';
            statusBarItem.tooltip = 'Not connected to Ollama';
            vscode.window.showWarningMessage('AGEIXTIC: Could not connect to Ollama. Check your settings.');
        }
    } catch (error) {
        statusBarItem.text = '$(error) AGEIXTIC';
        statusBarItem.tooltip = 'Connection error';
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`AGEIXTIC Connection Error: ${errorMessage}`);
    }

    setTimeout(() => statusBarItem.dispose(), 5000);
}

export function deactivate() {
    console.log('AGEIXTIC Core extension deactivated');
}
