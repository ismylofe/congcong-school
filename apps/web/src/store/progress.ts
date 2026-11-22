"use client";

import { learnerLocalStorage, learnerSessionStorage } from "@/lib/learnerProfiles";
import { saveReviewSession } from "@/lib/reviewSession";
import { numberSkillForLesson, recordNumberPractice, recordNumberReview, dueNumberSkills, normalizeNumberProgress, type NumberProgress, type NumberPracticeEvidence, type NumberSkill } from '@cstf/core/numberSense';
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Question, LessonResult, Lesson } from "@/types";
import { reconcileMistakes } from "@/lib/reviewContent";
import { DEFAULT_EQUIPPED, getCosmeticById, getStarterCosmetics } from "@/lib/cosmetics";
import {
  starsFromAccuracy,
  lessonGemDrip,
  isWeekendXpActive,
  dailyRewardForStreak,
  MAX_HEARTS,
  HEART_REGEN_SECONDS,
  HEART_REFILL_COST,
  FREEZE_COST,
  MAX_FREEZES,
  INITIAL_FREEZES,
  STREAK_MAKEUP_COST,
  STREAK_MILESTONE_REWARDS,
  DAILY_GOAL_OPTIONS,
  DEFAULT_DAILY_GOAL,
  DAILY_GOAL_BONUS,
  FIRST_PERFECT_XP_BONUS,
  REVIEW_HEART_REWARD,
  REVIEW_HEART_MIN_CORRECT,
  reviewHeartReward,
  advanceStreak,
} from "@cstf/core/economy";
import {
  readingId,
  normalizeReadingId,
  normalizeReadingMap,
  type ReadingKind,
} from "@cstf/core/reading";
import {
  ALL_ACHIEVEMENTS,
  computeUnlockedAchievementIds,
} from "@cstf/core/achievements";
import { dailyQuests, type Quest, type QuestKind } from "@cstf/core/quests";
import { reviewSrsEntry, isSrsGraduated } from "@cstf/core/srs";
import {
  LEAGUE_BOT_COUNT,
  LEAGUE_TIERS,
  UNLOCK_LESSONS,
  botWeeklyGoal,
  nextTierId,
  prevTierId,
  settleRank,
  userRank,
  weekKeyFor,
  type LeagueTierId,
} from "@cstf/core/league";
import {
  buildBackup,
  type BackupEnvelope,
  type BackupLessonResult,
  type BackupMistake,
} from "@cstf/core/backup";

/**
 * 錯題條目，含 SRS（間隔重複）欄位。
 * box / correctCount / lastReviewedAt / nextReviewDate 由 lib/srs.ts 維護。
 */
interface MistakeEntry {
  lessonId: string;
  lessonTitle?: string;
  question: Question;
  addedAt: string;
  /** SRS box（1=新錯題/今天覆習，2=明天，3=畢業級 7 天） */
  box?: 1 | 2 | 3;
  /** 累計答對次數 */
  correctCount?: number;
  /** 上次複習時間（ISO） */
  lastReviewedAt?: string;
  /** 下次複習日期（YYYY-MM-DD），<= today 即可複習 */
  nextReviewDate?: string;
  /** 已畢業（box3 + 答對≥2）：保留展示「已掌握」，不再進入 due 佇列 */
  graduated?: boolean;
}

/**
 * 未完成的課程會話。
 * 當使用者關閉瀏覽器 / 切走 / 重新整理時，這個物件被持久化，
 * 下次進入同一課程可以無縫恢復到上次答到的題目。
 */
export interface ActiveLessonSession {
  lessonId: string;
  index: number;
  correctCount: number;
  mistakeCount: number;
  combo: number;
  startedAt: number; // legacy timestamp; not an elapsed-time counter
  /** Checkpointed foreground time; absent on legacy drafts. */
  activeTimeMs?: number;
  // —— 可選擴充欄位；恢復前由 lessonSession 校驗課程內容是否一致 ——
  /** 剩餘待答題目 id 佇列（含錯題重排回隊尾的順序） */
  queueIds?: number[];
  /** 已答對（離場）的題目 id */
  solvedIds?: number[];
  /** 本次會話最高連擊 */
  maxCombo?: number;
  /** 本次會話已累計 XP（展示用） */
  sessionXp?: number;
  stage?: "intro" | "practice";
  introPage?: number;
  introMode?: "warmup" | "handbook";
  introCompletedPages?: number[];
  warmupCounted?: number[];
  currentId?: number | null;
  draftAnswer?: string;
  phase?: "answering" | "checked";
  checkedCorrect?: boolean | null;
  attemptedIds?: number[];
  totalQuestions?: number;
  hintLevels?: Record<number, number>;
  independentIds?: number[];
  visualDraft?: number[];
  /** Identity of knowledge and questions, excluding audio; prevents stale feedback. */
  contentKey?: string;
}

/** 🚩 題目報錯型別（E2：小旗子三選） */
export type ReportKind = "question_wrong" | "answer_should_count" | "audio_issue";

/** 報錯型別 → 兒童友好中文標籤（UI 單一事實源） */
export const REPORT_KIND_LABELS: Record<ReportKind, string> = {
  question_wrong: "題目有誤",
  answer_should_count: "我的答案應該算對",
  audio_issue: "音訊有問題",
};

/**
 * 🚩 一條本地報錯記錄（E2）：只存在本機，不上傳任何伺服器。
 * 「我的」頁可查看與一鍵匯出 JSON。
 */
export interface QuestionReport {
  id: string;
  lessonId: string;
  questionId: number;
  /** 題幹快照（截斷），列表展示用 */
  questionText: string;
  kind: ReportKind;
  createdAt: string; // ISO
  /** 當次作答（可選，「我的答案應該算對」時最有用） */
  answerGiven?: string;
}

/**
 * 通關結算單 —— recordLessonComplete 的原子返回值，
 * 對齊 iOS ProgressStore.completeLesson 的 LessonOutcome 形態。
 * 結算頁/慶祝動畫只讀這裡的數字，不再自己扒 store 二次推算。
 */
export interface LessonOutcome {
  /** 實際入賬 XP（呼叫方經 xpForLesson 算好傳入，含週末 ×2） */
  xpGained: number;
  /** 本課寶石總額（drip：基礎+星級+首次三星+每日目標 +20，全含） */
  gemsGained: number;
  stars: 1 | 2 | 3;
  streakBefore: number;
  streakAfter: number;
  /** 本次通關是否推進了連勝（今天首次學習） */
  streakIncreased: boolean;
  /** 本次入賬是否讓今日 XP 首次跨過每日目標 */
  dailyGoalReachedNow: boolean;
  /** 本次觸發的連勝里程碑寶石（0 = 未到里程碑），已計入餘額 */
  milestoneGems: number;
  /** 是否該課歷史首次三星 */
  isFirstPerfect: boolean;
}

/**
 * 聯賽週一結算單 —— settleLeagueIfNeeded 發現跨周後寫入，
 * LeagueWatcher 消費並彈「上週戰報」結算幕（名次 + 段位變化 + 寶石）。
 */
export interface PendingLeagueResult {
  /** 被結算的那一週（週一 YYYY-MM-DD） */
  weekKey: string;
  /** 上週末終值名次（1..16） */
  rank: number;
  tierBefore: LeagueTierId;
  tierAfter: LeagueTierId;
  promoted: boolean;
  demoted: boolean;
  /** 名次獎勵 +（晉級時）晉級獎勵，已入賬 */
  gems: number;
}

interface ProgressState {
  // 核心進度
  xp: number;
  streak: number;
  lastActiveDate: string; // YYYY-MM-DD
  completedLessons: Record<string, LessonResult>;
  mistakesBank: MistakeEntry[];

  // 偏好
  muted: boolean;
  /** 自動朗讀題幹/講解/知識卡（面向低齡）。預設 on。 */
  autoNarrate: boolean;

  // 心數系統（持久化，跨會話恢復）
  hearts: number;
  nextHeartAt: number | null; // ms timestamp
  /**
   * 上次靠「複習錯題」賺到紅心的日期（YYYY-MM-DD，"" = 從未）。
   * 每天只能靠複習補一次心 —— 否則重複進出同一批錯題就能無限刷心。
   * 與 iOS ProgressStore 的 lastReviewHeartDate 同名同義。
   */
  lastReviewHeartDate: string;

  // 每日目標
  dailyGoal: number;
  todayXp: number;
  lastXpDate: string;

  // 連勝護盾
  streakFreezes: number;
  /**
   * 「護盾一次性補發」是否已經執行過（與 iOS Progress.freezesMigrated 同名同義）。
   * 沒有這個開關的話，persist version 每提升一次，migrate 裡的
   * `max(現值, INITIAL_FREEZES)` 就會再白送一輪護盾。
   */
  freezesMigrated: boolean;

  // 未完成課程會話
  activeLesson: ActiveLessonSession | null;

  // 💎 寶石貨幣 / 寶箱 / 首次完美通關記錄
  gems: number;
  lifetimeGems: number;
  claimedChests: Record<string, true>;
  perfectedLessons: Record<string, true>;

  // 🎨 美妝系統 v4
  /** 已解鎖的 cosmetic id 集合 */
  ownedCosmetics: Record<string, true>;
  /** 當前裝備的吉祥物皮膚 id */
  equippedMascotSkin: string;
  /** 當前裝備的 UI 主題 id */
  equippedTheme: string;
  /** 當前裝備的課程背景 id */
  equippedBackdrop: string;
  /** 已發放過的"連勝里程碑"禮物（防止重複發） */
  claimedStreakRewards: Record<number, true>;

