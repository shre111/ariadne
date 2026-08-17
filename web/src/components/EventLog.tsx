import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, XCircle } from 'lucide-react';
import type { AgentEvent } from '@/types';
import { eventMeta, detailText, type Tone } from '@/lib/event-meta';
import { cn } from '@/lib/utils';

// Riso: tone reads as a solid stamped chip, never coloured text on newsprint.
const toneChip: Record<Tone, string> = {
  live: 'bg-live text-primary-foreground',
  ok: 'bg-ok text-white',
  hold: 'bg-hold text-white',
  fault: 'bg-fault text-white',
  muted: 'bg-card text-foreground',
};

function EventRow({ ev, isLatest }: { ev: AgentEvent; isLatest: boolean }) {
  const [open, setOpen] = useState(false);
  const { label, tone, Icon } = eventMeta(ev);
  const detail = detailText(ev);
  const failedAction = ev.type === 'action.executed' && !ev.ok;

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className={cn(
        'group flex flex-col gap-1 rounded-none px-2.5 py-2 transition-colors hover:bg-accent',
        isLatest && 'bg-accent/60',
      )}
    >
      {/* Header row: everything lives on one flex ROW; detail goes on its own block below */}
      <div className="flex items-start gap-2.5">
        <span className={cn('mt-px flex size-5 shrink-0 items-center justify-center rounded-none border border-foreground', toneChip[tone])}>
          <Icon className="size-3" />
        </span>
        <span className="mt-1 shrink-0 font-mono text-[10px] font-bold uppercase tracking-wide text-foreground">
          {label}
        </span>
        <span className="mt-0.5 min-w-0 flex-1 break-words text-[13px] leading-relaxed text-foreground">
          {ev.explain}
          {failedAction && <XCircle className="ml-1.5 inline size-3.5 -translate-y-px text-fault" />}
        </span>
        {detail && (
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label="Toggle detail"
            className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition hover:text-foreground group-hover:opacity-100"
          >
            <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
          </button>
        )}
      </div>

      {/* Full-width detail block — wraps on words, never per-character */}
      <AnimatePresence initial={false}>
        {open && detail && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <pre className="ml-[30px] mt-1 max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-none border-2 border-foreground bg-background p-2.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
              {detail}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function EventLog({ events }: { events: AgentEvent[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const visible = events.filter((e) => e.type !== 'screenshot');

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [visible.length, autoScroll]);

  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
  }

  return (
    <div ref={containerRef} onScroll={handleScroll} className="h-full overflow-y-auto px-2 py-2">
      {visible.length === 0 ? (
        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
          The agent's thoughts and actions will stream here…
        </div>
      ) : (
        visible.map((ev, i) => <EventRow key={ev.id} ev={ev} isLatest={i === visible.length - 1} />)
      )}
      <div ref={bottomRef} />
    </div>
  );
}
