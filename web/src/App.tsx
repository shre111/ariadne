import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Pause, Play, Square, Sparkles, Send, CircleHelp, Activity, Check,
  Volume2, VolumeX, Share2, CopyCheck, Eye, Zap,
} from 'lucide-react';
import { useRun } from '@/hooks/useRun';
import { useNarration } from '@/hooks/useNarration';
import { GoalComposer } from '@/components/GoalComposer';
import { StageView, type Highlight } from '@/components/StageView';
import { EventLog } from '@/components/EventLog';
import { ApprovalGate } from '@/components/ApprovalGate';
import { FlightRecorder } from '@/components/FlightRecorder';
import { ResultPanel } from '@/components/ResultPanel';
import { Button } from '@/components/ui/button';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { screenshotAtSeq, momentLabelAtSeq, type RunStatus } from '@/types';
import { computeCost } from '@/lib/cost';
import { cn } from '@/lib/utils';

const STATUS: Record<RunStatus, { label: string; dot: string; text: string; pulse: boolean }> = {
  running:          { label: 'Running',         dot: 'bg-live',   text: 'text-live',   pulse: true },
  paused:           { label: 'Paused',          dot: 'bg-muted-foreground', text: 'text-muted-foreground', pulse: false },
  waiting_approval: { label: 'Waiting for you', dot: 'bg-hold',   text: 'text-hold',   pulse: true },
  waiting_answer:   { label: 'Waiting for you', dot: 'bg-hold',   text: 'text-hold',   pulse: true },
  finished:         { label: 'Done',            dot: 'bg-ok',     text: 'text-ok',     pulse: false },
  failed:           { label: 'Failed',          dot: 'bg-fault',  text: 'text-fault',  pulse: false },
  stopped:          { label: 'Stopped',         dot: 'bg-fault',  text: 'text-fault',  pulse: false },
};

