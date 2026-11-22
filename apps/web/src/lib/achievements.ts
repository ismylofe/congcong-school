/**
 * achievements.ts —— Web 端 shim
 *
 * 解鎖判定 / 成就定義 全部來自 @cstf/core/achievements（純函式、跨端共享）。
 * 本檔案只保留 Web 平臺特定的 seen-tracking（基於 localStorage）。
 * RN 端會有自己的 seen-tracking 實現（AsyncStorage）。
 */

export {
  ALL_ACHIEVEMENTS,
  computeUnlockedAchievementIds,
  diffNewlyUnlocked,
} from "@cstf/core/achievements";
export type {
  Achievement,
  AchievementCategory,
  AchievementProgressSnapshot,
} from "@cstf/core/achievements";

import { learnerLocalStorage } from "@/lib/learnerProfiles";
import { computeUnlockedAchievementIds } from "@cstf/core/achievements";
import { useProgressStore } from "@/store/progress";

const SEEN_KEY = "csf-achievements-seen-v1";

function readSeen(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = learnerLocalStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function writeSeen(set: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    learnerLocalStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(set)));
  } catch {
    /* noop */
  }
}

/** 解鎖集合 = 永久賬本 ∪ 實時計算（已入賬本的永不"回鎖"） */
function currentUnlockedIds(): string[] {
  const state = useProgressStore.getState();
  return [
    ...new Set([
      ...Object.keys(state.unlockedAchievements),
      ...computeUnlockedAchievementIds(state),
    ]),
  ];
}

/** 當前是否存在尚未被使用者查看的已解鎖成就 */
export function hasUnseenAchievements(): boolean {
  if (typeof window === "undefined") return false;
  const seen = readSeen();
  return currentUnlockedIds().some(id => !seen.has(id));
}

/** 把當前所有解鎖標記為已讀（使用者進入成就牆時呼叫） */
export function markAllSeen(): void {
  const seen = readSeen();
  currentUnlockedIds().forEach(id => seen.add(id));
  writeSeen(seen);
}
