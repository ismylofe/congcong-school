"use client";

import { useId } from "react";

/** Audio progress stays a small rail; the action keeps the shared disabled state. */
export function NarrationNextButton({ locked, progress, isLast, onClick }: {
  locked: boolean;
  progress: number | null;
  isLast: boolean;
  onClick: () => void;
}) {
  const hintId = useId();
  const label = isLast ? "開始練習" : "下一步";
  const completed = Math.min(1, Math.max(0, progress ?? 0));
  return (
    <div className="relative flex-1 min-w-0">
      <button type="button" disabled={locked} aria-label={label}
        aria-describedby={locked ? hintId : undefined} onClick={onClick}
        className={`w-full ${locked ? "btn-chunky-disabled" : "btn-chunky-primary"}`}>
        {label}
      </button>
      {locked && <>
        <div role="progressbar" aria-label="講解朗讀進度" aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={progress === null ? undefined : Math.round(completed * 100)}
          className="absolute bottom-0 left-4 right-4 h-1 rounded-full overflow-hidden bg-bg-softer">
          <div className={`h-full bg-secondary rounded-full ${progress === null ? "animate-pulse" : ""}`}
            style={{ width: progress === null ? "30%" : `${completed * 100}%`, transition: "width 160ms linear" }} />
        </div>
        <span id={hintId} className="sr-only">請先聽完本頁講解，再繼續學習。</span>
      </>}
    </div>
  );
}