export function App() {
  const { state, startRun, sendCommand, reset, isWatch } = useRun();
  const [answerDraft, setAnswerDraft] = useState('');
  const [scrubSeq, setScrubSeq] = useState<number | null>(null);
  const [voiceOn, setVoiceOn] = useState(false);
  const [copied, setCopied] = useState(false);
  const [liveHl, setLiveHl] = useState<Highlight | null>(null);
  const lastHlSeq = useRef(-1);

  const events = state.mode === 'run' ? state.run.events : [];
  const eventCount = events.length;

  useNarration(events, voiceOn);

  // New events pull the stage back to live (never hide activity behind a scrub).
  useEffect(() => { setScrubSeq(null); }, [eventCount]);

  // X-ray: flash a highlight box on the element the latest action targeted.
  useEffect(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i]!;
      if (e.type !== 'action.executed') continue;
      if (e.bbox && e.viewport && e.seq > lastHlSeq.current) {
        lastHlSeq.current = e.seq;
        const hl: Highlight = { bbox: e.bbox, viewport: e.viewport, label: e.refLabel ?? e.tool };
        setLiveHl(hl);
        const t = setTimeout(() => setLiveHl((cur) => (cur === hl ? null : cur)), 1700);
        return () => clearTimeout(t);
      }
      break;
    }
    return undefined;
  }, [eventCount]); // eslint-disable-line

  if (state.mode === 'empty') {
    return (
      <TooltipProvider delayDuration={300}>
        <GoalComposer onStart={async (goal, autonomy) => { await startRun(goal, autonomy); }} />
      </TooltipProvider>
    );
  }

  const { run } = state;
  const isActive = run.status === 'running' || run.status === 'paused' || run.status === 'waiting_approval' || run.status === 'waiting_answer';
  const st = STATUS[run.status];

  // Which highlight to draw: the scrubbed action's, else the live flash.
  const scrubHl: Highlight | null = (() => {
    if (scrubSeq === null) return null;
    const e = run.events.find((x) => x.seq === scrubSeq);
    if (e && e.type === 'action.executed' && e.bbox && e.viewport) {
      return { bbox: e.bbox, viewport: e.viewport, label: e.refLabel ?? e.tool };
    }
    return null;
  })();
  const highlight = scrubSeq !== null ? scrubHl : liveHl;

  const usage = run.latestUsage;
  const cost = usage ? computeCost(usage) : null;
  const actionCount = run.events.filter((e) => e.type === 'action.executed' && e.tool !== 'finish' && e.tool !== 'finish_step').length;

  function share() {
    const url = `${location.origin}/?run=${run.runId}&watch=1`;
    navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => {});
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen flex-col overflow-hidden">
        {/* Header */}
        <header className="glass z-20 flex h-14 shrink-0 items-center gap-3 rounded-none border-x-0 border-t-0 px-4">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-none border-2 border-foreground bg-primary font-display text-sm text-primary-foreground">A</span>
            <span className="font-display text-[15px] tracking-tight">Ariadne</span>
          </div>
          <div className="mx-1 h-5 w-0.5 bg-foreground" />
          <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">{run.goal}</span>

          {/* Live cost / cache-savings ticker */}
          {cost && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 rounded-none border-2 border-foreground bg-card px-3 py-1 font-mono text-[11px] shadow-[3px_3px_0_hsl(var(--hold))]">
                  <Zap className="size-3 text-live" />
                  <span className="font-bold text-foreground">${cost.cost.toFixed(cost.cost < 1 ? 3 : 2)}</span>
                  <span className="text-muted-foreground">· {actionCount} actions</span>
                  {cost.savedPct >= 1 && <span className="font-semibold text-ok">· {cost.savedPct.toFixed(0)}% cached</span>}
                </div>
              </TooltipTrigger>
              <TooltipContent>Live spend, actions taken, and % saved by prompt caching</TooltipContent>
            </Tooltip>
          )}

          {/* Voice narration toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setVoiceOn((v) => !v)}
                className={cn('grid size-8 place-items-center rounded-none border-2 border-foreground transition-colors', voiceOn ? 'bg-live text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground')}
                aria-label="Toggle voice narration"
              >
                {voiceOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
              </button>
            </TooltipTrigger>
            <TooltipContent>{voiceOn ? 'Voice narration on' : 'Read the agent aloud'}</TooltipContent>
          </Tooltip>

          {/* Share spectator link (owner only) */}
          {!isWatch && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={share}
                  className="grid size-8 place-items-center rounded-none border-2 border-foreground bg-card text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Copy spectator link"
                >
                  {copied ? <CopyCheck className="size-4 text-ok" /> : <Share2 className="size-4" />}
                </button>
              </TooltipTrigger>
              <TooltipContent>{copied ? 'Link copied!' : 'Copy a read-only watch link'}</TooltipContent>
            </Tooltip>
          )}

          {isWatch && (
            <span className="flex items-center gap-1.5 rounded-none border-2 border-foreground bg-card px-3 py-1 text-xs text-muted-foreground">
              <Eye className="size-3.5" /> Spectating
            </span>
          )}

          <div className="flex items-center gap-2 rounded-none border-2 border-foreground bg-card px-3 py-1">
            <span className={cn('size-2.5 rounded-none', st.dot, st.pulse && 'animate-pulse-glow')} />
            <span className="text-xs font-bold uppercase tracking-wide text-foreground">{st.label}</span>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* Rail */}
          <aside className="glass z-10 flex w-72 shrink-0 flex-col rounded-none border-y-0 border-l-0">
            <div className="flex-1 overflow-y-auto p-4">
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Plan</div>
              {run.steps.length === 0 ? (
                <div className="thinking-sweep rounded-none border-2 border-foreground px-3 py-2.5 text-xs text-muted-foreground">Planning…</div>
              ) : (
                <div className="flex flex-col gap-1">
                  {run.steps.map((step, i) => {
                    const outcome = run.stepOutcomes[step.index];
                    const isLive = step.index === run.currentStepIndex && !outcome;
                    return (
                      <motion.div
                        key={step.index}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className={cn('flex items-start gap-2.5 rounded-none px-2.5 py-2 transition-colors', isLive && 'border-l-[3px] border-live bg-live/15 pl-2', outcome && 'opacity-60')}
                      >
                        <span className={cn('mt-0.5 grid size-4 shrink-0 place-items-center rounded-none border-2 text-[9px]',
                          isLive && 'border-foreground bg-live text-primary-foreground',
                          outcome === 'success' && 'border-foreground bg-ok text-white',
                          outcome === 'failed' && 'border-foreground bg-fault text-white',
                          !isLive && !outcome && 'border-foreground')}>
                          {outcome === 'success' && <Check className="size-2.5" />}
                          {outcome === 'failed' && '✕'}
                          {isLive && <span className="size-1.5 animate-ping rounded-none bg-primary-foreground" />}
                        </span>
                        <span className={cn('text-xs leading-snug', isLive ? 'font-bold text-foreground' : 'text-muted-foreground')}>{step.title}</span>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Controls (hidden for spectators) */}
            <div className="flex flex-col gap-2 border-t-2 border-foreground p-4">
              {isWatch ? (
                <div className="flex items-center gap-2 rounded-none border-2 border-foreground bg-card px-3 py-2 text-xs text-muted-foreground">
                  <Eye className="size-3.5" /> Read-only — you're watching
                </div>
              ) : (
                <>
                  {run.status === 'running' && <Button variant="secondary" onClick={() => sendCommand({ type: 'run.pause' })}><Pause /> Pause</Button>}
                  {run.status === 'paused' && <Button onClick={() => sendCommand({ type: 'run.resume' })}><Play /> Resume</Button>}
                  {isActive && <Button variant="danger" onClick={() => sendCommand({ type: 'run.stop' })}><Square /> Stop</Button>}
                  {!isActive && <Button onClick={reset}><Sparkles /> New goal</Button>}
                </>
              )}
            </div>
          </aside>

          {/* Main */}
          <main className="flex min-w-0 flex-1 flex-col bg-background">
            <div className="relative flex min-h-0 flex-1 flex-col">
              <StageView
                screenshot={scrubSeq === null ? run.latestScreenshot : screenshotAtSeq(run.events, scrubSeq)}
                scrubbing={scrubSeq !== null}
                scrubLabel={scrubSeq !== null ? momentLabelAtSeq(run.events, scrubSeq) : undefined}
                highlight={highlight}
              />
              <AnimatePresence>
                {run.pendingApproval && (
                  <ApprovalGate
                    event={run.pendingApproval}
                    readOnly={isWatch}
                    onApprove={() => sendCommand({ type: 'run.approve' })}
                    onReject={(note) => sendCommand({ type: 'run.reject', note })}
                  />
                )}
              </AnimatePresence>
            </div>

            {/* Ask human */}
            <AnimatePresence>
              {run.pendingQuestion && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="shrink-0 overflow-hidden border-t-2 border-foreground bg-hold/10">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <CircleHelp className="size-5 shrink-0 text-hold" />
                    <span className="flex-1 text-[13px]"><span className="font-bold text-hold">Agent needs help:</span> {run.pendingQuestion}</span>
                    {!isWatch && (
                      <>
                        <input
                          value={answerDraft}
                          onChange={(e) => setAnswerDraft(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && answerDraft.trim()) { sendCommand({ type: 'run.answer', answer: answerDraft }); setAnswerDraft(''); } }}
                          placeholder="Your answer…"
                          className="h-8 w-64 rounded-none border-2 border-foreground bg-background px-3 text-[13px] outline-none focus:ring-2 focus:ring-hold"
                        />
                        <Button size="sm" disabled={!answerDraft.trim()} onClick={() => { sendCommand({ type: 'run.answer', answer: answerDraft }); setAnswerDraft(''); }}>
                          <Send /> Send
                        </Button>
                      </>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Result */}
            <AnimatePresence>
              {run.status === 'finished' && run.result !== null && (
                <ResultPanel
                  result={run.result}
                  goal={run.goal}
                  onReset={reset}
                  onShowSource={(url) => {
                    const nav = run.events.find((e) => e.type === 'action.executed' && e.tool === 'navigate' && e.params['url'] === url);
                    if (!nav) return;
                    const shot = run.events.find((e) => e.type === 'screenshot' && e.seq > nav.seq);
                    setScrubSeq(shot ? shot.seq : nav.seq);
                  }}
                />
              )}
            </AnimatePresence>

            <FlightRecorder steps={run.steps} stepOutcomes={run.stepOutcomes} currentStepIndex={run.currentStepIndex} events={run.events} scrubSeq={scrubSeq} onScrub={setScrubSeq} />

            {/* Activity log */}
            <div className="glass flex h-60 shrink-0 flex-col rounded-none border-x-0 border-b-0">
              <div className="flex items-center gap-2 border-b-2 border-foreground px-4 py-2">
                <Activity className="size-3.5 text-muted-foreground" />
                <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Activity</span>
                {run.status === 'running' && (
                  <span className="ml-1 flex items-center gap-1.5 text-[10px] font-bold uppercase text-foreground">
                    <span className="size-1.5 animate-pulse-glow rounded-none bg-live" /> streaming
                  </span>
                )}
              </div>
              <div className="min-h-0 flex-1">
                <EventLog events={run.events} />
              </div>
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
