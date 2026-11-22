"use client";

/**
 * DailyQuestsPanel —— 每日任務卡（仿多鄰國 Daily Quests）
 *
 * 三條任務來自 @cstf/core dailyQuests（同一天雙端結果一致）：
 *   - 每條任務：圖示 + 中文標題 + 進度條與寶石獎勵
 *   - 完成未領取 → 高亮「領取」按鈕（動效 + 音效 + toast）
 *   - 頭部顯示「距重新整理還有 N 小時」倒計時（本地午夜重新整理）
 *
 * 桌面端掛在 RightRail，移動端掛在 ProfileClient 頂部 —— 同一元件雙端複用。
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Quest, QuestKind } from "@cstf/core/quests";
import { useProgressStore } from "@/store/progress";
import { Check } from "@/components/icons";
import { Lightning, BookOpen, Bookmark, BookOpen as Book, Gem } from "@/components/LearningIcon";
import { useToast } from "@/components/Toast";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";

/** 各任務型別的圖示與配色（feather 色板） */
const KIND_STYLE: Record<
  QuestKind,
  { icon: React.ComponentType<{ className?: string }>; iconBg: string; iconColor: string; bar: string }
> = {
  earnXP:         { icon: Lightning, iconBg: "bg-warning/20",   iconColor: "text-warning",        bar: "bg-warning" },
  finishLessons:  { icon: BookOpen,  iconBg: "bg-primary/15",   iconColor: "text-primary-dark",   bar: "bg-primary" },
  reviewMistakes: { icon: Bookmark,  iconBg: "bg-danger/10",    iconColor: "text-danger",         bar: "bg-danger" },
  readTexts:      { icon: Book,      iconBg: "bg-secondary/15", iconColor: "text-secondary-dark", bar: "bg-secondary" },
};

/** 本地時區的今天，YYYY-MM-DD（與 store 同實現） */
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 到今晚午夜的剩餘時間文案：≥1 小時顯示「N 小時」，否則「N 分鐘」 */
function formatUntilMidnight(now: number): string {
  const d = new Date(now);
  const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  const ms = Math.max(0, midnight.getTime() - now);
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours >= 1) return `${hours} 小時`;
  const minutes = Math.max(1, Math.ceil(ms / (60 * 1000)));
  return `${minutes} 分鐘`;
}

export function DailyQuestsPanel() {
  const toast = useToast();
  const todayQuests = useProgressStore(s => s.todayQuests);
  const questProgress = useProgressStore(s => s.questProgress);
  const claimQuest = useProgressStore(s => s.claimQuest);
  const claimedQuests = useProgressStore(s => s.claimedQuests);
  // 訂閱進度相關原始欄位：埋點變化時驅動本卡重渲染
  useProgressStore(s => s.todayXp);
  useProgressStore(s => s.lastXpDate);
  useProgressStore(s => s.dailyQuestDate);
  useProgressStore(s => s.dailyLessons);
  useProgressStore(s => s.dailyReviews);
  useProgressStore(s => s.dailyReadings);

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  // 分鐘級 tick：驅動倒計時 + 跨午夜自動換題
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  // 領取動效：記錄剛領取的任務 id，播放 +N💎 彈跳
  const [justClaimed, setJustClaimed] = useState<string | null>(null);

  // SSR 首幀沒有可靠本地日期，hydrate 後再生成任務，避免水合不一致
  const quests: Quest[] = hydrated ? todayQuests() : [];
  const today = todayStr();

  function handleClaim(quest: Quest) {
    playSfx("tap");
    haptic("light");
    const ok = claimQuest(quest.id, quest.reward);
    if (!ok) return;
    playSfx("unlock");
    haptic("success");
    setJustClaimed(quest.id);
    toast.success(`🎁 任務完成！+${quest.reward}💎`, 3000);
    window.setTimeout(() => setJustClaimed(c => (c === quest.id ? null : c)), 1200);
  }

  return (
    <div
      className="min-w-0 rounded-2xl border-2 border-bg-softer bg-white p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <div className="text-lg font-bold text-ink">每日任務</div>
        {hydrated && (
          <div className="text-xs font-medium text-ink-light">
            {formatUntilMidnight(now)}後重新整理
          </div>
        )}
      </div>

      {!hydrated ? (
        // 骨架佔位：三條灰色行，避免閃爍
        <div className="space-y-3">
          {[0, 1, 2].map(i => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-bg-soft shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-2/3 rounded-full bg-bg-soft" />
                <div className="h-3 rounded-full bg-bg-soft" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {quests.map(quest => (
            <QuestRow
              key={quest.id}
              quest={quest}
              progress={questProgress(quest.kind)}
              claimed={!!claimedQuests[`${today}:${quest.id}`]}
              justClaimed={justClaimed === quest.id}
              onClaim={() => handleClaim(quest)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function QuestRow({
  quest,
  progress,
  claimed,
  justClaimed,
  onClaim,
}: {
  quest: Quest;
  progress: number;
  claimed: boolean;
  justClaimed: boolean;
  onClaim: () => void;
}) {
  const style = KIND_STYLE[quest.kind];
  const Icon = style.icon;
  const done = progress >= quest.target;
  const claimable = done && !claimed;
  const pct = Math.min(100, Math.round((Math.min(progress, quest.target) / quest.target) * 100));

  return (
    <div className="relative grid grid-cols-[40px_minmax(0,1fr)_44px] items-center gap-3">
      {/* 任務圖示 */}
      <div
        className={`w-10 h-12 flex items-center justify-center shrink-0 ${claimed ? "opacity-50 grayscale" : ""}`}
      >
        <Icon className={`w-8 h-8 ${claimed ? "text-ink-softer" : style.iconColor}`} />
      </div>

      <div className="flex-1 min-w-0">
        <div className={`text-sm font-bold leading-relaxed break-words ${claimed ? "text-ink-softer" : "text-ink"}`}>
          {quest.title}
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="min-w-0 flex-1 h-3 rounded-full bg-bg-softer overflow-hidden">
            <motion.div
              initial={false}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className={`h-full rounded-full ${claimed ? "bg-bg-softer" : style.bar}`}
            />
          </div>
          <div className="text-xs font-medium text-ink-light tabular-nums shrink-0">
            {Math.min(progress, quest.target)}/{quest.target}
          </div>
        </div>
      </div>

      <div className="min-w-0 flex justify-end">
        {claimed ? (
          <span className="inline-flex items-center gap-1 text-xs text-primary-dark" aria-label="已領取">
            <Check className="w-3.5 h-3.5" />已領
          </span>
        ) : claimable ? (
          <motion.button type="button" onClick={onClaim} whileTap={{ y: 1 }}
            className="min-h-11 rounded-xl bg-primary/10 px-2 text-xs font-bold text-primary-dark"
            aria-label={`領取獎勵 ${quest.reward} 寶石`}>領取</motion.button>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-gem tabular-nums whitespace-nowrap" aria-label={`獎勵 ${quest.reward} 寶石`}>
            <Gem className="w-3.5 h-3.5" />{quest.reward}
          </span>
        )}
      </div>

      {/* +N💎 領取飄字 */}
      <AnimatePresence>
        {justClaimed && (
          <motion.div
            initial={{ opacity: 0, y: 0, scale: 0.6 }}
            animate={{ opacity: [0, 1, 1, 0], y: -28, scale: 1.1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.1, ease: "easeOut" }}
            className="pointer-events-none absolute right-1 top-0 inline-flex items-center gap-0.5 text-sm font-extrabold text-secondary-dark"
          >
            <Gem className="w-4 h-4" />+{quest.reward}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
