/**
 * achievements.ts —— 成就 / 徽章定義與解鎖判定（純函式）
 *
 * 拆分成兩層：
 *   - **core/achievements**（本檔案）：定義 ALL_ACHIEVEMENTS、computeUnlockedAchievementIds、
 *     diffNewlyUnlocked。零 DOM、零 store 依賴。所有 getProgress 函式接收一個
 *     結構化的 AchievementProgressSnapshot —— 實際的 ProgressState 透過 TS
 *     結構子型別自動滿足這個介面。
 *   - **frontend/lib/achievements**（Web 端 shim）：在此基礎上保留 hasUnseenAchievements /
 *     markAllSeen，依賴 localStorage + Zustand store。RN 端會有自己的 seen-tracking 實現。
 */

import { getStarterCosmetics } from "./cosmetics";

export type AchievementCategory = "milestone" | "streak" | "perfection" | "shop" | "review";

/**
 * 新檔白送的初始美妝 id 集合 —— "解鎖第一件聰聰的裝扮"要排除它們。
 * 用 cosmetics 的 starter 標記推導（而不是減一個魔法數），
 * 將來增刪 starter 或使用者只擁有部分 starter 都不會錯檔。
 */
const STARTER_COSMETIC_IDS: ReadonlySet<string> = new Set(
  getStarterCosmetics().map(c => c.id),
);

/** 自己買/賺來的美妝件數（不含初始白送的）。 */
function ownedNonStarterCount(ownedCosmetics: Record<string, unknown>): number {
  return Object.keys(ownedCosmetics).filter(id => !STARTER_COSMETIC_IDS.has(id)).length;
}

/**
 * 成就計算所需的進度快照——只宣告 ALL_ACHIEVEMENTS 真正讀到的欄位。
 * 任何包含這些欄位的更大物件（例如 Web 的 ProgressState）都自動相容。
 */
export interface AchievementProgressSnapshot {
  xp: number;
  streak: number;
  lifetimeGems: number;
  completedLessons: Record<string, unknown>;
  perfectedLessons: Record<string, unknown>;
  ownedCosmetics: Record<string, unknown>;
  mistakesBank: ReadonlyArray<{ correctCount?: number }>;
}

/**
 * 成就獎勵分量（寶石）：輕量 20 / 中量 50 / 重量 100。
 */
export type AchievementRewardGems = 20 | 50 | 100;

export interface Achievement {
  id: string;
  category: AchievementCategory;
  name: string;
  description: string;
  iconKey:
    | "lightning"
    | "flame"
    | "star"
    | "crown"
    | "gem"
    | "bookmark"
    | "trophy"
    | "rocket"
    | "medal"
    | "sparkle";
  color: string;
  goal: number;
  /** 解鎖獎勵寶石（只發一次，解鎖寫入永久 unlockedAchievements 賬本） */
  reward: AchievementRewardGems;
  getProgress: (s: AchievementProgressSnapshot) => number;
}

