import Anthropic from '@anthropic-ai/sdk';
import { BrowserSession } from '../browser/session.js';
import { makeBase, type RunBus, type RunRegistry } from '../runs.js';
import type { RunRecord, PlanStep, AgentEvent, RunStatus } from '../types.js';
import { planGoal } from './planner.js';
import { AGENT_TOOLS } from './tools.js';
import { classifyAction } from './policy.js';
import {
  initialStuckState,
  isStuck,
  recordError,
  recordSuccess,
  runRecovery,
} from './recovery.js';
import { z } from 'zod';

// ─── Budgets (D-007) ──────────────────────────────────────────────────────────

const BUDGET = {
  actionsPerStep: 25,
  actionsTotal: 120,
  wallClockMs: 12 * 60 * 1000,
  // Screenshot sent to the model: step start, after navigation, after 2 consecutive errors
};

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(
  goal: string,
  step: PlanStep,
  totalSteps: number,
  priorNotes: string[],
): string {
  const notesBlock =
    priorNotes.length > 0
      ? `\nWHAT YOU'VE LEARNED IN EARLIER STEPS (your only memory of them — reuse these facts and source URLs, don't re-gather them):\n${priorNotes.map((n, i) => `  ${i + 1}. ${n}`).join('\n')}\n`
      : '';

  return `You are Ariadne, an autonomous browser agent. You are working to accomplish:

GOAL: ${goal}

CURRENT STEP (${step.index + 1} of ${totalSteps}): ${step.title}
SUCCESS CRITERION: ${step.criterion}
${notesBlock}
You can see the current page snapshot below. Use the available tools to interact with the browser.

Rules:
- Always use ref numbers from the snapshot — never guess or invent refs
- Read the page carefully before acting; verify you are on the right page
- After each action, you will receive an updated snapshot
- The moment this step's success criterion is met, call finish_step with the facts you gathered — this advances the plan and the user watches each step light up. Don't over-work a step.
- Call finish (not finish_step) only when the ENTIRE goal is done and you have every required fact
- If a control you want (a toggle, switch, tab) is NOT in the snapshot's interactive elements after ONE attempt, treat it as unavailable: record what IS visible, note the limitation in your findings, and finish_step. Do not keep retrying it.
- Stay on the target site. Do not go to Google, Bing, or the Wayback Machine to hunt a minor missing value — a partial, sourced answer with an honest gap beats leaving the site.
- If you cannot make progress after several attempts, use ask_human
- Be concise in your reasoning; the user can see your thoughts in real time
- Never click payment, account-creation, or message-send buttons (a "Get started"/"Sign up" button is not a billing toggle)`;
}

// ─── Extract tool helper ──────────────────────────────────────────────────────

