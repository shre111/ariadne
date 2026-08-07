import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { ArrowUp, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Autonomy = 'autopilot' | 'approve_risky' | 'approve_all';

const EXAMPLES = [
  'Compare Linear, Height and Shortcut on pricing, SSO, and data-residency — give me a table with sources',
  'Find the cheapest MacBook Air on Amazon and note the seller name and delivery estimate',
  'Look up the GitHub REST API rate-limit docs and summarise the key limits in a table',
];

const AUTONOMY: [Autonomy, string][] = [
  ['autopilot', 'Autopilot'],
  ['approve_risky', 'Approve risky'],
  ['approve_all', 'Approve every step'],
];

const fade = {
  hidden: { opacity: 0, y: 12 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: 0.05 * i, duration: 0.4, ease: 'easeOut' } }),
};

export function GoalComposer({ onStart }: { onStart: (goal: string, autonomy: Autonomy) => Promise<void> }) {
  const [goal, setGoal] = useState('');
  const [autonomy, setAutonomy] = useState<Autonomy>('approve_risky');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!goal.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      await onStart(goal.trim(), autonomy);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center px-6 py-10">
      <form onSubmit={submit} className="w-full max-w-2xl">
        <motion.div variants={fade} custom={0} initial="hidden" animate="show" className="mb-8">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-primary to-[hsl(280_80%_60%)] font-display text-lg font-bold text-white shadow-[0_8px_24px_-6px_hsl(var(--primary)/0.7)]">A</span>
            <h1 className="font-display text-4xl font-bold tracking-tight text-gradient">Ariadne</h1>
          </div>
          <p className="mt-2 text-[15px] text-muted-foreground">
            An AI browser agent — give it a goal, watch every step, steer it in real time.
          </p>
        </motion.div>

        <motion.div variants={fade} custom={1} initial="hidden" animate="show" className="glass relative rounded-2xl p-2">
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit(e as unknown as FormEvent); } }}
            placeholder="What do you want to get done?"
            autoFocus
            disabled={loading}
            className="h-28 w-full resize-none bg-transparent px-3 py-2.5 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground/70"
          />
          <button
            type="submit"
            disabled={!goal.trim() || loading}
            className="absolute bottom-3 right-3 grid size-9 place-items-center rounded-xl bg-primary text-white shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.8)] transition hover:bg-primary/90 disabled:opacity-40"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
          </button>
        </motion.div>

        {error && <p className="mt-3 text-sm text-fault">{error}</p>}

        <motion.div variants={fade} custom={2} initial="hidden" animate="show" className="mt-5 flex flex-col gap-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Autonomy</span>
          <div className="flex gap-1 rounded-xl border border-white/[0.06] bg-black/20 p-1">
            {AUTONOMY.map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setAutonomy(val)}
                className={cn(
                  'relative flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition',
                  autonomy === val ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {autonomy === val && (
                  <motion.span
                    layoutId="autonomy-pill"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                    className="absolute inset-0 rounded-lg bg-white/[0.08] ring-1 ring-white/10"
                  />
                )}
                <span className="relative">{label}</span>
              </button>
            ))}
          </div>
        </motion.div>

        <motion.div variants={fade} custom={3} initial="hidden" animate="show" className="mt-6 flex flex-col gap-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Try one</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              disabled={loading}
              onClick={() => setGoal(ex)}
              className="group flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2.5 text-left text-[13px] text-muted-foreground transition hover:border-primary/40 hover:bg-white/[0.04] hover:text-foreground"
            >
              <span className="text-primary opacity-60 transition group-hover:opacity-100">→</span>
              {ex}
            </button>
          ))}
        </motion.div>
      </form>
    </div>
  );
}
