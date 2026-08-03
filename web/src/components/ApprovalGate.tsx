import { useState } from 'react';
import type { AgentEvent } from '../types.ts';

interface Props {
  event: AgentEvent & { type: 'approval.required' };
  onApprove: () => void;
  onReject: (note: string) => void;
}

export function ApprovalGate({ event, onApprove, onReject }: Props) {
  const [note, setNote] = useState('');

  return (
    <div className="approval-overlay">
      <div className="approval-card">
        <div className="approval-header">
          <span className="approval-badge">Approval needed</span>
          <span className="approval-title">Review this action</span>
        </div>

        <div className="approval-risk">{event.riskReason}</div>

        <div className="approval-action">
          <span className="action-tool">{event.tool}</span>
          {' '}
          {Object.entries(event.params)
            .filter(([k]) => k !== 'refLabel')
            .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
            .join(' ')}
        </div>

        <div className="approval-note">
          <label htmlFor="reject-note">Reject with a note (optional)</label>
          <input
            id="reject-note"
            type="text"
            className="approval-note input"
            placeholder="e.g. use the annual billing toggle first"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && note.trim()) onReject(note);
            }}
          />
        </div>

        <div className="approval-actions">
          <button
            className="btn btn-danger"
            onClick={() => onReject(note || 'Rejected.')}
          >
            Reject
          </button>
          <button
            className="btn btn-approve"
            onClick={onApprove}
          >
            Approve →
          </button>
        </div>
      </div>
    </div>
  );
}
