// Client-side types matching server/src/types.ts.
// Kept in sync by hand — both sides share the same discriminated union shape.

export interface PlanStep {
  index: number;
  title: string;
  criterion: string;
}

export interface BBox { x: number; y: number; w: number; h: number }
export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export type AgentEvent =
  | { type: 'run.started';       id: string; runId: string; seq: number; ts: number; explain: string; goal: string }
  | { type: 'run.finished';      id: string; runId: string; seq: number; ts: number; explain: string; result: unknown }
  | { type: 'run.failed';        id: string; runId: string; seq: number; ts: number; explain: string; reason: string }
  | { type: 'plan.proposed';     id: string; runId: string; seq: number; ts: number; explain: string; steps: PlanStep[] }
  | { type: 'step.started';      id: string; runId: string; seq: number; ts: number; explain: string; stepIndex: number; title: string }
  | { type: 'step.finished';     id: string; runId: string; seq: number; ts: number; explain: string; stepIndex: number; outcome: 'success' | 'failed' | 'skipped'; summary: string }
  | { type: 'thought';           id: string; runId: string; seq: number; ts: number; explain: string; text: string }
  | { type: 'action.executed';   id: string; runId: string; seq: number; ts: number; explain: string; tool: string; params: Record<string, unknown>; ref?: number; refLabel?: string; bbox?: BBox; viewport?: { width: number; height: number }; ok: boolean; error?: string; durationMs?: number }
  | { type: 'screenshot';        id: string; runId: string; seq: number; ts: number; explain: string; data: string; width: number; height: number; stepIndex?: number }
  | { type: 'approval.required'; id: string; runId: string; seq: number; ts: number; explain: string; tool: string; params: Record<string, unknown>; riskReason: string; screenshot?: string }
  | { type: 'approval.granted';  id: string; runId: string; seq: number; ts: number; explain: string; tool: string }
  | { type: 'approval.rejected'; id: string; runId: string; seq: number; ts: number; explain: string; tool: string; note: string }
  | { type: 'error';             id: string; runId: string; seq: number; ts: number; explain: string; code: string; detail: string }
  | { type: 'recovery';          id: string; runId: string; seq: number; ts: number; explain: string; rung: number; strategy: string; detail: string }
  | { type: 'budget.warning';    id: string; runId: string; seq: number; ts: number; explain: string; metric: 'tokens' | 'actions' | 'time'; used: number; limit: number; pct: number }
  | { type: 'ask.human';         id: string; runId: string; seq: number; ts: number; explain: string; question: string }
  | { type: 'usage';             id: string; runId: string; seq: number; ts: number; explain: string; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number };

export type ClientCommand =
  | { type: 'run.approve' }
  | { type: 'run.reject'; note: string }
  | { type: 'run.pause' }
  | { type: 'run.resume' }
  | { type: 'run.stop' }
  | { type: 'run.answer'; answer: string };

export type RunStatus =
  | 'running'
  | 'paused'
  | 'waiting_approval'
  | 'waiting_answer'
  | 'finished'
  | 'failed'
  | 'stopped';

// ─── App state derived from the event log ─────────────────────────────────────

export interface RunState {
  runId: string;
  goal: string;
  status: RunStatus;
  events: AgentEvent[];
  steps: PlanStep[];
  currentStepIndex: number;
  stepOutcomes: Record<number, 'success' | 'failed' | 'skipped'>;
  latestScreenshot: string | null;
  pendingApproval: (AgentEvent & { type: 'approval.required' }) | null;
  pendingQuestion: string | null;
  result: unknown;
  latestUsage: UsageTotals | null;
}

export function initialRunState(runId: string, goal: string): RunState {
  return {
    runId,
    goal,
    status: 'running',
    events: [],
    steps: [],
    currentStepIndex: 0,
    stepOutcomes: {},
    latestScreenshot: null,
    pendingApproval: null,
    pendingQuestion: null,
    result: null,
    latestUsage: null,
  };
}

// Resolve the screenshot the stage should show at a given scrub position:
// the most recent screenshot event at or before `seq`. Returns null if none.
export function screenshotAtSeq(events: AgentEvent[], seq: number): string | null {
  let found: string | null = null;
  for (const ev of events) {
    if (ev.seq > seq) break;
    if (ev.type === 'screenshot') found = ev.data;
  }
  return found;
}

// A short human label for the moment at `seq` — used on the rewind badge.
export function momentLabelAtSeq(events: AgentEvent[], seq: number): string {
  const ev = events.find((e) => e.seq === seq);
  if (!ev) return '';
  if (ev.type === 'step.started') return `step ${ev.stepIndex + 1}`;
  if (ev.type === 'action.executed') return ev.tool;
  return ev.type;
}

export function applyEvent(state: RunState, ev: AgentEvent): RunState {
  const events = [...state.events, ev];
  const next = { ...state, events };

  switch (ev.type) {
    case 'plan.proposed':
      return { ...next, steps: ev.steps };
    case 'step.started':
      return { ...next, currentStepIndex: ev.stepIndex };
    case 'step.finished':
      return { ...next, stepOutcomes: { ...state.stepOutcomes, [ev.stepIndex]: ev.outcome } };
    case 'screenshot':
      return { ...next, latestScreenshot: ev.data };
    case 'usage':
      return { ...next, latestUsage: { inputTokens: ev.inputTokens, outputTokens: ev.outputTokens, cacheReadTokens: ev.cacheReadTokens, cacheCreationTokens: ev.cacheCreationTokens } };
    case 'approval.required':
      return { ...next, pendingApproval: ev, status: 'waiting_approval' };
    case 'approval.granted':
    case 'approval.rejected':
      return { ...next, pendingApproval: null, status: 'running' };
    case 'ask.human':
      return { ...next, pendingQuestion: ev.question, status: 'waiting_answer' };
    case 'run.finished':
      return { ...next, status: 'finished', result: ev.result, pendingApproval: null, pendingQuestion: null };
    case 'run.failed':
      return { ...next, status: 'failed', pendingApproval: null, pendingQuestion: null };
    default:
      return next;
  }
}
