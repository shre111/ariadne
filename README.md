# Ariadne

**A browser agent that takes a plain-English goal and completes it autonomously — wrapped in a console that makes every thought, action, and page state legible and steerable by a non-technical person.**

> The agent walks the labyrinth; the event log is the thread you follow back. The flight recorder is how you walk it back.

Give it a goal like *"Compare Linear, Height and Shortcut on pricing, SSO, data-residency and integrations, with sources"* and watch it plan, drive a real browser, recover when a page isn't what it expected, pause for your approval on anything risky, and hand back a comparison table where every cell carries a source URL and a confidence flag.

---

## Quick start

```bash
npm install
npx playwright install chromium      # one-time, local only
cp .env.example .env                  # then add your ANTHROPIC_API_KEY
npm run dev                           # server :8787 + web :5173
```

Open **http://localhost:5173**.

No API key handy? The UI is fully browsable against a recorded run with real screenshots — open **http://localhost:5173/?run=fixture-linear**. Regenerate that fixture any time with `npm run capture:fixture --workspace=server` (drives Linear with Playwright, no model involved).

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | Server + web with hot reload |
| `npm run typecheck` | `tsc --noEmit` across both workspaces |
| `npm run build` | Web build → `server/public`, then server `tsc` build |
| `npm start` | Production: single Node process serving API + built UI |
| `npm run capture:fixture --workspace=server` | Record a demo run (Playwright only, no model) |

---

## What's graded, and where it lives

| # | Requirement | Where |
|---|---|---|
| **R1** | Accept a natural-language goal | [GoalComposer.tsx](web/src/components/GoalComposer.tsx) → `POST /api/runs` in [index.ts](server/src/index.ts) |
| **R2** | Plan + execute multi-step browser actions with an LLM in the loop (not a script) | [planner.ts](server/src/agent/planner.ts) + [loop.ts](server/src/agent/loop.ts) |
| **R3** | Stream reasoning and each action live, with current page state visible | event bus in [runs.ts](server/src/runs.ts) → WebSocket → [StageView](web/src/components/StageView.tsx) / [EventLog](web/src/components/EventLog.tsx) / [FlightRecorder](web/src/components/FlightRecorder.tsx) |
| **R4** | Human in control: stop, intervene, approve | [policy.ts](server/src/agent/policy.ts) + [ApprovalGate.tsx](web/src/components/ApprovalGate.tsx) + control rail in [App.tsx](web/src/App.tsx) |
| **R5** | Graceful recovery; no silent failures | [recovery.ts](server/src/agent/recovery.ts) + `error`/`recovery` events + `classifyModelError` in [loop.ts](server/src/agent/loop.ts) |
| **R6** | Clean, structured end result | `finish` tool + [ResultPanel.tsx](web/src/components/ResultPanel.tsx) with CSV/JSON export |

---

## How it works

**One event stream is the single source of truth.** Everything the agent does emits a typed `AgentEvent` ([types.ts](server/src/types.ts)) onto the run's bus. The WebSocket ships those events; the UI is a pure function of the event log; refresh-and-replay and the flight-recorder scrubber are the same log seen three ways. If a behaviour isn't in the log, it doesn't exist for the user.

**Ref-based element addressing, never raw coordinates.** A snapshot pass ([snapshot.ts](server/src/browser/snapshot.ts)) stamps `data-ariadne-ref` integers on visible interactive elements. Tools address `ref`, not selectors or x/y — so the log reads `click ref 12 · "Annual billing" toggle` (legible), a ref resolves to exactly one node (reliable), and a ref + bbox lets the UI rewind and highlight the right element on an archived screenshot (replayable).

**The model never touches the browser directly.** It emits tool calls; the loop validates them, runs each through the risk policy, and only then calls [session.ts](server/src/browser/session.ts).

**The observe → think → act loop** ([loop.ts](server/src/agent/loop.ts)): plan the goal into steps → for each step, feed the model the text snapshot (plus a screenshot on a cadence) → it emits a tool call → policy-gate it → execute → emit `action.executed` with before/after screenshots → repeat until the step's criterion is met (`finish_step`) or the whole goal is done (`finish`). Findings carry forward between steps as notes.

**Failure is a first-class output.** No silent catch. Stuck detection (repeated errors, no progress) triggers a recovery ladder — re-observe → dismiss overlay → scroll → go back — each rung emitting a `recovery` event with what it's trying and why. Fatal model errors (bad key, no credit) stop the run cleanly with a plain-English explanation; transient ones (429/529) retry with backoff.

### Control & safety

Three autonomy modes, applied once in the policy classifier:

- **Autopilot** — runs without stopping; only hard-`BLOCKED` actions halt it.
- **Approve risky** (default) — parks for your approval on anything the classifier flags `NEEDS_APPROVAL`.
- **Approve every step** — gates every action.

`BLOCKED` (payment fields/pages, message-send) can't be approved away in any mode — the guardrail is policy, not prompt. Rejecting a gated action opens a one-line note that's injected back into the model's context, so it re-plans against your steer — a collaborator, not just a kill switch.

Per-run budgets are enforced in code, not the prompt: 25 model turns/step, 120 actions total, 12-minute wall clock.

### The flight recorder

The signature element: a tick band under the stage, one tick per step (plus per-action ticks), coloured by outcome. Scrub to any tick and the stage rewinds to exactly what the agent saw at that moment. Click a source cell in the result table and the stage jumps to the page that cell came from — turning "trust me" into "check for yourself".

---

## Deploy

Single Docker service on Render — API, WebSocket, and built UI from one origin (no CORS, no split deploy).

1. Push this repo to GitHub.
2. On Render: **New → Blueprint**, point it at the repo. [render.yaml](render.yaml) provisions a `standard` Docker web service (Chromium OOMs on the free tier's 512 MB).
3. Set `ANTHROPIC_API_KEY` as a secret env var in the dashboard.
4. Deploy. Health check is `GET /api/runs`.

The [Dockerfile](Dockerfile) builds on the Playwright base image pinned to the same version as the `playwright` npm package (1.62.1) — Chromium and its system deps come preinstalled.

---

## Cost

Runs on **Claude Sonnet 4.6** ($3/1M input, $15/1M output) for planning, execution, and extraction. A full flagship (3-vendor) run is roughly **$0.50–0.85**. $5 of credit covers ~6–10 runs — enough to demo and rehearse.

---

## Honest limits

- **Snapshot can't see everything.** Elements rendered as styled `<div>`s with no ARIA role (e.g. Linear's monthly/annual pricing toggle) never appear in the snapshot, so the agent can't operate them. It detects this and reports what's visible rather than inventing data — but it's a real ceiling of the ref-based approach on canvas/shadow-DOM-heavy apps.
- **In-memory state.** Runs live in memory and serialize to `runs/<id>.json` on completion; there's no database. A server restart drops live runs.
- **Single-region, datacentre IP.** Sites that hard-block datacentre IPs or throw CAPTCHAs (Google/Bing search hit this in testing) will stall — the browser layer is behind a `BrowserProvider` seam so a hosted-browser provider is a config change, not a rewrite.
- **No test suite.** Verification is real runs against real sites; unit tests around a stubbed DOM would prove nothing about the part that actually breaks.
- **`take over` (human drives the live browser) is not built** — degrades to Pause + Stop.

## Stack

TypeScript everywhere, one deployable. Server: Node 22 + Fastify + `ws` + Playwright. Web: React 19 + Vite + plain CSS with design tokens. Architecture decisions and their trade-offs are written up in [decisions.md](decisions.md).
