import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { EventEmitter } from 'events';
import * as readline from 'readline';
import { BaseSeshatEvent, SeshatEvent } from './types';

export declare interface SeshatRunner {
  on(event: 'event', listener: (event: SeshatEvent) => void): this;
  on(event: 'stderr', listener: (line: string) => void): this;
  on(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
}

export class SeshatRunner extends EventEmitter {
  private process: ChildProcessWithoutNullStreams | null = null;
  private stdoutReader: readline.Interface | null = null;
  private stderrReader: readline.Interface | null = null;

  run(cwd: string, executablePath: string): void {
    if (this.isRunning()) {
      throw new Error('Seshat runner já está em execução.');
    }

    const child = spawn(executablePath, ['commit', '--format', 'json'], {
      cwd,
      env: { ...process.env },
      stdio: 'pipe',
    });

    this.process = child;

    this.stdoutReader = readline.createInterface({
      input: child.stdout,
      crlfDelay: Infinity,
    });

    this.stderrReader = readline.createInterface({
      input: child.stderr,
      crlfDelay: Infinity,
    });

    this.stdoutReader.on('line', (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return;
      }

      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (typeof parsed === 'object' && parsed !== null && 'event' in parsed) {
          this.emit('event', parsed as SeshatEvent);
          return;
        }

        const fallback: BaseSeshatEvent = {
          event: 'info',
          message: trimmed,
        };
        this.emit('event', fallback);
      } catch {
        const fallback: BaseSeshatEvent = {
          event: 'info',
          message: trimmed,
        };
        this.emit('event', fallback);
      }
    });

    this.stderrReader.on('line', (line: string) => {
      const trimmed = line.trim();
      if (trimmed) {
        this.emit('stderr', trimmed);
      }
    });

    child.on('error', (error: Error) => {
      this.emit('error', error);
    });

    child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
      this.cleanupReaders();
      this.process = null;
      this.emit('close', code, signal);
    });
  }

  respond(text: string): boolean {
    if (!this.process || this.process.killed || !this.process.stdin.writable) {
      return false;
    }

    const payload = text.endsWith('\n') ? text : `${text}\n`;
    this.process.stdin.write(payload);
    return true;
  }

  kill(): void {
    if (this.process && !this.process.killed) {
      this.process.kill();
    }
  }

  isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }

  private cleanupReaders(): void {
    this.stdoutReader?.close();
    this.stderrReader?.close();
    this.stdoutReader = null;
    this.stderrReader = null;
  }
}
