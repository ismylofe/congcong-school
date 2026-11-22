/**
 * chestLogic.ts — 寶箱節點的位置計算 + 獎勵隨機
 *
 * 設計原則：
 *   - 不改 outline.json，純客戶端計算
 *   - 每單元內每 N 課後插入一個 chest slot
 *   - chestId 穩定：`${bookId}-u${unit}-chest-${indexInUnit}`
 *   - 依賴 lesson.id 的集合是 determinstic 的，所以同一個 book 再次渲染時 id 一致
 */

import type { PathLessonMeta } from "./types";

/**
 * 每個單元內每 N 課後插入一個寶箱節點。
 * 這是寶箱節奏的核心常量，progress store 也會 re-export 這個值。
 */
export const CHEST_EVERY_N_LESSONS = 5;

export interface ChestSlot {
  id: string;
  /** 這個 chest 出現在這節課之後 */
  afterLessonId: string;
  unitNumber: number;
  unitTitle: string;
  /** 單元內第幾個寶箱（0-indexed），用於 chestId */
  indexInUnit: number;
}

/**
 * 掃描所有 lessons，在每單元內每 N 課之後插入一個 chest slot。
 * 只在"緊跟"N 的倍數位置放 chest，不在單元末尾補 chest（避免奇怪的視覺跳動）。
 */
export function computeChestsForBook(
  bookId: string,
  lessons: PathLessonMeta[],
  interval = CHEST_EVERY_N_LESSONS,
): ChestSlot[] {
  const slots: ChestSlot[] = [];
  // 按單元分組，保持原順序
  const unitIndices = new Map<number, number>();

  for (const l of lessons) {
    const countInUnit = (unitIndices.get(l.unitNumber) ?? 0) + 1;
    unitIndices.set(l.unitNumber, countInUnit);

    // 到達 interval 倍數（比如第 5 / 10 / 15 課）時，在這節課之後插入 chest
    if (countInUnit % interval === 0) {
      const indexInUnit = countInUnit / interval - 1;
      slots.push({
        id: `${bookId}-u${l.unitNumber}-chest-${indexInUnit}`,
        afterLessonId: l.id,
        unitNumber: l.unitNumber,
        unitTitle: l.unitTitle,
        indexInUnit,
      });
    }
  }

  return slots;
}

/**
 * 給定一個 bookId 和"剛完成的 lesson id"，查是否緊跟一個 chest slot。
 * 用於課程通關時判定"要不要開箱"。
 */
export function findChestAfterLesson(
  bookId: string,
  lessons: PathLessonMeta[],
  lessonId: string,
): ChestSlot | null {
  const chests = computeChestsForBook(bookId, lessons);
  return chests.find(c => c.afterLessonId === lessonId) ?? null;
}

/**
 * 三檔可變獎勵 —— 模擬 Duolingo 的"variable reward"心理機制。
 * - 85% 普通：[10, 20] gems
 * - 10% 驚喜：[21, 30] gems
 * -  5% 超級驚喜：[40, 50] gems（值得截圖分享）
 *
 * 對應的 rarity tier 給前端用，可以讓超級驚喜走更誇張的開箱動畫。
 */
export type ChestRewardTier = "common" | "rare" | "epic";

export interface ChestRewardResult {
  gems: number;
  tier: ChestRewardTier;
}

export function rollChestReward(): ChestRewardResult {
  const roll = Math.random();
  if (roll < 0.85) {
    return { gems: Math.round(10 + Math.random() * 10), tier: "common" };
  }
  if (roll < 0.95) {
    return { gems: Math.round(21 + Math.random() * 9), tier: "rare" };
  }
  return { gems: Math.round(40 + Math.random() * 10), tier: "epic" };
}
