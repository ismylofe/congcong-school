/**
 * economy.ts —— 經濟系統單一事實源（Wave B 統一口徑）
 *
 * 這裡是 web / iOS 雙端共同遵守的經濟數值表與純函式。任何一端不得偏離；
 * Swift 側需要按 spec/golden-vectors.json 鏡像同名常量與函式並跑同一組黃金向量。
 *
 * 覆蓋範圍：
 *   - 課程 XP（首答計分 + 零失誤 + 首次三星 + 週末雙倍）
 *   - 星級（accuracy → 1/2/3 星）
 *   - 每課寶石 drip（星級加成 + 首次三星 + 每日目標）
 *   - 紅心（上限 / 回覆節奏 / 補滿價格）
 *   - 連勝護盾（價格 / 上限 / 週一補給）與連勝推進（advanceStreak）
 *   - 連勝里程碑寶石 / 每日登入獎勵 / 連勝補卡
 *   - 每日目標檔位 / 閱讀 XP
 */

// ============================================================
// ⭐ 星級
// ============================================================

/** 三星線：首答正確率 ≥ 0.95 */
export const THREE_STAR_ACCURACY = 0.95;
/** 二星線：首答正確率 ≥ 0.80（web 端從 0.75 上調對齊） */
export const TWO_STAR_ACCURACY = 0.8;

/**
 * 由首答正確率（首答答對數 / 總題數）計算星級。
 * ≥0.95 → 3 星；≥0.80 → 2 星；否則 1 星。
 */
export function starsFromAccuracy(accuracy: number): 1 | 2 | 3 {
  if (accuracy >= THREE_STAR_ACCURACY) return 3;
  if (accuracy >= TWO_STAR_ACCURACY) return 2;
  return 1;
}

// ============================================================
// ⚡ 課程 XP
// ============================================================

/** 每道首答答對的題 = 10 XP */
export const XP_PER_CORRECT = 10;
/** 零失誤（首答全對）額外 +5 XP */
export const PERFECT_XP_BONUS = 5;
/** 該課歷史首次達成三星，額外 +5 XP */
export const FIRST_PERFECT_XP_BONUS = 5;
/** 週末（本地時間週六/週日）XP 總額整體 ×2，且必須在 UI 可見 */
export const WEEKEND_XP_MULTIPLIER = 2;
/** 單元挑戰（exam 課）XP 總額整體 ×2，與週末雙倍可疊加（寶石 drip 不翻倍） */
export const EXAM_XP_MULTIPLIER = 2;

export interface LessonXpInput {
  /** 首答答對的題數 */
  correctCount: number;
  /** 是否零失誤（首答全對） */
  perfect: boolean;
  /** 是否該課歷史首次達成 3 星 */
  firstPerfect: boolean;
  /** 本地時間是否為週六/週日 */
  isWeekend: boolean;
  /** 是否單元挑戰課（"{bookId}-u{n}-exam"）；預設 false */
  isExam?: boolean;
}

/**
 * 一節課的 XP 總額：
 *   base = correctCount × 10；perfect +5；firstPerfect +5；
 *   單元挑戰對總額 ×2；週末再對總額 ×2（兩者可疊加 = ×4）。
 */
export function xpForLesson(input: LessonXpInput): number {
  let xp = input.correctCount * XP_PER_CORRECT;
  if (input.perfect) xp += PERFECT_XP_BONUS;
  if (input.firstPerfect) xp += FIRST_PERFECT_XP_BONUS;
  if (input.isExam) xp *= EXAM_XP_MULTIPLIER;
  if (input.isWeekend) xp *= WEEKEND_XP_MULTIPLIER;
  return xp;
}

/** 本地時間是否處於週末雙倍 XP（週六/週日） */
export function isWeekendXpActive(date: Date = new Date()): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

// ============================================================
// 💎 每課寶石 drip
// ============================================================

