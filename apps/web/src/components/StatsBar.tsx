"use client";

/**
 * StatsBar — 頂欄持續狀態條（紅心 · 連續天數 · XP · 靜音）
 *
 * 放在 Home / Grade / Book 等主頁面的右上角。
 * 紅心膠囊可點選彈出恢復倒計時詳情。
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { dateKey, weekDateKeys, weekStartKey } from "@cstf/core/week";
import {
  MAX_HEARTS,
  HEART_REFILL_COST,
  MAX_FREEZES,
  FREEZE_COST,
  STREAK_MAKEUP_COST,
  STREAK_MILESTONE_REWARDS,
  useProgressStore,
} from "@/store/progress";
import { Heart, Flame, Gem, Lightning } from "@/components/LearningIcon";
import { Snowflake } from "@/components/icons";
import { useToast } from "./Toast";
import { MuteToggle, AutoNarrateToggle, useSyncMute } from "./MuteToggle";
import { Modal } from "./Modal";
import { GemBadge } from "./GemBadge";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import { Mascot } from "./Mascot";
import { useProgressTicker, formatMsCountdown } from "@/lib/useProgressTicker";

interface StatsBarProps {
  /** 緊湊模式：移動端 / 內頁用，只顯示 心 + 連擊 + 寶石，省掉 XP & 音訊開關 */
  compact?: boolean;
  placement?: "page" | "rail";
}

