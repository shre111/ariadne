import { EventEmitter } from 'node:events';
import { nanoid } from 'nanoid';
import type { AgentEvent, ClientCommand, RunRecord, RunStatus } from './types.js';

// ─── RunBus ──────────────────────────────────────────────────────────────────
// Per-run typed event bus. The agent pushes AgentEvents; WS listeners relay them.

export class RunBus {
  private readonly emitter = new EventEmitter();
  readonly events: AgentEvent[] = [];
  private _seq = 0;

  get nextSeq(): number {
    return this._seq++;
  }

  push(event: AgentEvent): void {
    this.events.push(event);
    this.emitter.emit('event', event);
  }

  onEvent(listener: (e: AgentEvent) => void): () => void {
    this.emitter.on('event', listener);
    return () => this.emitter.off('event', listener);
  }

  sendCommand(cmd: ClientCommand): void {
    this.emitter.emit('command', cmd);
  }

  onCommand(listener: (cmd: ClientCommand) => void): () => void {
    this.emitter.on('command', listener);
    return () => this.emitter.off('command', listener);
  }

  // Returns a promise that resolves with the next command of the given type.
  waitForCommand<T extends ClientCommand['type']>(
    type: T,
    signal?: AbortSignal,
  ): Promise<Extract<ClientCommand, { type: T }>> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error('Aborted'));
        return;
      }

      const onCmd = (cmd: ClientCommand) => {
        if (cmd.type === type) {
          signal?.removeEventListener('abort', onAbort);
          resolve(cmd as Extract<ClientCommand, { type: T }>);
        }
      };

      const onAbort = () => {
        this.emitter.off('command', onCmd);
        reject(new Error('Aborted'));
      };

      signal?.addEventListener('abort', onAbort, { once: true });
      this.emitter.on('command', onCmd);
    });
  }

  // Waits for approve OR reject.
  waitForApproval(signal?: AbortSignal): Promise<{ approved: boolean; note?: string }> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error('Aborted'));
        return;
      }

      const onCmd = (cmd: ClientCommand) => {
        if (cmd.type === 'run.approve') {
          cleanup();
          resolve({ approved: true });
        } else if (cmd.type === 'run.reject') {
          cleanup();
          resolve({ approved: false, note: cmd.note });
        }
      };

      const onAbort = () => {
        cleanup();
        reject(new Error('Aborted'));
      };

      const cleanup = () => {
        this.emitter.off('command', onCmd);
        signal?.removeEventListener('abort', onAbort);
      };

      signal?.addEventListener('abort', onAbort, { once: true });
      this.emitter.on('command', onCmd);
    });
  }
}

// ─── RunRegistry ─────────────────────────────────────────────────────────────

export class RunRegistry {
  private readonly records = new Map<string, RunRecord>();
  private readonly buses = new Map<string, RunBus>();

  create(goal: string): { record: RunRecord; bus: RunBus } {
    const id = nanoid();
    const record: RunRecord = {
      id,
      goal,
      status: 'running',
      createdAt: Date.now(),
      events: [],
    };
    const bus = new RunBus();
    bus.onEvent((ev) => {
      record.events.push(ev);
    });
    this.records.set(id, record);
    this.buses.set(id, bus);
    return { record, bus };
  }

  // Insert a pre-built record (e.g. a captured fixture or a run reloaded from
  // disk). Its events are already populated; the bus stays idle since no live
  // events will arrive — the WS handler replays record.events on connect.
  insert(record: RunRecord): void {
    const bus = new RunBus();
    bus.onEvent((ev) => {
      record.events.push(ev);
    });
    this.records.set(record.id, record);
    this.buses.set(record.id, bus);
  }

  get(id: string): { record: RunRecord; bus: RunBus } | undefined {
    const record = this.records.get(id);
    const bus = this.buses.get(id);
    if (!record || !bus) return undefined;
    return { record, bus };
  }

  setStatus(id: string, status: RunStatus): void {
    const r = this.records.get(id);
    if (r) r.status = status;
  }

  list(): RunRecord[] {
    return [...this.records.values()];
  }
}

// ─── Event factory ────────────────────────────────────────────────────────────

export function makeBase(
  runId: string,
  bus: RunBus,
  explain: string,
): { id: string; runId: string; seq: number; ts: number; explain: string } {
  return { id: nanoid(), runId, seq: bus.nextSeq, ts: Date.now(), explain };
}
