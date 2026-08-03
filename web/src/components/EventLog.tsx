import { useEffect, useRef, useState } from 'react';
import type { AgentEvent } from '../types.ts';

interface Props {
  events: AgentEvent[];
}

function eventCategory(ev: AgentEvent): string {
  switch (ev.type) {
    case 'thought':           return 'thought';
    case 'action.executed':   return 'action';
    case 'approval.required':
    case 'approval.granted':
    case 'approval.rejected': return 'approval';
    case 'error':             return 'error';
    case 'recovery':          return 'recovery';
    case 'plan.proposed':
    case 'step.started':
    case 'step.finished':     return 'step';
    case 'run.started':
    case 'run.finished':
    case 'run.failed':        return 'system';
    case 'budget.warning':    return 'error';
    default:                  return 'system';
  }
}

function eventLabel(ev: AgentEvent): string {
  switch (ev.type) {
    case 'thought':           return 'thought';
    case 'action.executed':   return ev.tool;
    case 'approval.required': return 'gate';
    case 'approval.granted':  return 'approved';
    case 'approval.rejected': return 'rejected';
    case 'error':             return 'error';
    case 'recovery':          return `recover·${ev.rung}`;
    case 'plan.proposed':     return 'plan';
    case 'step.started':      return `step ${ev.stepIndex + 1}`;
    case 'step.finished':     return `done·${ev.outcome}`;
    case 'run.started':       return 'start';
    case 'run.finished':      return 'finish';
    case 'run.failed':        return 'failed';
    case 'budget.warning':    return `budget·${ev.metric}`;
    case 'screenshot':        return 'screenshot';
    case 'ask.human':         return 'ask?';
    default:                  return (ev as AgentEvent).type;
  }
}

function EventRow({ ev }: { ev: AgentEvent }) {
  const [expanded, setExpanded] = useState(false);
  const cat = eventCategory(ev);
  const label = eventLabel(ev);
  const isAction = ev.type === 'action.executed';
  const isBold = ev.type === 'run.started' || ev.type === 'step.started' || ev.type === 'plan.proposed';

  // Skip bare screenshot events from the log to keep it readable
  if (ev.type === 'screenshot') return null;

  const hasDetail =
    ev.type === 'thought' ||
    ev.type === 'action.executed' ||
    ev.type === 'error' ||
    ev.type === 'recovery' ||
    ev.type === 'plan.proposed';

  return (
    <div className="event-row">
      <span className={`event-type ${cat}`}>{label}</span>
      <span className={`event-text ${isBold ? 'bold' : ''}`}>
        {ev.explain}
        {isAction && !ev.ok && (
          <span style={{ color: 'var(--fault)', marginLeft: 6 }}>✗</span>
        )}
      </span>
      {hasDetail && (
        <button
          className="event-detail"
          onClick={() => setExpanded(!expanded)}
          aria-label="Toggle detail"
        >
          {expanded ? '▲' : '▼'}
        </button>
      )}
      {expanded && hasDetail && (
        <div
          style={{
            width: '100%',
            marginTop: 4,
            background: 'var(--ink-2)',
            borderRadius: 4,
            padding: '6px 8px',
            fontSize: 11,
            color: 'var(--dim-2)',
            wordBreak: 'break-all',
            whiteSpace: 'pre-wrap',
          }}
        >
          {ev.type === 'thought' && ev.text}
          {ev.type === 'action.executed' && JSON.stringify(ev.params, null, 2)}
          {ev.type === 'error' && `${ev.code}: ${ev.detail}`}
          {ev.type === 'recovery' && `Strategy: ${ev.strategy}\n${ev.detail}`}
          {ev.type === 'plan.proposed' && ev.steps.map((s) => `${s.index + 1}. ${s.title}`).join('\n')}
        </div>
      )}
    </div>
  );
}

export function EventLog({ events }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [events, autoScroll]);

  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
    setAutoScroll(atBottom);
  }

  return (
    <div className="event-log" ref={containerRef} onScroll={handleScroll}>
      {events.map((ev) => (
        <EventRow key={ev.id} ev={ev} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
