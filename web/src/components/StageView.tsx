import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MonitorPlay, Rewind } from 'lucide-react';
import type { BBox } from '@/types';

export interface Highlight {
  bbox: BBox;
  viewport: { width: number; height: number };
  label?: string;
}

interface Props {
  screenshot: string | null;
  scrubbing: boolean;
  scrubLabel?: string;
  highlight: Highlight | null;
}

interface Metrics { left: number; top: number; scale: number }

export function StageView({ screenshot, scrubbing, scrubLabel, highlight }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  // A single, stable <img> (no crossfade double-mount) so measuring the rendered
  // rect for the X-ray overlay is always reliable.
  const measure = useCallback(() => {
    const img = imgRef.current, cont = containerRef.current;
    if (!img || !cont || !img.naturalWidth) return;
    const ir = img.getBoundingClientRect(), cr = cont.getBoundingClientRect();
    setMetrics({ left: ir.left - cr.left, top: ir.top - cr.top, scale: ir.width / img.naturalWidth });
  }, []);

  useEffect(() => { measure(); }, [screenshot, measure]);
  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  const box = highlight && metrics ? {
    left: metrics.left + highlight.bbox.x * metrics.scale,
    top: metrics.top + highlight.bbox.y * metrics.scale,
    width: Math.max(10, highlight.bbox.w * metrics.scale),
    height: Math.max(10, highlight.bbox.h * metrics.scale),
  } : null;

  return (
    <div ref={containerRef} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.015] via-transparent to-black/20" />

      {screenshot ? (
        <img
          ref={imgRef}
          src={`data:image/jpeg;base64,${screenshot}`}
          onLoad={measure}
          draggable={false}
          alt="Live browser view"
          className="max-h-full max-w-full rounded-xl border border-white/10 shadow-[0_40px_90px_-40px_rgba(0,0,0,0.95)] ring-1 ring-black/50 transition-opacity duration-200"
        />
      ) : (
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="thinking-sweep grid size-16 place-items-center rounded-2xl border border-white/10 bg-white/[0.03]">
            <MonitorPlay className="size-7 opacity-70" />
          </div>
          <span className="text-sm">Waiting for the agent to open a page…</span>
        </div>
      )}

      {/* X-ray: highlight the element the agent is acting on */}
      <AnimatePresence>
        {box && (
          <motion.div
            key="xray"
            className="pointer-events-none absolute z-20 rounded-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, left: box.left, top: box.top, width: box.width, height: box.height }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30, opacity: { duration: 0.15 } }}
            style={{ border: '2px solid hsl(var(--live))', boxShadow: '0 0 0 3px hsl(var(--live)/0.18), 0 0 26px hsl(var(--live)/0.6)' }}
          >
            <span className="absolute -top-6 left-0 whitespace-nowrap rounded-md bg-live px-2 py-0.5 font-mono text-[10px] font-semibold text-white shadow-lg">
              {highlight?.label ?? 'acting'}
            </span>
            <span className="absolute inset-0 animate-pulse-glow rounded-md ring-1 ring-live/40" />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {scrubbing && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="absolute left-4 top-4 z-30 flex items-center gap-1.5 rounded-lg border border-hold/40 bg-background/80 px-2.5 py-1.5 text-xs font-medium text-hold shadow-lg backdrop-blur-md"
          >
            <Rewind className="size-3.5" />
            Rewound{scrubLabel ? ` · ${scrubLabel}` : ''}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
