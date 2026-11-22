"use client";

/**
 * ThemeModeToggle —— 免費深色模式的三態開關（跟隨系統 / 亮 / 暗）。
 *
 * 出現在 SideNav 底部（桌面）和 我的 頁外觀設定（移動端可達）。
 * 裝備了暗色美妝主題時強制暗色，這裡的選擇暫不生效 —— 給出提示。
 */

import { useEffect, useState } from "react";
import { useThemeMode, setThemeMode, type ThemeMode } from "@/lib/themeMode";
import { useProgressStore } from "@/store/progress";
import { getCosmeticById, type UiTheme } from "@/lib/cosmetics";
import { Sun, Moon, MonitorIcon } from "@/components/icons";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import { cn } from "@/lib/cn";

const OPTIONS: Array<{
  mode: ThemeMode;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { mode: "system", label: "自動", Icon: MonitorIcon },
  { mode: "light", label: "亮", Icon: Sun },
  { mode: "dark", label: "暗", Icon: Moon },
];

export function ThemeModeToggle({ compact = false }: { compact?: boolean }) {
  const mode = useThemeMode();
  const themeId = useProgressStore(s => s.equippedTheme);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const equipped = getCosmeticById(themeId) as UiTheme | undefined;
  const forcedDark = hydrated && !!(equipped?.type === "ui_theme" && equipped.data.isDark);
  const active = hydrated ? mode : "system";

  return (
    <div>
      <div
        className="grid grid-cols-3 gap-1 p-1 rounded-2xl border-2 border-bg-softer bg-bg-soft"
        data-theme-compact={compact ? "true" : undefined}
        role="radiogroup"
        aria-label="外觀模式"
      >
        {OPTIONS.map((opt, index) => {
          const selected = active === opt.mode;
          const Icon = opt.Icon;
          return (
            <button
              key={opt.mode}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={opt.mode === "system" ? "跟隨系統" : opt.mode === "light" ? "淺色模式" : "深色模式"}
              disabled={forcedDark}
              tabIndex={selected ? 0 : -1}
              onKeyDown={event => {
                const next = event.key === "ArrowRight" || event.key === "ArrowDown" ? (index + 1) % OPTIONS.length
                  : event.key === "ArrowLeft" || event.key === "ArrowUp" ? (index + OPTIONS.length - 1) % OPTIONS.length
                  : event.key === "Home" ? 0 : event.key === "End" ? OPTIONS.length - 1 : null;
                if (next === null || forcedDark) return;
                event.preventDefault();
                setThemeMode(OPTIONS[next].mode);
                (event.currentTarget.parentElement?.querySelectorAll("button")[next] as HTMLButtonElement | undefined)?.focus();
              }}
              onClick={() => {
                playSfx("tap");
                haptic("light");
                setThemeMode(opt.mode);
              }}
              className={cn(
                "flex items-center justify-center gap-1 min-h-11 rounded-xl text-xs font-extrabold transition-colors select-none",
                selected
                  ? "bg-white text-ink shadow-sm border-2 border-bg-softer"
                  : "text-ink-softer hover:text-ink-light",
                forcedDark && "opacity-50 cursor-not-allowed",
              )}
              title={forcedDark ? "當前裝備了暗色主題，介面保持暗色" : opt.label}
            >
              <Icon className="w-4 h-4" />
              {!compact && <span>{opt.label}</span>}
            </button>
          );
        })}
      </div>
      {forcedDark && !compact && (
        <p className="mt-1.5 text-[10px] text-ink-softer leading-snug">
          裝備了暗色主題，介面保持暗色；想切回來可以在商店換個主題
        </p>
      )}
    </div>
  );
}
