import { motion } from 'framer-motion';
import { Play } from 'lucide-react';
import type { AgentEvent, PlanStep } from '@/types';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type TickTone = 'pending' | 'live' | 'ok' | 'fault' | 'hold';

interface Tick {
  seq: number;
  label: string;
  tone: TickTone;
}

const toneBg: Record<TickTone, string> = {
  pending: 'bg-foreground/25',
  live: 'bg-live',
  ok: 'bg-ok',
  fault: 'bg-fault',
  hold: 'bg-hold',
};

interface Props {
  steps: PlanStep[];
  stepOutcomes: Record<number, 'success' | 'failed' | 'skipped'>;
  currentStepIndex: number;
  events: AgentEvent[];
  scrubSeq: number | null;
  onScrub: (seq: number | null) => void;
}

export function FlightRecorder({ steps, stepOutcomes, currentStepIndex, events, scrubSeq, onScrub }: Props) {
  const stepTicks: Tick[] = steps.map((step) => {
    const started = events.find((e) => e.type === 'step.started' && e.stepIndex === step.index);
    const outcome = stepOutcomes[step.index];
    let tone: TickTone = 'pending';
    if (outcome === 'success') tone = 'ok';
    else if (outcome === 'failed') tone = 'fault';
    else if (outcome === 'skipped') tone = 'hold';
    else if (step.index === currentStepIndex) tone = 'live';
    return { seq: started ? started.seq : 0, label: `Step ${step.index + 1}: ${step.title}`, tone };
  });

  const actionTicks: Tick[] = [];
  for (const e of events) {
    if (e.type !== 'action.executed') continue;
    actionTicks.push({ seq: e.seq, label: e.explain, tone: e.ok ? 'ok' : 'fault' });
  }

  if (stepTicks.length === 0 && actionTicks.length === 0) {
    return <div className="h-11 border-t-2 border-foreground" />;
  }

  const renderTick = (t: Tick, big: boolean) => {
    const active = scrubSeq === t.seq;
    return (
      <Tooltip key={`${big ? 's' : 'a'}-${t.seq}-${t.label.slice(0, 8)}`}>
        <TooltipTrigger asChild>
          <motion.button
            whileHover={{ scale: 1.35 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => onScrub(t.seq)}
            className={cn(
              'shrink-0 rounded-none border border-foreground transition-transform',
              big ? 'h-3.5 w-3.5' : 'h-2.5 w-[7px]',
              toneBg[t.tone],
              t.tone === 'live' && 'animate-pulse-glow',
              active && 'outline outline-2 outline-offset-2 outline-foreground',
            )}
            aria-label={t.label}
          />
        </TooltipTrigger>
        <TooltipContent>{t.label}</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <div className="flex h-11 items-center gap-2.5 border-t-2 border-foreground bg-card px-4">
      {scrubSeq !== null && (
        <button
          onClick={() => onScrub(null)}
          className="flex shrink-0 items-center gap-1.5 rounded-none border-2 border-foreground bg-live px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wide text-primary-foreground"
        >
          <Play className="size-3 fill-current" /> Live
        </button>
      )}
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-2">
        {stepTicks.map((t) => renderTick(t, true))}
        {actionTicks.length > 0 && <span className="mx-1 h-3.5 w-0.5 shrink-0 bg-foreground" />}
        {actionTicks.slice(-40).map((t) => renderTick(t, false))}
      </div>
    </div>
  );
}