const A: Achievement[] = [
  // ===== Milestone：首次行動 =====
  {
    id: "first-lesson",
    category: "milestone",
    name: "出師告捷",
    description: "完成你的第一節課",
    iconKey: "rocket",
    color: "#1CB0F6",
    goal: 1,
    reward: 20,
    getProgress: s => Object.keys(s.completedLessons).length,
  },
  {
    id: "ten-lessons",
    category: "milestone",
    name: "學海十里",
    description: "累計完成 10 節課",
    iconKey: "bookmark",
    color: "#1CB0F6",
    goal: 10,
    reward: 50,
    getProgress: s => Object.keys(s.completedLessons).length,
  },
  {
    id: "fifty-lessons",
    category: "milestone",
    name: "百鍊成鋼",
    description: "累計完成 50 節課",
    iconKey: "trophy",
    color: "#A855F7",
    goal: 50,
    reward: 100,
    getProgress: s => Object.keys(s.completedLessons).length,
  },

  // ===== XP =====
  {
    id: "xp-100",
    category: "milestone",
    name: "初露鋒芒",
    description: "累計 100 經驗",
    iconKey: "lightning",
    color: "#1CB0F6",
    goal: 100,
    reward: 20,
    getProgress: s => s.xp,
  },
  {
    id: "xp-1000",
    category: "milestone",
    name: "經驗豐富",
    description: "累計 1000 經驗",
    iconKey: "lightning",
    color: "#A855F7",
    goal: 1000,
    reward: 50,
    getProgress: s => s.xp,
  },
  {
    id: "xp-5000",
    category: "milestone",
    name: "學習達人",
    description: "累計 5000 經驗",
    iconKey: "lightning",
    color: "#FFC800",
    goal: 5000,
    reward: 100,
    getProgress: s => s.xp,
  },

  // ===== Streak =====
  {
    id: "streak-3",
    category: "streak",
    name: "三日不輟",
    description: "連續學習 3 天",
    iconKey: "flame",
    color: "#FF9600",
    goal: 3,
    reward: 20,
    getProgress: s => s.streak,
  },
  {
    id: "streak-7",
    category: "streak",
    name: "一週如一日",
    description: "連續學習 7 天",
    iconKey: "flame",
    color: "#FF9600",
    goal: 7,
    reward: 50,
    getProgress: s => s.streak,
  },
  {
    id: "streak-30",
    category: "streak",
    name: "整月堅持",
    description: "連續學習 30 天",
    iconKey: "flame",
    color: "#FF4B4B",
    goal: 30,
    reward: 100,
    getProgress: s => s.streak,
  },
  {
    id: "streak-100",
    category: "streak",
    name: "百日行者",
    description: "連續學習 100 天",
    iconKey: "flame",
    color: "#FFC800",
    goal: 100,
    reward: 100,
    getProgress: s => s.streak,
  },

  // ===== Perfection =====
  {
    id: "perfect-1",
    category: "perfection",
    name: "完美初體驗",
    description: "首次三星通關一節課",
    iconKey: "star",
    color: "#FFC800",
    goal: 1,
    reward: 20,
    getProgress: s => Object.keys(s.perfectedLessons).length,
  },
  {
    id: "perfect-10",
    category: "perfection",
    name: "完美十連",
    description: "三星通關 10 節課",
    iconKey: "star",
    color: "#FFC800",
    goal: 10,
    reward: 50,
    getProgress: s => Object.keys(s.perfectedLessons).length,
  },
  {
    id: "perfect-50",
    category: "perfection",
    name: "無瑕修行",
    description: "三星通關 50 節課",
    iconKey: "crown",
    color: "#A855F7",
    goal: 50,
    reward: 100,
    getProgress: s => Object.keys(s.perfectedLessons).length,
  },

  // ===== Shop / Cosmetics =====
  {
    id: "first-cosmetic",
    category: "shop",
    name: "時尚啟航",
    description: "解鎖第一件聰聰的裝扮",
    iconKey: "sparkle",
    color: "#A855F7",
    goal: 1,
    reward: 20,
    getProgress: s => ownedNonStarterCount(s.ownedCosmetics),
  },
  {
    id: "gem-collector",
    category: "shop",
    name: "寶石收藏家",
    description: "累計獲得 500 顆寶石",
    iconKey: "gem",
    color: "#A855F7",
    goal: 500,
    reward: 50,
    getProgress: s => s.lifetimeGems,
  },

  // ===== Review =====
  {
    id: "first-review",
    category: "review",
    name: "知錯就改",
    description: "在錯題本中複習一道題",
    iconKey: "medal",
    color: "#58CC02",
    goal: 1,
    reward: 20,
    getProgress: s => s.mistakesBank.filter(m => (m.correctCount ?? 0) > 0).length,
  },
];

export const ALL_ACHIEVEMENTS: Achievement[] = A;

export function computeUnlockedAchievementIds(s: AchievementProgressSnapshot): string[] {
  return ALL_ACHIEVEMENTS.filter(a => a.getProgress(s) >= a.goal).map(a => a.id);
}

/**
 * 比較兩次 store 快照，返回這次新解鎖的成就。
 */
export function diffNewlyUnlocked(
  before: AchievementProgressSnapshot,
  after: AchievementProgressSnapshot,
): Achievement[] {
  const beforeSet = new Set(computeUnlockedAchievementIds(before));
  return ALL_ACHIEVEMENTS.filter(a => a.getProgress(after) >= a.goal && !beforeSet.has(a.id));
}

/**
 * 永久解鎖賬本合併（只進不出）：把「當前按進度算出來的解鎖集合」並進
 * 已持久化的 unlockedAchievements 賬本。連勝回落等導致進度倒退時，
 * 已解鎖的成就不會被「回鎖」，獎勵也因此只會發一次。
 *
 * 返回的陣列保持 prevLedger 原有順序，新解鎖的按 currentUnlockedIds
 * 順序追加；結果去重。入參不被修改。
 */
export function latchUnlocked(
  prevLedger: ReadonlyArray<string>,
  currentUnlockedIds: ReadonlyArray<string>,
): string[] {
  const seen = new Set(prevLedger);
  const merged = [...prevLedger];
  for (const id of currentUnlockedIds) {
    if (!seen.has(id)) {
      seen.add(id);
      merged.push(id);
    }
  }
  return merged;
}
