import type { BrowserSession } from '../browser/session.js';
import type { RunBus } from '../runs.js';
import { makeBase } from '../runs.js';

// Recovery ladder rungs (in order):
// 0 — re-observe: take a fresh snapshot and retry
// 1 — dismiss overlay: look for close/dismiss buttons and click them
// 2 — scroll: scroll down to reveal more content
// 3 — go back: navigate to previous page
// 4 — escalate: mark stuck, let loop decide what to do

export interface StuckState {
  consecutiveErrors: number;
  lastActionTool: string;
  lastSnapshotHash: string;
  noProgressCount: number;
}

export function initialStuckState(): StuckState {
  return {
    consecutiveErrors: 0,
    lastActionTool: '',
    lastSnapshotHash: '',
    noProgressCount: 0,
  };
}

export function recordSuccess(state: StuckState, tool: string): void {
  state.consecutiveErrors = 0;
  state.lastActionTool = tool;
}

export function recordError(state: StuckState, tool: string): void {
  state.consecutiveErrors++;
  state.lastActionTool = tool;
}

export function isStuck(state: StuckState): boolean {
  return state.consecutiveErrors >= 3 || state.noProgressCount >= 4;
}

export async function runRecovery(
  runId: string,
  bus: RunBus,
  session: BrowserSession,
  state: StuckState,
): Promise<'recovered' | 'escalate'> {
  const rung = Math.min(state.consecutiveErrors, 3);

  const emit = (rungNum: number, strategy: string, detail: string) => {
    bus.push({
      ...makeBase(runId, bus, `Trying to recover: ${strategy}`),
      type: 'recovery',
      rung: rungNum,
      strategy,
      detail,
    });
  };

  if (rung === 0) {
    emit(0, 're-observe', 'Taking a fresh look at the page before retrying.');
    return 'recovered'; // just let the loop re-snapshot
  }

  if (rung === 1) {
    emit(1, 'dismiss-overlay', 'Looking for a dialog or cookie banner to dismiss.');
    try {
      const snap = await session.snapshot();
      // Look for common dismiss patterns
      const dismissPatterns = [
        /^(close|dismiss|accept|got it|okay|ok|×|✕|✗|reject all|deny)$/i,
        /cookie/i,
        /consent/i,
      ];
      const candidate = snap.elements.find((el) => {
        return dismissPatterns.some((p) => p.test(el.name ?? el.role));
      });
      if (candidate) {
        await session.click(candidate.ref);
        state.consecutiveErrors = Math.max(0, state.consecutiveErrors - 1);
        return 'recovered';
      }
    } catch {
      // Fall through to next rung
    }
  }

  if (rung === 2) {
    emit(2, 'scroll', 'Scrolling to reveal more of the page.');
    try {
      await session.scroll('down', 500);
      state.consecutiveErrors = Math.max(0, state.consecutiveErrors - 1);
      return 'recovered';
    } catch {
      // Fall through
    }
  }

  if (rung >= 3) {
    emit(3, 'go-back', 'Navigating back to try a different path.');
    try {
      await session.goBack();
      state.consecutiveErrors = 0;
      state.noProgressCount = 0;
      return 'recovered';
    } catch {
      // escalate
    }
  }

  return 'escalate';
}
