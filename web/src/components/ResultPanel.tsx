import { useState } from 'react';

interface Props {
  result: unknown;
  goal: string;
  onReset: () => void;
  onShowSource: (url: string) => void;
}

type Row = Record<string, unknown>;

// Pull a table of rows out of whatever shape the agent returned:
// a bare array, or an object with a `rows` / `findings` / `data` array.
function extractRows(result: unknown): Row[] | null {
  if (Array.isArray(result) && result.every((r) => r && typeof r === 'object')) {
    return result as Row[];
  }
  if (result && typeof result === 'object') {
    for (const key of ['rows', 'findings', 'data', 'results', 'items']) {
      const v = (result as Record<string, unknown>)[key];
      if (Array.isArray(v) && v.every((r) => r && typeof r === 'object')) return v as Row[];
    }
  }
  return null;
}

function orderedColumns(rows: Row[]): string[] {
  const keys = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) keys.add(k);
  const preferred = ['field', 'name', 'label', 'value', 'answer', 'detail', 'source', 'source_url', 'url', 'confidence'];
  const present = [...keys];
  return present.sort((a, b) => {
    const ia = preferred.indexOf(a); const ib = preferred.indexOf(b);
    if (ia === -1 && ib === -1) return 0;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

const SOURCE_KEYS = new Set(['source', 'source_url', 'url']);
const CONF_KEYS = new Set(['confidence', 'conf']);

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return (u.hostname + u.pathname).replace(/^www\./, '').replace(/\/$/, '');
  } catch {
    return url;
  }
}

function ConfidenceBadge({ value }: { value: string }) {
  const v = value.toLowerCase();
  const color = v === 'high' ? 'var(--ok)' : v === 'low' ? 'var(--fault)' : 'var(--hold)';
  return (
    <span style={{
      display: 'inline-block', fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
      letterSpacing: '0.05em', padding: '2px 7px', borderRadius: 4,
      color, background: `color-mix(in srgb, ${color} 16%, transparent)`,
    }}>
      {value}
    </span>
  );
}

function ResultTable({ rows, onShowSource }: { rows: Row[]; onShowSource: (u: string) => void }) {
  const cols = orderedColumns(rows);
  return (
    <div className="result-table-wrap">
      <table className="result-table">
        <thead>
          <tr>{cols.map((c) => <th key={c}>{c.replace(/_/g, ' ')}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {cols.map((c) => {
                const val = row[c];
                if (SOURCE_KEYS.has(c) && typeof val === 'string' && val.startsWith('http')) {
                  return (
                    <td key={c}>
                      <button className="source-chip" onClick={() => onShowSource(val)} title={`Show the page this came from: ${val}`}>
                        ⧉ {shortUrl(val)}
                      </button>
                    </td>
                  );
                }
                if (CONF_KEYS.has(c) && typeof val === 'string') {
                  return <td key={c}><ConfidenceBadge value={val} /></td>;
                }
                const isField = c === 'field' || c === 'name' || c === 'label';
                return <td key={c} className={isField ? 'cell-field' : ''}>{val === undefined || val === null ? '—' : String(val)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ResultPanel({ result, goal, onReset, onShowSource }: Props) {
  const [showRaw, setShowRaw] = useState(false);
  const rows = extractRows(result);

  function download(filename: string, content: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function exportCSV() {
    if (!rows) return;
    const cols = orderedColumns(rows);
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(String(r[c] ?? ''))).join(','))].join('\n');
    download('ariadne-result.csv', csv, 'text/csv');
  }

  return (
    <div className="result-panel">
      <div className="result-header">
        <span className="result-badge">Result</span>
        <span className="result-goal">{goal}</span>
        <div className="result-actions">
          <button className="btn btn-ghost" onClick={() => setShowRaw((s) => !s)}>{showRaw ? 'Table' : 'Raw JSON'}</button>
          <button className="btn btn-ghost" onClick={() => download('ariadne-result.json', JSON.stringify(result, null, 2), 'application/json')}>JSON</button>
          {rows && <button className="btn btn-ghost" onClick={exportCSV}>CSV</button>}
          <button className="btn btn-primary" onClick={onReset}>New goal</button>
        </div>
      </div>

      {showRaw || !rows ? (
        <pre className="result-raw">{JSON.stringify(result, null, 2)}</pre>
      ) : (
        <ResultTable rows={rows} onShowSource={onShowSource} />
      )}
    </div>
  );
}