async function runExtract(
  client: Anthropic,
  pageText: string,
  schema: unknown,
  description: string,
): Promise<unknown> {
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system:
      'You are a data extraction agent. Extract structured data from the provided page content according to the schema. Return ONLY valid JSON matching the schema, nothing else.',
    messages: [
      {
        role: 'user',
        content: `Page content:\n${pageText}\n\nExtraction task: ${description}\n\nTarget schema: ${JSON.stringify(schema, null, 2)}\n\nReturn the extracted data as JSON:`,
      },
    ],
  });

  const text = message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .replace(/```(?:json)?\n?/g, '')
    .trim();

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

// ─── Model error handling ─────────────────────────────────────────────────────

// A fatal error means the run cannot continue at all (bad key, no credit). It
// propagates out of the step loop to startRun, which stops the run cleanly with
// a human-readable explanation rather than limping through more failing steps.
class FatalRunError extends Error {
  constructor(readonly explain: string, readonly detail: string) {
    super(explain);
    this.name = 'FatalRunError';
  }
}

function classifyModelError(err: unknown): {
  kind: 'fatal' | 'transient' | 'other';
  explain: string;
} {
  const msg = err instanceof Error ? err.message : String(err);
  const status = typeof (err as { status?: unknown })?.status === 'number'
    ? (err as { status: number }).status
    : undefined;

  if (/credit balance is too low|billing|insufficient|payment required/i.test(msg) || status === 402) {
    return {
      kind: 'fatal',
      explain: 'The AI account has run out of credit. Add credit to the Anthropic API key, then start the run again.',
    };
  }
  if (status === 401 || /invalid x-api-key|authentication|unauthorized/i.test(msg)) {
    return {
      kind: 'fatal',
      explain: 'The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in your .env file.',
    };
  }
  if (status === 429 || /rate.?limit/i.test(msg)) {
    return { kind: 'transient', explain: 'The AI model is rate-limiting us — pausing a moment and retrying.' };
  }
  if (status === 529 || /overloaded/i.test(msg)) {
    return { kind: 'transient', explain: 'The AI model is temporarily overloaded — retrying shortly.' };
  }
  return { kind: 'other', explain: 'There was an error communicating with the AI model.' };
}

// ─── Prompt caching ───────────────────────────────────────────────────────────
// The executor resends the growing conversation every turn. Marking a cache
// breakpoint on the last block of the last message caches the whole prefix
// (tools + system + prior turns); the next turn reads it at ~0.1x and only pays
// full price for the newly appended snapshot. Model input is byte-identical — no
// effect on what the model reasons over. See decisions.md D-012.
//
// We build a shallow copy with the marker only on the CURRENT last block, so the
// stored `messages` array stays clean and markers never accumulate past the
// 4-breakpoint limit (the prior turn's cache entry is still read from its own
// earlier write — reads match on content, not on where the marker sits now).
const CACHE: Anthropic.CacheControlEphemeral = { type: 'ephemeral' };

function withMessageCache(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  if (messages.length === 0) return messages;
  const out = messages.slice();
  const lastIdx = out.length - 1;
  const last = out[lastIdx]!;
  if (typeof last.content === 'string') {
    out[lastIdx] = { ...last, content: [{ type: 'text', text: last.content, cache_control: CACHE }] };
  } else if (last.content.length > 0) {
    const blocks = last.content.slice();
    // The last block is always text / image / tool_result here (never a thinking
    // block — we don't enable thinking), so attaching cache_control is valid; the
    // cast is needed only because ContentBlockParam's union includes types that
    // disallow it.
    blocks[blocks.length - 1] = {
      ...blocks[blocks.length - 1]!,
      cache_control: CACHE,
    } as Anthropic.ContentBlockParam;
    out[lastIdx] = { ...last, content: blocks };
  }
  return out;
}

// ─── Context ──────────────────────────────────────────────────────────────────

export interface StartRunContext {
  record: RunRecord;
  bus: RunBus;
  registry: RunRegistry;
  apiKey: string;
  autonomy: 'autopilot' | 'approve_risky' | 'approve_all';
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function startRun(ctx: StartRunContext): Promise<void> {
  const { record, bus, registry, apiKey, autonomy } = ctx;
  const runId = record.id;
  const client = new Anthropic({ apiKey });

  const emit = <T extends Omit<AgentEvent, 'id' | 'seq' | 'ts'>>(
    partial: T,
  ): void => {
    bus.push({ ...makeBase(runId, bus, partial.explain), ...partial } as AgentEvent);
  };

  const abortController = new AbortController();
  const { signal } = abortController;

  // Listen for the human control commands. Pause/resume flip the run status,
  // which both the step loop and the executor's per-turn loop poll before
  // acting; stop aborts the shared signal, which unwinds the in-flight model
  // call and every wait. Each one emits an event — a control the user can press
  // that produces no event would be invisible in the log and the replay.
  bus.onCommand((cmd) => {
    if (cmd.type === 'run.stop') {
      if (signal.aborted) return;
      emit({
        type: 'run.stopping',
        runId,
        explain: 'Stopping — finishing the action already in flight, then shutting down.',
      });
      abortController.abort();
    } else if (cmd.type === 'run.pause') {
      if (record.status !== 'running') return;
      registry.setStatus(runId, 'paused');
      emit({
        type: 'run.paused',
        runId,
        explain: 'You paused the run. The agent will hold before its next action.',
      });
    } else if (cmd.type === 'run.resume') {
      if (record.status !== 'paused') return;
      registry.setStatus(runId, 'running');
      emit({ type: 'run.resumed', runId, explain: 'You resumed the run.' });
    }
  });

  const budget = {
    actions: 0,
    startTime: Date.now(),
  };
  const usageTotals = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };

  function checkBudget(): boolean {
    if (signal.aborted) return false;
    const elapsed = Date.now() - budget.startTime;
    if (elapsed > BUDGET.wallClockMs) {
      emit({
        type: 'budget.warning',
        runId,
        metric: 'time',
        used: elapsed,
        limit: BUDGET.wallClockMs,
        pct: 100,
        explain: 'The 12-minute time limit has been reached.',
      });
      return false;
    }
    if (budget.actions >= BUDGET.actionsTotal) {
      emit({
        type: 'budget.warning',
        runId,
        metric: 'actions',
        used: budget.actions,
        limit: BUDGET.actionsTotal,
        pct: 100,
        explain: `Reached the ${BUDGET.actionsTotal}-action limit.`,
      });
      return false;
    }
    // 80% warning
    if (budget.actions === Math.floor(BUDGET.actionsTotal * 0.8)) {
      emit({
        type: 'budget.warning',
        runId,
        metric: 'actions',
        used: budget.actions,
        limit: BUDGET.actionsTotal,
        pct: 80,
        explain: `Used 80% of the action budget (${budget.actions}/${BUDGET.actionsTotal}).`,
      });
    }
    return true;
  }

  emit({ type: 'run.started', runId, goal: record.goal, explain: `Starting: ${record.goal}` });

  let session: BrowserSession | null = null;
  let finalResult: unknown = null;
  let finalSummary: string | null = null;
  const stepNotes: string[] = [];

  try {
    session = await BrowserSession.create();

    // 1. Plan
    emit({ type: 'thought', runId, text: 'Planning the steps to accomplish your goal…', explain: 'Working out a plan.' });
    const steps = await planGoal(record.goal, apiKey);
    emit({
      type: 'plan.proposed',
      runId,
      steps,
      explain: `I have a ${steps.length}-step plan to accomplish your goal.`,
    });

    // 2. Execute each step
    for (const step of steps) {
      if (!checkBudget()) break;
      if (signal.aborted) break;

      emit({
        type: 'step.started',
        runId,
        stepIndex: step.index,
        title: step.title,
        explain: `Starting step ${step.index + 1}: ${step.title}`,
      });

      // Handle pause
      while (record.status === 'paused') {
        await new Promise((r) => setTimeout(r, 500));
        if (signal.aborted) break;
      }

      const stepResult = await executeStep({
        step,
        totalSteps: steps.length,
        priorNotes: stepNotes,
        session,
        bus,
        runId,
        client,
        budget,
        usage: usageTotals,
        signal,
        registry,
        record,
        autonomy,
        emit,
      });

      // Stopped mid-step: skip the step.finished event and notes and go straight
      // to the aborted handler below, so a stop ends the run promptly and cleanly.
      if (signal.aborted) break;

      emit({
        type: 'step.finished',
        runId,
        stepIndex: step.index,
        outcome: stepResult.outcome,
        summary: stepResult.summary,
        explain: stepResult.explain,
      });

      if (stepResult.result !== undefined) {
        finalResult = stepResult.result;
        finalSummary = stepResult.summary;
        break; // finish tool was called
      }

      // Carry this step's findings forward as the only memory later steps get.
      if (stepResult.summary.trim()) {
        stepNotes.push(`[${step.title}] ${stepResult.summary.trim()}`);
      }
    }

    if (signal.aborted) {
      registry.setStatus(runId, 'stopped');
      emit({ type: 'run.failed', runId, reason: 'stopped', explain: 'You stopped the run.' });
      return;
    }

    emit({
      type: 'run.finished',
      runId,
      result: finalResult,
      explain: finalSummary
        ? finalSummary
        : finalResult
          ? 'The agent has completed your goal.'
          : 'The plan steps are complete.',
    });
    registry.setStatus(runId, 'finished');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // FatalRunError already carries a clean explain. For anything else that
    // bubbles up here (e.g. the planner call, which is outside the executor's
    // per-turn handling), classify it so a fatal model error — credit, bad key —
    // still reads in plain English instead of leaking a raw 400 JSON blob.
    if (err instanceof FatalRunError) {
      emit({ type: 'error', runId, code: 'fatal', detail: err.detail, explain: err.explain });
      emit({ type: 'run.failed', runId, reason: err.explain, explain: err.explain });
    } else {
      const c = classifyModelError(err);
      const explain = c.kind === 'other' ? `Something went wrong: ${msg}` : c.explain;
      emit({ type: 'error', runId, code: c.kind === 'fatal' ? 'fatal' : 'error', detail: msg, explain });
      emit({ type: 'run.failed', runId, reason: explain, explain });
    }
    registry.setStatus(runId, 'failed');
  } finally {
    await session?.close();
  }
}

// ─── Step executor ────────────────────────────────────────────────────────────

interface StepContext {
  step: PlanStep;
  totalSteps: number;
  priorNotes: string[];
  session: BrowserSession;
  bus: RunBus;
  runId: string;
  client: Anthropic;
  budget: { actions: number };
  usage: { input: number; output: number; cacheRead: number; cacheCreation: number };
  signal: AbortSignal;
  registry: RunRegistry;
  record: RunRecord;
  autonomy: 'autopilot' | 'approve_risky' | 'approve_all';
  emit: <T extends Omit<AgentEvent, 'id' | 'seq' | 'ts'>>(p: T) => void;
}

interface StepResult {
  outcome: 'success' | 'failed' | 'skipped';
  summary: string;
  explain: string;
  result?: unknown;
}

async function executeStep(ctx: StepContext): Promise<StepResult> {
  const { step, session, bus, runId, client, budget, signal, autonomy, record, emit } = ctx;

  const messages: Anthropic.MessageParam[] = [];
  const stuckState = initialStuckState();
  let stepActionCount = 0;
  let sendScreenshot = true; // send on first turn

  // Take initial screenshot
  try {
    const shot = await session.screenshot();
    emit({
      type: 'screenshot',
      runId,
      data: shot.data,
      width: shot.width,
      height: shot.height,
      stepIndex: step.index,
      explain: `Page screenshot at start of step ${step.index + 1}.`,
    });
  } catch { /* non-fatal */ }

  for (let turn = 0; turn < BUDGET.actionsPerStep; turn++) {
    if (signal.aborted || budget.actions >= BUDGET.actionsTotal) break;
    if (record.status === 'paused') {
      await new Promise((r) => setTimeout(r, 500));
      turn--;
      continue;
    }

    // Build the observation (snapshot text + optional image)
    let snapshotText: string;
    try {
      snapshotText = await session.snapshotText();
    } catch (err) {
      snapshotText = `(Could not take snapshot: ${err instanceof Error ? err.message : String(err)})`;
    }

    const userContent: Anthropic.ContentBlockParam[] = [];

    if (sendScreenshot) {
      try {
        const shot = await session.screenshot();
        userContent.push({
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: shot.data },
        });
        sendScreenshot = false;
      } catch { /* non-fatal */ }
    }

    userContent.push({ type: 'text', text: snapshotText });
    messages.push({ role: 'user', content: userContent });

    // Model turn — retry transient errors, stop the whole run on fatal ones.
    // Prompt caching: mark the system prompt (constant within a step, so tools +
    // system are reused across every turn) and the last message block (the
    // growing history). Purely a cost/latency optimization — see withMessageCache.
    const systemText = buildSystemPrompt(record.goal, step, ctx.totalSteps, ctx.priorNotes);
    let response: Anthropic.Message | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        response = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
          system: [{ type: 'text', text: systemText, cache_control: CACHE }],
          tools: AGENT_TOOLS,
          messages: withMessageCache(messages),
          tool_choice: { type: 'auto' },
        }, { signal });
        // Accumulate token usage and emit it for the live cost/savings ticker.
        {
          const u = response.usage;
          ctx.usage.input += u.input_tokens;
          ctx.usage.output += u.output_tokens;
          ctx.usage.cacheRead += u.cache_read_input_tokens ?? 0;
          ctx.usage.cacheCreation += u.cache_creation_input_tokens ?? 0;
          emit({
            type: 'usage',
            runId,
            inputTokens: ctx.usage.input,
            outputTokens: ctx.usage.output,
            cacheReadTokens: ctx.usage.cacheRead,
            cacheCreationTokens: ctx.usage.cacheCreation,
            explain: 'Token usage updated.',
          });
          if (process.env.NODE_ENV !== 'production') {
            console.log(
              `[cache] step ${step.index + 1} · read=${u.cache_read_input_tokens ?? 0} ` +
              `write=${u.cache_creation_input_tokens ?? 0} fresh=${u.input_tokens} out=${u.output_tokens}`,
            );
          }
        }
        break;
      } catch (err) {
        // A stop aborts the request mid-flight. That surfaces here as an error,
        // but it's the user getting what they asked for — never retry it, and
        // never log it as a fault. startRun ends the run from the same signal.
        if (signal.aborted) break;
        const c = classifyModelError(err);
        if (c.kind === 'fatal') {
          throw new FatalRunError(c.explain, String(err));
        }
        if (c.kind === 'transient' && attempt < 2) {
          emit({
            type: 'recovery',
            runId,
            rung: 0,
            strategy: 'model-retry',
            detail: `${c.explain} (attempt ${attempt + 1}/3)`,
            explain: c.explain,
          });
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
          continue;
        }
        emit({ type: 'error', runId, code: 'model_error', detail: String(err), explain: c.explain });
        break;
      }
    }
    if (!response) break; // retries exhausted or non-fatal error — end this step
    if (signal.aborted) break; // a stop aborted the model call mid-turn — unwind now

    // Emit any text responses as thoughts
    const textBlocks = response.content.filter((b) => b.type === 'text');
    for (const block of textBlocks) {
      if (block.text.trim()) {
        emit({ type: 'thought', runId, text: block.text, explain: block.text.slice(0, 120) });
      }
    }

    const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');

    // No tool calls — model is done with the step
    if (toolUseBlocks.length === 0 || response.stop_reason === 'end_turn') {
      return {
        outcome: 'success',
        summary: textBlocks.map((b) => b.text).join(' ').slice(0, 300),
        explain: `Step ${step.index + 1} complete.`,
      };
    }

    // Add assistant turn to messages
    messages.push({ role: 'assistant', content: response.content });

    // Process each tool call
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      if (toolUse.type !== 'tool_use') continue;
      if (signal.aborted) break; // stop requested — don't start another action

      const tool = toolUse.name;
      const params = toolUse.input as Record<string, unknown>;

      // finish_step — advance to the next plan step. Returns without a result so
      // startRun continues the loop. The findings become notes for later steps.
      if (tool === 'finish_step') {
        const findings = String(params['findings'] ?? '').trim();
        emit({
          type: 'action.executed',
          runId,
          tool,
          params,
          ok: true,
          explain: `Step ${step.index + 1} done: ${findings.slice(0, 120)}`,
        });
        return {
          outcome: 'success',
          summary: findings || `Step ${step.index + 1} complete.`,
          explain: `Step ${step.index + 1} complete.`,
        };
      }

      // finish tool — end the run. We emit only the action here; startRun owns
      // the single terminal run.finished event after step.finished, so the log
      // reads action → step.finished → run.finished in order with no duplicate.
      if (tool === 'finish') {
        emit({
          type: 'action.executed',
          runId,
          tool,
          params,
          ok: true,
          explain: `Finished: ${String(params['summary'] ?? '')}`,
        });
        return {
          outcome: 'success',
          summary: String(params['summary'] ?? ''),
          explain: String(params['summary'] ?? 'Done.'),
          result: params['result'],
        };
      }

      // ask_human tool
      if (tool === 'ask_human') {
        const question = String(params['question'] ?? '');
        emit({
          type: 'ask.human',
          runId,
          question,
          explain: `The agent has a question: ${question}`,
        });
        ctx.registry.setStatus(runId, 'waiting_answer');
        let answer = '';
        try {
          const cmd = await bus.waitForCommand('run.answer', signal);
          answer = cmd.answer;
          ctx.registry.setStatus(runId, 'running');
        } catch {
          answer = 'No answer provided.';
        }
        toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: answer });
        continue;
      }

      // Resolve ref label for policy context
      if ('ref' in params && typeof params['ref'] === 'number') {
        try {
          params['refLabel'] = await session.refLabel(params['ref']);
        } catch { /* non-fatal */ }
      }

      // Pause gate — hold right before executing a real browser action, so a
      // pause takes effect immediately rather than only at the next turn
      // boundary (otherwise the whole current turn's actions still fire after
      // the user hits Pause). finish / finish_step / ask_human are handled above
      // and intentionally aren't gated here. The cast re-widens the status,
      // which the command handler mutates asynchronously (TS narrowed 'paused'
      // out after the turn-top pause check).
      while ((record.status as RunStatus) === 'paused' && !signal.aborted) {
        await new Promise((r) => setTimeout(r, 300));
      }
      if (signal.aborted) break;

      // Policy check
      const policy = classifyAction(tool as any, params, autonomy);

      if (policy.decision === 'BLOCKED') {
        emit({
          type: 'error',
          runId,
          code: 'blocked',
          detail: policy.reason,
          explain: `That action is not permitted: ${policy.reason}`,
        });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: `BLOCKED: ${policy.reason}`,
          is_error: true,
        });
        recordError(stuckState, tool);
        continue;
      }

      if (policy.decision === 'NEEDS_APPROVAL') {
        let screenshot: string | undefined;
        try {
          const shot = await session.screenshot();
          screenshot = shot.data;
          emit({ type: 'screenshot', runId, data: shot.data, width: shot.width, height: shot.height, explain: 'Screenshot before gated action.' });
        } catch { /* non-fatal */ }

        emit({
          type: 'approval.required',
          runId,
          tool,
          params,
          riskReason: policy.reason,
          screenshot,
          explain: `Waiting for your approval: ${policy.reason}`,
        });
        ctx.registry.setStatus(runId, 'waiting_approval');

        let approval: { approved: boolean; note?: string };
        try {
          approval = await bus.waitForApproval(signal);
        } catch {
          approval = { approved: false, note: 'Aborted.' };
        }
        ctx.registry.setStatus(runId, 'running');

        if (!approval.approved) {
          const note = approval.note ?? 'Action rejected.';
          emit({ type: 'approval.rejected', runId, tool, note, explain: `You rejected this action: ${note}` });
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: `Action rejected by user. Their note: "${note}". Please re-plan.`,
            is_error: true,
          });
          recordError(stuckState, tool);
          continue;
        }

        emit({ type: 'approval.granted', runId, tool, explain: 'You approved the action.' });
        sendScreenshot = true; // send screenshot on next turn after approval
      }

      // X-ray: for element-targeting tools, grab the acted element's bounding
      // box and emit a matching frame first, so the UI can draw a highlight over
      // exactly where the agent is about to act.
      let actionBBox: { x: number; y: number; w: number; h: number } | undefined;
      let actionViewport: { width: number; height: number } | undefined;
      if ((tool === 'click' || tool === 'type' || tool === 'select') && typeof params['ref'] === 'number') {
        const box = await session.refBox(params['ref']);
        if (box) {
          actionBBox = box;
          actionViewport = session.viewport();
          try {
            const shot = await session.screenshot();
            emit({ type: 'screenshot', runId, data: shot.data, width: shot.width, height: shot.height, explain: `Targeting ${String(params['refLabel'] ?? 'element')}.` });
          } catch { /* non-fatal */ }
        }
      }

      // Execute the action
      const actionStart = Date.now();
      let ok = true;
      let errorMsg: string | undefined;
      let toolResult = '';

      try {
        toolResult = await executeTool(tool, params, session, ctx.client, ctx.record.goal);
        recordSuccess(stuckState, tool);
        budget.actions++;
        stepActionCount++;
      } catch (err) {
        ok = false;
        errorMsg = err instanceof Error ? err.message : String(err);
        recordError(stuckState, tool);

        // After navigation/click failures, send a fresh screenshot to the model
        sendScreenshot = true;
      }

      const label = String(params['refLabel'] ?? params['reason'] ?? tool);
      emit({
        type: 'action.executed',
        runId,
        tool,
        params,
        ref: typeof params['ref'] === 'number' ? params['ref'] : undefined,
        refLabel: typeof params['refLabel'] === 'string' ? params['refLabel'] : undefined,
        bbox: actionBBox,
        viewport: actionViewport,
        ok,
        error: errorMsg,
        durationMs: Date.now() - actionStart,
        explain: ok
          ? `${tool}: ${label}`
          : `${tool} failed: ${errorMsg}`,
      });

      // Take screenshot after action for the UI
      try {
        const shot = await session.screenshot();
        emit({ type: 'screenshot', runId, data: shot.data, width: shot.width, height: shot.height, explain: `After ${tool}.` });
      } catch { /* non-fatal */ }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: ok ? toolResult : `Error: ${errorMsg}`,
        is_error: ok ? undefined : true,
      });

      // Recovery check
      if (isStuck(stuckState)) {
        const recoveryResult = await runRecovery(runId, bus, session, stuckState);
        sendScreenshot = true;
        if (recoveryResult === 'escalate') {
          return {
            outcome: 'failed',
            summary: 'The agent got stuck and could not recover.',
            explain: 'The agent tried several recovery strategies but could not make progress.',
          };
        }
      }

      // After navigation, always send a screenshot
      if (tool === 'navigate' || tool === 'go_back') {
        sendScreenshot = true;
      }
    }

    // Add tool results as user turn
    if (toolResults.length > 0) {
      messages.push({ role: 'user', content: toolResults });
    }
  }

  return {
    outcome: stepActionCount > 0 ? 'success' : 'skipped',
    summary: `Completed ${stepActionCount} actions.`,
    explain: `Step ${step.index + 1} finished.`,
  };
}

// ─── Tool executor ────────────────────────────────────────────────────────────

async function executeTool(
  tool: string,
  params: Record<string, unknown>,
  session: BrowserSession,
  client: Anthropic,
  _goal: string,
): Promise<string> {
  switch (tool) {
    case 'navigate': {
      const url = String(params['url'] ?? '');
      await session.navigate(url);
      return `Navigated to ${url}`;
    }
    case 'click': {
      const ref = z.number().int().parse(params['ref']);
      await session.click(ref);
      return `Clicked ref ${ref}`;
    }
    case 'type': {
      const ref = z.number().int().parse(params['ref']);
      const text = String(params['text'] ?? '');
      await session.type(ref, text);
      return `Typed "${text.slice(0, 40)}" into ref ${ref}`;
    }
    case 'press': {
      const key = String(params['key'] ?? '');
      await session.press(key);
      return `Pressed ${key}`;
    }
    case 'select': {
      const ref = z.number().int().parse(params['ref']);
      const value = String(params['value'] ?? '');
      await session.select(ref, value);
      return `Selected "${value}" in ref ${ref}`;
    }
    case 'scroll': {
      const dir = params['direction'] === 'up' ? 'up' : 'down';
      const amount = typeof params['amount'] === 'number' ? params['amount'] : 600;
      await session.scroll(dir, amount);
      return `Scrolled ${dir} ${amount}px`;
    }
    case 'go_back': {
      await session.goBack();
      return 'Navigated back';
    }
    case 'extract': {
      const pageText = await session.snapshotText();
      const data = await runExtract(client, pageText, params['schema'], String(params['description'] ?? ''));
      return JSON.stringify(data);
    }
    default:
      throw new Error(`Unknown tool: ${tool}`);
  }
}
