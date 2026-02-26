import * as vscode from 'vscode';
import { SeshatEvent, SeshatRunnerStatus } from './types';

export type PanelMessageFromWebview =
  | { type: 'confirm' }
  | { type: 'cancel' }
  | { type: 'messageEdited'; message: string };

export class SeshatPanel implements vscode.Disposable {
  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly onDidReceiveMessageEmitter = new vscode.EventEmitter<PanelMessageFromWebview>();
  private readonly onDidDisposeEmitter = new vscode.EventEmitter<void>();

  readonly onDidReceiveMessage = this.onDidReceiveMessageEmitter.event;
  readonly onDidDispose = this.onDidDisposeEmitter.event;

  constructor(context: vscode.ExtensionContext) {
    this.panel = vscode.window.createWebviewPanel(
      'seshat.panel',
      'Seshat',
      {
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus: false,
      },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
      }
    );

    this.panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'seshat-icon.svg');
    this.panel.webview.html = this.getHtml(this.panel.webview);

    this.panel.onDidDispose(
      () => {
        this.onDidDisposeEmitter.fire();
      },
      null,
      this.disposables
    );

    this.panel.webview.onDidReceiveMessage(
      (message: unknown) => {
        if (!message || typeof message !== 'object' || !('type' in message)) {
          return;
        }

        const type = (message as { type: unknown }).type;
        if (type === 'confirm' || type === 'cancel') {
          this.onDidReceiveMessageEmitter.fire({ type });
          return;
        }

        if (type === 'messageEdited') {
          const text = (message as { message?: unknown }).message;
          this.onDidReceiveMessageEmitter.fire({
            type: 'messageEdited',
            message: typeof text === 'string' ? text : '',
          });
        }
      },
      null,
      this.disposables
    );
  }

  reveal(autoOpen: boolean): void {
    this.panel.reveal(vscode.ViewColumn.Beside, !autoOpen);
  }

  postSeshatEvent(event: SeshatEvent): void {
    void this.panel.webview.postMessage({ type: 'seshat-event', event });
  }

  setStatus(status: SeshatRunnerStatus, text?: string): void {
    void this.panel.webview.postMessage({ type: 'status', status, text });
  }

  setCommitMessage(message: string, suggested: string): void {
    void this.panel.webview.postMessage({
      type: 'set-commit-message',
      message,
      suggested,
    });
  }

  showCommitActions(visible: boolean, prompt?: string): void {
    void this.panel.webview.postMessage({
      type: 'show-commit-actions',
      visible,
      prompt,
    });
  }

  reset(): void {
    void this.panel.webview.postMessage({ type: 'reset' });
  }

  postSystemOutput(title: string, output: string): void {
    void this.panel.webview.postMessage({
      type: 'system-output',
      title,
      output,
    });
  }

  dispose(): void {
    this.panel.dispose();

    while (this.disposables.length > 0) {
      const disposable = this.disposables.pop();
      disposable?.dispose();
    }

    this.onDidReceiveMessageEmitter.dispose();
    this.onDidDisposeEmitter.dispose();
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = createNonce();
    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource} data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Seshat</title>
  <style>
    :root {
      color-scheme: light dark;
    }

    body {
      margin: 0;
      padding: 12px;
      font-family: var(--vscode-font-family, sans-serif);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 10px;
    }

    #summary {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin-top: 2px;
    }

    #status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      padding: 4px 8px;
      border-radius: 999px;
      border: 1px solid var(--vscode-panel-border);
    }

    #status.running::before {
      content: '';
      width: 8px;
      height: 8px;
      border: 2px solid var(--vscode-progressBar-background);
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    #status.success::before {
      content: '✔';
      color: var(--vscode-testing-iconPassed);
      font-weight: bold;
    }

    #status.error::before {
      content: '✖';
      color: var(--vscode-errorForeground);
      font-weight: bold;
    }

    #status.idle::before {
      content: '•';
      color: var(--vscode-descriptionForeground);
      font-weight: bold;
    }

    section {
      margin-bottom: 12px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 10px;
      background: var(--vscode-sideBar-background);
    }

    h2 {
      margin: 0 0 8px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--vscode-descriptionForeground);
    }

    #progress-line {
      font-size: 12px;
      margin-bottom: 8px;
      color: var(--vscode-foreground);
    }

    #event-log,
    #file-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 6px;
      font-size: 12px;
    }

    .log-item {
      border-left: 3px solid transparent;
      padding-left: 8px;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .log-step { border-left-color: var(--vscode-textLink-foreground); }
    .log-info { border-left-color: var(--vscode-focusBorder); }
    .log-warning { border-left-color: var(--vscode-editorWarning-foreground); }
    .log-error { border-left-color: var(--vscode-errorForeground); }
    .log-success { border-left-color: var(--vscode-testing-iconPassed); }

    details {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      margin-top: 8px;
      overflow: hidden;
      background: var(--vscode-editor-background);
    }

    summary {
      padding: 6px 8px;
      cursor: pointer;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-sideBarSectionHeader-background);
    }

    pre {
      margin: 0;
      padding: 8px;
      overflow: auto;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px;
      white-space: pre-wrap;
      word-break: break-word;
    }

    #review-output {
      display: grid;
      gap: 6px;
      font-size: 12px;
    }

    .review-line {
      border-left: 3px solid transparent;
      padding-left: 8px;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .review-bug {
      border-left-color: var(--vscode-errorForeground);
      color: var(--vscode-errorForeground);
    }

    .review-smell {
      border-left-color: var(--vscode-editorWarning-foreground);
      color: var(--vscode-editorWarning-foreground);
    }

    #message-box {
      display: none;
    }

    textarea {
      width: 100%;
      box-sizing: border-box;
      resize: vertical;
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 4px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      padding: 8px;
      font-family: var(--vscode-editor-font-family, monospace);
      min-height: 88px;
    }

    #confirm-prompt {
      margin-top: 8px;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }

    #actions {
      margin-top: 10px;
      display: none;
      gap: 8px;
    }

    button {
      border: 0;
      border-radius: 4px;
      padding: 6px 10px;
      cursor: pointer;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
    }

    button:hover {
      background: var(--vscode-button-hoverBackground);
    }

    button.secondary {
      color: var(--vscode-secondaryButton-foreground);
      background: var(--vscode-secondaryButton-background);
    }

    button.secondary:hover {
      background: var(--vscode-secondaryButton-hoverBackground);
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <strong>Seshat</strong>
      <div id="summary">Aguardando execução...</div>
    </div>
    <div id="status" class="idle">Parado</div>
  </header>

  <section>
    <h2>Progresso</h2>
    <div id="progress-line">Sem progresso ainda.</div>
    <ul id="event-log"></ul>
  </section>

  <section>
    <h2>Arquivos Staged</h2>
    <ul id="file-list"></ul>
  </section>

  <section>
    <h2>Tool Output</h2>
    <div id="tool-output"></div>
  </section>

  <section>
    <h2>Code Review</h2>
    <div id="review-output"></div>
  </section>

  <section id="message-box">
    <h2>Mensagem de Commit</h2>
    <textarea id="commit-message"></textarea>
    <div id="confirm-prompt"></div>
    <div id="actions">
      <button id="confirm-button" type="button">Confirmar Commit</button>
      <button id="cancel-button" class="secondary" type="button">Cancelar</button>
    </div>
  </section>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    const summaryEl = document.getElementById('summary');
    const statusEl = document.getElementById('status');
    const progressEl = document.getElementById('progress-line');
    const logListEl = document.getElementById('event-log');
    const fileListEl = document.getElementById('file-list');
    const toolOutputEl = document.getElementById('tool-output');
    const reviewOutputEl = document.getElementById('review-output');
    const messageBoxEl = document.getElementById('message-box');
    const messageInputEl = document.getElementById('commit-message');
    const confirmPromptEl = document.getElementById('confirm-prompt');
    const actionsEl = document.getElementById('actions');
    const confirmButtonEl = document.getElementById('confirm-button');
    const cancelButtonEl = document.getElementById('cancel-button');

    const state = {
      suggestedMessage: '',
      toolCounter: 0,
      reviewCounter: 0,
    };

    function setStatus(status, text) {
      statusEl.className = status;
      statusEl.textContent = text || status;
    }

    function appendLog(kind, message) {
      const li = document.createElement('li');
      li.className = 'log-item log-' + kind;
      li.textContent = message;
      logListEl.appendChild(li);
      logListEl.scrollTop = logListEl.scrollHeight;
    }

    function appendDetails(target, summary, body) {
      const details = document.createElement('details');
      details.open = true;

      const summaryEl = document.createElement('summary');
      summaryEl.textContent = summary;

      const pre = document.createElement('pre');
      pre.textContent = body;

      details.appendChild(summaryEl);
      details.appendChild(pre);
      target.appendChild(details);
    }

    function renderReview(text, files) {
      const wrapper = document.createElement('div');
      wrapper.style.display = 'grid';
      wrapper.style.gap = '6px';

      const lines = String(text || '').split(/\r?\n/).filter(Boolean);
      if (lines.length === 0) {
        lines.push('(sem detalhes)');
      }

      for (const line of lines) {
        const item = document.createElement('div');
        item.className = 'review-line';
        const upper = line.toUpperCase();
        if (upper.includes('[BUG]')) {
          item.classList.add('review-bug');
        } else if (upper.includes('[SMELL]')) {
          item.classList.add('review-smell');
        }
        item.textContent = line;
        wrapper.appendChild(item);
      }

      if (Array.isArray(files) && files.length > 0) {
        const filesLabel = document.createElement('div');
        filesLabel.className = 'review-line';
        filesLabel.textContent = 'Arquivos: ' + files.join(', ');
        wrapper.appendChild(filesLabel);
      }

      reviewOutputEl.appendChild(wrapper);
    }

    function setSummary(provider, language) {
      const left = provider ? ('Provider: ' + provider) : 'Provider: -';
      const right = language ? ('Language: ' + language) : 'Language: -';
      summaryEl.textContent = left + ' | ' + right;
    }

    function setCommitMessage(message, suggested) {
      messageBoxEl.style.display = 'block';
      messageInputEl.value = message;
      state.suggestedMessage = suggested || message;
    }

    function showCommitActions(visible, prompt) {
      actionsEl.style.display = visible ? 'flex' : 'none';
      confirmPromptEl.textContent = prompt || '';
    }

    function resetView() {
      setSummary('', '');
      setStatus('idle', 'Parado');
      progressEl.textContent = 'Sem progresso ainda.';
      logListEl.replaceChildren();
      fileListEl.replaceChildren();
      toolOutputEl.replaceChildren();
      reviewOutputEl.replaceChildren();
      messageInputEl.value = '';
      confirmPromptEl.textContent = '';
      actionsEl.style.display = 'none';
      messageBoxEl.style.display = 'none';
      state.suggestedMessage = '';
      state.toolCounter = 0;
      state.reviewCounter = 0;
    }

    window.addEventListener('message', (e) => {
      const message = e.data;
      if (!message || typeof message !== 'object') {
        return;
      }

      if (message.type === 'status') {
        setStatus(message.status, message.text);
        return;
      }

      if (message.type === 'set-commit-message') {
        setCommitMessage(String(message.message || ''), String(message.suggested || ''));
        return;
      }

      if (message.type === 'show-commit-actions') {
        showCommitActions(Boolean(message.visible), String(message.prompt || ''));
        return;
      }

      if (message.type === 'system-output') {
        appendDetails(toolOutputEl, String(message.title || 'Saída'), String(message.output || ''));
        return;
      }

      if (message.type === 'reset') {
        resetView();
        return;
      }

      if (message.type !== 'seshat-event') {
        return;
      }

      const event = message.event;
      if (!event || typeof event !== 'object') {
        return;
      }

      const name = String(event.event || 'info');

      if (name === 'summary') {
        const data = event.data && typeof event.data === 'object' ? event.data : {};
        setSummary(data.Provider || data.provider || '', data.Language || data.language || '');
        return;
      }

      if (name === 'progress_started' || name === 'progress_update' || name === 'progress_done') {
        const text = String(event.message || '');
        progressEl.textContent = text || 'Atualizando...';
        if (name === 'progress_started' || name === 'progress_update') {
          setStatus('running', 'Executando');
        }
        return;
      }

      if (name === 'step' || name === 'info' || name === 'warning' || name === 'error' || name === 'success') {
        appendLog(name, String(event.message || ''));
        if (name === 'error') {
          setStatus('error', 'Erro');
        }
        if (name === 'success') {
          setStatus('success', 'Concluído');
        }
        return;
      }

      if (name === 'panel') {
        appendDetails(toolOutputEl, String(event.title || 'Painel'), String(event.content || ''));
        return;
      }

      if (name === 'file_list') {
        fileListEl.replaceChildren();
        if (Array.isArray(event.files)) {
          for (const file of event.files) {
            const li = document.createElement('li');
            li.textContent = String(file);
            fileListEl.appendChild(li);
          }
        }
        return;
      }

      if (name === 'tool_output') {
        state.toolCounter += 1;
        const language = event.language ? ' [' + String(event.language) + ']' : '';
        const status = event.status ? ' (' + String(event.status) + ')' : '';
        const title = 'Tool output #' + state.toolCounter + language + status;
        appendDetails(toolOutputEl, title, String(event.output || ''));
        return;
      }

      if (name === 'review_output') {
        state.reviewCounter += 1;
        const title = document.createElement('div');
        title.style.fontSize = '12px';
        title.style.color = 'var(--vscode-descriptionForeground)';
        title.textContent = 'Review #' + state.reviewCounter;
        reviewOutputEl.appendChild(title);
        renderReview(String(event.text || ''), Array.isArray(event.files) ? event.files : []);
        return;
      }

      if (name === 'message_ready') {
        const value = String(event.message || '');
        setCommitMessage(value, value);
        return;
      }

      if (name === 'committed') {
        setStatus('success', String(event.summary || 'Commit realizado'));
        showCommitActions(false, '');
        return;
      }

      if (name === 'cancelled') {
        setStatus('error', 'Cancelado');
        showCommitActions(false, '');
      }
    });

    confirmButtonEl.addEventListener('click', () => {
      vscode.postMessage({ type: 'confirm' });
    });

    cancelButtonEl.addEventListener('click', () => {
      vscode.postMessage({ type: 'cancel' });
    });

    messageInputEl.addEventListener('input', () => {
      vscode.postMessage({ type: 'messageEdited', message: messageInputEl.value });
    });
  </script>
</body>
</html>`;
  }
}

function createNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let i = 0; i < 32; i += 1) {
    value += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return value;
}
