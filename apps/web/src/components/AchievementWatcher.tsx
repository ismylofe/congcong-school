"use client";

/**
 * AchievementWatcher —— 監聽 progress store，發現新解鎖成就時：
 *   1. 寫入永久 unlockedAchievements 賬本（只進不出，防連勝回落"回鎖"）
 *   2. 按 core 的 reward 發放寶石（只發一次）
 *   3. 彈 Toast「解鎖成就 +N💎」
 *
 * 僅在客戶端執行；用 zustand subscribe API 訂閱。
 * 注意：元件本身不渲染任何東西，只負責副作用。
 *
 * 沉浸頁（答題 / 閱讀器，判定走 lib/immersiveRoutes 的單一事實源）不彈提示：
 * 賬本與寶石照常即時入賬（一分不少），只把慶祝文案排進佇列，等使用者走出
 * 沉浸頁再補播——既不打斷答題，也不會把慶祝弄丟。
 */

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useProgressStore } from "@/store/progress";
import {
  ALL_ACHIEVEMENTS,
  computeUnlockedAchievementIds,
} from "@/lib/achievements";
import { useToast } from "./Toast";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import { isImmersivePath } from "@/lib/immersiveRoutes";

export function AchievementWatcher() {
  const toast = useToast();
  const pathname = usePathname() ?? "/";
  // 正在處理標記：claimAchievement 會觸發 store 更新 → subscribe 重入，用它擋住
  const processing = useRef(false);
  // 沉浸頁裡攢下的慶祝文案，回到普通頁面時補播
  const pendingToasts = useRef<string[]>([]);
  // 給 subscribe 回呼讀的最新沉浸態（回呼閉包只建一次，不能直接閉包 pathname）
  const immersiveRef = useRef(false);
  immersiveRef.current = isImmersivePath(pathname);

  useEffect(() => {
    const celebrate = (message: string) => {
      toast.success(message, 3600);
      playSfx("unlock");
      haptic("success");
    };

    const handle = () => {
      if (processing.current) return;
      processing.current = true;
      try {
        // 迴圈直到沒有新解鎖：發獎勵會推高 lifetimeGems，可能連鎖解鎖下一枚
        for (let pass = 0; pass < 5; pass++) {
          const s = useProgressStore.getState();
          const newly = computeUnlockedAchievementIds(s).filter(
            id => !s.unlockedAchievements[id],
          );
          if (newly.length === 0) break;
          for (const id of newly) {
            // 寫賬本 + 發獎勵（冪等；已在賬本返回 0）
            const reward = useProgressStore.getState().claimAchievement(id);
            const ach = ALL_ACHIEVEMENTS.find(a => a.id === id);
            if (ach && reward > 0) {
              const message = `🏆 解鎖成就：${ach.name} +${reward}💎`;
              if (immersiveRef.current) pendingToasts.current.push(message);
              else celebrate(message);
            }
          }
        }
      } finally {
        processing.current = false;
      }
    };

    // hydrate 之後先補一輪（遷移遺漏 / 上次會話末尾的解鎖）
    const t = window.setTimeout(handle, 700);
    const unsub = useProgressStore.subscribe(handle);
    return () => {
      window.clearTimeout(t);
      unsub();
    };
  }, [toast]);

  // 走出沉浸頁 → 把攢下的慶祝依次補播（錯開 900ms，避免一次糊一屏）。
  // 只在真正播出的那一刻才出隊，中途被打斷的仍留在佇列裡，下次再補。
  useEffect(() => {
    if (isImmersivePath(pathname)) return;
    let cancelled = false;
    let timer: number | undefined;
    const pump = () => {
      if (cancelled) return;
      const message = pendingToasts.current.shift();
      if (message === undefined) return;
      toast.success(message, 3600);
      playSfx("unlock");
      haptic("success");
      timer = window.setTimeout(pump, 900);
    };
    timer = window.setTimeout(pump, 600);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [pathname, toast]);

  return null;
}
