import type { ToolName } from './tools.js';

export type PolicyDecision = 'SAFE' | 'NEEDS_APPROVAL' | 'BLOCKED';

export interface PolicyResult {
  decision: PolicyDecision;
  reason: string;
}

// Patterns that indicate payment or account-creation pages
const PAYMENT_PATTERNS = [
  /credit.?card/i, /card.?number/i, /cvv/i, /expir/i,
  /billing.?address/i, /payment/i, /checkout/i, /stripe/i,
  /paypal/i, /subscribe/i, /purchase/i,
];

const ACCOUNT_CREATION_PATTERNS = [
  /sign.?up/i, /register/i, /create.?account/i, /join/i, /get.?started/i,
];

const MESSAGE_SEND_PATTERNS = [
  /send.?message/i, /post.?comment/i, /submit.?feedback/i,
  /contact.?us/i, /send.?email/i,
];

// URL patterns that are always blocked. Kept deliberately narrow: only paths
// where the agent could actually submit a payment. Words like "billing",
// "pricing" and "subscribe" appear on read-only info/docs pages a research
// agent SHOULD visit (e.g. Linear's "Billing and plans" docs), so they are NOT
// blocked here — the click/type PAYMENT_PATTERNS still guard the real danger.
const BLOCKED_URL_PATTERNS = [
  /\/checkout(\/|\?|$)/i, /\/payment(s)?(\/|\?|$)/i, /\/cart(\/|\?|$)/i,
];

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

export function classifyAction(
  tool: ToolName,
  params: Record<string, unknown>,
  autonomy: 'autopilot' | 'approve_risky' | 'approve_all',
): PolicyResult {
  const raw = classifyRaw(tool, params, autonomy);

  // Autonomy semantics live here, once, so all callers agree:
  //   BLOCKED  — stops the agent in EVERY mode; the hard guardrail, never gated away.
  //   autopilot — the user has said "don't ask me": NEEDS_APPROVAL proceeds automatically.
  //               The irreversible actions (payment, message-send) are BLOCKED, not
  //               NEEDS_APPROVAL, so they still stop even here.
  //   approve_risky / approve_all — NEEDS_APPROVAL gates and waits for the human.
  if (autonomy === 'autopilot' && raw.decision === 'NEEDS_APPROVAL') {
    return { decision: 'SAFE', reason: `Autopilot: proceeding without a gate (${raw.reason})` };
  }
  return raw;
}

function classifyRaw(
  tool: ToolName,
  params: Record<string, unknown>,
  autonomy: 'autopilot' | 'approve_risky' | 'approve_all',
): PolicyResult {
  // approve_all: gate on every action except the terminal/step tools
  if (autonomy === 'approve_all' && tool !== 'finish' && tool !== 'finish_step') {
    return { decision: 'NEEDS_APPROVAL', reason: 'Approve-all mode: every action requires confirmation.' };
  }

  // Hard blocks — cannot be approved away in the demo
  if (tool === 'navigate') {
    const url = String(params['url'] ?? '');
    if (matchesAny(url, BLOCKED_URL_PATTERNS)) {
      return { decision: 'BLOCKED', reason: 'Navigation to payment or checkout pages is not permitted in the demo.' };
    }
  }

  if (tool === 'click') {
    // We evaluate click risk based on what the button label signals
    const label = String(params['refLabel'] ?? params['reason'] ?? '');
    if (matchesAny(label, PAYMENT_PATTERNS)) {
      return { decision: 'BLOCKED', reason: 'Clicking payment-related actions is not permitted.' };
    }
    if (matchesAny(label, MESSAGE_SEND_PATTERNS)) {
      return { decision: 'BLOCKED', reason: 'Sending messages on the user\'s behalf is not permitted.' };
    }
    if (matchesAny(label, ACCOUNT_CREATION_PATTERNS)) {
      return {
        decision: 'NEEDS_APPROVAL',
        reason: 'This looks like an account-creation action. Please confirm you want to proceed.',
      };
    }
  }

  if (tool === 'type') {
    const fieldName = String(params['reason'] ?? '');
    if (matchesAny(fieldName, PAYMENT_PATTERNS)) {
      return { decision: 'BLOCKED', reason: 'Entering payment information is not permitted.' };
    }
  }

  // Risky but approvable
  if (autonomy !== 'autopilot') {
    if (tool === 'press' && String(params['key'] ?? '') === 'Enter') {
      const reason = String(params['reason'] ?? '');
      if (matchesAny(reason, [...ACCOUNT_CREATION_PATTERNS, ...MESSAGE_SEND_PATTERNS])) {
        return { decision: 'NEEDS_APPROVAL', reason: `Pressing Enter might submit a form: ${reason}` };
      }
    }
  }

  return { decision: 'SAFE', reason: 'Action is safe to execute.' };
}
