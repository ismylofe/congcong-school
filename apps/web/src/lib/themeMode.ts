"use client";

/**
 * themeMode.ts —— 免費深色模式的三態偏好（跟隨系統 / 亮 / 暗）。
 *
 * 與美妝主題（equippedTheme）互相獨立：
 *   - 購買的暗色美妝主題（isDark）永遠「強制暗色」，覆蓋這裡的偏好；
 *   - 其餘情況按這裡的三態決定是否掛 .theme-dark（night 色板）。
 *
 * 儲存在 localStorage（THEME_MODE_KEY），首屏由 layout.tsx 的內聯腳本
 * 提前讀取並掛類，防止白閃。
 */

import { learnerLocalStorage, learnerStorageKey } from "@/lib/learnerProfiles";
import { useSyncExternalStore } from "react";

export type ThemeMode = "system" | "light" | "dark";

export const THEME_MODE_KEY = "csf-theme-mode";

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach(l => l());
}

export function getThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  const raw = learnerLocalStorage.getItem(THEME_MODE_KEY);
  return raw === "light" || raw === "dark" ? raw : "system";
}

export function setThemeMode(mode: ThemeMode) {
  if (typeof window === "undefined") return;
  if (mode === "system") learnerLocalStorage.removeItem(THEME_MODE_KEY);
  else learnerLocalStorage.setItem(THEME_MODE_KEY, mode);
  emit();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  // 其他標籤頁改了偏好也同步
  const onStorage = (e: StorageEvent) => {
    if (e.key === learnerStorageKey(THEME_MODE_KEY)) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** 響應式讀取當前三態偏好 */
export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(subscribe, getThemeMode, () => "system" as ThemeMode);
}

/** 系統是否偏好深色（響應式） */
export function useSystemPrefersDark(): boolean {
  return useSyncExternalStore(
    cb => {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
    () => false,
  );
}
