import { useEffect, useRef } from 'react';
import type { AgentEvent } from '@/types';

// Speaks the agent's key moments aloud via the browser's built-in Speech API.
// Put on headphones and *listen* to your agent work.
function narrate(ev: AgentEvent): string | null {
  switch (ev.type) {
    case 'thought':           return ev.text.slice(0, 240);
    case 'step.started':      return `Step ${ev.stepIndex + 1}. ${ev.title}`;
    case 'approval.required': return `I need your approval. ${ev.riskReason}`;
    case 'ask.human':         return ev.question;
    case 'run.finished':      return 'Done. Your result is ready.';
    case 'run.failed':        return `The run stopped. ${ev.explain}`;
    case 'run.paused':        return 'Paused.';
    case 'run.resumed':       return 'Resuming.';
    default:                  return null;
  }
}

export function useNarration(events: AgentEvent[], enabled: boolean): void {
  const lastSeq = useRef(-1);
  const wasEnabled = useRef(false);

  useEffect(() => {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;

    // On toggle: skip the backlog when switching on; stop speaking when off.
    if (enabled && !wasEnabled.current) {
      lastSeq.current = events.length ? events[events.length - 1]!.seq : -1;
    }
    if (!enabled && wasEnabled.current) {
      synth?.cancel();
    }
    wasEnabled.current = enabled;

    if (!enabled || !synth) return;

    for (const ev of events) {
      if (ev.seq <= lastSeq.current) continue;
      lastSeq.current = ev.seq;
      // A stop must silence narration at once: clear whatever is already queued
      // or mid-utterance, and don't speak the backlog that led up to it. Mark
      // every event consumed so none of it replays on a later render.
      if (ev.type === 'run.stopping' || (ev.type === 'run.failed' && ev.reason === 'stopped')) {
        synth.cancel();
        lastSeq.current = events.length ? events[events.length - 1]!.seq : lastSeq.current;
        break;
      }
      const text = narrate(ev);
      if (!text) continue;
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.06;
      u.pitch = 1;
      synth.speak(u);
    }
  }, [events, enabled]);

  // Ensure speech stops if the component unmounts mid-utterance.
  useEffect(() => () => { window.speechSynthesis?.cancel(); }, []);
}
