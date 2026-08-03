import type { AgentEvent, PlanStep } from '../types.ts';

export interface Moment {
  seq: number;
  kind: 'step' | 'action';
  label: string;
  status: 'pending' | 'live' | 'ok' | 'fault' | 'hold';
}

interface Props {
  steps: PlanStep[];
  stepOutcomes: Record<number, 'success' | 'failed' | 'skipped'>;
  currentStepIndex: number;
  events: AgentEvent[];
  scrubSeq: number | null;
  onScrub: (seq: number | null) => void;
}

// Build the tick band: one tick per step (coloured by outcome), with the
// per-action ticks of the current/last step shown after a divider. Each tick
// carries the event seq it maps to, so clicking rewinds the stage to that moment.
function buildMoments(
  steps: PlanStep[],
  stepOutcomes: Record<number, 'success' | 'failed' | 'skipped'>,
  currentStepIndex: number,
  events: AgentEvent[],
): Moment[] {
  const moments: Moment[] = [];

  for (const step of steps) {
    const started = events.find((e) => e.type === 'step.started' && e.stepIndex === step.index);
    const outcome = stepOutcomes[step.index];
    let status: Moment['status'] = 'pending';
    if (outcome === 'success') status = 'ok';
    else if (outcome === 'failed') status = 'fault';
    else if (outcome === 'skipped') status = 'hold';
    else if (step.index === currentStepIndex) status = 'live';

    moments.push({
      seq: started ? started.seq : 0,
      kind: 'step',
      label: `Step ${step.index + 1}: ${step.title}`,
      status,
    });
  }

  return moments;
}

export function FlightRecorder({ steps, stepOutcomes, currentStepIndex, events, scrubSeq, onScrub }: Props) {
  const stepMoments = buildMoments(steps, stepOutcomes, currentStepIndex, events);

  // Action ticks — every executed action is a scrubbable moment.
  const actionMoments: Moment[] = [];
  for (const e of events) {
    if (e.type !== 'action.executed') continue;
    actionMoments.push({
      seq: e.seq,
      kind: 'action',
      label: e.explain,
      status: e.ok ? 'ok' : 'fault',
    });
  }

  const hasContent = stepMoments.length > 0 || actionMoments.length > 0;
  if (!hasContent) return <div className="flight-recorder" />;

  // Which tick is "active" — the scrubbed one, else the newest.
  const activeSeq = scrubSeq;

  function tickClass(m: Moment): string {
    const cls = ['flight-tick', m.status];
    if (activeSeq !== null && m.seq === activeSeq) cls.push('active');
    return cls.join(' ');
  }

  return (
    <div className="flight-recorder">
      {scrubSeq !== null && (
        <button className="flight-live-btn" onClick={() => onScrub(null)} title="Return to the live view">
          ⏵ LIVE
        </button>
      )}

      <div className="flight-ticks" role="list" aria-label="Flight recorder — scrub to any step">
        {stepMoments.map((m) => (
          <button
            key={`s${m.seq}-${m.label}`}
            className={tickClass(m)}
            style={{ width: 14, height: 14 }}
            role="listitem"
            title={m.label}
            aria-label={m.label}
            onClick={() => onScrub(m.seq)}
          />
        ))}

        {actionMoments.length > 0 && (
          <span className="flight-divider" aria-hidden="true" />
        )}

        {actionMoments.map((m) => (
          <button
            key={`a${m.seq}`}
            className={tickClass(m)}
            style={{ width: 7 }}
            role="listitem"
            title={m.label}
            aria-label={m.label}
            onClick={() => onScrub(m.seq)}
          />
        ))}
      </div>
    </div>
  );
}
