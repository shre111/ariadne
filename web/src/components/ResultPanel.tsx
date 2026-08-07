import { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Download, ExternalLink, Sparkles, Table2, Code2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type Row = Record<string, unknown>;

interface Props {
  result: unknown;
  goal: string;
  onReset: () => void;
  onShowSource: (url: string) => void;
}

function extractRows(result: unknown): Row[] | null {
  if (Array.isArray(result) && result.every((r) => r && typeof r === 'object')) return result as Row[];
  if (result && typeof result === 'object') {
    for (const key of ['rows', 'findings', 'data', 'results', 'items']) {
      const v = (result as Record<string, unknown>)[key];
      if (Array.isArray(v) && v.every((r) => r && typeof r === 'object')) return v as Row[];
    }
  }
  return null;
}

const PREFERRED = ['field', 'name', 'label', 'value', 'answer', 'detail', 'source', 'source_url', 'url', 'confidence'];
function orderedColumns(rows: Row[]): string[] {
  const keys = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) keys.add(k);
  return [...keys].sort((a, b) => {
    const ia = PREFERRED.indexOf(a), ib = PREFERRED.indexOf(b);
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
  return <Badge variant={v === 'high' ? 'ok' : v === 'low' ? 'fault' : 'hold'}>{value}</Badge>;
}

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function ResultPanel({ result, goal, onReset, onShowSource }: Props) {
  const [showRaw, setShowRaw] = useState(false);
  const rows = extractRows(result);
  const cols = rows ? orderedColumns(rows) : [];

  function exportCSV() {
    if (!rows) return;
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(String(r[c] ?? ''))).join(','))].join('\n');
    download('ariadne-result.csv', csv, 'text/csv');
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 220, damping: 26 }}
      className="glass max-h-[46vh] shrink-0 overflow-y-auto border-t-0"
      style={{ boxShadow: '0 -24px 60px -30px hsl(var(--ok)/0.35)' }}
    >
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/[0.06] bg-card/80 px-4 py-3 backdrop-blur-xl">
        <div className="grid size-8 place-items-center rounded-lg bg-ok/15 text-ok">
          <CheckCircle2 className="size-4" />
        </div>
        <div className="flex min-w-0 flex-col">
          <Badge variant="ok" className="w-fit">Result</Badge>
        </div>
        <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">{goal}</span>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => setShowRaw((s) => !s)}>
            {showRaw ? <Table2 /> : <Code2 />} {showRaw ? 'Table' : 'JSON'}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => download('ariadne-result.json', JSON.stringify(result, null, 2), 'application/json')}>
            <Download /> JSON
          </Button>
          {rows && <Button variant="secondary" size="sm" onClick={exportCSV}><Download /> CSV</Button>}
          <Button size="sm" onClick={onReset}><Sparkles /> New goal</Button>
        </div>
      </div>

      {showRaw || !rows ? (
        <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-words p-4 font-mono text-xs text-foreground/90">
          {JSON.stringify(result, null, 2)}
        </pre>
      ) : (
        <div className="overflow-x-auto p-3">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c} className="whitespace-nowrap border-b border-white/[0.08] px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {c.replace(/_/g, ' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <motion.tr
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="border-b border-white/[0.05] transition-colors hover:bg-white/[0.03]"
                >
                  {cols.map((c) => {
                    const val = row[c];
                    if (SOURCE_KEYS.has(c) && typeof val === 'string' && val.startsWith('http')) {
                      return (
                        <td key={c} className="px-3 py-2.5 align-top">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => onShowSource(val)}
                                className="inline-flex max-w-[240px] items-center gap-1.5 truncate rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 font-mono text-[11px] text-live transition hover:border-live/40 hover:bg-live/10"
                              >
                                <ExternalLink className="size-3 shrink-0" />
                                <span className="truncate">{shortUrl(val)}</span>
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>Rewind the stage to this page</TooltipContent>
                          </Tooltip>
                        </td>
                      );
                    }
                    if (CONF_KEYS.has(c) && typeof val === 'string') {
                      return <td key={c} className="px-3 py-2.5 align-top"><ConfidenceBadge value={val} /></td>;
                    }
                    const isField = c === 'field' || c === 'name' || c === 'label';
                    return (
                      <td key={c} className={cn('px-3 py-2.5 align-top', isField ? 'whitespace-nowrap font-semibold text-foreground' : 'text-foreground/85')}>
                        {val === undefined || val === null ? '—' : String(val)}
                      </td>
                    );
                  })}
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );
}
