interface Props {
  screenshot: string | null;
  scrubbing: boolean;
  scrubLabel?: string;
  highlightRef?: { x: number; y: number; w: number; h: number } | null;
}

export function StageView({ screenshot, scrubbing, scrubLabel, highlightRef }: Props) {
  return (
    <div className="stage">
      {screenshot ? (
        <>
          <img src={`data:image/jpeg;base64,${screenshot}`} alt="Live browser view" draggable={false} />
          {highlightRef && (
            <div
              className="stage-highlight"
              style={{
                left: `${highlightRef.x}px`,
                top: `${highlightRef.y}px`,
                width: `${highlightRef.w}px`,
                height: `${highlightRef.h}px`,
              }}
            />
          )}
          {scrubbing && (
            <div className="stage-rewind-badge">
              ⏪ Rewound{scrubLabel ? ` — ${scrubLabel}` : ''}
            </div>
          )}
        </>
      ) : (
        <div className="stage-empty">Waiting for the agent to open a page…</div>
      )}
    </div>
  );
}
