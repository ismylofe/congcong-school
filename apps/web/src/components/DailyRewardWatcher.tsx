"use client";

/**
 * DailyRewardWatcher —— 回訪獎勵的統一入口（每日登入 / 連勝補卡 / 里程碑慶祝）
 *
 * 行為：
 *   - 每日登入獎勵：每天首次開啟時自動發放，數額按「有效連勝」走 core
 *     dailyRewardForStreak（斷籤未救回按 0 檔，文案不再謊報連續天數）
 *   - 連勝補卡：檢測到「今天未學 + gap≥2 + 護盾兜不住 + 寶石夠 50」時
 *     彈出「花 50💎 補回昨天」彈窗；拒絕後本次斷籤不再彈（localStorage 記賬）
 *   - 連勝里程碑慶祝：store 發放里程碑寶石後留下 pendingStreakMilestone，
 *     這裡消費並彈「連續 N 天！+M💎」
 *   - 週末雙倍 XP 提示（每天一次）
 *   - 在 lesson runner 等沉浸頁面不打擾（里程碑慶祝除外，它就發生在結算時）
 */

import { learnerLocalStorage } from "@/lib/learnerProfiles";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  useProgressStore,
  isWeekendBonusActive,
  STREAK_MAKEUP_COST,
} from "@/store/progress";
import { useToast } from "./Toast";
import { Modal } from "./Modal";
import { Mascot } from "./Mascot";
import { Flame, Gem } from "./icons";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import { isImmersivePath } from "@/lib/immersiveRoutes";

/** 本地時區 YYYY-MM-DD（與 store 同實現） */
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysBetween(a: string, b: string): number {
  if (!a || !b) return Infinity;
  const da = new Date(a);
  const db = new Date(b);
  return Math.round((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24));
}

