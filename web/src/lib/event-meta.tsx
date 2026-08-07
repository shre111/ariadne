import {
  Sparkles, Globe, MousePointerClick, Keyboard, MoveVertical, Table2, Flag,
  CornerDownLeft, ChevronsUpDown, ArrowLeft, ShieldAlert, CheckCircle2, XCircle,
  LifeBuoy, ListChecks, Radio, HelpCircle, AlertTriangle, Camera, OctagonX,
  Pause as PauseIcon, Play as PlayIcon, type LucideIcon,
} from 'lucide-react';
import type { AgentEvent } from '@/types';

export type Tone = 'live' | 'ok' | 'hold' | 'fault' | 'muted';

export interface EventMeta {
  label: string;
  tone: Tone;
  Icon: LucideIcon;
}

const TOOL_ICON: Record<string, LucideIcon> = {
  navigate: Globe,
  click: MousePointerClick,
  type: Keyboard,
  press: CornerDownLeft,
  select: ChevronsUpDown,
  scroll: MoveVertical,
  go_back: ArrowLeft,
  extract: Table2,
  finish: Flag,
  finish_step: Flag,
};

export function eventMeta(ev: AgentEvent): EventMeta {
  switch (ev.type) {
    case 'thought':           return { label: 'thinking', tone: 'live', Icon: Sparkles };
    case 'action.executed':   return { label: ev.tool, tone: ev.ok ? 'ok' : 'fault', Icon: TOOL_ICON[ev.tool] ?? MousePointerClick };
    case 'approval.required': return { label: 'approval', tone: 'hold', Icon: ShieldAlert };
    case 'approval.granted':  return { label: 'approved', tone: 'ok', Icon: CheckCircle2 };
    case 'approval.rejected': return { label: 'rejected', tone: 'fault', Icon: XCircle };
    case 'error':             return { label: 'error', tone: 'fault', Icon: XCircle };
    case 'recovery':          return { label: `recover · ${ev.rung}`, tone: 'hold', Icon: LifeBuoy };
    case 'plan.proposed':     return { label: 'plan', tone: 'live', Icon: ListChecks };
    case 'step.started':      return { label: `step ${ev.stepIndex + 1}`, tone: 'live', Icon: Flag };
    case 'step.finished':     return { label: `done · ${ev.outcome}`, tone: ev.outcome === 'success' ? 'ok' : ev.outcome === 'failed' ? 'fault' : 'muted', Icon: CheckCircle2 };
    case 'run.started':       return { label: 'start', tone: 'live', Icon: Radio };
    case 'run.finished':      return { label: 'finish', tone: 'ok', Icon: CheckCircle2 };
    case 'run.failed':        return { label: ev.reason === 'stopped' ? 'stopped' : 'failed', tone: 'fault', Icon: ev.reason === 'stopped' ? OctagonX : AlertTriangle };
    case 'run.paused':        return { label: 'paused', tone: 'hold', Icon: PauseIcon };
    case 'run.resumed':       return { label: 'resumed', tone: 'live', Icon: PlayIcon };
    case 'run.stopping':      return { label: 'stopping', tone: 'hold', Icon: OctagonX };
    case 'budget.warning':    return { label: `budget · ${ev.metric}`, tone: 'hold', Icon: AlertTriangle };
    case 'ask.human':         return { label: 'question', tone: 'hold', Icon: HelpCircle };
    case 'screenshot':        return { label: 'screenshot', tone: 'muted', Icon: Camera };
    default:                  return { label: (ev as AgentEvent).type, tone: 'muted', Icon: Radio };
  }
}

export const toneText: Record<Tone, string> = {
  live: 'text-live',
  ok: 'text-ok',
  hold: 'text-hold',
  fault: 'text-fault',
  muted: 'text-muted-foreground',
};

export function detailText(ev: AgentEvent): string | null {
  switch (ev.type) {
    case 'thought':         return ev.text;
    case 'action.executed': return JSON.stringify(ev.params, null, 2);
    case 'error':           return `${ev.code}: ${ev.detail}`;
    case 'recovery':        return `${ev.strategy}\n${ev.detail}`;
    case 'plan.proposed':   return ev.steps.map((s) => `${s.index + 1}. ${s.title}`).join('\n');
    default:                return null;
  }
}