  // ⏱️ 時間關懷（家長可選開啟） v4
  /** 每日累計學習時間（毫秒，按 lastXpDate 重置） */
  todayTimeMs: number;
  /** 單日學習時間上限（毫秒），0 表示無限制 */
  dailyTimeLimitMs: number;
  /** 單次課程時長上限（毫秒），0 表示無限制 */
  sessionTimeLimitMs: number;

  // 📅 v5：每日 XP 歷史 + 每日登陸獎勵
  /** 每日 XP 歷史 { "YYYY-MM-DD": xp }，最多保留近 60 天 */
  xpHistory: Record<string, number>;
  /** 每日完成課程數歷史 { "YYYY-MM-DD": count } */
  lessonHistory: Record<string, number>;
  /** Effective learning days, independent of XP and reward eligibility. */
  studyDays: Record<string, true>;
  numberSenseProgress: NumberProgress;
  /** 上次領取每日登陸獎勵的日期 */
  lastDailyRewardDate: string;

  // 🎒 v6：使用者選擇的年級（首次進入時引導選擇，決定 home 顯示哪一年級的教材）
  selectedGrade: number | null;

  // 📖 v7：閱讀完成記錄，**規範閱讀 id**（@cstf/core/reading 的
  // `reading:{kind}:{rawId}`）→ 完成時間 ISO。
  // 與課程記錄徹底分離：閱讀只發 XP、不發寶石、不算課時（對齊 iOS completeReading）。
  // ⚠️ 不要手拼 key：讀用 isReadingDone / 寫用 completeReading(readingId(kind, rawId), xp)。
  completedReadings: Record<string, string>;

  // 🏆 v8：成就永久解鎖賬本（只進不出，防連勝回落"回鎖"；獎勵只發一次）
  unlockedAchievements: Record<string, true>;
  /** 最近一次發放但尚未慶祝的連勝里程碑（DailyRewardWatcher 消費後清空） */
  pendingStreakMilestone: { streak: number; gems: number } | null;

  // 🗓️ v9：每日任務計數（對齊 iOS rollDailyIfNeeded 的 dailyXxx 三計數）
  /** 計數所屬日期（YYYY-MM-DD），跨日清零 */
  dailyQuestDate: string;
  /** 今日完成課程數 */
  dailyLessons: number;
  /** 今日複習錯題道數 */
  dailyReviews: number;
  /** 今日讀完的課文/故事篇數 */
  dailyReadings: number;
  /** 任務領取賬本，key = "YYYY-MM-DD:questId"（防重複領取） */
  claimedQuests: Record<string, true>;

  // ⏱️ v9：學習時長獨立換日欄位（修復 addLearningTimeMs 汙染 lastXpDate）
  lastTimeDate: string;

  // 🏠 v9：首頁 IA——當前正在學的教材
  activeBookId: string | null;

  // 🏆 v10：本地模擬聯賽（確定性影子同學，純單機）
  /** 每臺裝置一次性生成的穩定隨機串——聯賽 seed 的一部分（"" = 尚未生成） */
  leagueSalt: string;
  /** 當前段位 */
  leagueTier: LeagueTierId;
  /** 當前參賽周（本週週一 YYYY-MM-DD；"" = 尚未入場） */
  leagueWeekKey: string;
  /** 待展示的上週結算幕（LeagueWatcher 消費後清空） */
  pendingLeagueResult: PendingLeagueResult | null;

  // 🚩 v11：題目報錯（本地列表，不上傳）
  reports: QuestionReport[];

  // actions
  setSelectedGrade: (grade: number | null) => void;
  /** 設定首頁當前教材（null = 未選擇，回到選書流程） */
  setActiveBookId: (bookId: string | null) => void;
  /**
   * 通關記賬（原子）：XP/寶石/星級/連勝推進/里程碑/每日任務計數一次完成，
   * 返回結算單 LessonOutcome 供結算頁展示。
   */
  recordLessonComplete: (lessonId: string, lessonTitle: string, accuracy: number, xpGained: number, evidence?: { questionCount: number; numberSense?: NumberPracticeEvidence }) => LessonOutcome;
  /**
   * 完成一篇閱讀（課文聽讀/跟讀/故事）：冪等，首次才發 XP，不發通關寶石、不寫課程記錄。
   * id 請傳 `readingId(kind, rawId)`；傳歷史格式也不會記錯賬（內部會歸一化）。
   */
  completeReading: (id: string, xp: number) => void;
  recordNumberSenseReview: (results: { skill: NumberSkill; correct: number; total: number }[]) => boolean;
  /** 某篇閱讀是否已完成（內部按規範 id 查表，呼叫方不用關心 key 格式） */
  isReadingDone: (kind: ReadingKind, rawId: string) => boolean;
  addMistake: (lessonId: string, lessonTitle: string, question: Question) => void;
  removeMistake: (lessonId: string, questionId: number) => void;
  clearMistakesForLesson: (lessonId: string) => void;
  bumpStreakIfNeeded: () => void;
  toggleMute: () => void;
  toggleAutoNarrate: () => void;

  loseHeart: () => void;
  refreshHearts: () => void;
  refillHeartsFull: () => void; // 除錯/管理用
  /**
   * 補回 n 顆紅心（預設 1）：先結算自然回覆再封頂 MAX_HEARTS，滿心清計時。
   * 對齊 iOS ProgressStore.addHeart。
   */
  addHeart: (n?: number) => void;
  /**
   * 複習一輪錯題後的補心結算（Web按可用題數調整門檻）：
   * 首答正確達五題（可用題不足五題則需整輪正確）補 REVIEW_HEART_REWARD 顆，
   * 每天最多一次（lastReviewHeartDate 賬本，防止刷同一批錯題無限刷心）。
   * 返回實際補到的紅心數（0 = 沒到門檻 / 今天領過 / 已滿心）。
   */
  awardReviewHeart: (correctCount: number, availableCount?: number) => number;
  /** 花 350 寶石立即補滿紅心（先重新整理自然回覆；已滿不扣費返回 false） */
  buyHeartRefill: () => boolean;
  /** 花 200 寶石購買一枚連勝護盾（持有上限 2，滿則返回 false） */
  buyStreakFreeze: () => boolean;
  setDailyGoal: (goal: number) => void;

  /** 更新/寫入當前進行中的課程會話 */
  upsertLessonSession: (session: ActiveLessonSession) => void;
  /** 清除進行中的會話（通關/退出/失敗時呼叫） */
  clearLessonSession: () => void;

  // 💎 寶石 / 寶箱 / 首次完美
  addGems: (n: number) => void;
  /** 花費寶石，成功返回 true，不夠返回 false */
  spendGems: (n: number) => boolean;
  /** 標記某課為已首次完美通關（冪等），返回 true 表示是首次 */
  markPerfected: (lessonId: string) => boolean;
  /** 領取寶箱（冪等），返回 true 表示是首次領取 */
  claimChest: (chestId: string) => boolean;

  // 🎨 美妝系統 actions
  /** 擁有 cosmetic（不扣 gems，比如初始贈送 / 任務獎勵） */
  unlockCosmetic: (id: string) => void;
  /** 購買 cosmetic：扣 gems → 加入 owned → 自動裝備。失敗返回 false（gems 不夠 / 已擁有 / 道具不存在） */
  purchaseCosmetic: (id: string) => { ok: boolean; reason?: string };
  /** 切換裝備（必須已擁有） */
  equipCosmetic: (id: string) => boolean;

  // ⏱️ 時間關懷 actions
  setDailyTimeLimit: (ms: number) => void;
  setSessionTimeLimit: (ms: number) => void;
  /** 課程過程中按秒累加學習時間 */
  addLearningTimeMs: (ms: number) => void;

  // 🔁 連勝補卡：花 50 gems 找回昨天的 streak（不讓小朋友因為漏了一天就清零）
  makeUpYesterdayStreak: () => boolean;

  /**
   * 領取今日登陸獎勵。數額按「有效連勝」折算（斷籤未救回按 0 檔）。
   * 返回 { gems, effectiveStreak }；已領過返回 gems=0。
   */
  claimDailyReward: () => { gems: number; effectiveStreak: number };

  /** 按成就賬本發放一枚成就的解鎖獎勵（冪等），返回發放的寶石數；已在賬本返回 0 */
  claimAchievement: (id: string) => number;
  /** 里程碑慶祝已展示，清除 pending 標記 */
  clearPendingStreakMilestone: () => void;

  // 📚 SRS：複習答題後的更新（core reviewSrsEntry 單一事實源）。
  // 返回 true 表示本次複習讓該題「新畢業」（box3 + 答對≥2），供 UI 慶祝。
  reviewMistake: (lessonId: string, questionId: number, isCorrect: boolean) => boolean;
  refreshMistakeContent: (lessons: Map<string, Lesson | null>) => void;

  /**
   * 複習會話結算：每答對一題 +5 XP（走統一記賬，含每日目標判定與
   * 達標 +20 寶石），dailyReviews += reviewedCount，推進連勝。
   * 對齊 iOS ProgressStore.awardReviewXP。返回本次入賬的 XP。
   */
  awardReviewXP: (correctCount: number, reviewedCount: number) => number;

  // 🗓️ 每日任務
  /** 今天的三條任務（core dailyQuests，確定性，與 iOS 同日同任務） */
  todayQuests: () => Quest[];
  /** 某類任務今天的進度值（earnXP 用今日 XP，其餘用 daily 計數） */
  questProgress: (kind: QuestKind) => number;
  /**
   * 領取一條已完成任務的寶石：按 "今天:questId" 記賬防重複。
   * 實發數額以任務池為準（reward 入參僅為呼叫方便/介面對齊）。
   * 返回 true = 領取成功。
   */
  claimQuest: (questId: string, reward: number) => boolean;
  /** 已完成且未領取的任務數（首頁紅點/角標用） */
  claimableQuestCount: () => number;

