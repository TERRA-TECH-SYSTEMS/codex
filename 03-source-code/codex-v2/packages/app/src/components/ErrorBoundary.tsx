// ============================================================================
// CodeEX v2 — Error Boundary
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Catches rendering errors in child components and displays a recovery UI
// instead of crashing the entire application. VS Code parity: graceful
// error handling for individual panels/components.
// ============================================================================

import { ErrorBoundary as SolidErrorBoundary, type JSX } from "solid-js";

interface Props {
  children: JSX.Element;
  name?: string;
}

function ErrorFallback(props: { error: Error; reset: () => void; name?: string }) {
  return (
    <div class="error-boundary">
      <div class="error-boundary-content">
        <div class="error-boundary-icon">!</div>
        <div class="error-boundary-title">
          {props.name ? `${props.name} encountered an error` : "Something went wrong"}
        </div>
        <div class="error-boundary-message">{props.error.message}</div>
        <button class="error-boundary-retry" onClick={props.reset}>
          Reload Component
        </button>
      </div>

      <style>{`
        .error-boundary {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
          min-height: 80px;
          background: var(--bg-base);
        }
        .error-boundary-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-6);
          max-width: 400px;
          text-align: center;
        }
        .error-boundary-icon {
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 69, 58, 0.15);
          color: var(--accent-red, #ff453a);
          border-radius: 50%;
          font-size: 20px;
          font-weight: 700;
        }
        .error-boundary-title {
          font-size: var(--text-sm);
          font-weight: 600;
          color: var(--text-primary);
        }
        .error-boundary-message {
          font-size: var(--text-xs);
          color: var(--text-tertiary);
          font-family: var(--font-mono);
          max-height: 60px;
          overflow: hidden;
          text-overflow: ellipsis;
          word-break: break-all;
        }
        .error-boundary-retry {
          padding: var(--space-2) var(--space-4);
          background: var(--bg-hover);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          color: var(--accent-blue);
          font-family: var(--font-ui);
          font-size: var(--text-xs);
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
        }
        .error-boundary-retry:hover {
          background: var(--bg-card);
          border-color: var(--accent-blue);
        }
      `}</style>
    </div>
  );
}

export function AppErrorBoundary(props: Props) {
  return (
    <SolidErrorBoundary
      fallback={(err, reset) => (
        <ErrorFallback error={err} reset={reset} name={props.name} />
      )}
    >
      {props.children}
    </SolidErrorBoundary>
  );
}
