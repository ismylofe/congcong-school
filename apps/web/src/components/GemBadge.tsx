"use client";

/**
 * GemBadge —— 頂欄寶石計數膠囊。
 *
 * 和 StatsBar 上的 紅心 / 連勝 / XP 保持一致的視覺風格（帶邊框的膠囊 + 圖示 + 數字）。
 * 數字變化時輕微彈入，不使用會撐寬右欄的外擴光圈。
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useProgressStore } from "@/store/progress";
import { Gem } from "@/components/LearningIcon";

interface GemBadgeProps {
  className?: string;
  /** 是否包成連結（預設 true，點選進商店） */
  asLink?: boolean;
}

export function GemBadge({ className = "", asLink = true }: GemBadgeProps) {
  const gems = useProgressStore(s => s.gems);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => setHydrated(true), []);

  const display = hydrated ? gems : 0;

  const inner = (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.12 }}
      className={`status-counter relative min-h-11 px-2 inline-flex items-center gap-2 rounded-xl font-extrabold text-base select-none tabular-nums text-gem ${asLink ? "hover:bg-bg-soft transition-colors cursor-pointer" : ""} ${className}`}
      aria-label={asLink ? `寶石 ${display}，進入商店` : `可用寶石 ${display}`}
    >
      <Gem className="w-6 h-6" />
      <motion.span
        className="text-gem"
        key={display}
        initial={{ y: -6, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", damping: 18 }}
      >
        {display}
      </motion.span>

    </motion.div>
  );

  if (asLink) {
    return <Link href="/shop/">{inner}</Link>;
  }
  return inner;
}
