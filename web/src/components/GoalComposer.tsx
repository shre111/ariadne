import { useState, type FormEvent } from 'react';
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
    <div className="halftone flex min-h-screen w-full items-center justify-center px-6 py-10">
      <form onSubmit={submit} className="w-full max-w-2xl">
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-none border-2 border-foreground bg-primary font-display text-2xl text-primary-foreground shadow-[4px_4px_0_hsl(var(--hold))]">A</span>
            <h1 className="font-display text-5xl uppercase tracking-tight text-foreground">Ariadne</h1>
          </div>
          <p className="mt-3 max-w-md text-[15px] text-muted-foreground">
            An AI browser agent — give it a goal, watch every step, steer it in real time.
          </p>
        </div>

        <div className="relative rounded-none border-2 border-foreground bg-card p-2 shadow-[6px_6px_0_hsl(var(--hold))]">
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
            className="absolute bottom-3 right-3 grid size-9 place-items-center rounded-none border-2 border-foreground bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
          </button>
        </div>

        {error && <p className="mt-3 text-sm font-semibold text-fault">{error}</p>}

        <div className="mt-6 flex flex-col gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Autonomy</span>
          <div className="flex gap-1 rounded-none border-2 border-foreground bg-card p-1">
            {AUTONOMY.map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setAutonomy(val)}
                className={cn(
                  'flex-1 rounded-none px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors',
                  autonomy === val
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Try one</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              disabled={loading}
              onClick={() => setGoal(ex)}
              className="group flex items-center gap-2.5 rounded-none border-2 border-foreground bg-card px-4 py-2.5 text-left text-[13px] text-foreground transition-all hover:-translate-y-0.5 hover:shadow-[3px_3px_0_hsl(var(--live))]"
            >
              <span className="font-display text-primary">→</span>
              {ex}
            </button>
          ))}
        </div>
      </form>
    </div>
  );
}
