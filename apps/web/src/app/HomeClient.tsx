"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useProgressStore } from "@/store/progress";
import { GradePicker } from "@/components/GradePicker";

interface HomeClientProps {
  grades: number[];
  byGrade: Record<number, number>;
  /** 目前上架的全部教材 id（含被新版取代、但路由仍保留的舊版） */
  bookIds: string[];
  totalBooks: number;
  totalLessons: number;
  totalQuestions: number;
}

/**
 * 首頁路由分發（開啟即路徑）：
 *   - 有當前教材（activeBookId）→ 軟跳轉到 /book/{id}/（router.replace，無整頁白閃）
 *   - 只選過年級 → 軟跳轉到 /grade/{grade}/
 *   - 都沒有（首訪 / 剛點了「換年級」）→ 渲染 GradePicker 引導
 *
 * 換年級會把 selectedGrade 清空；此時殘留的 activeBookId 已屬於舊年級，
 * 在這裡順手清掉（自愈），避免下次開啟又跳回舊教材。
 */
export function HomeClient({ grades, bookIds }: HomeClientProps) {
  const selectedGrade = useProgressStore(s => s.selectedGrade);
  const activeBookId = useProgressStore(s => s.activeBookId);
  const setActiveBookId = useProgressStore(s => s.setActiveBookId);
  const setSelectedGrade = useProgressStore(s => s.setSelectedGrade);
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    if (!hydrated) return;
    if (selectedGrade == null) {
      // 年級已重置 → 舊教材選擇隨之失效
      if (activeBookId != null) setActiveBookId(null);
      return;
    }
    if (activeBookId && !bookIds.includes(activeBookId)) {
      // localStorage 記著已下架的教材（例如原專案教材）：不要跳到不存在的頁面，
      // 清掉選擇回到選年級畫面，避免 404 →「返回學習頁面」→ 又跳回 404 的迴圈。
      setActiveBookId(null);
      setSelectedGrade(null);
      return;
    }
    if (activeBookId) {
      // An explicit legacy selection must survive reopening the home page.
      router.replace(`/book/${activeBookId}/`);
    } else {
      router.replace(`/grade/${selectedGrade}/`);
    }
  }, [hydrated, selectedGrade, activeBookId, setActiveBookId, setSelectedGrade, bookIds, router]);

  // 跳轉前渲染空底色佔位，避免閃 GradePicker
  if (!hydrated || selectedGrade != null) {
    return <main className="min-h-screen bg-bg" aria-busy="true" />;
  }

  return <GradePicker availableGrades={grades} />;
}