  // ⏱️ 時間關懷 selectors
  /** 今天已學習的毫秒數（跨日自動歸零口徑） */
  todayLearningTimeMs: () => number;
  /** 是否已達到家長設定的每日時長上限（未設定上限恆為 false） */
  dailyTimeLimitReached: () => boolean;

  // 🏆 聯賽
  /** 聯賽是否已解鎖（累計完成 ≥ 10 節課） */
  leagueUnlocked: () => boolean;
  /**
   * 開啟 app 時的聯賽例行檢查：
   *   - 首次呼叫生成 leagueSalt（一次性，之後穩定不變）；
   *   - 首次入場把 leagueWeekKey 設為本週（不結算）；
   *   - 發現跨周 → 按 core settleRank 結算上週終值名次：發寶石、
   *     晉降段位、寫 pendingLeagueResult 供 UI 彈結算幕。
   */
  settleLeagueIfNeeded: () => void;
  /** 結算幕已展示，清除 pending 標記 */
  clearPendingLeagueResult: () => void;

  // ⚡ 跳級（jump ahead）
  /**
   * 跳級測試透過後的批次補標：把傳入課程裡尚未完成的批次標記為
   * completed{stars:1, accuracy:0.8}（防刷：不發 XP / 寶石 / 連勝 / 任務計數）。
   * 已完成的課程保持原成績不動。返回本次新標記的課程數。
   */
  jumpAheadComplete: (lessonIds: string[]) => number;

  // 💾 存檔備份（BackupEnvelope v1，雙端互通）
  /** 匯出當前進度為中立信封（core buildBackup，platform="web"） */
  exportBackup: () => BackupEnvelope;
  /**
   * 匯入一個已經過 core validateBackup 規整的信封：覆蓋當前進度。
   * 紅心計時 / 進行中課程 / 每日任務計數等瞬態全部復位。
   */
  importBackup: (envelope: BackupEnvelope) => void;

  // 🚩 題目報錯
  /** 寫入一條本地報錯記錄（列表封頂 200 條，超出丟最舊） */
  addReport: (input: Omit<QuestionReport, "id" | "createdAt">) => void;
}

/** 每多少課出現一個寶箱節點（真值在 @cstf/core/chestLogic 中，這裡 re-export 保持向後相容） */
export { CHEST_EVERY_N_LESSONS } from "@cstf/core/chestLogic";

// ============================================================
// 常量 —— 全部來自 @cstf/core/economy（經濟單一事實源），這裡只 re-export
// ============================================================

export {
  MAX_HEARTS,
  MAX_FREEZES,
  FREEZE_COST,
  HEART_REFILL_COST,
  STREAK_MILESTONE_REWARDS,
  STREAK_MAKEUP_COST,
  FIRST_PERFECT_XP_BONUS,
  DAILY_GOAL_OPTIONS,
  DEFAULT_DAILY_GOAL,
  dailyRewardForStreak,
  isWeekendXpActive as isWeekendBonusActive,
  REVIEW_HEART_REWARD,
  REVIEW_HEART_MIN_CORRECT,
};

/**
 * 閱讀完成 id 的單一事實源（@cstf/core/reading）。
 * UI 呼叫點（PassageReader / StoryReaderClient / StoryCard）統一用它拼 key：
 *   readingId("listen" | "followup", passage.id) / readingId("story", story.id)
 */
export { readingId, type ReadingKind };

/** 一顆紅心的回覆時長（ms），由 core HEART_REGEN_SECONDS 折算 */
export const HEART_RECHARGE_MS = HEART_REGEN_SECONDS * 1000;

// ============================================================
// 工具函式
// ============================================================

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysBetween(a: string, b: string): number {
  if (!a || !b) return Infinity;
  const da = new Date(a);
  const db = new Date(b);
  return Math.round((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24));
}

/** 當前是否為週一（用於連勝護盾補給） */
function isMonday(): boolean {
  return new Date().getDay() === 1;
}

/** 保留最近 60 天的歷史，防止 localStorage 持續膨脹 */
function pruneHistory<T>(history: Record<string, T>): Record<string, T> {
  const keys = Object.keys(history).sort();
  if (keys.length <= 60) return history;
  const kept = keys.slice(-60);
  const out: Record<string, T> = {};
  for (const k of kept) out[k] = history[k];
  return out;
}

/**
 * 一次 XP 入賬的通用記賬：xp / todayXp / xpHistory 累加 + 每日目標首次達成的 +20 gems 判定。
 * recordLessonComplete 與 completeReading 共用，避免兩份手抄的記賬邏輯漂移。
 */
function applyXpGain(
  state: ProgressState,
  xpGained: number,
  today: string,
): {
  xp: number;
  todayXp: number;
  xpHistory: Record<string, number>;
  /** 首次跨過 dailyGoal 閾值的一次性獎勵（未達成為 0） */
  goalBonusGems: number;
} {
  const isSameDay = state.lastXpDate === today;
  const prevTodayXp = isSameDay ? state.todayXp : 0;
  const newTodayXp = prevTodayXp + xpGained;
  const newXpHistory = pruneHistory({
    ...state.xpHistory,
    [today]: (state.xpHistory[today] ?? 0) + xpGained,
  });
  let goalBonusGems = 0;
  if (
    prevTodayXp < state.dailyGoal &&
    newTodayXp >= state.dailyGoal &&
    state.dailyGoal > 0
  ) {
    goalBonusGems = DAILY_GOAL_BONUS;
  }
  return {
    xp: state.xp + xpGained,
    todayXp: newTodayXp,
    xpHistory: newXpHistory,
    goalBonusGems,
  };
}

/**
 * 有效連勝（展示/結算口徑）：
 * gap ≤ 1 或漏掉的天數能被護盾兜住 → 連勝仍有效；否則視為 0（已斷籤）。
 */
function effectiveStreakOf(
  streak: number,
  lastActiveDate: string,
  streakFreezes: number,
): number {
  if (streak <= 0 || !lastActiveDate) return 0;
  const gap = daysBetween(lastActiveDate, todayStr());
  const alive = gap <= 1 || gap - 1 <= streakFreezes;
  return alive ? streak : 0;
}

/**
 * rollQuestDayIfNeeded 的純函式核心：跨日時把每日任務計數清零。
 * 返回需要合併進 set() 的補丁（同日返回空物件），保證與本次埋點在
 * 同一個 set 裡原子生效。
 */
function questDayRollover(
  state: Pick<ProgressState, "dailyQuestDate" | "dailyLessons" | "dailyReviews" | "dailyReadings">,
  today: string,
): Partial<Pick<ProgressState, "dailyQuestDate" | "dailyLessons" | "dailyReviews" | "dailyReadings">> {
  if (state.dailyQuestDate === today) return {};
  return { dailyQuestDate: today, dailyLessons: 0, dailyReviews: 0, dailyReadings: 0 };
}

/** 複習錯題：每答對一題的 XP（與 iOS MistakeReviewRunnerView.xpPerCorrect 一致） */
export const REVIEW_XP_PER_CORRECT = 5;

// ============================================================
// 🏆 聯賽工具
// ============================================================

