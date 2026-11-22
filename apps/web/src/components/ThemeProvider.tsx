"use client";

/**
 * ThemeProvider —— 三態深色模式 + 美妝主題的統一應用層。
 *
 * 深色的三個來源（優先順序從高到低）：
 *   1. 裝備了暗色美妝主題（theme_midnight / theme_obsidian，isDark）
 *      → 「強制暗色」，用主題自帶的色板覆蓋同一套 --app-* token
 *   2. 免費三態偏好 = dark（手動開關）
 *   3. 免費三態偏好 = system 且系統 prefers-color-scheme: dark
 *   後兩種情況只掛 .theme-dark 類，night 色板（與 iOS DuoColors 同 hex：
 *   bg #131F24 / surface #202F36 / border #37464F）由 globals.css 提供預設值。
 *
 * 亮色美妝主題隻影響 --theme-primary / --theme-accent / --theme-bg 等
 * 強調色；處於深色時保留強調色、頁面底色走 night token。
 *
 * .theme-dark 類掛在 <html> 上 —— layout.tsx 的首屏內聯腳本會在水合前
 * 先掛好，防止白閃；這裡負責水合後的響應式維護。
 *
 * 同時掛載全域 <MotionConfig reducedMotion="user" transition={uiMotion.fade}>，讓所有 framer-motion
 * 動畫尊重系統「減少動態效果」設定。
 */

import { useEffect } from "react";
import { uiMotion } from "@/lib/motion";
import { MotionConfig } from "framer-motion";
import { useProgressStore } from "@/store/progress";
import { themeAccentColors } from "@/lib/themeColors";
import { getCosmeticById, type UiTheme } from "@/lib/cosmetics";
import { useThemeMode, useSystemPrefersDark } from "@/lib/themeMode";

const NIGHT_BG = "#131F24";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const themeId = useProgressStore(s => s.equippedTheme);
  const mode = useThemeMode();
  const systemDark = useSystemPrefersDark();

  useEffect(() => {
    const item = getCosmeticById(themeId) as UiTheme | undefined;
    if (!item || item.type !== "ui_theme") return;
    const d = item.data;
    const surfaceBg = themeId === "theme_default" ? "#FFFFFF" : d.bg;
    const root = document.documentElement;

    // 強調色永遠跟隨裝備的美妝主題
    root.style.setProperty("--theme-primary", d.primary);
    root.style.setProperty("--theme-primary-dark", d.primaryDark);
    root.style.setProperty("--theme-accent", d.accent);
    root.style.setProperty("--theme-bg", surfaceBg);

    const freeDark = mode === "dark" || (mode === "system" && systemDark);
    const isDark = !!d.isDark || freeDark;
    for (const [name, value] of Object.entries(themeAccentColors(d.primary, d.primaryDark, d.accent, isDark))) {
      root.style.setProperty(name, value);
    }

    if (d.isDark) {
      // 購買的暗色主題：同一套 token，用主題自帶色板覆蓋 night 預設值
      root.style.setProperty("--app-bg", d.bg);
      root.style.setProperty("--app-bg-soft", d.bgSoft ?? d.bg);
      root.style.setProperty("--app-bg-softer", d.bgSofter ?? d.cardBg ?? d.bg);
      root.style.setProperty("--app-card", d.cardBg ?? "#202F36");
      root.style.setProperty("--app-border", d.borderSoft ?? "#37464F");
      root.style.setProperty("--app-ink", d.ink ?? "#F1F5F9");
      root.style.setProperty("--app-ink-light", d.inkLight ?? "#CBD5E1");
      root.style.setProperty("--app-ink-softer", d.inkSofter ?? "#94A3B8");
    } else {
      // 免費深色 / 亮色：清掉內聯覆蓋，讓 globals.css 的 night 預設值生效
      for (const p of [
        "--app-bg",
        "--app-bg-soft",
        "--app-bg-softer",
        "--app-card",
        "--app-border",
        "--app-ink",
        "--app-ink-light",
        "--app-ink-softer",
      ]) {
        root.style.removeProperty(p);
      }
    }

    root.classList.toggle("theme-dark", isDark);
    root.style.colorScheme = isDark ? "dark" : "light";
    // 首屏 bootScript 會在 <html> 上內聯深色底色防白閃 —— 這裡接管：
    // 深色時保持同步，切回亮色時清掉，避免滾動越界處露出舊底色
    if (isDark) {
      root.style.backgroundColor = d.isDark ? d.bg : NIGHT_BG;
    } else {
      root.style.removeProperty("background-color");
    }
    document.body.dataset.theme = themeId;
    document.body.style.backgroundColor = d.isDark
      ? d.bg
      : freeDark
        ? NIGHT_BG
        : surfaceBg;
  }, [themeId, mode, systemDark]);

  return <MotionConfig reducedMotion="user" transition={uiMotion.fade}>{children}</MotionConfig>;
}
