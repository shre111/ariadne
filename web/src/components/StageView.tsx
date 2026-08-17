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
    <div ref={containerRef} className="halftone relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-6">
      <span className="pointer-events-none absolute left-3 top-2 select-none font-display text-2xl text-primary">⊕</span>

      {screenshot ? (
        <img
          ref={imgRef}
          src={`data:image/jpeg;base64,${screenshot}`}
          onLoad={measure}
          draggable={false}
          alt="Live browser view"
          className="max-h-full max-w-full rounded-none border-2 border-foreground shadow-[8px_8px_0_hsl(var(--hold))] transition-opacity duration-200"
        />
      ) : (
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="thinking-sweep grid size-16 place-items-center rounded-none border-2 border-foreground bg-card">
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
            className="pointer-events-none absolute z-20 rounded-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, left: box.left, top: box.top, width: box.width, height: box.height }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30, opacity: { duration: 0.15 } }}
            style={{ border: '3px solid hsl(var(--live))', boxShadow: '4px 4px 0 hsl(var(--hold))' }}
          >
            <span className="absolute -top-6 left-0 whitespace-nowrap rounded-none border-2 border-foreground bg-live px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-primary-foreground">
              {highlight?.label ?? 'acting'}
            </span>
            <span className="absolute inset-0 animate-pulse-glow" />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {scrubbing && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="absolute left-4 top-4 z-30 flex items-center gap-1.5 rounded-none border-2 border-foreground bg-card px-2.5 py-1.5 text-xs font-bold uppercase text-hold shadow-[3px_3px_0_hsl(var(--hold))]"
          >
            <Rewind className="size-3.5" />
            Rewound{scrubLabel ? ` · ${scrubLabel}` : ''}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
