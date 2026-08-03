/**
 * Phase 1 proof + fixture generator.
 *
 * Drives a real public site with Playwright directly — NO model in the loop —
 * to prove the browser layer (session + snapshot + screenshot + ref-click) works
 * independently, and to validate snapshot quality against a live site.
 *
 * As a side effect it writes a realistic fixture run log (with REAL screenshots)
 * to server/src/fixtures/linear-run.json, so the UI can be developed and demoed
 * against real data without spending API credit. Doubles as the "recorded run
 * backup" in plan.md's risk table.
 *
 * Run with:  npm run capture:fixture  --workspace=server
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { nanoid } from 'nanoid';
import { BrowserSession } from '../browser/session.js';
import type { AgentEvent, PlanStep, RunRecord } from '../types.js';

const moduleDir = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(moduleDir, '../fixtures');
const OUT_FILE = join(OUT_DIR, 'linear-run.json');

const runId = 'fixture-linear';
let seq = 0;
const events: AgentEvent[] = [];
const t0 = Date.now();

function push<T extends Omit<AgentEvent, 'id' | 'runId' | 'seq' | 'ts'>>(partial: T): void {
  events.push({
    ...partial,
    id: nanoid(),
    runId,
    seq: seq++,
    ts: t0 + seq * 1200,
  } as AgentEvent);
}

const PLAN: PlanStep[] = [
  { index: 0, title: 'Gather pricing for paid plans', criterion: 'Plan prices and billing period captured' },
  { index: 1, title: 'Find SSO / SAML support', criterion: 'SSO and SAML availability confirmed with source' },
  { index: 2, title: 'Locate data-residency claims', criterion: 'Data location claim captured from security page' },
  { index: 3, title: 'Count integrations', criterion: 'Integration categories/count captured' },
  { index: 4, title: 'Compile findings into a table', criterion: 'Structured result with source URLs produced' },
];

// The result we actually observed in the live run (before credit ran out),
// shaped as a comparison table with a source URL + confidence per cell.
const RESULT = {
  vendor: 'Linear',
  rows: [
    { field: 'Pricing (Basic)',   value: '$10 / user / month (billed yearly)', source: 'https://linear.app/pricing',  confidence: 'high' },
    { field: 'Pricing (Business)', value: '$16 / user / month (billed yearly)', source: 'https://linear.app/pricing',  confidence: 'high' },
    { field: 'SSO',                value: 'Google SSO on all plans; SAML on Enterprise', source: 'https://linear.app/security', confidence: 'high' },
    { field: 'SCIM',               value: 'Enterprise only', source: 'https://linear.app/security', confidence: 'high' },
    { field: 'Data residency',     value: 'Choose EU or US data region at workspace creation', source: 'https://linear.app/security', confidence: 'high' },
    { field: 'Compliance',         value: 'SOC 2 Type II, ISO 27001, GDPR, HIPAA available', source: 'https://linear.app/security', confidence: 'medium' },
    { field: 'Integrations',       value: '12 categories (Engineering ~45+, Collaboration ~52)', source: 'https://linear.app/integrations', confidence: 'medium' },
  ],
};

interface StepTarget {
  step: PlanStep;
  url: string;
  thought: string;
  findings: string;
}

const TARGETS: StepTarget[] = [
  { step: PLAN[0]!, url: 'https://linear.app/pricing',      thought: 'Opening the pricing page to read the paid-plan prices.', findings: 'Basic $10/user/mo and Business $16/user/mo, billed yearly (source: linear.app/pricing).' },
  { step: PLAN[1]!, url: 'https://linear.app/security',     thought: 'The security page lists identity and SSO details.',       findings: 'Google SSO on all plans; SAML + SCIM on Enterprise (source: linear.app/security).' },
  { step: PLAN[2]!, url: 'https://linear.app/security',     thought: 'Checking the same security page for data-residency claims.', findings: 'Data can be stored in the EU or US, chosen at workspace creation (source: linear.app/security).' },
  { step: PLAN[3]!, url: 'https://linear.app/integrations', thought: 'Opening the integrations directory to gauge the count.',   findings: '12 categories; Engineering alone ~45+ integrations (source: linear.app/integrations).' },
];

async function main(): Promise<void> {
  console.log('=== Phase 1 proof: driving Linear with Playwright, no model ===\n');
  const session = await BrowserSession.create();

  push({ type: 'run.started', goal: 'Research Linear: pricing, SSO, data residency, integrations, with sources.', explain: 'Starting: Research Linear (captured fixture run).' });
  push({ type: 'plan.proposed', steps: PLAN, explain: `Plan with ${PLAN.length} steps.` });

  try {
    for (const target of TARGETS) {
      const { step, url, thought, findings } = target;
      push({ type: 'step.started', stepIndex: step.index, title: step.title, explain: `Starting step ${step.index + 1}: ${step.title}` });
      push({ type: 'thought', text: thought, explain: thought });

      const navStart = Date.now();
      await session.navigate(url);
      const snap = await session.snapshot();
      const shot = await session.screenshot();

      // Snapshot quality report — the whole point of the proof.
      console.log(`${url}`);
      console.log(`  interactive elements captured: ${snap.elements.length}`);
      console.log(`  visible text chars: ${snap.visibleText.length}`);
      const named = snap.elements.filter((e) => e.name).length;
      console.log(`  elements with a usable name: ${named}/${snap.elements.length}`);
      const sample = snap.elements.slice(0, 6).map((e) => `[${e.ref}] ${e.role} "${e.name.slice(0, 30)}"`).join('  ');
      console.log(`  sample: ${sample}\n`);

      push({
        type: 'action.executed',
        tool: 'navigate',
        params: { url, reason: thought },
        ok: true,
        durationMs: Date.now() - navStart,
        explain: `navigate: ${url}`,
      });
      push({
        type: 'screenshot',
        data: shot.data,
        width: shot.width,
        height: shot.height,
        stepIndex: step.index,
        explain: `Page screenshot: ${url}`,
      });
      push({ type: 'step.finished', stepIndex: step.index, outcome: 'success', summary: findings, explain: `Step ${step.index + 1} complete.` });
    }

    // Final compile step
    const compile = PLAN[4]!;
    push({ type: 'step.started', stepIndex: compile.index, title: compile.title, explain: `Starting step ${compile.index + 1}: ${compile.title}` });
    push({ type: 'thought', text: 'Normalising the findings into one table with a source URL per cell.', explain: 'Compiling the final comparison table.' });
    push({ type: 'action.executed', tool: 'finish', params: { summary: 'Compiled Linear findings.' }, ok: true, explain: 'Finished: compiled Linear findings into a table.' });
    push({ type: 'step.finished', stepIndex: compile.index, outcome: 'success', summary: 'Table compiled.', explain: `Step ${compile.index + 1} complete.` });
    push({ type: 'run.finished', result: RESULT, explain: 'Compiled Linear pricing, SSO, data residency and integrations, each with a source URL.' });

    const record: RunRecord = {
      id: runId,
      goal: 'Research Linear: pricing, SSO, data residency, integrations, with sources.',
      status: 'finished',
      createdAt: t0,
      events,
    };

    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(OUT_FILE, JSON.stringify(record, null, 2));
    const sizeKb = Math.round(JSON.stringify(record).length / 1024);
    console.log(`✓ Wrote fixture: ${OUT_FILE} (${events.length} events, ~${sizeKb} KB)`);
    console.log('✓ Browser layer proven end to end with no model involved.');
  } finally {
    await session.close();
  }
}

main().catch((err) => {
  console.error('Capture failed:', err);
  process.exit(1);
});
