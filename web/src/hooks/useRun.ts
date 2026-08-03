import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  type AgentEvent,
  type ClientCommand,
  type RunState,
  applyEvent,
  initialRunState,
} from '../types.ts';

type Action =
  | { type: 'init'; runId: string; goal: string }
  | { type: 'event'; event: AgentEvent }
  | { type: 'reset' };

type State =
  | { mode: 'empty' }
  | { mode: 'run'; run: RunState };

function reducer(state: State, action: Action): State {
  if (action.type === 'reset') return { mode: 'empty' };
  if (action.type === 'init') {
    return { mode: 'run', run: initialRunState(action.runId, action.goal) };
  }
  if (action.type === 'event' && state.mode === 'run') {
    return { mode: 'run', run: applyEvent(state.run, action.event) };
  }
  return state;
}

export interface UseRunReturn {
  state: State;
  startRun: (goal: string, autonomy: string) => Promise<void>;
  sendCommand: (cmd: ClientCommand) => void;
  reset: () => void;
}

export function useRun(): UseRunReturn {
  const [state, dispatch] = useReducer(reducer, { mode: 'empty' });
  const wsRef = useRef<WebSocket | null>(null);

  const sendCommand = useCallback((cmd: ClientCommand) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(cmd));
    }
  }, []);

  const connectWs = useCallback((runId: string) => {
    wsRef.current?.close();
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/api/runs/${runId}/stream`);

    ws.addEventListener('message', (e) => {
      try {
        const event = JSON.parse(e.data as string) as AgentEvent;
        dispatch({ type: 'event', event });
      } catch { /* ignore */ }
    });

    ws.addEventListener('close', () => {
      wsRef.current = null;
    });

    wsRef.current = ws;
  }, []);

  const startRun = useCallback(async (goal: string, autonomy: string) => {
    const res = await fetch('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal, autonomy }),
    });
    if (!res.ok) throw new Error(`Failed to start run: ${res.statusText}`);
    const { id } = await res.json() as { id: string };

    // Update URL so refresh re-attaches
    history.pushState({}, '', `?run=${id}`);

    dispatch({ type: 'init', runId: id, goal });
    connectWs(id);
  }, [connectWs]);

  const reset = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    history.pushState({}, '', '/');
    dispatch({ type: 'reset' });
  }, []);

  // On mount: re-attach to an existing run from URL
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const runId = params.get('run');
    if (!runId) return;

    fetch(`/api/runs/${runId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data: { id: string; goal: string } | null) => {
        if (!data) return;
        dispatch({ type: 'init', runId: data.id, goal: data.goal });
        connectWs(data.id);
      })
      .catch(() => {});
  }, [connectWs]);

  // Clean up WS on unmount
  useEffect(() => {
    return () => { wsRef.current?.close(); };
  }, []);

  return { state, startRun, sendCommand, reset };
}
