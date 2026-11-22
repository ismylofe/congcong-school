"use client";

/**
 * StateMessages —— 通用空狀態 / 錯誤狀態元件
 *
 * 用法：
 *   <EmptyState mood="cheer" title="還沒有錯題！" desc="..." action={<button>...</button>} />
 *   <ErrorState title="載入失敗" desc="網路似乎斷開了" onRetry={refetch} />
 *
 * 風格：
 *   - 居中佈局，吉祥物 + 標題 + 描述 + 可選 CTA
 *   - 使用專案裡已有的 Mascot + chunky 按鈕
 *   - 自動尺寸適配桌面 / 移動
 */

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Mascot, type MascotMood } from "./Mascot";
import { CloudOff } from "@/components/icons";

interface EmptyStateProps {
  /** 吉祥物心情；預設 cheer */
  mood?: MascotMood;
  title: string;
  desc?: string;
  /** 可選 CTA 按鈕節點 */
  action?: ReactNode;
  /** 較小的內聯模式（卡片內部用） */
  compact?: boolean;
}

export function EmptyState({
  mood = "cheer",
  title,
  desc,
  action,
  compact = false,
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex flex-col items-center justify-center text-center ${
        compact ? "py-8" : "py-16"
      }`}
    >
      <Mascot mood={mood} size={compact ? 84 : 140} />
      <h2
        className={`font-extrabold text-ink mt-4 ${
          compact ? "text-lg" : "text-2xl"
        }`}
      >
        {title}
      </h2>
      {desc && (
        <p className="text-ink-light mt-2 max-w-xs leading-relaxed text-sm">
          {desc}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </motion.div>
  );
}

interface ErrorStateProps {
  title?: string;
  desc?: string;
  /** 重試回呼；若提供則顯示"再試一次"按鈕 */
  onRetry?: () => void;
  compact?: boolean;
}

export function ErrorState({
  title = "出錯了",
  desc = "好像網路斷開了，稍後再試試看",
  onRetry,
  compact = false,
}: ErrorStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex flex-col items-center justify-center text-center ${
        compact ? "py-8" : "py-16"
      }`}
      role="alert"
    >
      <div
        className={`flex items-center justify-center rounded-full bg-danger/10 text-danger ${
          compact ? "w-16 h-16" : "w-24 h-24"
        }`}
      >
        <CloudOff className={compact ? "w-8 h-8" : "w-12 h-12"} />
      </div>
      <h2
        className={`font-extrabold text-ink mt-4 ${
          compact ? "text-lg" : "text-2xl"
        }`}
      >
        {title}
      </h2>
      {desc && (
        <p className="text-ink-light mt-2 max-w-xs leading-relaxed text-sm">
          {desc}
        </p>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="btn-chunky-primary mt-6 px-8"
        >
          再試一次
        </button>
      )}
    </motion.div>
  );
}
