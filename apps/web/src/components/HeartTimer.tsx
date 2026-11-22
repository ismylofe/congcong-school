"use client";

/**
 * HeartTimer —— 紅心不滿時顯示 mm:ss 到下一顆心。
 *
 * 放在課程頁頂欄（LessonRunner），小膠囊貼在 HeartsBar 旁邊。
 * hearts === MAX 或 nextHeartAt 為 null 時返回 null（不渲染）。
 *
 * 依賴 useProgressTicker 每秒重新整理。LessonRunner 已經 mount 了 ticker，
 * 這裡直接讀取 store + 訂閱自己的 tick 即可。
 */

import { motion } from "framer-motion";
import { useProgressTicker, formatMsCountdown } from "@/lib/useProgressTicker";
import { MAX_HEARTS, useProgressStore } from "@/store/progress";
import { Heart } from "@/components/icons";

interface HeartTimerProps {
  className?: string;
}

export function HeartTimer({ className = "" }: HeartTimerProps) {
  const now = useProgressTicker();
  const hearts = useProgressStore(s => s.hearts);
  const nextHeartAt = useProgressStore(s => s.nextHeartAt);

  if (hearts >= MAX_HEARTS || !nextHeartAt) return null;

  const ms = Math.max(0, nextHeartAt - now);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`h-8 px-2.5 inline-flex items-center gap-1 rounded-full bg-danger/10 border-2 border-danger/30 text-danger text-xs font-extrabold tabular-nums ${className}`}
      aria-label={`下一顆心還需 ${formatMsCountdown(ms)}`}
    >
      <Heart className="w-3.5 h-3.5" />
      <span>+{formatMsCountdown(ms)}</span>
    </motion.div>
  );
}
