"use client";

import { useEffect, useState } from "react";
import { useProgressStore } from "@/store/progress";

/**
 * useProgressTicker — 定期重新整理心數、提供一個每秒 tick 用於倒計時顯示。
 *
 * 掛載時立即呼叫 refreshHearts（回填從上次關閉到現在的心數恢復），
 * 然後每秒 tick 一次用於"下一顆心還有 mm:ss" 顯示，
 * 每次 tick 都會嘗試 refreshHearts。
 *
 * 返回 now（ms）用於倒計時計算。
 */
export function useProgressTicker(): number {
  const refreshHearts = useProgressStore(s => s.refreshHearts);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    refreshHearts();
    setNow(Date.now());
    const t = setInterval(() => {
      refreshHearts();
      setNow(Date.now());
    }, 1000);

    // 頁面切回前臺時立即重新整理
    const onVis = () => {
      if (document.visibilityState === "visible") {
        refreshHearts();
        setNow(Date.now());
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refreshHearts]);

  return now;
}

/** 格式化毫秒為 mm:ss */
export function formatMsCountdown(ms: number): string {
  if (ms <= 0) return "0:00";
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
