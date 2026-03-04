// ============================================================================
// CodeEX v2 — Loading Spinner
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Reusable loading indicator for async content (file tree, search results,
// extensions marketplace, etc.). VS Code parity: progress spinners in panels.
// ============================================================================

interface Props {
  size?: "sm" | "md" | "lg";
  label?: string;
}

export function LoadingSpinner(props: Props) {
  const sizeMap = { sm: 16, md: 24, lg: 36 };
  const sz = () => sizeMap[props.size ?? "md"];

  return (
    <div class="loading-spinner-container">
      <svg
        class="loading-spinner"
        width={sz()}
        height={sz()}
        viewBox="0 0 24 24"
        fill="none"
      >
        <circle
          cx="12" cy="12" r="10"
          stroke="var(--border-subtle)"
          stroke-width="2.5"
        />
        <path
          d="M12 2a10 10 0 019.8 8"
          stroke="var(--accent-blue)"
          stroke-width="2.5"
          stroke-linecap="round"
        />
      </svg>
      {props.label && <span class="loading-spinner-label">{props.label}</span>}

      <style>{`
        .loading-spinner-container {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-2);
          padding: var(--space-3);
        }
        .loading-spinner {
          animation: codex-spin 0.8s linear infinite;
        }
        @keyframes codex-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .loading-spinner-label {
          font-size: var(--text-xs);
          color: var(--text-tertiary);
        }
      `}</style>
    </div>
  );
}
