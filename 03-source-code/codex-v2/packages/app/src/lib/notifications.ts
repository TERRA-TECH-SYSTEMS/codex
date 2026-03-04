// ============================================================================
// CodeEX v2 — Notification System
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Reactive toast notifications. Import { notify, notifications } to use.
// ============================================================================

import { createSignal } from "solid-js";

export type NotificationType = "info" | "success" | "warning" | "error";

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  timestamp: number;
  duration: number;
}

const [notifications, setNotifications] = createSignal<Notification[]>([]);

export { notifications };

let counter = 0;

export function notify(
  message: string,
  type: NotificationType = "info",
  duration = 4000,
) {
  const id = `notif-${++counter}`;
  const notif: Notification = {
    id,
    type,
    message,
    timestamp: Date.now(),
    duration,
  };

  setNotifications((prev) => [...prev, notif]);

  if (duration > 0) {
    setTimeout(() => dismiss(id), duration);
  }

  return id;
}

export function dismiss(id: string) {
  setNotifications((prev) => prev.filter((n) => n.id !== id));
}