/** 生成一次性的 leagueSalt（16 位元組隨機 hex；無 crypto 時退化到 Math.random） */
function generateLeagueSalt(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
    }
  } catch {
    /* 走兜底 */
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}-${Math.random().toString(16).slice(2, 10)}`;
}

/**
 * 某一週（weekKey = 週一 YYYY-MM-DD）的使用者周 XP：
 * xpHistory 該周 7 天求和。歷史保留天數不足一週時按可得資料盡力求和。
 */
export function weekXpFromHistory(
  xpHistory: Record<string, number>,
  weekKey: string,
): number {
  const [y, m, d] = weekKey.split("-").map(Number);
  if (!y || !m || !d) return 0;
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    const day = new Date(y, m - 1, d + i);
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    sum += xpHistory[key] ?? 0;
  }
  return sum;
}

// ============================================================
// Store
// ============================================================

export const useProgressStore = create<ProgressState>()(
  persist(
    (set, get) => ({
      xp: 0,
      streak: 0,
      lastActiveDate: "",
      completedLessons: {},
      mistakesBank: [],
      muted: false,
      autoNarrate: true,

      hearts: MAX_HEARTS,
      nextHeartAt: null,
      lastReviewHeartDate: "",

      dailyGoal: DEFAULT_DAILY_GOAL,
      todayXp: 0,
      lastXpDate: "",

      streakFreezes: INITIAL_FREEZES,
      // 新裝的 app 一開始就拿到 INITIAL_FREEZES，不需要再被"補發"一次
      freezesMigrated: true,

      activeLesson: null,

      gems: 0,
      lifetimeGems: 0,
      claimedChests: {},
      perfectedLessons: {},

      // 美妝系統初值（首次啟動 = 僅持有 starter 道具）
      ownedCosmetics: Object.fromEntries(
        getStarterCosmetics().map(c => [c.id, true as const]),
      ),
      equippedMascotSkin: DEFAULT_EQUIPPED.mascotSkin,
      equippedTheme: DEFAULT_EQUIPPED.uiTheme,
      equippedBackdrop: DEFAULT_EQUIPPED.lessonBackdrop,
      claimedStreakRewards: {},

      // 時間關懷（預設全部關閉，家長在 profile 裡手動開）
      todayTimeMs: 0,
      dailyTimeLimitMs: 0,
      sessionTimeLimitMs: 0,

      // v5
      xpHistory: {},
      lessonHistory: {},
      studyDays: {},
      numberSenseProgress: {},
      lastDailyRewardDate: "",

      // v6
      selectedGrade: null,
      setSelectedGrade: grade => set({ selectedGrade: grade }),

      // v7
      completedReadings: {},

      // v8
      unlockedAchievements: {},
      pendingStreakMilestone: null,

      // v9：每日任務計數 + 時長獨立換日 + 首頁教材
      dailyQuestDate: "",
      dailyLessons: 0,
      dailyReviews: 0,
      dailyReadings: 0,
      claimedQuests: {},
      lastTimeDate: "",
      activeBookId: null,
      setActiveBookId: bookId => set({ activeBookId: bookId }),

      // v10：本地模擬聯賽
      leagueSalt: "",
      leagueTier: "bronze",
      leagueWeekKey: "",
      pendingLeagueResult: null,

      // v11：題目報錯
      reports: [],

      leagueUnlocked: () =>
        Object.keys(get().completedLessons).length >= UNLOCK_LESSONS,

      settleLeagueIfNeeded: () => {
        // salt 一次性生成（首次呼叫；此後終生穩定，保證聯賽確定性）
        if (!get().leagueSalt) {
          set({ leagueSalt: generateLeagueSalt() });
        }
        const state = get();
        const currentWeek = weekKeyFor();

        // 首次入場：記錄本週週鍵，不結算
        if (state.leagueWeekKey === "") {
          set({ leagueWeekKey: currentWeek });
          return;
        }
        // 同一周：無事發生
        if (state.leagueWeekKey === currentWeek) return;

        const prevWeekKey = state.leagueWeekKey;

        // 未解鎖（<10 課）期間不真正參賽：靜默滾動周鍵
        if (!state.leagueUnlocked()) {
          set({ leagueWeekKey: currentWeek });
          return;
        }

        // === 按上週末終值結算 ===
        // bot 終值 = 周目標全額（過周後 botXpAt 收斂到 botWeeklyGoal）
        const tier = state.leagueTier;
        const salt = state.leagueSalt || get().leagueSalt;
        const botXps: number[] = [];
        for (let i = 0; i < LEAGUE_BOT_COUNT; i++) {
          botXps.push(
            botWeeklyGoal({ weekKey: prevWeekKey, tier, salt, botIndex: i }),
          );
        }
        // 使用者終值 = 上週 xpHistory 求和（保留天數不足按可得資料盡力）
        const userXp = weekXpFromHistory(state.xpHistory, prevWeekKey);
        const rank = userRank({ userXp, botXps });
        const result = settleRank(rank, tier);
        const tierAfter: LeagueTierId = result.promoted
          ? nextTierId(tier)
          : result.demoted
            ? prevTierId(tier)
            : tier;

        set(s => ({
          leagueWeekKey: currentWeek,
          leagueTier: tierAfter,
          gems: s.gems + result.gems,
          lifetimeGems: s.lifetimeGems + result.gems,
          pendingLeagueResult: {
            weekKey: prevWeekKey,
            rank,
            tierBefore: tier,
            tierAfter,
            promoted: result.promoted,
            demoted: result.demoted,
            gems: result.gems,
          },
        }));
      },

      clearPendingLeagueResult: () => {
        set({ pendingLeagueResult: null });
      },

      // --------------------------------------------------------
      // ⚡ 跳級（jump ahead）
      // --------------------------------------------------------

      jumpAheadComplete: lessonIds => {
        // 跳級口徑（E2 拍板）：批次 completed{stars:1, accuracy:0.8}，
        // 不發 XP / 寶石 / 連勝 / 每日任務計數（防刷）；已完成的不動。
        const now = new Date().toISOString();
        let added = 0;
        set(state => {
          const completedLessons = { ...state.completedLessons };
          for (const id of lessonIds) {
            if (completedLessons[id]) continue;
            completedLessons[id] = {
              lessonId: id,
              stars: 1,
              accuracy: 0.8,
              completedAt: now,
            };
            added += 1;
          }
          return added > 0 ? { completedLessons } : {};
        });
        return added;
      },

      // --------------------------------------------------------
      // 💾 存檔備份（BackupEnvelope v1）
      // --------------------------------------------------------

      exportBackup: () => {
        const s = get();
        // Record<number,true> → JSON 鍵天然是字串，這裡顯式轉一遍
        const claimedStreakRewards: Record<string, true> = {};
        for (const k of Object.keys(s.claimedStreakRewards)) {
          claimedStreakRewards[String(k)] = true;
        }
        const completedLessons: Record<string, BackupLessonResult> = {};
        for (const [id, r] of Object.entries(s.completedLessons)) {
          completedLessons[id] = {
            stars: r.stars,
            accuracy: r.accuracy,
            completedAt: r.completedAt,
          };
        }
        const mistakesBank: BackupMistake[] = s.mistakesBank.map(m => ({
          lessonId: m.lessonId,
          questionId: m.question.id,
          box: m.box,
          correctCount: m.correctCount,
          nextReviewDate: m.nextReviewDate,
          graduated: m.graduated,
          // 題面快照：跨端匯入時可直接展示（iOS 題庫齊全時會忽略）
          question: m.question,
        }));
        // 🏆 成就兩個欄位語義不同，如實分別匯出：
        //   unlockedAchievements = 「已達成」= 實時判定 ∪ 賬本（賬本只進不出，
        //     所以並集才是真實的已達成集）；
        //   claimedAchievements  = 「已領取（已發過寶石）」= web 的 unlockedAchievements 賬本。
        // web 上 AchievementWatcher 會在解鎖的同一瞬間發錢，所以兩者通常相等；
        // 相等時對端（iOS）算出的「已解鎖未領取」差集為空，不會重複發獎，語義依然正確。
        let unlockedForBackup: Record<string, true> = { ...s.unlockedAchievements };
        try {
          for (const id of computeUnlockedAchievementIds(s)) {
            unlockedForBackup[id] = true;
          }
        } catch {
          // 快照欄位異常時保守回退到賬本本身（寧可少報"已達成"，也不謊報）
          unlockedForBackup = { ...s.unlockedAchievements };
        }
        return buildBackup({
          platform: "web",
          data: {
            xp: s.xp,
            streak: s.streak,
            lastActiveDate: s.lastActiveDate,
            streakFreezes: s.streakFreezes,
            gems: s.gems,
            lifetimeGems: s.lifetimeGems,
            hearts: s.hearts,
            dailyGoal: s.dailyGoal,
            completedLessons,
            completedReadings: s.completedReadings,
            perfectedLessons: s.perfectedLessons,
            mistakesBank,
            claimedChests: s.claimedChests,
            claimedStreakRewards,
            // 每日任務領取賬本必須隨檔走：不帶的話匯入端把它當瞬態清空，
            // 又從 xpHistory 復原了今日 XP，今天領過的任務立刻回到"可領取"，
            // 「匯出→匯入」就能無限刷寶石。
            claimedQuests: s.claimedQuests,
            lastDailyRewardDate: s.lastDailyRewardDate,
            unlockedAchievements: unlockedForBackup,
            claimedAchievements: s.unlockedAchievements,
            ownedCosmetics: s.ownedCosmetics,
            equipped: {
              mascotSkin: s.equippedMascotSkin,
              uiTheme: s.equippedTheme,
              lessonBackdrop: s.equippedBackdrop,
            },
            xpHistory: s.xpHistory,
            studyDays: s.studyDays,
            lessonHistory: s.lessonHistory,
            numberSenseProgress: s.numberSenseProgress,
            leagueTier: s.leagueTier,
            leagueWeekKey: s.leagueWeekKey || undefined,
          },
        });
      },

      importBackup: envelope => {
        saveReviewSession(null);
        try { learnerSessionStorage.removeItem("csf-number-check-v1"); } catch { /* storage may be unavailable */ }
        const d = envelope.data;
        const today = todayStr();

        const completedLessons: Record<string, LessonResult> = {};
        for (const [id, r] of Object.entries(d.completedLessons)) {
          completedLessons[id] = {
            lessonId: id,
            stars: r.stars,
            accuracy: r.accuracy,
            completedAt: r.completedAt || new Date().toISOString(),
          };
        }

        // Legacy/cross-client backups may omit the snapshot. Keep its identity and
        // schedule; the review loader resolves current content before any grading.
        const mistakesBank: MistakeEntry[] = [];
        for (const m of d.mistakesBank) {
          mistakesBank.push({
            lessonId: m.lessonId,
            question: m.question ? {...m.question,id:m.questionId} : {
              id:m.questionId,type:"choice",question:"進入複習後同步這道舊題",answer:"",options:[],
              explanation:"",knowledge_point:"",score:1,difficulty:1,
            },
            addedAt: new Date().toISOString(),
            box: m.box ?? 1,
            correctCount: m.correctCount ?? 0,
            nextReviewDate: m.nextReviewDate ?? today,
            graduated: m.graduated ?? false,
          });
        }

        const claimedStreakRewards: Record<number, true> = {};
        for (const k of Object.keys(d.claimedStreakRewards)) {
          const n = Number(k);
          if (Number.isFinite(n) && n > 0) claimedStreakRewards[n] = true;
        }

        // 🏆 web 的 unlockedAchievements 是「已發錢賬本」（進賬本 = 寶石已到手）。
        // 所以匯入時只能吸收對端的**已領取**集：iOS 上「已解鎖但還沒領」的成就
        // 不進賬本，匯入後 AchievementWatcher 重算時會把它當新解鎖正常補發寶石。
        // 若對端根本沒有 claimedAchievements 欄位，說明是"解鎖即發錢"語義的老檔，
        // 這時才回退用 unlockedAchievements（否則會把老檔的獎勵重複發一遍）。
        const unlockedAchievements: Record<string, true> = {
          ...(d.claimedAchievements ?? d.unlockedAchievements),
        };

        // 🗓️ 每日任務領取賬本：key 是 "YYYY-MM-DD:questId"，只有**今天**的鍵
        // 還會被 claimQuest / claimableQuestCount 查到（更早的日期永遠查不到，
        // 留著只會白佔儲存），所以按今天裁剪後寫回，保證「匯出→匯入」之後
        // 今天已經領過的任務不能再領一次。
        const claimedQuests: Record<string, true> = {};
        for (const k of Object.keys(d.claimedQuests ?? {})) {
          if (k.startsWith(`${today}:`)) claimedQuests[k] = true;
        }

        // ❤️ 紅心：缺心的存檔必須帶著回覆計時進來，否則 refreshHearts 無表可走
        //（自愈守衛也會補種，這裡顯式設定是為了不白白浪費一個回覆週期）。
        const hearts = Math.max(0, Math.min(d.hearts, MAX_HEARTS));
        const nextHeartAt = hearts >= MAX_HEARTS ? null : Date.now() + HEART_RECHARGE_MS;

        // 裝扮：starter 永遠保底；未知裝扮 id 回退預設（跨版本 / 跨端容錯）
        const ownedCosmetics: Record<string, true> = {
          ...Object.fromEntries(getStarterCosmetics().map(c => [c.id, true as const])),
          ...d.ownedCosmetics,
        };
        const safeEquip = (id: string, fallback: string) =>
          getCosmeticById(id) ? id : fallback;

        // 聯賽段位：未知段位降級 bronze；leagueSalt 保留本機值（裝置指紋）
        const leagueTier: LeagueTierId = LEAGUE_TIERS.some(t => t.id === d.leagueTier)
          ? (d.leagueTier as LeagueTierId)
          : "bronze";

        set({
          xp: d.xp,
          streak: d.streak,
          lastActiveDate: d.lastActiveDate,
          streakFreezes: Math.min(d.streakFreezes, 99),
          gems: d.gems,
          lifetimeGems: d.lifetimeGems,
          hearts,
          nextHeartAt,
          dailyGoal: Math.max(10, Math.min(500, d.dailyGoal || DEFAULT_DAILY_GOAL)),
          completedLessons,
          // 閱讀 key 歸一化（core validateBackup 已經歸一過，這裡冪等兜底，
          // 防止呼叫方繞過校驗直接塞信封）
          completedReadings: normalizeReadingMap(d.completedReadings),
          perfectedLessons: d.perfectedLessons ?? {},
          mistakesBank,
          claimedChests: d.claimedChests,
          claimedStreakRewards,
          lastDailyRewardDate: d.lastDailyRewardDate,
          unlockedAchievements,
          ownedCosmetics,
          equippedMascotSkin: safeEquip(d.equipped.mascotSkin, DEFAULT_EQUIPPED.mascotSkin),
          equippedTheme: safeEquip(d.equipped.uiTheme, DEFAULT_EQUIPPED.uiTheme),
          equippedBackdrop: safeEquip(d.equipped.lessonBackdrop, DEFAULT_EQUIPPED.lessonBackdrop),
          xpHistory: d.xpHistory,
          studyDays: d.studyDays ?? {},
          numberSenseProgress: normalizeNumberProgress(d.numberSenseProgress),
          // 今日 XP 從 xpHistory 復原（跨端同日互導也不丟當日目標進度）
          todayXp: d.xpHistory[today] ?? 0,
          lastXpDate: d.xpHistory[today] !== undefined ? today : "",
          leagueTier,
          leagueWeekKey: d.leagueWeekKey ?? "",
          // === 瞬態全部復位（不隨存檔遷移）===
          activeLesson: null,
          pendingStreakMilestone: null,
          pendingLeagueResult: null,
          lessonHistory: d.lessonHistory ?? {},
          dailyQuestDate: "",
          dailyLessons: 0,
          dailyReviews: 0,
          dailyReadings: 0,
          todayTimeMs: 0,
          lastTimeDate: "",
          // ⚠️ 不是瞬態、也不進信封：
          //   claimedQuests —— 見上，按今天裁剪後隨檔恢復（防重複領任務寶石）；
          //   lastReviewHeartDate —— 故意不寫（保持本機當前值），
          //     否則「匯出→匯入」就能清掉補心賬本，每天刷無數顆紅心；
          //   freezesMigrated —— 保持本機 true，匯入不該觸發護盾補發。
          claimedQuests,
        });
      },

      // --------------------------------------------------------
      // 🚩 題目報錯（本地列表，不上傳）
      // --------------------------------------------------------

      addReport: input => {
        const report: QuestionReport = {
          id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          createdAt: new Date().toISOString(),
          ...input,
        };
        set(state => ({
          reports: [...state.reports, report].slice(-200),
        }));
      },

      recordLessonComplete: (lessonId, lessonTitle, accuracy, xpGained, evidence) => {
        // ⚠️ XP 公式（含週末 ×2）由呼叫方經 @cstf/core xpForLesson 算好傳入，
        //    這裡不再二次翻倍 —— 保證「結算展示值 == 入賬值」。
        // 整個通關記賬（XP/寶石/連勝/里程碑/每日任務計數）在一個 set 裡
        // 原子完成，返回結算單 —— 對齊 iOS ProgressStore.completeLesson。
        const stars = evidence && evidence.questionCount < 3 ? 1 : starsFromAccuracy(accuracy);
        const today = todayStr();

        let outcome: LessonOutcome = {
          xpGained,
          gemsGained: 0,
          stars,
          streakBefore: 0,
          streakAfter: 0,
          streakIncreased: false,
          dailyGoalReachedNow: false,
          milestoneGems: 0,
          isFirstPerfect: false,
        };

        set(state => {
          const isFirstPerfect = stars === 3 && !state.perfectedLessons[lessonId];

          // 每日任務計數：跨日清零 + 今日課程數 +1
          const roll = questDayRollover(state, today);
          const dailyLessons = (roll.dailyLessons ?? state.dailyLessons) + 1;

          // XP / todayXp / xpHistory 記賬 + 每日目標首次達成判定
          const xpAccount = applyXpGain(state, xpGained, today);
          const newLessonHistory = pruneHistory({
            ...state.lessonHistory,
            [today]: (state.lessonHistory[today] ?? 0) + 1,
          });
          // 💎 每課寶石 drip —— 單一事實源 @cstf/core lessonGemDrip
          //（含每日目標 +20，不再疊加 goalBonusGems）
          const dripGems = lessonGemDrip({
            stars,
            isFirstPerfect,
            crossedDailyGoal: xpAccount.goalBonusGems > 0,
          });

          // === 🔥 連勝推進（core advanceStreak，含護盾消耗與週一補給）===
          const streakBefore = state.streak;
          let streakAfter = streakBefore;
          let streakFreezes = state.streakFreezes;
          const isNewDay = state.lastActiveDate !== today;
          if (isNewDay) {
            if (state.lastActiveDate === "") {
              streakAfter = 1;
            } else {
              const adv = advanceStreak({
                streak: state.streak,
                freezes: state.streakFreezes,
                gapDays: daysBetween(state.lastActiveDate, today),
                isMonday: isMonday(),
              });
              streakAfter = adv.streak;
              streakFreezes = adv.freezes;
            }
          }

          // === 💎 連勝里程碑：3/7/14/30/60/100（每檔一次，賬本防重發）===
          let milestoneGems = 0;
          let claimedStreakRewards = state.claimedStreakRewards;
          let pendingStreakMilestone = state.pendingStreakMilestone;
          const milestone = STREAK_MILESTONE_REWARDS[streakAfter];
          if (isNewDay && milestone && !state.claimedStreakRewards[streakAfter]) {
            milestoneGems = milestone;
            claimedStreakRewards = { ...state.claimedStreakRewards, [streakAfter]: true };
            // 留給 DailyRewardWatcher 彈「連續 N 天！+M💎」慶祝
            pendingStreakMilestone = { streak: streakAfter, gems: milestone };
          }

          // === 只保留最好成績：重玩得低星不回退（對齊 iOS ProgressStore）===
          // 僅當新星級 >= 舊星級時才覆蓋；accuracy 取更優，completedAt 用最新
          const prior = state.completedLessons[lessonId];
          const result: LessonResult =
            prior && stars < prior.stars
              ? prior
              : {
                  lessonId,
                  stars,
                  accuracy: Math.max(accuracy, prior?.accuracy ?? 0),
                  completedAt: new Date().toISOString(),
                };

          const totalGems = dripGems + milestoneGems;

          outcome = {
            xpGained,
            gemsGained: dripGems,
            stars,
            streakBefore,
            streakAfter,
            streakIncreased: streakAfter > streakBefore,
            dailyGoalReachedNow: xpAccount.goalBonusGems > 0,
            milestoneGems,
            isFirstPerfect,
          };

          return {
            ...roll,
            dailyLessons,
            xp: xpAccount.xp,
            completedLessons: { ...state.completedLessons, [lessonId]: result },
            todayXp: xpAccount.todayXp,
            lastXpDate: today,
            gems: state.gems + totalGems,
            lifetimeGems: state.lifetimeGems + totalGems,
            xpHistory: xpAccount.xpHistory,
            lessonHistory: newLessonHistory,
            numberSenseProgress: evidence?.numberSense && numberSkillForLesson(lessonId)
              ? recordNumberPractice(state.numberSenseProgress, numberSkillForLesson(lessonId)!, evidence.numberSense, today)
              : state.numberSenseProgress,
            studyDays: pruneHistory({ ...state.studyDays, [today]: true as const }),
            streak: streakAfter,
            lastActiveDate: today,
            streakFreezes,
            claimedStreakRewards,
            pendingStreakMilestone,
            perfectedLessons: outcome.isFirstPerfect
              ? { ...state.perfectedLessons, [lessonId]: true as const }
              : state.perfectedLessons,
          };
        });

        // 通關後：如當前課程的錯題都已掌握（使用者透過），自動移除該課的錯題
        // 保守起見：準確率 100% 才清理，否則保留待複習
        if (accuracy >= 0.999) {
          get().clearMistakesForLesson(lessonId);
        }
        // 記錄 lessonTitle 到最近結果（未使用但便於未來）
        void lessonTitle;
        return outcome;
      },

      // 📖 閱讀完成（課文聽讀/跟讀、故事）——對齊 iOS completeReading：
      // 純 XP，不發通關寶石、不寫 completedLessons/lessonHistory，重複完成不再獎勵
      completeReading: (id, xp) => {
        // key 一律歸一化成 core 的規範閱讀 id：即使某個呼叫點還在傳歷史格式
        // （`passage-x-listen` / `story-x` / 裸 id），也不會在表裡另開一個鍵
        // 導致重複發 XP、或與匯入的存檔對不上。normalizeReadingId 冪等。
        const key = normalizeReadingId(id);
        if (key === "") return; // 認不出來的殘缺 id：不記賬，避免汙染 key 空間
        // 冪等判斷只看**鍵是否存在**，與 isReadingDone / UI 同一口徑。
        // 不能寫成 `if (map[key])`：值是完成日期，老檔（或另一端匯出的檔）裡
        // 可能是空串，真值判斷會把"讀過但日期不詳"誤判成沒讀過 → 每次進來都能再領一次 XP。
        if (get().completedReadings[key] != null) return; // 已完成過，冪等
        const today = todayStr();
        set(state => {
          const roll = questDayRollover(state, today);
          const dailyReadings = (roll.dailyReadings ?? state.dailyReadings) + 1;
          const xpAccount = applyXpGain(state, xp, today);
          return {
            ...roll,
            dailyReadings,
            studyDays: pruneHistory({ ...state.studyDays, [today]: true as const }),
            xp: xpAccount.xp,
            todayXp: xpAccount.todayXp,
            lastXpDate: today,
            xpHistory: xpAccount.xpHistory,
            gems: state.gems + xpAccount.goalBonusGems,
            lifetimeGems: state.lifetimeGems + xpAccount.goalBonusGems,
            completedReadings: {
              ...state.completedReadings,
              [key]: new Date().toISOString(),
            },
          };
        });
        get().bumpStreakIfNeeded();
      },

      recordNumberSenseReview: results => {
        const today = todayStr();
        const due = dueNumberSkills(get().numberSenseProgress, today);
        const eligible = results.filter((r, index) => due.includes(r.skill) && results.findIndex(other => other.skill === r.skill) === index && r.total === 2 && Number.isInteger(r.correct) && r.correct >= 0 && r.correct <= r.total);
        if (!eligible.length) return false;
        set(state => {
          const xp = applyXpGain(state, eligible.reduce((n, r) => n + r.correct * REVIEW_XP_PER_CORRECT, 0), today);
          return { numberSenseProgress: recordNumberReview(state.numberSenseProgress, eligible, today),
            studyDays: pruneHistory({ ...state.studyDays, [today]: true as const }),
            xp: xp.xp, todayXp: xp.todayXp, lastXpDate: today, xpHistory: xp.xpHistory,
            gems: state.gems + xp.goalBonusGems, lifetimeGems: state.lifetimeGems + xp.goalBonusGems };
        });
        get().bumpStreakIfNeeded();
        return true;
      },

      isReadingDone: (kind, rawId) =>
        get().completedReadings[readingId(kind, rawId)] != null,

      addMistake: (lessonId, lessonTitle, question) => {
        const today = todayStr();
        set(state => ({
          mistakesBank: [
            ...state.mistakesBank.filter(
              m => !(m.lessonId === lessonId && m.question.id === question.id),
            ),
            {
              lessonId,
              lessonTitle,
              question,
              addedAt: new Date().toISOString(),
              // SRS 初值：box 1，今天就該複習
              box: 1,
              correctCount: 0,
              nextReviewDate: today,
            },
          ],
        }));
      },

      removeMistake: (lessonId, questionId) => {
        set(state => ({
          mistakesBank: state.mistakesBank.filter(
            m => !(m.lessonId === lessonId && m.question.id === questionId),
          ),
        }));
      },

      clearMistakesForLesson: lessonId => {
        set(state => ({
          mistakesBank: state.mistakesBank.filter(m => m.lessonId !== lessonId),
        }));
      },

      bumpStreakIfNeeded: () => {
        const today = todayStr();
        const { lastActiveDate, streak, streakFreezes } = get();
        if (lastActiveDate === today) return;
        let newStreak = streak;
        if (lastActiveDate === "") {
          newStreak = 1;
          set({ streak: 1, lastActiveDate: today });
        } else {
          const gap = daysBetween(lastActiveDate, today);
          if (gap === 1) {
            // 正常連續
            newStreak = streak + 1;
            const newFreezes =
              isMonday() && streakFreezes < MAX_FREEZES ? streakFreezes + 1 : streakFreezes;
            set({ streak: newStreak, lastActiveDate: today, streakFreezes: newFreezes });
          } else if (gap > 1) {
            const missed = gap - 1;
            if (streakFreezes >= missed) {
              newStreak = streak + 1;
              set({
                streak: newStreak,
                lastActiveDate: today,
                streakFreezes: streakFreezes - missed,
              });
            } else {
              newStreak = 1;
              set({ streak: 1, lastActiveDate: today });
            }
          }
        }

        // === 💎 連勝里程碑獎勵：3/7/14/30/60/100 天（每檔一次） ===
        const reward = STREAK_MILESTONE_REWARDS[newStreak];
        if (reward && !get().claimedStreakRewards[newStreak]) {
          set(state => ({
            gems: state.gems + reward,
            lifetimeGems: state.lifetimeGems + reward,
            claimedStreakRewards: {
              ...state.claimedStreakRewards,
              [newStreak]: true,
            },
            // 留給 DailyRewardWatcher 彈「連續 N 天！+M💎」慶祝
            pendingStreakMilestone: { streak: newStreak, gems: reward },
          }));
        }
      },

      toggleMute: () => {
        set(state => ({ muted: !state.muted }));
      },

      toggleAutoNarrate: () => {
        set(state => ({ autoNarrate: !state.autoNarrate }));
      },

      // --------------------------------------------------------
      // 心數
      // --------------------------------------------------------

      loseHeart: () => {
        const { hearts, nextHeartAt } = get();
        if (hearts <= 0) return;
        const newHearts = hearts - 1;
        // 只有原本是滿心時才開始充能；否則保留已有 nextHeartAt
        const newNext = nextHeartAt ?? Date.now() + HEART_RECHARGE_MS;
        set({ hearts: newHearts, nextHeartAt: newNext });
      },

      refreshHearts: () => {
        let { hearts, nextHeartAt } = get();
        if (hearts >= MAX_HEARTS) {
          // 確保滿心時 nextHeartAt 為空
          if (nextHeartAt !== null) set({ nextHeartAt: null });
          return;
        }
        if (!nextHeartAt) {
          // 🩹 自愈守衛：缺心卻沒有回覆計時 —— 這是個「死狀態」，
          // 因為迴心只發生在這裡（要有表才走），而 loseHeart 在 hearts<=0 時
          // 直接 return 也夠不著補種。任何路徑（匯入存檔、老檔遷移、
          // 手改 localStorage）寫出這個組合，都會讓小朋友的紅心永遠停在 0、
          // 一節課都點不開，重新整理也救不回來。發現即補種一個回覆週期。
          set({ nextHeartAt: Date.now() + HEART_RECHARGE_MS });
          return;
        }
        const now = Date.now();
        let changed = false;
        while (nextHeartAt && now >= nextHeartAt && hearts < MAX_HEARTS) {
          hearts += 1;
          changed = true;
          nextHeartAt = hearts < MAX_HEARTS ? nextHeartAt + HEART_RECHARGE_MS : null;
        }
        if (changed) set({ hearts, nextHeartAt });
      },

      refillHeartsFull: () => {
        set({ hearts: MAX_HEARTS, nextHeartAt: null });
      },

      addHeart: (n = REVIEW_HEART_REWARD) => {
        if (n <= 0) return;
        // 先結算自然回覆，封頂才是按"真實心數"來的（否則會吞掉一次迴心）
        get().refreshHearts();
        const { hearts } = get();
        if (hearts >= MAX_HEARTS) return;
        const next = Math.min(MAX_HEARTS, hearts + n);
        // 補滿了就停表；沒補滿保留原計時（不重置，否則等於懲罰玩家）
        set(state => ({
          hearts: next,
          nextHeartAt: next >= MAX_HEARTS ? null : state.nextHeartAt,
        }));
      },

      awardReviewHeart: (correctCount, availableCount) => {
        const today = todayStr();
        // 每天一次的賬本：不然反覆進出同一批錯題就能把紅心刷成無限
        if (get().lastReviewHeartDate === today) return 0;
        get().refreshHearts();
        const granted = reviewHeartReward(correctCount, get().hearts, availableCount);
        // 沒到門檻 / 已經滿心 → 不記賬本，今天晚點真賺到了還能補
        if (granted <= 0) return 0;
        get().addHeart(granted);
        set({ lastReviewHeartDate: today });
        return granted;
      },

      buyHeartRefill: () => {
        // 先結算自然回覆，避免"已經回滿還扣費"
        get().refreshHearts();
        const { gems, hearts } = get();
        if (hearts >= MAX_HEARTS) return false;
        if (gems < HEART_REFILL_COST) return false;
        set(state => ({
          gems: state.gems - HEART_REFILL_COST,
          hearts: MAX_HEARTS,
          nextHeartAt: null,
        }));
        return true;
      },

      buyStreakFreeze: () => {
        const { gems, streakFreezes } = get();
        if (streakFreezes >= MAX_FREEZES) return false;
        if (gems < FREEZE_COST) return false;
        set(state => ({
          gems: state.gems - FREEZE_COST,
          streakFreezes: state.streakFreezes + 1,
        }));
        return true;
      },

      setDailyGoal: goal => {
        set({ dailyGoal: Math.max(10, Math.min(500, goal)) });
      },

      upsertLessonSession: session => {
        set({ activeLesson: session });
      },

      clearLessonSession: () => {
        set({ activeLesson: null });
      },

      // --------------------------------------------------------
      // 💎 寶石 / 寶箱 / 首次完美
      // --------------------------------------------------------

      addGems: n => {
        if (n <= 0) return;
        set(state => ({
          gems: state.gems + n,
          lifetimeGems: state.lifetimeGems + n,
        }));
      },

      spendGems: n => {
        if (n <= 0) return true;
        const { gems } = get();
        if (gems < n) return false;
        set({ gems: gems - n });
        return true;
      },

      markPerfected: lessonId => {
        const { perfectedLessons } = get();
        if (perfectedLessons[lessonId]) return false;
        set({ perfectedLessons: { ...perfectedLessons, [lessonId]: true } });
        return true;
      },

      claimChest: chestId => {
        const { claimedChests } = get();
        if (claimedChests[chestId]) return false;
        set({ claimedChests: { ...claimedChests, [chestId]: true } });
        return true;
      },

      // --------------------------------------------------------
      // 🎨 美妝系統
      // --------------------------------------------------------

      unlockCosmetic: id => {
        const item = getCosmeticById(id);
        if (!item) return;
        set(state => ({
          ownedCosmetics: { ...state.ownedCosmetics, [id]: true },
        }));
      },

      purchaseCosmetic: id => {
        const item = getCosmeticById(id);
        if (!item) return { ok: false, reason: "找不到這個道具" };
        const { ownedCosmetics, gems } = get();
        if (ownedCosmetics[id]) return { ok: false, reason: "已經擁有了" };
        if (gems < item.cost) return { ok: false, reason: "寶石不夠" };
        set(state => ({
          gems: state.gems - item.cost,
          ownedCosmetics: { ...state.ownedCosmetics, [id]: true },
        }));
        // 自動裝備購買的道具
        get().equipCosmetic(id);
        return { ok: true };
      },

      equipCosmetic: id => {
        const item = getCosmeticById(id);
        if (!item) return false;
        const { ownedCosmetics } = get();
        if (!ownedCosmetics[id]) return false;
        if (item.type === "mascot_skin") set({ equippedMascotSkin: id });
        else if (item.type === "ui_theme") set({ equippedTheme: id });
        else if (item.type === "lesson_backdrop") set({ equippedBackdrop: id });
        return true;
      },

      // --------------------------------------------------------
      // ⏱️ 時間關懷
      // --------------------------------------------------------

      setDailyTimeLimit: ms => {
        set({ dailyTimeLimitMs: Math.max(0, ms) });
      },

      setSessionTimeLimit: ms => {
        set({ sessionTimeLimitMs: Math.max(0, ms) });
      },

      addLearningTimeMs: ms => {
        if (ms <= 0) return;
        // 獨立 lastTimeDate 換日：不再觸碰 lastXpDate（修復「計時把 todayXp
        // 的換日基準汙染」的老 bug）
        const today = todayStr();
        set(state => {
          const prev = state.lastTimeDate === today ? state.todayTimeMs : 0;
          return {
            todayTimeMs: prev + ms,
            lastTimeDate: today,
          };
        });
      },

      todayLearningTimeMs: () => {
        const { lastTimeDate, todayTimeMs } = get();
        return lastTimeDate === todayStr() ? todayTimeMs : 0;
      },

      dailyTimeLimitReached: () => {
        const { dailyTimeLimitMs } = get();
        if (dailyTimeLimitMs <= 0) return false; // 0 = 家長未設上限
        return get().todayLearningTimeMs() >= dailyTimeLimitMs;
      },

      // --------------------------------------------------------
      // 🔁 連勝補卡（消耗 50 gems 找回昨天的 streak）
      // --------------------------------------------------------

      // --------------------------------------------------------
      // 📚 SRS：複習答題後更新錯題狀態
      // --------------------------------------------------------

      refreshMistakeContent: lessons => {
        set(state => ({ mistakesBank: reconcileMistakes(state.mistakesBank, lessons) }));
      },

      reviewMistake: (lessonId, questionId, isCorrect) => {
        // core reviewSrsEntry 單一事實源（box3 答對 → 7 天后），消滅內聯 fork。
        // 畢業語義：box3 + 答對≥2 → 打 graduated 標記（保留展示，不再進 due 佇列）。
        let newlyGraduated = false;
        set(state => ({
          mistakesBank: state.mistakesBank.map(m => {
            if (m.lessonId !== lessonId || m.question.id !== questionId) return m;
            const wasGraduated = m.graduated === true;
            const updated: MistakeEntry = { ...reviewSrsEntry(m, isCorrect) };
            if (!isCorrect) {
              // 防禦性：答錯回爐（畢業條目理論上不會再進佇列）
              updated.graduated = false;
            } else if (isSrsGraduated(updated)) {
              updated.graduated = true;
              if (!wasGraduated) newlyGraduated = true;
            }
            return updated;
          }),
        }));
        return newlyGraduated;
      },

      awardReviewXP: (correctCount, reviewedCount) => {
        // 對齊 iOS ProgressStore.awardReviewXP：0 對也算複習活動（計數+連勝），
        // 但沒有任何複習量時不做事。
        const xpGained = Math.max(0, correctCount) * REVIEW_XP_PER_CORRECT;
        const reviewed = Math.max(0, reviewedCount);
        if (xpGained <= 0 && reviewed <= 0) return 0;
        const today = todayStr();
        set(state => {
          const roll = questDayRollover(state, today);
          const dailyReviews = (roll.dailyReviews ?? state.dailyReviews) + reviewed;
          const xpAccount = applyXpGain(state, xpGained, today);
          return {
            ...roll,
            dailyReviews,
            studyDays: pruneHistory({ ...state.studyDays, [today]: true as const }),
            xp: xpAccount.xp,
            todayXp: xpAccount.todayXp,
            lastXpDate: today,
            xpHistory: xpAccount.xpHistory,
            gems: state.gems + xpAccount.goalBonusGems,
            lifetimeGems: state.lifetimeGems + xpAccount.goalBonusGems,
          };
        });
        get().bumpStreakIfNeeded();
        return xpGained;
      },

      // --------------------------------------------------------
      // 🗓️ 每日任務
      // --------------------------------------------------------

      todayQuests: () => dailyQuests(todayStr()).map(q => q.kind === "reviewMistakes" ? { ...q, title: `完成 ${q.target} 次練習或錯題複習` } : q),

      questProgress: kind => {
        const state = get();
        const today = todayStr();
        // earnXP 有獨立的 lastXpDate 口徑；其餘用每日任務計數
        if (kind === "earnXP") return state.lastXpDate === today ? state.todayXp : 0;
        if (state.dailyQuestDate !== today) return 0;
        switch (kind) {
          case "finishLessons":  return state.dailyLessons;
          case "reviewMistakes": return state.dailyReviews + state.dailyLessons;
          case "readTexts":      return state.dailyReadings;
          default:               return 0;
        }
      },

      claimQuest: (questId, reward) => {
        void reward; // 實發以任務池為準，入參僅作介面對齊
        const today = todayStr();
        const quest = dailyQuests(today).find(q => q.id === questId);
        if (!quest) return false;
        const key = `${today}:${questId}`;
        if (get().claimedQuests[key]) return false;
        if (get().questProgress(quest.kind) < quest.target) return false;
        set(state => {
          let claimed: Record<string, true> = { ...state.claimedQuests, [key]: true };
          // 賬本裁剪：key 以日期開頭，字典序即時間序，只留最近 60 條
          const keys = Object.keys(claimed).sort();
          if (keys.length > 60) {
            claimed = {};
            for (const k of keys.slice(-60)) claimed[k] = true;
          }
          return {
            claimedQuests: claimed,
            gems: state.gems + quest.reward,
            lifetimeGems: state.lifetimeGems + quest.reward,
          };
        });
        return true;
      },

      claimableQuestCount: () => {
        const state = get();
        const today = todayStr();
        return dailyQuests(today).filter(
          q =>
            state.questProgress(q.kind) >= q.target &&
            !state.claimedQuests[`${today}:${q.id}`],
        ).length;
      },

      claimDailyReward: () => {
        const today = todayStr();
        const { lastDailyRewardDate, streak, lastActiveDate, streakFreezes } = get();
        if (lastDailyRewardDate === today) return { gems: 0, effectiveStreak: 0 };
        // 數額按「有效連勝」折算：斷籤且護盾兜不住 → 按 0 檔發（不謊報連續天數）
        const effectiveStreak = effectiveStreakOf(streak, lastActiveDate, streakFreezes);
        const reward = dailyRewardForStreak(effectiveStreak);
        set(state => ({
          gems: state.gems + reward,
          lifetimeGems: state.lifetimeGems + reward,
          lastDailyRewardDate: today,
        }));
        return { gems: reward, effectiveStreak };
      },

      claimAchievement: id => {
        const { unlockedAchievements } = get();
        if (unlockedAchievements[id]) return 0;
        const ach = ALL_ACHIEVEMENTS.find(a => a.id === id);
        if (!ach) return 0;
        set(state => ({
          unlockedAchievements: { ...state.unlockedAchievements, [id]: true },
          gems: state.gems + ach.reward,
          lifetimeGems: state.lifetimeGems + ach.reward,
        }));
        return ach.reward;
      },

      clearPendingStreakMilestone: () => {
        set({ pendingStreakMilestone: null });
      },

      makeUpYesterdayStreak: () => {
        const { gems, streak, lastActiveDate } = get();
        if (gems < STREAK_MAKEUP_COST) return false;
        const today = todayStr();
        // 必須是今天沒活動過 + 昨天斷了
        if (lastActiveDate === today) return false;
        const gap = daysBetween(lastActiveDate, today);
        if (gap < 2) return false;
        // 扣 gems + 把 lastActiveDate 設回昨天，下次 bumpStreakIfNeeded 會順延
        set({
          gems: gems - STREAK_MAKEUP_COST,
          // 假裝"昨天有學過" → 讓 bumpStreakIfNeeded 看到 gap=1
          lastActiveDate: (() => {
            const d = new Date();
            d.setDate(d.getDate() - 1);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          })(),
          streak,
        });
        return true;
      },
    }),
    {
      name: "csf-progress-v1",
      storage: createJSONStorage(() => learnerLocalStorage),
      // 版本遷移：
      //   v1 → v2：新增 hearts / dailyGoal / freezes / activeLesson
      //   v2 → v3：新增 gems / lifetimeGems / claimedChests / perfectedLessons + autoNarrate
      //   v3 → v4：新增美妝系統 ownedCosmetics / equippedXxx + claimedStreakRewards + 時間關懷
      //   v4 → v5：新增 xpHistory / lessonHistory / lastDailyRewardDate
      //   v5 → v6：新增 selectedGrade（首次進入引導選擇年級）
      //   v6 → v7：閱讀獎勵從"偽課程"遷出 —— completedLessons/perfectedLessons 裡
      //            passage-/story- 字首的條目移入 completedReadings，課時統計盡力回退
      //   v7 → v8：成就永久解鎖賬本 unlockedAchievements（當前實時解鎖集一次性寫入，
      //            不補發獎勵）+ pendingStreakMilestone + 護盾一次性遷移 max(現值, 2)
      //   v8 → v9：每日任務計數 dailyQuestDate/dailyLessons/dailyReviews/dailyReadings
      //            + claimedQuests 領取賬本 + lastTimeDate（時長獨立換日）
      //            + activeBookId（首頁當前教材）
      //   v9 → v10：本地模擬聯賽 leagueSalt/leagueTier/leagueWeekKey
      //            + pendingLeagueResult（salt 由首次 settleLeagueIfNeeded 生成）
      //   v10 → v11：題目報錯本地列表 reports（🚩 小旗子）
      //   v11 → v12：completedReadings 的 key 升級為 core 規範閱讀 id
      //            （reading:{kind}:{rawId}，雙端同一 key 空間）
      //            + freezesMigrated（護盾補發一次性開關）
      //            + lastReviewHeartDate（複習補心按天賬本）
      // v13: reward-independent study days.
      version: 13,
      migrate: (persistedState: unknown, fromVersion: number) => {
        const state = (persistedState as Partial<ProgressState>) ?? {};
        const starterOwned = Object.fromEntries(
          getStarterCosmetics().map(c => [c.id, true as const]),
        );

        // === v7：把歷史上以 recordLessonComplete 記錄的閱讀（passage-/story- 偽 id）
        //     移入 completedReadings，不再汙染課程記錄與成就統計 ===
        const isReadingId = (id: string) =>
          id.startsWith("passage-") || id.startsWith("story-");
        const completedLessons: Record<string, LessonResult> = {};
        const completedReadings: Record<string, string> = {
          ...(state.completedReadings ?? {}),
        };
        const lessonHistory: Record<string, number> = {
          ...(state.lessonHistory ?? {}),
        };
        for (const [id, result] of Object.entries(state.completedLessons ?? {})) {
          if (isReadingId(id)) {
            completedReadings[id] =
              completedReadings[id] ?? (result.completedAt || new Date().toISOString());
            // 課時統計盡力回退：按完成日期 -1（閱讀不該算課時）
            const dayKey = (result.completedAt ?? "").slice(0, 10);
            if (dayKey && lessonHistory[dayKey]) {
              lessonHistory[dayKey] = Math.max(0, lessonHistory[dayKey] - 1);
            }
          } else {
            completedLessons[id] = result;
          }
        }
        // === v12：閱讀 key 歸一化 —— 上面剛並進來的 `passage-*` / `story-*` 偽 id
        //     和 iOS 老檔的裸 id 一起升級到規範 `reading:{kind}:{rawId}`。
        //     normalizeReadingMap 冪等，重複遷移不會出問題；同一篇被多個歷史鍵
        //     記過時保留較早的完成日期。 ===
        const normalizedReadings = normalizeReadingMap(completedReadings);

        const perfectedLessons = Object.fromEntries(
          Object.entries(state.perfectedLessons ?? {}).filter(
            ([id]) => !isReadingId(id),
          ),
        ) as Record<string, true>;

        // === v8：成就賬本 —— 把當前按進度算出來的解鎖集一次性寫入（不補發獎勵，
        //     這些是歷史解鎖；此後只有真正新解鎖的成就才發寶石） ===
        const unlockedAchievements: Record<string, true> = {
          ...(state.unlockedAchievements ?? {}),
        };
        try {
          for (const id of computeUnlockedAchievementIds({
            xp: state.xp ?? 0,
            streak: state.streak ?? 0,
            lifetimeGems: state.lifetimeGems ?? 0,
            completedLessons,
            perfectedLessons,
            ownedCosmetics: state.ownedCosmetics ?? {},
            mistakesBank: state.mistakesBank ?? [],
          })) {
            unlockedAchievements[id] = true;
          }
        } catch {
          /* 快照欄位異常時保守跳過，賬本從空開始 */
        }

        // === v8 的「護盾一次性補發」——現在有了持久開關，最多再跑這一次 ===
        // 判定「已經補發過」：顯式標記，或者存檔版本 ≥ 8（那次遷移當年就跑過了）。
        // 沒有這個開關時，每提升一次 persist version 都會重跑 max(現值, 2)，
        // 用護盾用到 0 的小朋友每次發版都白撿 2 個。
        const freezesAlreadyToppedUp =
          state.freezesMigrated === true || fromVersion >= 8;
        const rawFreezes = state.streakFreezes ?? INITIAL_FREEZES;
        const streakFreezes = freezesAlreadyToppedUp
          ? rawFreezes
          : Math.max(rawFreezes, INITIAL_FREEZES); // 超過 2 的不沒收（只封新購）

        return {
          ...state,
          hearts: state.hearts ?? MAX_HEARTS,
          nextHeartAt: state.nextHeartAt ?? null,
          lastReviewHeartDate: state.lastReviewHeartDate ?? "",
          dailyGoal: state.dailyGoal ?? DEFAULT_DAILY_GOAL,
          todayXp: state.todayXp ?? 0,
          lastXpDate: state.lastXpDate ?? "",
          streakFreezes,
          freezesMigrated: true,
          activeLesson: state.activeLesson ?? null,
          autoNarrate: state.autoNarrate ?? true,
          gems: state.gems ?? 0,
          lifetimeGems: state.lifetimeGems ?? 0,
          claimedChests: state.claimedChests ?? {},
          completedLessons,
          perfectedLessons,
          // v4 新欄位
          ownedCosmetics: { ...starterOwned, ...(state.ownedCosmetics ?? {}) },
          equippedMascotSkin: state.equippedMascotSkin ?? DEFAULT_EQUIPPED.mascotSkin,
          equippedTheme: state.equippedTheme ?? DEFAULT_EQUIPPED.uiTheme,
          equippedBackdrop: state.equippedBackdrop ?? DEFAULT_EQUIPPED.lessonBackdrop,
          claimedStreakRewards: state.claimedStreakRewards ?? {},
          todayTimeMs: state.todayTimeMs ?? 0,
          dailyTimeLimitMs: state.dailyTimeLimitMs ?? 0,
          sessionTimeLimitMs: state.sessionTimeLimitMs ?? 0,
          xpHistory: state.xpHistory ?? {},
          lessonHistory,
          studyDays: state.studyDays ?? {},
          numberSenseProgress: normalizeNumberProgress(state.numberSenseProgress),
          lastDailyRewardDate: state.lastDailyRewardDate ?? "",
          // v6
          selectedGrade: state.selectedGrade ?? null,
          // v7 + v12（key 已升級為規範閱讀 id）
          completedReadings: normalizedReadings,
          // v8
          unlockedAchievements,
          pendingStreakMilestone: state.pendingStreakMilestone ?? null,
          // v9：每日任務計數預設零值（老檔從今天起重新計數）+ 獨立時長換日
          dailyQuestDate: state.dailyQuestDate ?? "",
          dailyLessons: state.dailyLessons ?? 0,
          dailyReviews: state.dailyReviews ?? 0,
          dailyReadings: state.dailyReadings ?? 0,
          claimedQuests: state.claimedQuests ?? {},
          // 時長換日基準：沿用舊檔的 lastXpDate 口徑起步（老實現用它換日）
          lastTimeDate: state.lastTimeDate ?? state.lastXpDate ?? "",
          activeBookId: state.activeBookId ?? null,
          // v10：聯賽（salt 留空，由首次 settleLeagueIfNeeded 生成）
          leagueSalt: state.leagueSalt ?? "",
          leagueTier: state.leagueTier ?? "bronze",
          leagueWeekKey: state.leagueWeekKey ?? "",
          pendingLeagueResult: state.pendingLeagueResult ?? null,
          // v11：題目報錯列表
          reports: state.reports ?? [],
        } as ProgressState;
      },
    },
  ),
);
