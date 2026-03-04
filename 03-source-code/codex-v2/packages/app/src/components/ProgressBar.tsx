// ============================================================================
// CodeEX v2 — Progress Bar
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Global indeterminate/determinate progress bar for async operations.
// VS Code parity: progress indicator at top of editor area and in panels.
// ============================================================================

import { Show } from "solid-js";

interface Props {
  active: boolean;
  value?: number;       // 0-100 for determinate, undefined for indeterminate
  color?: string;
}

export function ProgressBar(props: Props) {
  return (
    <Show when={props.active}>
      <div class="progress-bar-container" role="progressbar" aria-valuenow={props.value} aria-valuemin={0} aria-valuemax={100}>
        <Show when={props.value !== undefined} fallback={
          <div class="progress-bar-indeterminate" style={{ background: props.color ?? "var(--accent-blue)" }} />
        }>
          <div class="progress-bar-fill" style={{ width: `${props.value}%`, background: props.color ?? "var(--accent-blue)" }} />
        </Show>
      </div>

      <style>{`
        .progress-bar-container {
          position: relative;
          width: 100%;
          height: 2px;
          background: transparent;
          overflow: hidden;
          flex-shrink: 0;
        }
        .progress-bar-fill {
          height: 100%;
          transition: width 200ms var(--ease-out);
        }
        .progress-bar-indeterminate {
          height: 100%;
          width: 40%;
          animation: progress-slide 1.5s ease-in-out infinite;
        }
        @keyframes progress-slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
      `}</style>
    </Show>
  );
}
