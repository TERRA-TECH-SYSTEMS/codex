// ============================================================================
// CodeEX v2 — Sovereign IDE by TerraTech Systems
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Entry point — mounts the SolidJS application.
// ============================================================================

import { render } from "solid-js/web";
import { App } from "./App";
import "./styles/theme.css";
import "./styles/layout.css";

const root = document.getElementById("root");
if (root) {
  render(() => <App />, root);
}
