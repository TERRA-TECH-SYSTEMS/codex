// ============================================================================
// CodeEX v2 — Resize Handle
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Draggable divider for resizing panels. Supports horizontal and vertical.
// ============================================================================

import { createSignal, onCleanup } from "solid-js";

interface Props {
  direction: "horizontal" | "vertical";
  onResize: (delta: number) => void;
}

export function ResizeHandle(props: Props) {
  const [dragging, setDragging] = createSignal(false);

  const handleMouseDown = (e: MouseEvent) => {
    e.preventDefault();
    setDragging(true);

    // Notify App shell that a drag is in progress (disables CSS width transitions)
    document.documentElement.classList.add("panel-resizing");

    const startPos = props.direction === "horizontal" ? e.clientX : e.clientY;
    let rafId = 0;
    let latestDelta = 0;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const currentPos = props.direction === "horizontal" ? moveEvent.clientX : moveEvent.clientY;
      latestDelta = currentPos - startPos;
      // Throttle resize callbacks to one per animation frame
      if (!rafId) {
        rafId = requestAnimationFrame(() => {
          rafId = 0;
          if (latestDelta !== 0) {
            props.onResize(latestDelta);
          }
        });
      }
    };

    const handleMouseUp = () => {
      if (rafId) cancelAnimationFrame(rafId);
      setDragging(false);
      document.documentElement.classList.remove("panel-resizing");
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = props.direction === "horizontal" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
  };

  return (
    <div
      class={`resize-handle ${props.direction} ${dragging() ? "active" : ""}`}
      onMouseDown={handleMouseDown}
    >
      <style>{`
        .resize-handle {
          flex-shrink: 0;
          z-index: 10;
          transition: background var(--duration-fast) var(--ease-out);
        }
        .resize-handle.horizontal {
          width: 4px;
          cursor: col-resize;
        }
        .resize-handle.vertical {
          height: 4px;
          cursor: row-resize;
        }
        .resize-handle:hover,
        .resize-handle.active {
          background: var(--accent-blue);
        }
        /* Hint the browser to optimize compositing for panels adjacent to an active handle */
        .resize-handle.active ~ * {
          will-change: width, height;
        }
      `}</style>
    </div>
  );
}