export function StatsBar({ compact = false, placement = "page" }: StatsBarProps = {}) {
  useSyncMute();
  const now = useProgressTicker();
  const toast = useToast();

  const hearts = useProgressStore(s => s.hearts);
  const nextHeartAt = useProgressStore(s => s.nextHeartAt);
  const streak = useProgressStore(s => s.streak);
  const lastActiveDate = useProgressStore(s => s.lastActiveDate);
  const freezes = useProgressStore(s => s.streakFreezes);
  const xp = useProgressStore(s => s.xp);
  const gems = useProgressStore(s => s.gems);
  const buyHeartRefill = useProgressStore(s => s.buyHeartRefill);
  const buyStreakFreeze = useProgressStore(s => s.buyStreakFreeze);
  const makeUpYesterdayStreak = useProgressStore(s => s.makeUpYesterdayStreak);
  const xpHistory = useProgressStore(s => s.xpHistory);

  const [hydrated, setHydrated] = useState(false);
  const [showHearts, setShowHearts] = useState(false);
  const [showStreak, setShowStreak] = useState(false);
  useEffect(() => setHydrated(true), []);

  const dHearts = hydrated ? hearts : MAX_HEARTS;
  const dFreezes = hydrated ? freezes : 0;
  const dXp = hydrated ? xp : 0;
  const dNextHeartAt = hydrated ? nextHeartAt : null;

  // 連勝兩態（對齊多鄰國）：斷籤且護盾兜不住 → 顯示 0；火焰只在"今天已學"時點亮
  const { value: dStreak, litToday: streakActive } = hydrated
    ? displayStreak(streak, lastActiveDate, freezes)
    : { value: 0, litToday: false };
  const heartsFull = dHearts >= MAX_HEARTS;
  const msToNext = dNextHeartAt ? Math.max(0, dNextHeartAt - now) : 0;

  return (
    <>
      <div className="stats-bar flex items-center gap-2" data-placement={placement} role="group" aria-label="學習狀態">
        {/* 紅心膠囊 */}
        <motion.button
          type="button"
          onClick={() => {
            playSfx("tap");
            haptic("light");
            setShowHearts(true);
          }}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className={`status-counter min-h-11 px-2 inline-flex items-center gap-2 rounded-xl font-extrabold text-base select-none tabular-nums transition-colors ${
            dHearts > 0
              ? "text-danger"
              : "text-ink-softer"
          }`}
          aria-label="紅心"
          title={`紅心：${dHearts} / ${MAX_HEARTS}`}
        >
          <Heart className="w-6 h-6" />
          <span>{dHearts}</span>
        </motion.button>

        {/* 連續天數 —— 可點開連勝詳情彈層 */}
        <motion.button
          type="button"
          onClick={() => {
            playSfx("tap");
            haptic("light");
            setShowStreak(true);
          }}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className={`status-counter min-h-11 px-2 inline-flex items-center gap-2 rounded-xl font-extrabold text-base select-none tabular-nums transition-colors ${
            streakActive
              ? "text-fox"
              : "text-ink-softer"
          }`}
          aria-label="連勝詳情"
          title={`連續學習 ${dStreak} 天`}
        >
          <Flame className={`w-6 h-6 ${streakActive ? "" : "status-inactive"}`} />
          <span>{dStreak}</span>
        </motion.button>

        {/* XP —— compact 模式隱藏 */}
        {!compact && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="h-8 px-2.5 inline-flex items-center gap-1 rounded-full border-2 border-secondary/40 text-secondary-dark bg-secondary/10 font-extrabold text-sm select-none tabular-nums"
          >
            <Lightning className="w-4 h-4" />
            <span>{dXp}</span>
          </motion.div>
        )}

        {/* 寶石 */}
        <GemBadge />

        {/* 分割豎線 + 音訊開關 —— compact 模式隱藏 */}
        {!compact && (
          <>
            <span aria-hidden className="w-px h-5 bg-bg-softer mx-0.5" />
            <AutoNarrateToggle />
            <MuteToggle />
          </>
        )}
      </div>

      {/* 紅心詳情彈窗 */}
      <Modal ariaLabel="紅心詳情" open={showHearts} onClose={() => setShowHearts(false)}>
        <div className="flex flex-col items-center text-center">
          <Mascot mood={heartsFull ? "happy" : "think"} size={88} />
          <h2 className="text-2xl font-extrabold text-ink mt-3">紅心</h2>
          <div className="flex items-center justify-center gap-2 mt-3">
            {Array.from({ length: MAX_HEARTS }).map((_, i) => {
              const alive = i < dHearts;
              return (
                <Heart
                  key={i}
                  className={`w-8 h-8 ${alive ? "text-danger" : "text-bg-softer"}`}
                />
              );
            })}
          </div>
          {heartsFull ? (
            <p className="text-ink-light mt-4">你的紅心已滿！</p>
          ) : (
            <div className="mt-4 w-full">
              <p className="text-ink-light text-sm">下一顆心還需</p>
              <div className="text-3xl font-extrabold text-danger tabular-nums mt-1">
                {formatMsCountdown(msToNext)}
              </div>
              <p className="text-xs text-ink-softer mt-2">每 5 分鐘恢復 1 顆心</p>

              {/* 350💎 立即補滿 */}
              <button
                type="button"
                onClick={() => {
                  playSfx("tap");
                  haptic("light");
                  const ok = buyHeartRefill();
                  if (ok) {
                    playSfx("unlock");
                    haptic("success");
                    toast.success("❤️ 紅心已補滿！");
                  } else {
                    playSfx("wrong");
                    toast.error("寶石不夠，先去學習攢寶石吧");
                  }
                }}
                disabled={gems < HEART_REFILL_COST}
                className={gems >= HEART_REFILL_COST ? "btn-chunky-secondary w-full mt-4 gap-2" : "btn-chunky-disabled w-full mt-4 gap-2"}
              >
                <Gem className="w-4 h-4" />
                <span className="tabular-nums">{HEART_REFILL_COST}</span>
                <span>立即補滿</span>
              </button>
              {gems < HEART_REFILL_COST && (
                <div className="mt-1.5 text-[11px] text-ink-softer">
                  寶石還差 {HEART_REFILL_COST - gems} 顆
                </div>
              )}
            </div>
          )}

          {/* 連勝護盾資訊 */}
          {dFreezes > 0 && (
            <div className="mt-5 flex items-center gap-2 px-3 py-2 rounded-xl bg-secondary/10 border-2 border-secondary/30 text-secondary-dark">
              <Snowflake className="w-5 h-5" />
              <span className="text-sm font-extrabold">連勝護盾 × {dFreezes}</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              playSfx("tap");
              haptic("light");
              setShowHearts(false);
            }}
            className="btn-chunky-primary w-full mt-6"
          >
            知道了
          </button>
        </div>
      </Modal>

      {/* 🔥 連勝詳情彈窗 */}
      <StreakModal
        open={showStreak}
        onClose={() => setShowStreak(false)}
        streakDisplay={dStreak}
        litToday={streakActive}
        rawStreak={hydrated ? streak : 0}
        lastActiveDate={hydrated ? lastActiveDate : ""}
        freezes={dFreezes}
        gems={hydrated ? gems : 0}
        xpHistory={hydrated ? xpHistory : {}}
        buyStreakFreeze={buyStreakFreeze}
        makeUpYesterdayStreak={makeUpYesterdayStreak}
      />
    </>
  );
}

// ============================================================
// 🔥 StreakModal —— 連勝彈層（周曆 + 護盾 + 里程碑 + 補卡）
// ============================================================

const WEEK_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

