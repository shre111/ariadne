import { z } from 'zod';

// ─── Base ────────────────────────────────────────────────────────────────────

const BaseEvent = z.object({
  id: z.string(),
  runId: z.string(),
  seq: z.number().int(),
  ts: z.number(),
  explain: z.string(), // plain-English for the non-technical viewer
});

// ─── Run lifecycle ────────────────────────────────────────────────────────────

const RunStartedEvent = BaseEvent.extend({
  type: z.literal('run.started'),
  goal: z.string(),
});

const RunFinishedEvent = BaseEvent.extend({
  type: z.literal('run.finished'),
  result: z.unknown(),
});

const RunFailedEvent = BaseEvent.extend({
  type: z.literal('run.failed'),
  reason: z.string(),
});

// ─── Plan ─────────────────────────────────────────────────────────────────────

export const PlanStepSchema = z.object({
  index: z.number().int(),
  title: z.string(),
  criterion: z.string(),
});

const PlanProposedEvent = BaseEvent.extend({
  type: z.literal('plan.proposed'),
  steps: z.array(PlanStepSchema),
});

// ─── Steps ────────────────────────────────────────────────────────────────────

const StepStartedEvent = BaseEvent.extend({
  type: z.literal('step.started'),
  stepIndex: z.number().int(),
  title: z.string(),
});

const StepFinishedEvent = BaseEvent.extend({
  type: z.literal('step.finished'),
  stepIndex: z.number().int(),
  outcome: z.enum(['success', 'failed', 'skipped']),
  summary: z.string(),
});

// ─── Thought ─────────────────────────────────────────────────────────────────

const ThoughtEvent = BaseEvent.extend({
  type: z.literal('thought'),
  text: z.string(),
});

// ─── Action ──────────────────────────────────────────────────────────────────

// Bounding box of the acted-on element, in the screenshot's own coordinate
// space (CSS pixels at the capture viewport). Powers the "X-ray" overlay.
const BBoxSchema = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });

const ActionExecutedEvent = BaseEvent.extend({
  type: z.literal('action.executed'),
  tool: z.string(),
  params: z.record(z.unknown()),
  ref: z.number().int().optional(),
  refLabel: z.string().optional(),
  bbox: BBoxSchema.optional(),
  viewport: z.object({ width: z.number(), height: z.number() }).optional(),
  screenshotAfter: z.string().optional(), // base64 JPEG
  durationMs: z.number().optional(),
  ok: z.boolean(),
  error: z.string().optional(),
});

// ─── Usage (live cost / cache-savings ticker) ──────────────────────────────────

const UsageEvent = BaseEvent.extend({
  type: z.literal('usage'),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadTokens: z.number(),
  cacheCreationTokens: z.number(),
});

// ─── Screenshot ───────────────────────────────────────────────────────────────

const ScreenshotEvent = BaseEvent.extend({
  type: z.literal('screenshot'),
  data: z.string(), // base64 JPEG
  width: z.number(),
  height: z.number(),
  stepIndex: z.number().int().optional(),
});

// ─── Approval gate ────────────────────────────────────────────────────────────

const ApprovalRequiredEvent = BaseEvent.extend({
  type: z.literal('approval.required'),
  tool: z.string(),
  params: z.record(z.unknown()),
  riskReason: z.string(),
  screenshot: z.string().optional(),
});

const ApprovalGrantedEvent = BaseEvent.extend({
  type: z.literal('approval.granted'),
  tool: z.string(),
});

const ApprovalRejectedEvent = BaseEvent.extend({
  type: z.literal('approval.rejected'),
  tool: z.string(),
  note: z.string(),
});

// ─── Error / Recovery ─────────────────────────────────────────────────────────

const ErrorEvent = BaseEvent.extend({
  type: z.literal('error'),
  code: z.string(),
  detail: z.string(),
});

const RecoveryEvent = BaseEvent.extend({
  type: z.literal('recovery'),
  rung: z.number().int(),
  strategy: z.string(),
  detail: z.string(),
});

// ─── Budget ───────────────────────────────────────────────────────────────────

const BudgetWarningEvent = BaseEvent.extend({
  type: z.literal('budget.warning'),
  metric: z.enum(['tokens', 'actions', 'time']),
  used: z.number(),
  limit: z.number(),
  pct: z.number(),
});

// ─── Ask human ────────────────────────────────────────────────────────────────

const AskHumanEvent = BaseEvent.extend({
  type: z.literal('ask.human'),
  question: z.string(),
});

// ─── AgentEvent union ─────────────────────────────────────────────────────────

export const AgentEventSchema = z.discriminatedUnion('type', [
  RunStartedEvent,
  RunFinishedEvent,
  RunFailedEvent,
  PlanProposedEvent,
  StepStartedEvent,
  StepFinishedEvent,
  ThoughtEvent,
  ActionExecutedEvent,
  ScreenshotEvent,
  ApprovalRequiredEvent,
  ApprovalGrantedEvent,
  ApprovalRejectedEvent,
  ErrorEvent,
  RecoveryEvent,
  BudgetWarningEvent,
  AskHumanEvent,
  UsageEvent,
]);

export type AgentEvent = z.infer<typeof AgentEventSchema>;
export type PlanStep = z.infer<typeof PlanStepSchema>;

// ─── WS commands (client → server) ───────────────────────────────────────────

export const ClientCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('run.approve') }),
  z.object({ type: z.literal('run.reject'), note: z.string() }),
  z.object({ type: z.literal('run.pause') }),
  z.object({ type: z.literal('run.resume') }),
  z.object({ type: z.literal('run.stop') }),
  z.object({ type: z.literal('run.answer'), answer: z.string() }),
]);

export type ClientCommand = z.infer<typeof ClientCommandSchema>;

// ─── Run record ───────────────────────────────────────────────────────────────

export type RunStatus =
  | 'running'
  | 'paused'
  | 'waiting_approval'
  | 'waiting_answer'
  | 'finished'
  | 'failed'
  | 'stopped';

export interface RunRecord {
  id: string;
  goal: string;
  status: RunStatus;
  createdAt: number;
  events: AgentEvent[];
}

// ─── API ─────────────────────────────────────────────────────────────────────

export const CreateRunBodySchema = z.object({
  goal: z.string().min(1).max(2000),
  autonomy: z.enum(['autopilot', 'approve_risky', 'approve_all']).default('approve_risky'),
});

export type CreateRunBody = z.infer<typeof CreateRunBodySchema>;