export function DailyRewardWatcher() {
  const pathname = usePathname() ?? "/";
  const toast = useToast();
  const fired = useRef(false);
  // 連勝補卡彈窗（null = 不顯示；數字 = 可保住的連勝天數）
  const [makeupStreak, setMakeupStreak] = useState<number | null>(null);
  // 「本次斷籤」的記賬 key（按斷籤前最後學習日區分）
  const makeupKeyRef = useRef<string | null>(null);

  /** 發放今日登入獎勵 + 週末提示（補卡決定之後再呼叫，避免按 0 檔誤發） */
  function claimDailyAndHint() {
    const { gems, effectiveStreak } = useProgressStore.getState().claimDailyReward();
    if (gems > 0) {
      if (effectiveStreak >= 1) {
        toast.success(`💎 每日登入獎勵 +${gems}（連續 ${effectiveStreak} 天）`, 3200);
      } else {
        toast.success(`💎 每日登入獎勵 +${gems}`, 3200);
      }
      playSfx("star");
      haptic("success");
    }

    // 週末 XP 雙倍提示（每天只提一次）
    if (isWeekendBonusActive()) {
      const seenKey = `csf-weekend-bonus-seen-${todayStr()}`;
      if (typeof window !== "undefined" && !learnerLocalStorage.getItem(seenKey)) {
        window.setTimeout(() => {
          toast.info("🎉 週末雙倍 XP 已開啟！", 3200);
        }, 800);
        try {
          learnerLocalStorage.setItem(seenKey, "1");
        } catch {
          /* noop */
        }
      }
    }
  }

  useEffect(() => {
    if (fired.current) return;
    // 沉浸頁（課程 / 跳級 / 複習 runner / 閱讀器）不打擾，回到普通頁面再發
    if (isImmersivePath(pathname)) return;

    // 等待 store hydrate；用一幀延遲確保 persist 已載入
    const t = window.setTimeout(() => {
      if (fired.current) return;
      fired.current = true;

      const s = useProgressStore.getState();
      const today = todayStr();
      const gap = daysBetween(s.lastActiveDate, today);
      // 連勝補卡入口：今天未學 + gap≥2 + 護盾兜不住（連勝真的會斷）+ 寶石夠
      const shieldsCanSave = gap - 1 <= s.streakFreezes;
      const declinedKey = `csf-makeup-declined-${s.lastActiveDate}`;
      const alreadyDeclined =
        typeof window !== "undefined" && !!learnerLocalStorage.getItem(declinedKey);
      if (
        s.lastActiveDate !== today &&
        s.streak > 0 &&
        gap >= 2 &&
        !shieldsCanSave &&
        s.gems >= STREAK_MAKEUP_COST &&
        !alreadyDeclined
      ) {
        makeupKeyRef.current = declinedKey;
        setMakeupStreak(s.streak);
        // 登入獎勵等使用者做完補卡決定再發（避免按 0 檔誤發）
        return;
      }

      claimDailyAndHint();
    }, 600);

    return () => window.clearTimeout(t);
    // 僅依賴 pathname 變化觸發再判定（首次進入時執行一次）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, toast]);

  // === 連勝里程碑慶祝：消費 store 的 pendingStreakMilestone ===
  useEffect(() => {
    const celebrate = (pending: { streak: number; gems: number } | null) => {
      if (!pending) return;
      useProgressStore.getState().clearPendingStreakMilestone();
      toast.success(`🔥 連續 ${pending.streak} 天！+${pending.gems}💎`, 4000);
      playSfx("unlock");
      haptic("success");
    };
    // hydrate 後可能已有未慶祝的里程碑（比如上次在結算頁直接關了頁面）
    const t = window.setTimeout(
      () => celebrate(useProgressStore.getState().pendingStreakMilestone),
      900,
    );
    const unsub = useProgressStore.subscribe(state =>
      celebrate(state.pendingStreakMilestone),
    );
    return () => {
      window.clearTimeout(t);
      unsub();
    };
  }, [toast]);

  function handleMakeupConfirm() {
    playSfx("tap");
    haptic("medium");
    const ok = useProgressStore.getState().makeUpYesterdayStreak();
    setMakeupStreak(null);
    if (ok) {
      playSfx("unlock");
      haptic("success");
      toast.success("🔥 補回昨天成功，連勝保住了！", 3600);
    } else {
      toast.error("補卡沒有成功，再試試吧");
    }
    // 補卡決定之後再發今日登入獎勵
    window.setTimeout(claimDailyAndHint, 400);
  }

  function handleMakeupDecline() {
    playSfx("tap");
    haptic("light");
    // 本次斷籤不再彈（按斷籤前最後學習日記賬）
    if (makeupKeyRef.current) {
      try {
        learnerLocalStorage.setItem(makeupKeyRef.current, "1");
      } catch {
        /* noop */
      }
    }
    setMakeupStreak(null);
    window.setTimeout(claimDailyAndHint, 400);
  }

  return (
    <Modal ariaLabel="連勝補籤" open={makeupStreak !== null} onClose={handleMakeupDecline}>
      <div className="flex flex-col items-center text-center">
        <Mascot mood="sad" size={96} />
        <h2 className="text-2xl font-extrabold text-ink mt-3">連勝要斷啦！</h2>
        <p className="text-ink-light mt-2">
          昨天忘了學習。花{" "}
          <span className="inline-flex items-center gap-0.5 font-extrabold text-secondary-dark">
            <Gem className="w-4 h-4" />
            {STREAK_MAKEUP_COST}
          </span>{" "}
          補回昨天，保住{" "}
          <span className="inline-flex items-center gap-0.5 font-extrabold text-fox">
            <Flame className="w-4 h-4" />
            {makeupStreak ?? 0} 天
          </span>{" "}
          連勝？
        </p>
        <div className="flex flex-col gap-3 w-full mt-5">
          <button
            type="button"
            onClick={handleMakeupConfirm}
            className="btn-chunky-primary w-full"
          >
            花 {STREAK_MAKEUP_COST} 寶石保住連勝
          </button>
          <button
            type="button"
            onClick={handleMakeupDecline}
            className="btn-chunky-ghost w-full"
          >
            算了，重新開始
          </button>
        </div>
      </div>
    </Modal>
  );
}
