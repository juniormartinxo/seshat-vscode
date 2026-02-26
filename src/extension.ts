import { spawn } from 'child_process';
import * as vscode from 'vscode';
import { PanelMessageFromWebview, SeshatPanel } from './seshatPanel';
import { SeshatRunner } from './seshatRunner';
import {
  BaseSeshatEvent,
  ChoiceNeededEvent,
  CommittedEvent,
  ConfirmNeededEvent,
  MessageReadyEvent,
  SeshatEvent,
} from './types';

interface RunnerListeners {
  event: (event: SeshatEvent) => void;
  stderr: (line: string) => void;
  close: (code: number | null, signal: NodeJS.Signals | null) => void;
  error: (error: Error) => void;
}

interface GitCommitFailure extends Error {
  stdout?: string;
  stderr?: string;
  code?: number | null;
}

class SeshatController implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private panel: SeshatPanel | null = null;
  private runner: SeshatRunner | null = null;
  private runnerListeners: RunnerListeners | null = null;
  private workspacePath: string | null = null;

  private suggestedMessage = '';
  private editedMessage = '';
  private hasMessageReady = false;
  private waitingForCommitConfirmation = false;
  private replacingWithManualGitCommit = false;
  private sawTerminalEvent = false;

  constructor(private readonly context: vscode.ExtensionContext) {
    const commandDisposable = vscode.commands.registerCommand('seshat.commit', async () => {
      await this.startCommit();
    });

    this.disposables.push(commandDisposable);
  }

  async startCommit(): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      void vscode.window.showErrorMessage('Seshat: abra um workspace antes de executar o commit.');
      return;
    }

    if (this.runner?.isRunning()) {
      this.panel?.reveal(true);
      void vscode.window.showInformationMessage('Seshat: já existe um commit em execução.');
      return;
    }

    this.workspacePath = workspaceFolder.uri.fsPath;

    const config = vscode.workspace.getConfiguration('seshat');
    const executablePath = config.get<string>('executablePath', 'seshat') || 'seshat';
    const autoOpenPanel = config.get<boolean>('autoOpenPanel', true);

    const panel = this.getOrCreatePanel();
    panel.reveal(autoOpenPanel);
    panel.reset();
    panel.setStatus('running', 'Executando');

    this.suggestedMessage = '';
    this.editedMessage = '';
    this.hasMessageReady = false;
    this.waitingForCommitConfirmation = false;
    this.replacingWithManualGitCommit = false;
    this.sawTerminalEvent = false;

    const runner = new SeshatRunner();
    this.runner = runner;
    this.attachRunnerListeners(runner);

    try {
      runner.run(this.workspacePath, executablePath);
      panel.postSeshatEvent({
        event: 'step',
        message: `Executando: ${executablePath} commit --format json`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      panel.setStatus('error', 'Falha ao iniciar');
      void vscode.window.showErrorMessage(`Seshat: falha ao iniciar processo (${message}).`);
      this.cleanupRunner();
    }
  }

  dispose(): void {
    this.stopRunner();

    if (this.panel) {
      this.panel.dispose();
      this.panel = null;
    }

    while (this.disposables.length > 0) {
      const disposable = this.disposables.pop();
      disposable?.dispose();
    }
  }

  private getOrCreatePanel(): SeshatPanel {
    if (this.panel) {
      return this.panel;
    }

    const panel = new SeshatPanel(this.context);

    panel.onDidReceiveMessage((message: PanelMessageFromWebview) => {
      void this.handlePanelMessage(message);
    });

    panel.onDidDispose(() => {
      if (this.panel === panel) {
        this.panel = null;
      }
      this.stopRunner();
    });

    this.panel = panel;
    return panel;
  }

  private attachRunnerListeners(runner: SeshatRunner): void {
    const listeners: RunnerListeners = {
      event: (event: SeshatEvent) => {
        void this.handleSeshatEvent(event);
      },
      stderr: (line: string) => {
        this.panel?.postSeshatEvent({ event: 'warning', message: line });
      },
      close: (code: number | null) => {
        this.handleRunnerClose(code);
      },
      error: (error: Error) => {
        this.panel?.setStatus('error', 'Erro no processo');
        void vscode.window.showErrorMessage(`Seshat: erro no processo (${error.message}).`);
      },
    };

    runner.on('event', listeners.event);
    runner.on('stderr', listeners.stderr);
    runner.on('close', listeners.close);
    runner.on('error', listeners.error);

    this.runnerListeners = listeners;
  }

  private cleanupRunner(): void {
    if (!this.runner || !this.runnerListeners) {
      this.runner = null;
      this.runnerListeners = null;
      return;
    }

    this.runner.off('event', this.runnerListeners.event);
    this.runner.off('stderr', this.runnerListeners.stderr);
    this.runner.off('close', this.runnerListeners.close);
    this.runner.off('error', this.runnerListeners.error);

    this.runnerListeners = null;
    this.runner = null;
  }

  private stopRunner(): void {
    if (this.runner?.isRunning()) {
      this.runner.kill();
    }
    this.cleanupRunner();
  }

  private handleRunnerClose(code: number | null): void {
    const cancelledForEditedMessage = this.replacingWithManualGitCommit;

    if (!this.sawTerminalEvent && !cancelledForEditedMessage) {
      if (code === 0) {
        this.panel?.setStatus('success', 'Concluído');
      } else {
        this.panel?.setStatus('error', 'Processo finalizado com erro');
      }
    }

    this.panel?.showCommitActions(false);

    this.waitingForCommitConfirmation = false;
    this.cleanupRunner();
  }

  private async handleSeshatEvent(event: SeshatEvent): Promise<void> {
    this.panel?.postSeshatEvent(event);

    switch (event.event) {
      case 'message_ready': {
        this.handleMessageReady(event);
        return;
      }
      case 'confirm_needed': {
        await this.handleConfirmNeeded(event);
        return;
      }
      case 'choice_needed': {
        await this.handleChoiceNeeded(event);
        return;
      }
      case 'committed': {
        this.handleCommitted(event);
        return;
      }
      case 'cancelled': {
        this.handleCancelled(event);
        return;
      }
      case 'error': {
        if (!this.replacingWithManualGitCommit) {
          this.panel?.setStatus('error', event.message || 'Erro');
          void vscode.window.showErrorMessage(`Seshat: ${event.message || 'erro inesperado.'}`);
        }
        return;
      }
      default:
        return;
    }
  }

  private handleMessageReady(event: MessageReadyEvent): void {
    this.suggestedMessage = event.message;
    this.editedMessage = event.message;
    this.hasMessageReady = true;
    this.panel?.setCommitMessage(event.message, event.message);
  }

  private async handleConfirmNeeded(event: ConfirmNeededEvent): Promise<void> {
    const isCommitConfirmation = this.hasMessageReady && /commit/i.test(event.message);
    if (isCommitConfirmation) {
      this.waitingForCommitConfirmation = true;
      this.panel?.showCommitActions(true, event.message);
      return;
    }

    const yesLabel = 'Sim';
    const noLabel = 'Não';
    const choice = await vscode.window.showWarningMessage(event.message, { modal: true }, yesLabel, noLabel);

    if (choice === yesLabel) {
      this.runner?.respond('y');
      return;
    }

    if (choice === noLabel) {
      this.runner?.respond('n');
      return;
    }

    this.runner?.respond(event.default ? 'y' : 'n');
  }

  private async handleChoiceNeeded(event: ChoiceNeededEvent): Promise<void> {
    if (!event.choices || event.choices.length === 0) {
      return;
    }

    const picks = event.choices.map((choice) => ({ label: choice }));
    const selected = await vscode.window.showQuickPick(picks, {
      placeHolder: event.message,
      canPickMany: false,
      ignoreFocusOut: true,
    });

    if (selected) {
      this.runner?.respond(selected.label);
      return;
    }

    if (event.default) {
      this.runner?.respond(event.default);
      return;
    }

    this.runner?.respond(event.choices[0]);
  }

  private handleCommitted(event: CommittedEvent): void {
    this.sawTerminalEvent = true;
    this.waitingForCommitConfirmation = false;
    this.hasMessageReady = false;
    this.panel?.showCommitActions(false);
    this.panel?.setStatus('success', event.summary || 'Commit realizado');
    void vscode.window.showInformationMessage(`Seshat: ${event.summary || 'commit realizado com sucesso.'}`);
    this.schedulePanelReset();
  }

  private handleCancelled(event: BaseSeshatEvent): void {
    this.sawTerminalEvent = true;
    this.waitingForCommitConfirmation = false;
    this.hasMessageReady = false;
    this.panel?.showCommitActions(false);

    if (this.replacingWithManualGitCommit) {
      return;
    }

    const reason = typeof event.reason === 'string' ? event.reason : 'sem motivo informado';
    this.panel?.setStatus('error', 'Commit cancelado');
    void vscode.window.showWarningMessage(`Seshat: commit cancelado (${reason}).`);
  }

  private async handlePanelMessage(message: PanelMessageFromWebview): Promise<void> {
    if (message.type === 'messageEdited') {
      this.editedMessage = message.message;
      return;
    }

    if (!this.waitingForCommitConfirmation) {
      return;
    }

    if (message.type === 'cancel') {
      this.waitingForCommitConfirmation = false;
      this.hasMessageReady = false;
      this.panel?.showCommitActions(false);
      this.runner?.respond('n');
      return;
    }

    if (message.type === 'confirm') {
      await this.handleCommitConfirmation();
    }
  }

  private async handleCommitConfirmation(): Promise<void> {
    const edited = this.editedMessage.trim();
    const original = this.suggestedMessage.trim();

    this.waitingForCommitConfirmation = false;
    this.hasMessageReady = false;
    this.panel?.showCommitActions(false);

    if (!edited || edited === original) {
      this.runner?.respond('y');
      return;
    }

    this.replacingWithManualGitCommit = true;
    this.runner?.respond('n');

    if (!this.workspacePath) {
      this.panel?.setStatus('error', 'Workspace indisponível');
      void vscode.window.showErrorMessage('Seshat: não foi possível localizar o workspace para git commit.');
      this.replacingWithManualGitCommit = false;
      return;
    }

    this.panel?.setStatus('running', 'Aplicando mensagem editada com git commit');

    try {
      const result = await this.runGitCommit(this.workspacePath, edited);
      const output = [result.stdout, result.stderr].filter(Boolean).join('\n');

      if (output) {
        this.panel?.postSystemOutput('git commit', output);
      }

      this.panel?.setStatus('success', 'Commit realizado com mensagem editada');
      this.sawTerminalEvent = true;
      void vscode.window.showInformationMessage('Seshat: commit realizado com a mensagem editada.');
      this.schedulePanelReset();
    } catch (error) {
      const err = error as GitCommitFailure;
      const stderr = err.stderr ? String(err.stderr).trim() : '';
      const stdout = err.stdout ? String(err.stdout).trim() : '';
      const combined = [stdout, stderr].filter(Boolean).join('\n');

      if (combined) {
        this.panel?.postSystemOutput('git commit (erro)', combined);
      }

      this.panel?.setStatus('error', 'Falha ao executar git commit');
      void vscode.window.showErrorMessage(`Seshat: falha no git commit (${err.message}).`);
    } finally {
      this.replacingWithManualGitCommit = false;
    }
  }

  private runGitCommit(cwd: string, message: string): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn('git', ['commit', '-m', message], {
        cwd,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on('error', (error: Error) => {
        const failure = error as GitCommitFailure;
        failure.stdout = stdout;
        failure.stderr = stderr;
        reject(failure);
      });

      child.on('close', (code: number | null) => {
        if (code === 0) {
          resolve({ stdout, stderr });
          return;
        }

        const failure = new Error(`git commit finalizou com código ${code ?? 'desconhecido'}`) as GitCommitFailure;
        failure.stdout = stdout;
        failure.stderr = stderr;
        failure.code = code;
        reject(failure);
      });
    });
  }

  private schedulePanelReset(delayMs = 1800): void {
    setTimeout(() => {
      this.panel?.reset();
    }, delayMs);
  }
}

let controller: SeshatController | null = null;

export function activate(context: vscode.ExtensionContext): void {
  controller = new SeshatController(context);
  context.subscriptions.push(controller);
}

export function deactivate(): void {
  controller?.dispose();
  controller = null;
}
