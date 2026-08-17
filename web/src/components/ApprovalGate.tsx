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
      className="absolute inset-0 z-30 flex items-center justify-center bg-foreground/35 p-4"
    >
      <motion.div
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="w-[480px] max-w-full rounded-none border-[3px] border-foreground bg-card p-6 shadow-[10px_10px_0_hsl(var(--hold))]"
      >
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-none border-2 border-foreground bg-hold text-white">
            <ShieldAlert className="size-5" />
          </div>
          <div className="flex flex-col gap-1">
            <Badge variant="hold" className="w-fit">Approval needed</Badge>
            <span className="font-display text-[15px]">Review this action before it runs</span>
          </div>
        </div>

        <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">{event.riskReason}</p>

        <div className="mt-4 rounded-none border-2 border-foreground bg-background p-3 font-mono text-xs">
          <span className="font-bold text-hold">{event.tool}</span>{' '}
          <span className="text-muted-foreground">
            {Object.entries(event.params)
              .filter(([k]) => k !== 'refLabel')
              .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
              .join('  ')}
          </span>
        </div>

        {readOnly ? (
          <div className="mt-5 flex items-center gap-2 rounded-none border-2 border-foreground bg-background px-3 py-2.5 text-xs text-muted-foreground">
            <span className="size-1.5 animate-pulse-glow rounded-none bg-hold" />
            Waiting for the operator to decide…
          </div>
        ) : (
          <>
            <div className="mt-4 flex flex-col gap-1.5">
              <label htmlFor="reject-note" className="text-xs font-semibold text-muted-foreground">
                Reject with a note (steers the agent)
              </label>
              <input
                id="reject-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && note.trim()) onReject(note); }}
                placeholder="e.g. that's the signup button — use the annual toggle instead"
                className="h-9 rounded-none border-2 border-foreground bg-background px-3 font-mono text-xs outline-none transition focus:ring-2 focus:ring-hold"
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
