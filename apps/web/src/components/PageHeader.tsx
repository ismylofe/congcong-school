"use client";

/**
 * PageHeader —— 內頁通用頂欄（移動端 56px / 桌面 72px）
 *
 * 1:1 Duolingo 設計語言：
 *   - 左側：圓角 ghost 風格的純圖示返回按鈕（40×40 / lg 48×48），無文字
 *   - 中間：頁面標題 + 可選副標題（左對齊，跟隨返回按鈕頂格）
 *   - 右側：緊湊 StatsBar（移動端只顯 心 + 連擊 + 寶石 3 顆膠囊；lg+ 顯示完整版）
 *
 * 設計原則：
 *   - 移動端 0 留白溢位，所有內容塞進一行
 *   - 桌面端用同一元件，自動展開 max-width 與字號
 *   - 標題區永遠在第二行（避免文字與 stats 搶空間）
 */

import { ReactNode } from "react";
import { motion } from "framer-motion";
import { ArrowLeft } from "@/components/icons";
import { SoundLink } from "@/components/SoundLink";
import { StatsBar } from "@/components/StatsBar";

interface PageHeaderProps {
  /** 返回連結的目標路徑；傳 null 隱藏返回按鈕（頂層頁面無父級時用） */
  backHref: string | null;
  /** 主標題 */
  title: string;
  /** 副標題（可選） */
  subtitle?: string;
  /** 是否顯示 StatsBar，預設 true */
  showStats?: boolean;
  /** 容器最大寬度（預設 max-w-3xl lg:max-w-5xl xl:max-w-6xl） */
  maxWidthClass?: string;
  /** 標題右側附加內容（如自定義按鈕） */
  rightExtra?: ReactNode;
}

export function PageHeader({
  backHref,
  title,
  subtitle,
  showStats = true,
  maxWidthClass = "max-w-3xl lg:max-w-5xl xl:max-w-6xl",
  rightExtra,
}: PageHeaderProps) {
  return (
    <div className={`w-full ${maxWidthClass}`}>
      {/* 頂部 app bar —— 單行：返回 + stats */}
      <div className="shell-page-toolbar flex items-center justify-between gap-3 mb-4 lg:mb-6">
        {backHref ? (
          <SoundLink
            href={backHref}
            aria-label="返回"
            className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-white border-2 border-bg-softer text-ink-light hover:text-primary hover:border-primary transition-colors shrink-0 lg:hidden"
            style={{ boxShadow: "0 3px 0 0 var(--shadow-card-color)" }}
          >
            <ArrowLeft className="w-5 h-5" />
          </SoundLink>
        ) : null}

        {showStats && (
          <div className="flex-1 flex justify-end min-w-0">
            <StatsBar compact />
          </div>
        )}
      </div>

      {/* 標題區（獨立一行，避免與 stats 搶寬） */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-end justify-between gap-3 mb-5 lg:mb-8"
      >
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl lg:text-4xl font-extrabold text-ink leading-tight break-words">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm lg:text-base text-ink-light mt-2 leading-relaxed">{subtitle}</p>
          )}
        </div>
        {rightExtra && <div className="shrink-0">{rightExtra}</div>}
      </motion.div>
    </div>
  );
}