/** 每節課基礎寶石 */
export const LESSON_GEM_BASE = 3;
/** 2 星寶石加成 */
export const LESSON_GEM_TWO_STAR_BONUS = 5;
/** 3 星寶石加成（替代 2 星加成，不疊加） */
export const LESSON_GEM_THREE_STAR_BONUS = 10;
/** 該課歷史首次三星，額外寶石 */
export const FIRST_PERFECT_GEM_BONUS = 15;
/** 當日首次跨過每日目標的一次性寶石獎勵 */
export const DAILY_GOAL_BONUS = 20;

export interface LessonGemDripInput {
  stars: 1 | 2 | 3;
  /** 該課歷史首次三星 */
  isFirstPerfect: boolean;
  /** 本次入賬是否讓 todayXp 當日首次跨過每日目標 */
  crossedDailyGoal: boolean;
}

/**
 * 每課寶石 drip：基礎 3；2 星 +5；3 星 +10（星級加成取檔，不疊加）；
 * 首次三星 +15；當日首次跨過每日目標 +20。
 */
export function lessonGemDrip(input: LessonGemDripInput): number {
  let gems = LESSON_GEM_BASE;
  if (input.stars === 3) gems += LESSON_GEM_THREE_STAR_BONUS;
  else if (input.stars === 2) gems += LESSON_GEM_TWO_STAR_BONUS;
  if (input.isFirstPerfect) gems += FIRST_PERFECT_GEM_BONUS;
  if (input.crossedDailyGoal) gems += DAILY_GOAL_BONUS;
  return gems;
}

// ============================================================
// ❤️ 紅心
// ============================================================

/** 紅心上限 */
export const MAX_HEARTS = 5;
/** 每顆紅心的回覆時長（秒） */
export const HEART_REGEN_SECONDS = 300;
/** 一次性補滿紅心的寶石價格 */
export const HEART_REFILL_COST = 350;

/**
 * 複習獎勵紅心：一輪錯題複習裡至少答對 REVIEW_HEART_MIN_CORRECT 題，
 * 補回 REVIEW_HEART_REWARD 顆心（不超過 MAX_HEARTS）。
 * 雙端必須引用這兩個常量——歷史上 iOS 有、web 沒有，導致同一輪複習收益不一致。
 */
export const REVIEW_HEART_REWARD = 1;
export const REVIEW_HEART_MIN_CORRECT = 5;

/**
 * 一輪複習結束後應補的紅心數（已滿心則為 0）。
 * @param correctCount 本輪答對題數
 * @param hearts 當前紅心數
 * @param availableCount 本輪可用題數；不足五題時需整輪首答正確
 */
export function reviewHeartReward(correctCount: number, hearts: number, availableCount = REVIEW_HEART_MIN_CORRECT): number {
  if (!Number.isFinite(correctCount) || !Number.isInteger(availableCount) || availableCount < 1) return 0;
  if (correctCount < Math.min(REVIEW_HEART_MIN_CORRECT, availableCount)) return 0;
  return Math.min(REVIEW_HEART_REWARD, Math.max(0, MAX_HEARTS - hearts));
}

// ============================================================
// 🛡️ 連勝護盾 & 連勝推進
// ============================================================

/** 護盾售價（寶石） */
export const FREEZE_COST = 200;
/** 護盾持有上限（滿時購買按鈕置灰顯示 2/2；老檔超過 2 的不沒收，只封新購） */
export const MAX_FREEZES = 2;
/** 新檔初始護盾數 */
export const INITIAL_FREEZES = 2;

/** 連勝補卡價格：僅當今天未學且 gap≥2（護盾不夠救）時可用，把 lastActiveDate 撥回昨天 */
export const STREAK_MAKEUP_COST = 50;

export interface StreakAdvanceInput {
  /** 當前連勝 */
  streak: number;
  /** 當前護盾數 */
  freezes: number;
  /** lastActiveDate 與今天相差的天數（0=同日；負數=時鐘回呼） */
  gapDays: number;
  /** 今天本地時間是否為週一（護盾補給日） */
  isMonday: boolean;
}

