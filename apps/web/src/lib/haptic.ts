"use client";

/**
 * haptic.ts — 輕量震動封裝
 * 桌面端自動 no-op；受全域 muted 開關控制。
 */

import { isMuted } from "./sfx";

export type HapticKind = "light" | "medium" | "heavy" | "success" | "error";

export function haptic(kind: HapticKind = "light") {
  if (isMuted()) return;
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    switch (kind) {
      case "light":
        navigator.vibrate(10);
        break;
      case "medium":
        navigator.vibrate([15, 30, 15]);
        break;
      case "heavy":
        navigator.vibrate([25, 50, 25]);
        break;
      case "success":
        navigator.vibrate([10, 40, 20]);
        break;
      case "error":
        navigator.vibrate([30, 60, 30, 60, 30]);
        break;
    }
  } catch {
    // ignore
  }
}
