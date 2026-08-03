import { type FormEvent, useState } from 'react';

const EXAMPLES = [
  'Compare Linear, Height and Shortcut on pricing, SSO, and data-residency — give me a table with sources',
  'Find the cheapest MacBook Air on Amazon and note the seller name and delivery estimate',
  'Look up the GitHub REST API rate-limit docs and summarise the key limits in a table',
];

interface Props {
  onStart: (goal: string, autonomy: 'autopilot' | 'approve_risky' | 'approve_all') => Promise<void>;
}

export function GoalComposer({ onStart }: Props) {
  const [goal, setGoal] = useState('');
  const [autonomy, setAutonomy] = useState<'autopilot' | 'approve_risky' | 'approve_all'>('approve_risky');
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
    <div className="composer-wrap" style={{ gridColumn: '1 / -1' }}>
      <form className="composer" onSubmit={submit}>
        <div>
          <div className="composer-title">Ariadne</div>
          <div className="composer-sub">AI browser agent — give it a goal, watch it work</div>
        </div>

        <div className="composer-input-wrap">
          <textarea
            className="composer-input"
            placeholder="What do you want to get done?"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void submit(e as unknown as FormEvent);
              }
            }}
            disabled={loading}
            autoFocus
          />
          <button className="composer-submit" type="submit" disabled={!goal.trim() || loading} aria-label="Start">
            {loading ? '…' : '→'}
          </button>
        </div>

        {error && (
          <div style={{ color: 'var(--fault)', fontSize: 13 }}>{error}</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Autonomy
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(
              [
                ['autopilot',    'Autopilot'],
                ['approve_risky','Approve risky (default)'],
                ['approve_all',  'Approve every step'],
              ] as const
            ).map(([val, label]) => (
              <label
                key={val}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 13, color: autonomy === val ? 'var(--paper)' : 'var(--dim-2)',
                  cursor: 'pointer',
                }}
              >
                <span
                  style={{
                    width: 12, height: 12, borderRadius: '50%',
                    border: `1.5px solid ${autonomy === val ? 'var(--live)' : 'var(--ink-3)'}`,
                    background: autonomy === val ? 'var(--live)' : 'transparent',
                    flexShrink: 0,
                  }}
                />
                <input
                  type="radio"
                  name="autonomy"
                  value={val}
                  checked={autonomy === val}
                  onChange={() => setAutonomy(val)}
                  style={{ display: 'none' }}
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div className="composer-examples">
          <div className="composer-examples-label">Try one</div>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              className="example-chip"
              onClick={() => setGoal(ex)}
              disabled={loading}
            >
              {ex}
            </button>
          ))}
        </div>
      </form>
    </div>
  );
}
