import { useRun } from './hooks/useRun.ts';
import { GoalComposer } from './components/GoalComposer.tsx';
import { StageView } from './components/StageView.tsx';
import { EventLog } from './components/EventLog.tsx';
import { ApprovalGate } from './components/ApprovalGate.tsx';
import { FlightRecorder } from './components/FlightRecorder.tsx';
import { ResultPanel } from './components/ResultPanel.tsx';
import { screenshotAtSeq, momentLabelAtSeq } from './types.ts';
import { useEffect, useState } from 'react';

export function App() {
  const { state, startRun, sendCommand, reset } = useRun();
  const [answerDraft, setAnswerDraft] = useState('');
  const [scrubSeq, setScrubSeq] = useState<number | null>(null);

  // Any new event pulls the stage back to live, so incoming activity is never
  // hidden behind a scrub the user forgot they left open.
  const eventCount = state.mode === 'run' ? state.run.events.length : 0;
  useEffect(() => {
    setScrubSeq(null);
  }, [eventCount]);

  if (state.mode === 'empty') {
    return (
      <div className="app-layout" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <GoalComposer
          onStart={async (goal, autonomy) => {
            await startRun(goal, autonomy);
          }}
        />
      </div>
    );
  }

  const { run } = state;
  const isActive = run.status === 'running' || run.status === 'paused' || run.status === 'waiting_approval' || run.status === 'waiting_answer';

  function statusLabel() {
    switch (run.status) {
      case 'running':          return 'running';
      case 'paused':           return 'paused';
      case 'waiting_approval': return 'waiting for you';
      case 'waiting_answer':   return 'waiting for you';
      case 'finished':         return 'done';
      case 'failed':           return 'failed';
      case 'stopped':          return 'stopped';
      default:                 return run.status;
    }
  }

  function statusDotClass() {
    if (run.status === 'running') return 'running';
    if (run.status === 'waiting_approval' || run.status === 'waiting_answer') return 'waiting';
    if (run.status === 'finished') return 'done';
    if (run.status === 'failed' || run.status === 'stopped') return 'failed';
    return '';
  }

  return (
    <div className="app-layout">
      {/* Header */}
      <header className="header">
        <span className="header-logo">Ariadne</span>
        <span className="header-goal">{run.goal}</span>
        <div className="header-status">
          <div className={`status-dot ${statusDotClass()}`} />
          <span style={{ color: 'var(--dim-2)' }}>{statusLabel()}</span>
        </div>
      </header>

      {/* Rail */}
      <aside className="rail">
        {/* Plan steps */}
        <div className="rail-section">
          <div className="rail-section-label">Plan</div>
          {run.steps.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--dim)', padding: '4px' }}>
              Planning…
            </div>
          ) : (
            run.steps.map((step) => {
              const outcome = run.stepOutcomes[step.index];
              const isLive = step.index === run.currentStepIndex && !outcome;
              return (
                <div
                  key={step.index}
                  className={`plan-step ${isLive ? 'active' : ''} ${outcome ? 'done' : ''}`}
                >
                  <div
                    className={`step-icon ${isLive ? 'live' : ''} ${outcome === 'success' ? 'ok' : ''} ${outcome === 'failed' ? 'fail' : ''}`}
                  >
                    {outcome === 'success' ? '✓' : outcome === 'failed' ? '✗' : isLive ? '' : ''}
                  </div>
                  <span className="step-title">{step.title}</span>
                </div>
              );
            })
          )}
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Controls */}
        <div className="controls">
          {run.status === 'running' && (
            <button
              className="btn btn-ghost"
              onClick={() => sendCommand({ type: 'run.pause' })}
            >
              ⏸ Pause
            </button>
          )}
          {run.status === 'paused' && (
            <button
              className="btn btn-primary"
              onClick={() => sendCommand({ type: 'run.resume' })}
            >
              ▶ Resume
            </button>
          )}
          {isActive && (
            <button
              className="btn btn-danger"
              onClick={() => sendCommand({ type: 'run.stop' })}
            >
              ■ Stop
            </button>
          )}
          {!isActive && (
            <button className="btn btn-primary" onClick={reset}>
              New goal
            </button>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="main">
        {/* Stage — shows the scrubbed moment when the flight recorder is scrubbed */}
        <StageView
          screenshot={scrubSeq === null ? run.latestScreenshot : screenshotAtSeq(run.events, scrubSeq)}
          scrubbing={scrubSeq !== null}
          scrubLabel={scrubSeq !== null ? momentLabelAtSeq(run.events, scrubSeq) : undefined}
        />

        {/* Approval overlay — covers the whole stage area as the centrepiece */}
        {run.pendingApproval && (
          <ApprovalGate
            event={run.pendingApproval}
            onApprove={() => sendCommand({ type: 'run.approve' })}
            onReject={(note) => sendCommand({ type: 'run.reject', note })}
          />
        )}

        {/* Ask human */}
        {run.pendingQuestion && (
          <div className="ask-human-banner">
            <div className="ask-human-q">
              <strong>Agent needs help:</strong> {run.pendingQuestion}
            </div>
            <input
              className="ask-human-input"
              placeholder="Your answer…"
              value={answerDraft}
              onChange={(e) => setAnswerDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && answerDraft.trim()) {
                  sendCommand({ type: 'run.answer', answer: answerDraft });
                  setAnswerDraft('');
                }
              }}
            />
            <button
              className="btn btn-primary"
              onClick={() => {
                sendCommand({ type: 'run.answer', answer: answerDraft });
                setAnswerDraft('');
              }}
              disabled={!answerDraft.trim()}
            >
              Send
            </button>
          </div>
        )}

        {/* Result panel */}
        {run.status === 'finished' && run.result !== null && (
          <ResultPanel
            result={run.result}
            goal={run.goal}
            onReset={reset}
            onShowSource={(url) => {
              // Rewind the stage to the screenshot of the page this cell came from.
              const nav = run.events.find(
                (e) => e.type === 'action.executed' && e.tool === 'navigate' && e.params['url'] === url,
              );
              if (!nav) return;
              const shot = run.events.find((e) => e.type === 'screenshot' && e.seq > nav.seq);
              setScrubSeq(shot ? shot.seq : nav.seq);
            }}
          />
        )}

        {/* Flight recorder */}
        <FlightRecorder
          steps={run.steps}
          stepOutcomes={run.stepOutcomes}
          currentStepIndex={run.currentStepIndex}
          events={run.events}
          scrubSeq={scrubSeq}
          onScrub={setScrubSeq}
        />

        {/* Event log */}
        <EventLog events={run.events} />
      </main>
    </div>
  );
}