function StreakModal({
  open,
  onClose,
  streakDisplay,
  litToday,
  rawStreak,
  lastActiveDate,
  freezes,
  gems,
  xpHistory,
  buyStreakFreeze,
  makeUpYesterdayStreak,
}: {
  open: boolean;
  onClose: () => void;
  /** 展示口徑的連勝（斷籤且救不回 = 0） */
  streakDisplay: number;
  litToday: boolean;
  /** store 裡的原始 streak（補卡判定用） */
  rawStreak: number;
  lastActiveDate: string;
  freezes: number;
  gems: number;
  xpHistory: Record<string, number>;
  buyStreakFreeze: () => boolean;
  makeUpYesterdayStreak: () => boolean;
}) {
  const toast = useToast();
  const today = todayStr();
  // 本週 7 天（週一→週日）走 core week.ts 的單一事實源，與週報/聯賽同一視窗
  const week = weekDateKeys(weekStartKey());

  // 斷籤可補卡：今天還沒學 + 缺口 ≥ 2 天 + 護盾兜不住（與 store makeUpYesterdayStreak 同判據）
  const gap = lastActiveDate ? daysBetween(lastActiveDate, today) : Infinity;
  const broken = rawStreak > 0 && streakDisplay === 0 && lastActiveDate !== today && gap >= 2;

  // 下一個連勝里程碑（3/7/14/30/60/100）
  const milestones = Object.keys(STREAK_MILESTONE_REWARDS)
    .map(Number)
    .sort((a, b) => a - b);
  const nextMilestone = milestones.find(m => m > streakDisplay) ?? null;
  const prevMilestone = nextMilestone
    ? milestones.filter(m => m <= streakDisplay).pop() ?? 0
    : null;
  const milestonePct =
    nextMilestone !== null && prevMilestone !== null
      ? Math.round(
          ((streakDisplay - prevMilestone) / (nextMilestone - prevMilestone)) * 100,
        )
      : 100;

  function handleBuyFreeze() {
    playSfx("tap");
    haptic("light");
    const ok = buyStreakFreeze();
    if (ok) {
      playSfx("unlock");
      haptic("success");
      toast.success("❄️ 護盾 +1，連勝更安全了！");
    } else if (freezes >= MAX_FREEZES) {
      toast.error("護盾已經滿啦（最多 2 個）");
    } else {
      toast.error("寶石不夠，先去學習攢寶石吧");
    }
  }

  function handleMakeup() {
    playSfx("tap");
    haptic("medium");
    const ok = makeUpYesterdayStreak();
    if (ok) {
      playSfx("unlock");
      haptic("success");
      toast.success("🔥 補回昨天成功，去學一課點亮連勝吧！", 3600);
    } else {
      toast.error("補卡沒有成功，再試試吧");
    }
  }

  return (
    <Modal ariaLabel="連勝詳情" open={open} onClose={onClose}>
      <div className="flex flex-col items-center text-center">
        <Mascot mood={streakDisplay > 0 ? "cheer" : "think"} size={88} />
        <h2 className="text-2xl font-extrabold text-ink mt-3">連勝</h2>
        <div
          className={`mt-2 inline-flex items-center gap-2 text-4xl font-extrabold tabular-nums ${
            litToday ? "text-fox" : "text-ink-softer"
          }`}
        >
          <Flame className="w-9 h-9" />
          <span>{streakDisplay}</span>
          <span className="text-base font-extrabold text-ink-light self-end mb-1.5">天</span>
        </div>
        {!litToday && streakDisplay > 0 && (
          <p className="text-xs text-ink-light mt-1">今天還沒學習，快去點亮火焰吧</p>
        )}

        {/* 本週 7 格日曆：學過 = 火焰格；今天未學 = 高亮空格 */}
        <div className="mt-5 w-full grid grid-cols-7 gap-1.5">
          {week.map((date, i) => {
            const learned = (xpHistory[date] ?? 0) > 0;
            const isToday = date === today;
            const isFuture = date > today;
            return (
              <div key={date} className="flex flex-col items-center gap-1">
                <div className="text-[10px] font-extrabold text-ink-softer">
                  {WEEK_LABELS[i]}
                </div>
                <div
                  className={`w-full max-w-9 aspect-square rounded-xl flex items-center justify-center border-2 ${
                    learned
                      ? "bg-fox/15 border-fox text-fox"
                      : isToday
                        ? "bg-warning/10 border-warning border-dashed text-warning"
                        : isFuture
                          ? "bg-bg-soft border-bg-softer text-bg-softer"
                          : "bg-bg-soft border-bg-softer text-ink-softer"
                  }`}
                  aria-label={`${date}${learned ? " 已學習" : isToday ? " 今天還沒學" : ""}`}
                >
                  {learned ? <Flame className="w-4 h-4" /> : isToday ? "?" : ""}
                </div>
              </div>
            );
          })}
        </div>

        {/* 下一里程碑進度 */}
        {nextMilestone !== null && (
          <div className="mt-5 w-full rounded-2xl border-2 border-bg-softer bg-bg-soft px-4 py-3 text-left">
            <div className="flex items-center justify-between text-xs font-extrabold">
              <span className="text-ink">
                距 {nextMilestone} 天還差 {nextMilestone - streakDisplay} 天
              </span>
              <span className="inline-flex items-center gap-0.5 text-secondary-dark tabular-nums">
                <Gem className="w-3.5 h-3.5" />+{STREAK_MILESTONE_REWARDS[nextMilestone]}
              </span>
            </div>
            <div className="mt-2 h-2.5 rounded-full bg-bg-softer overflow-hidden">
              <div
                className="h-full bg-fox rounded-full transition-all"
                style={{ width: `${Math.max(4, milestonePct)}%` }}
              />
            </div>
          </div>
        )}

        {/* 連勝護盾：數量 + 購買 */}
        <div className="mt-3 w-full rounded-2xl border-2 border-secondary/30 bg-secondary/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <Snowflake className="w-5 h-5 text-secondary" />
            <span className="text-sm font-extrabold text-secondary-dark">
              連勝護盾 {freezes}/{MAX_FREEZES}
            </span>
            <span className="ml-auto text-[10px] text-ink-light">每週一學習即可補 1 個（上限 2）</span>
          </div>
          {freezes < MAX_FREEZES && (
            <button
              type="button"
              onClick={handleBuyFreeze}
              disabled={gems < FREEZE_COST}
              className={gems >= FREEZE_COST ? "btn-chunky-secondary w-full mt-3 gap-2" : "btn-chunky-disabled w-full mt-3 gap-2"}
            >
              <Gem className="w-4 h-4" />
              <span className="tabular-nums">{FREEZE_COST}</span>
              <span>買一個護盾</span>
            </button>
          )}
        </div>

        {/* 斷籤補卡入口 */}
        {broken && (
          <div className="mt-3 w-full rounded-2xl border-2 border-danger/30 bg-danger/10 px-4 py-3">
            <div className="text-sm font-extrabold text-danger">
              連勝斷啦！花 {STREAK_MAKEUP_COST} 寶石補回昨天
            </div>
            <div className="mt-1 text-[11px] text-ink-light">
              補卡後今天學一課，{rawStreak} 天連勝就能接上
            </div>
            <button
              type="button"
              onClick={handleMakeup}
              disabled={gems < STREAK_MAKEUP_COST}
              className={gems >= STREAK_MAKEUP_COST ? "btn-chunky-secondary w-full mt-3 gap-2" : "btn-chunky-disabled w-full mt-3 gap-2"}
            >
              <Gem className="w-4 h-4" />
              <span className="tabular-nums">{STREAK_MAKEUP_COST}</span>
              <span>補回連勝</span>
            </button>
            {gems < STREAK_MAKEUP_COST && (
              <div className="mt-1.5 text-[11px] text-ink-softer text-center">
                寶石還差 {STREAK_MAKEUP_COST - gems} 顆
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            playSfx("tap");
            haptic("light");
            onClose();
          }}
          className="btn-chunky-primary w-full mt-6"
        >
          知道了
        </button>
      </div>
    </Modal>
  );
}

// ============================================================
// 連勝展示口徑（純函式，不改 store —— store 只在下一次學習時結算）
// ============================================================

/** 本地時區的今天，YYYY-MM-DD —— 走 core week.ts，避免第二套日期鍵實現 */
function todayStr(): string {
  return dateKey();
}

/** 兩個 YYYY-MM-DD 日期相差的天數（與 store 同實現） */
function daysBetween(a: string, b: string): number {
  if (!a || !b) return Infinity;
  const da = new Date(a);
  const db = new Date(b);
  return Math.round((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * 展示用連勝：
 * - gap ≤ 1（今天已學 / 昨天學過）→ 連勝有效，顯示原值；
 * - gap > 1 但漏掉的天數 (gap-1) 能被護盾兜住 → 仍有效，顯示原值；
 * - 否則連勝已斷 → 顯示 0。
 * 火焰只在「連勝有效 且 今天已學」時點亮（litToday）。
 */
function displayStreak(
  streak: number,
  lastActiveDate: string,
  streakFreezes: number,
): { value: number; litToday: boolean } {
  if (streak <= 0 || !lastActiveDate) return { value: 0, litToday: false };
  const gap = daysBetween(lastActiveDate, todayStr());
  const alive = gap <= 1 || gap - 1 <= streakFreezes;
  if (!alive) return { value: 0, litToday: false };
  return { value: streak, litToday: gap === 0 };
}