export interface StreakAdvanceResult {
  streak: number;
  freezes: number;
  /** 本次消耗的護盾數 */
  freezesConsumed: number;
}

/**
 * 連勝推進（沿用 bumpStreak 語義的純函式版）：
 *   - gapDays == 0（同日）或 < 0（時鐘回呼）：不變，不消耗。
 *   - gapDays == 1：streak+1；**週一補給規則**：若今天是週一且護盾未滿，自動補 1（封頂 MAX_FREEZES）。
 *   - gapDays >= 2：缺勤 missed = gapDays-1；護盾足夠則消耗 missed 顆並 streak+1，
 *     不夠則 streak 歸 1（護盾保留不消耗）。
 */
export function advanceStreak(input: StreakAdvanceInput): StreakAdvanceResult {
  const { streak, freezes, gapDays, isMonday } = input;
  if (gapDays <= 0) {
    return { streak, freezes, freezesConsumed: 0 };
  }
  if (gapDays === 1) {
    const topped = isMonday && freezes < MAX_FREEZES ? freezes + 1 : freezes;
    return { streak: streak + 1, freezes: topped, freezesConsumed: 0 };
  }
  const missed = gapDays - 1;
  if (freezes >= missed) {
    return { streak: streak + 1, freezes: freezes - missed, freezesConsumed: missed };
  }
  return { streak: 1, freezes, freezesConsumed: 0 };
}

// ============================================================
// 🔥 連勝里程碑 & 每日登入獎勵
// ============================================================

/**
 * 連勝里程碑寶石（每檔一次，記入 claimedStreakRewards 賬本）。
 */
export const STREAK_MILESTONE_REWARDS: Record<number, number> = {
  3: 30,
  7: 80,
  14: 150,
  30: 300,
  60: 500,
  100: 800,
};

/** 達到某連勝天數應發的里程碑寶石；非里程碑檔返回 0。 */
export function streakMilestoneReward(streakAfter: number): number {
  return STREAK_MILESTONE_REWARDS[streakAfter] ?? 0;
}

/**
 * 每日登入獎勵表：index = min(有效連勝, 7)。
 * 每日一次，記入 lastDailyRewardDate 賬本。
 */
export const DAILY_REWARD_TABLE = [5, 5, 8, 12, 15, 20, 25, 30] as const;

/** 按有效連勝取每日登入獎勵寶石數。 */
export function dailyRewardForStreak(streak: number): number {
  const idx = Math.min(Math.max(0, Math.floor(streak)), DAILY_REWARD_TABLE.length - 1);
  return DAILY_REWARD_TABLE[idx];
}

// ============================================================
// 🎯 每日目標
// ============================================================

/** 每日目標檔位（XP）。老使用者已選超出檔位的值保留現值，僅選項列表變。 */
export const DAILY_GOAL_OPTIONS = [20, 50, 100, 200] as const;
export const DEFAULT_DAILY_GOAL = 50;

// ============================================================
// 📖 閱讀 XP（純 XP，無寶石）
// ============================================================

/**
 * 閱讀類活動 XP：課文聽讀 5；跟讀 10；
 * 故事測驗 accuracy ≥ goodThreshold(0.8) → 15，否則 5。
 */
export const READING_XP = {
  /** 課文聽讀 */
  listen: 5,
  /** 跟讀 */
  followup: 10,
  /** 故事測驗達標（accuracy ≥ goodThreshold） */
  storyGood: 15,
  /** 故事測驗未達標 */
  storyBase: 5,
  /** 故事測驗達標線 */
  goodThreshold: 0.8,
} as const;

/** 故事測驗按正確率取 XP。 */
export function storyQuizXp(accuracy: number): number {
  return accuracy >= READING_XP.goodThreshold ? READING_XP.storyGood : READING_XP.storyBase;
}
