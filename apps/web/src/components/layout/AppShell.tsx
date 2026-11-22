"use client";

/**
 * AppShell —— 響應式三欄佈局殼（左 SideNav / 中央內容 / 右 RightRail）
 *
 * 斷點（web-shell-14）：
 *   - < md：單列，底部 BottomNav（BottomNav 自身 md:hidden）
 *   - md (768-1023)：icon-only 72px SideNav + 中央列（max ~640），無右欄
 *   - lg：200px SideNav + 中央列；xl+ 才展示 288px RightRail
 *
 * 單樹渲染：children 只掛載一次，透過同一組 CSS 斷點控制兩側欄的顯隱，
 * 避免舊版「移動端 + 桌面端各渲染一份 children」帶來的音效 / observer /
 * ticker 雙跑與重複 <main> 問題。
 *
 * 語義：AppShell 自身不再輸出 <main>——由各頁面的 children 提供唯一的
 * <main> 地標（現有殼內頁面均已自帶）。
 */

import type { CSSProperties, ReactNode } from "react";
import { SideNav } from "./SideNav";
import { RightRail } from "./RightRail";

interface AppShellProps {
  children: ReactNode;
  /** 自定義右欄。傳 null 顯式隱藏；不傳則顯示預設 RightRail */
  right?: ReactNode | null;
  /** 中央內容欄最大寬度（僅 md+ 生效），預設 640 */
  centerMaxWidth?: number;
}

export function AppShell({ children, right, centerMaxWidth = 640 }: AppShellProps) {
  const showRight = right !== null;
  return (
    <div className="app-shell" data-has-rail={showRight ? "true" : "false"}>
      <aside className="shell-sidebar">
        <SideNav />
      </aside>

      <div className="min-w-0">
        <div
          className="shell-content mx-auto w-full"
          style={{ "--center-max": `${centerMaxWidth}px` } as CSSProperties}
        >
          {children}
        </div>
      </div>

      {showRight && (
        <aside className="shell-rail">
          {right ?? <RightRail />}
        </aside>
      )}
    </div>
  );
}
