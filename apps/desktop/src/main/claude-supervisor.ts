import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { StreamEvent } from '@agentic-dev-app/claude-protocol';

export interface ClaudeSupervisorOptions {
  claudeBin?: string;
  cwd: string;
  prompt: string;
  agent?: string;
  allowedTools?: string[];
  permissionMode?: string;
  settingsPath?: string;
}

export interface ClaudeSupervisorEvents {
  event: (event: StreamEvent) => void;
  stderr: (line: string) => void;
  exit: (code: number | null) => void;
}

/**
 * Spawns `claude -p` with stream-json output and emits parsed NDJSON events.
 * One instance = one session. Caller is responsible for lifecycle.
 *
 * TODO Phase 1: implement `cancel()` via SIGTERM then SIGKILL after grace.
 * TODO Phase 2: correlate emitted events with SubagentStart hook payloads
 *   (see correlator.ts) to build the runtime agent graph.
 */
export class ClaudeSupervisor extends EventEmitter {
  readonly id = randomUUID();
  private child: ChildProcessWithoutNullStreams | null = null;
  private buffer = '';

  constructor(private readonly options: ClaudeSupervisorOptions) {
    super();
  }

  start(): void {
    if (this.child) throw new Error('Supervisor already started');

    const args = [
      '-p',
      this.options.prompt,
      '--output-format',
      'stream-json',
      '--include-partial-messages',
    ];
    if (this.options.agent) args.push('--agent', this.options.agent);
    if (this.options.allowedTools?.length) {
      args.push('--allowedTools', this.options.allowedTools.join(','));
    }
    if (this.options.permissionMode) args.push('--permission-mode', this.options.permissionMode);
    if (this.options.settingsPath) args.push('--settings', this.options.settingsPath);

    const child = spawn(this.options.claudeBin ?? 'claude', args, {
      cwd: this.options.cwd,
      env: process.env,
      shell: false,
    });

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => this.consumeStdout(chunk));
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      for (const line of chunk.split(/\r?\n/).filter(Boolean)) this.emit('stderr', line);
    });
    child.on('exit', (code) => this.emit('exit', code));

    this.child = child;
  }

  cancel(): void {
    if (!this.child) return;
    this.child.kill('SIGTERM');
    setTimeout(() => this.child?.kill('SIGKILL'), 3000).unref();
  }

  private consumeStdout(chunk: string): void {
    this.buffer += chunk;
    let idx: number;
    // biome-ignore lint/suspicious/noAssignInExpressions: classic NDJSON loop.
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      try {
        const parsed = JSON.parse(line) as StreamEvent;
        this.emit('event', parsed);
      } catch {
        this.emit('stderr', `[stream-json parse error] ${line}`);
      }
    }
  }
}
