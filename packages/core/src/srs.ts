/**
 * srs.ts —— 簡化的 Leitner 3-box 間隔重複演算法
 *
 * 設計原則：
 *   - 3 個盒子（box 1/2/3），分別對應今天 / 明天 / 3天后 / 7天后的複習節奏
 *   - 答錯 → 降級回 box 1
 *   - 答對 → 升級到下一個 box
 *   - 已經在 box 3 且連續答對 N 次 → 暫時"畢業"，不再頻繁出現
 *
 * 演算法極簡，純前端 + 零依賴，符合公益專案"低成本高效果"的目標。
 */

import type { Question } from "./types";

export type SrsBox = 1 | 2 | 3;

export interface SrsMistakeEntry {
  lessonId: string;
  lessonTitle?: string;
  question: Question;
  /** 首次加入錯題本的時間 */
  addedAt: string;
  /** 當前所在 box */
  box?: SrsBox;
  /** 總答對次數 */
  correctCount?: number;
  /** 上次複習時間（ISO） */
  lastReviewedAt?: string;
  /** 下次應當複習的日期（YYYY-MM-DD）。空 = 立即可複習 */
  nextReviewDate?: string;
  /**
   * 已畢業：box 3 且累計答對 ≥ SRS_GRADUATE_MIN_CORRECT。
   * 畢業條目保留在錯題本里展示「已掌握」，但不再進入 due 佇列。
   */
  graduated?: boolean;
}

/** 畢業線（盒子）：至少升到 box 3。 */
export const SRS_GRADUATE_MIN_BOX = 3;
/** 畢業線（答對次數）：累計答對達到該值（與 iOS reviewMistake 移除條件一致）。 */
export const SRS_GRADUATE_MIN_CORRECT = 2;

/**
 * 畢業判定只需要這三個欄位——刻意收窄成最小輸入，
 * 讓錯題本條目、備份裡的 BackupMistake、iOS 的 MistakeEntry 都能直接喂進來。
 */
export interface SrsGraduationState {
  graduated?: boolean;
  box?: number;
  correctCount?: number;
}

/**
 * 條目是否達到畢業語義：**顯式 graduated 標記，或 box ≥ 3 且累計答對 ≥ 2**。
 *
 * ⚠️ 這是派生判定，不是"只認顯式標記"：老檔 / 另一端匯入的條目常常只有
 * box + correctCount 而沒有 graduated 欄位，只認標記會讓它們永遠留在
 * due 佇列裡反覆出現。
 *
 * ⚠️ iOS `Domain/SRS.swift` 必須逐行鏡像本判定（due 過濾也必須用它，
 * 不能只判 `graduated != true`）。spec/golden-vectors.json 的 `srsGraduation`
 * 組是雙端對照的黃金向量，任何一端改判定都會讓兩端測試同時飄紅。
 */
export function isSrsGraduated(entry: SrsGraduationState): boolean {
  if (entry.graduated === true) return true;
  return (
    (entry.box ?? 1) >= SRS_GRADUATE_MIN_BOX &&
    (entry.correctCount ?? 0) >= SRS_GRADUATE_MIN_CORRECT
  );
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dateNDaysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * 給 SRS 條目應用一次複習結果，返回新的快照（不可變）。
 */
export function reviewSrsEntry(
  entry: SrsMistakeEntry,
  isCorrect: boolean,
): SrsMistakeEntry {
  const next: SrsMistakeEntry = { ...entry };
  next.lastReviewedAt = new Date().toISOString();

  if (!isCorrect) {
    // 答錯 → 重置回 box 1，今天就再練
    next.box = 1;
    next.correctCount = 0;
    next.nextReviewDate = todayStr();
    return next;
  }

  // 答對：根據當前 box 升級
  next.correctCount = (next.correctCount ?? 0) + 1;
  const currentBox = (entry.box ?? 1) as SrsBox;

  switch (currentBox) {
    case 1:
      next.box = 2;
      next.nextReviewDate = dateNDaysFromNow(1); // 明天
      break;
    case 2:
      next.box = 3;
      next.nextReviewDate = dateNDaysFromNow(3); // 3 天后
      break;
    case 3:
      next.box = 3;
      next.nextReviewDate = dateNDaysFromNow(7); // 7 天后
      break;
  }
  return next;
}

/**
 * 從錯題集篩出"今天應該複習"的題目，並按優先順序排序：
 *   1. box 等級低的優先（box 1 > box 2 > box 3）
 *   2. 同 box 內按 lastReviewedAt 舊的優先
 *   3. 沒有 nextReviewDate 的視作立即可複習
 *
 * 畢業過濾必須走 isSrsGraduated（派生判定），iOS 側同名過濾要逐行鏡像。
 */
export function getDueSrsEntries(
  entries: SrsMistakeEntry[],
): SrsMistakeEntry[] {
  const today = todayStr();
  const due = entries.filter(e => {
    if (isSrsGraduated(e)) return false; // 畢業條目不再進入複習佇列
    if (!e.nextReviewDate) return true;
    return e.nextReviewDate <= today;
  });
  return due.sort((a, b) => {
    const ba = a.box ?? 1;
    const bb = b.box ?? 1;
    if (ba !== bb) return ba - bb;
    const la = a.lastReviewedAt ?? a.addedAt ?? "";
    const lb = b.lastReviewedAt ?? b.addedAt ?? "";
    return la.localeCompare(lb);
  });
}

/**
 * 給一條新錯題（首次加入）填充 SRS 預設欄位。
 */
export function newSrsEntry(
  partial: Pick<SrsMistakeEntry, "lessonId" | "lessonTitle" | "question">,
): SrsMistakeEntry {
  return {
    ...partial,
    addedAt: new Date().toISOString(),
    box: 1,
    correctCount: 0,
    nextReviewDate: todayStr(),
  };
}
