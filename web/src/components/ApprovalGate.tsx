import { useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldAlert, Check, X } from 'lucide-react';
import type { AgentEvent } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface Props {
  event: AgentEvent & { type: 'approval.required' };
  onApprove: () => void;
  onReject: (note: string) => void;
  readOnly?: boolean;
}

export function ApprovalGate({ event, onApprove, onReject, readOnly = false }: Props) {
  const [note, setNote] = useState('');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-30 flex items-center justify-center bg-background/70 p-4 backdrop-blur-md"
    >
      <motion.div
        initial={{ scale: 0.94, y: 14, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 24 }}
        className="glass w-[480px] max-w-full rounded-2xl p-6 shadow-[0_0_80px_-16px_hsl(var(--hold)/0.45)] ring-1 ring-hold/30"
      >
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-hold/15 text-hold">
            <ShieldAlert className="size-5" />
          </div>
          <div className="flex flex-col gap-1">
            <Badge variant="hold" className="w-fit">Approval needed</Badge>
            <span className="font-display text-[15px] font-semibold">Review this action before it runs</span>
          </div>
        </div>

        <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">{event.riskReason}</p>

        <div className="mt-4 rounded-lg border border-white/[0.06] bg-black/30 p-3 font-mono text-xs">
          <span className="font-semibold text-live">{event.tool}</span>{' '}
          <span className="text-muted-foreground">
            {Object.entries(event.params)
              .filter(([k]) => k !== 'refLabel')
              .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
              .join('  ')}
          </span>
        </div>

        {readOnly ? (
          <div className="mt-5 flex items-center gap-2 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2.5 text-xs text-muted-foreground">
            <span className="size-1.5 animate-pulse-glow rounded-full bg-hold" />
            Waiting for the operator to decide…
          </div>
        ) : (
          <>
            <div className="mt-4 flex flex-col gap-1.5">
              <label htmlFor="reject-note" className="text-xs text-muted-foreground">
                Reject with a note (steers the agent)
              </label>
              <input
                id="reject-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && note.trim()) onReject(note); }}
                placeholder="e.g. that's the signup button — use the annual toggle instead"
                className="h-9 rounded-md border border-input bg-black/20 px-3 font-mono text-xs outline-none transition focus:border-hold focus:ring-2 focus:ring-hold/30"
              />
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="danger" onClick={() => onReject(note || 'Rejected.')}>
                <X /> Reject
              </Button>
              <Button variant="approve" onClick={onApprove}>
                <Check /> Approve
              </Button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
