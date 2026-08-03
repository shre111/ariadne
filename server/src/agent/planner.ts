import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { PlanStep } from '../types.js';

const PLANNER_SYSTEM = `You are a planning agent for an autonomous browser assistant named Ariadne.

Given a plain-English goal, produce an ordered list of 2–8 concrete steps that a browser agent should execute to accomplish the goal. Each step should be self-contained, verifiable, and describe a coherent chunk of browser work.

Return ONLY valid JSON — an array of step objects, nothing else. No markdown fences, no explanations outside the JSON.

Format:
[
  {
    "index": 0,
    "title": "Short action title (≤ 60 chars)",
    "criterion": "How to know this step is complete (observable in the browser)"
  },
  ...
]

Rules:
- Steps should be sequential and build on each other
- Each step is a coherent CHUNK of work with an outcome, not a single click. "Gather pricing across monthly and annual billing" is one step, not three. The agent will take many browser actions inside one step.
- Each step title starts with a verb (Gather, Find, Extract, Compile, etc.)
- Criterion must be observable (a fact captured, a page reached, a value read)
- Aim for 3–5 steps; never more than 6. The last step is usually "Compile findings into the final result"
- Do NOT include steps that require login, payment, or account creation`;

const StepArraySchema = z.array(
  z.object({
    index: z.number().int(),
    title: z.string(),
    criterion: z.string(),
  }),
);

export async function planGoal(goal: string, apiKey: string): Promise<PlanStep[]> {
  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: PLANNER_SYSTEM,
    messages: [{ role: 'user', content: `Goal: ${goal}` }],
  });

  const text = message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');

  // Strip potential markdown fences
  const cleaned = text.replace(/```(?:json)?\n?/g, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Planner returned invalid JSON: ${text.slice(0, 200)}`);
  }

  const result = StepArraySchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Planner response failed schema validation: ${result.error.message}`);
  }

  // Re-index to ensure 0-based
  return result.data.map((s, i) => ({ ...s, index: i }));
}
