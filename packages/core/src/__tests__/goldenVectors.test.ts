/**
 * goldenVectors.test.ts —— 逐組斷言 spec/golden-vectors.json 與 TS 實現一致。
 *
 * 這份 JSON 是 web / iOS 雙端的黃金向量：Swift 側應讀取同一檔案跑等價斷言。
 * 任何一端實現改動導致這裡飄紅，說明經濟口徑漂移，必須先改 spec 再改實現。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import vectors from "../../spec/golden-vectors.json";
import {
  MAX_HEARTS,
  REVIEW_HEART_MIN_CORRECT,
  REVIEW_HEART_REWARD,
  advanceStreak,
  dailyRewardForStreak,
  lessonGemDrip,
  reviewHeartReward,
  starsFromAccuracy,
  streakMilestoneReward,
  xpForLesson,
} from "../economy";
import {
  ALL_ACHIEVEMENTS,
  latchUnlocked,
  type AchievementProgressSnapshot,
} from "../achievements";
import { getStarterCosmetics } from "../cosmetics";
import {
  BOT_NAME_POOL,
  botWeeklyGoal,
  botXpAt,
  botsForWeek,
  type LeagueTierId,
} from "../league";
import {
  getDueSrsEntries,
  isSrsGraduated,
  reviewSrsEntry,
  type SrsBox,
  type SrsMistakeEntry,
} from "../srs";
import { computeChestsForBook } from "../chestLogic";
import type { PathLessonMeta, Question } from "../types";

// ============================================================
// 黃金向量組
// ============================================================

describe("golden vectors: stars", () => {
  for (const v of vectors.stars) {
    it(`accuracy=${v.accuracy} → ${v.expStars} 星`, () => {
      expect(starsFromAccuracy(v.accuracy)).toBe(v.expStars);
    });
  }
});

describe("golden vectors: xp", () => {
  for (const v of vectors.xp) {
    it(`correct=${v.correctCount} perfect=${v.perfect} first=${v.firstPerfect} weekend=${v.isWeekend} → ${v.expXp}`, () => {
      expect(
        xpForLesson({
          correctCount: v.correctCount,
          perfect: v.perfect,
          firstPerfect: v.firstPerfect,
          isWeekend: v.isWeekend,
        }),
      ).toBe(v.expXp);
    });
  }
});

describe("golden vectors: gemDrip", () => {
  for (const v of vectors.gemDrip) {
    it(`stars=${v.stars} first=${v.isFirstPerfect} crossedGoal=${v.crossedDailyGoal} → ${v.expGems}`, () => {
      expect(
        lessonGemDrip({
          stars: v.stars as 1 | 2 | 3,
          isFirstPerfect: v.isFirstPerfect,
          crossedDailyGoal: v.crossedDailyGoal,
        }),
      ).toBe(v.expGems);
    });
  }
});

describe("golden vectors: streakAdvance", () => {
  for (const v of vectors.streakAdvance) {
    it(v.$case, () => {
      const result = advanceStreak({
        streak: v.streak,
        freezes: v.freezes,
        gapDays: v.gapDays,
        isMonday: v.isMonday,
      });
      expect(result.streak).toBe(v.expStreak);
      expect(result.freezes).toBe(v.expFreezes);
      expect(result.freezesConsumed).toBe(v.expConsumed);
    });
  }
});

describe("golden vectors: srsReview", () => {
  const FROZEN_NOW = new Date(2026, 7, 25, 10, 0, 0); // 2026-08-25（週二）

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function localDateStr(daysFromNow: number): string {
    const d = new Date(FROZEN_NOW);
    d.setDate(d.getDate() + daysFromNow);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  const dummyQuestion: Question = {
    id: 1,
    type: "choice",
    score: 1,
    difficulty: 1,
    knowledge_point: "kp",
    question: "q",
    options: ["A", "B", "C", "D"],
    answer: "A",
    explanation: "e",
  };

  for (const v of vectors.srsReview) {
    it(`box${v.box} ${v.isCorrect ? "答對" : "答錯"} → box${v.expBox}，${v.expIntervalDays} 天后複習`, () => {
      const entry: SrsMistakeEntry = {
        lessonId: "lesson-1",
        question: dummyQuestion,
        addedAt: FROZEN_NOW.toISOString(),
        box: v.box as SrsBox,
        correctCount: 0,
      };
      const next = reviewSrsEntry(entry, v.isCorrect);
      expect(next.box).toBe(v.expBox);
      expect(next.nextReviewDate).toBe(localDateStr(v.expIntervalDays));
    });
  }
});

describe("golden vectors: srsGraduation", () => {
  // 這組向量是 iOS Domain/SRS.swift 的鏡像基準：畢業是**派生判定**，
  // 不是"只認顯式 graduated 標記"。
  for (const v of vectors.srsGraduation) {
    it(`${v.$case} → ${v.expGraduated ? "畢業" : "未畢業"}`, () => {
      expect(
        isSrsGraduated({
          graduated: v.graduated ?? undefined,
          box: v.box ?? undefined,
          correctCount: v.correctCount ?? undefined,
        }),
      ).toBe(v.expGraduated);
    });
  }

  it("due 佇列過濾與畢業判定同源：派生畢業的條目不再出現", () => {
    const base = {
      lessonId: "lesson-1",
      question: { id: 1 } as unknown as Question,
      addedAt: "2020-01-01T00:00:00.000Z",
      nextReviewDate: "2020-01-01", // 早就到期
    };
    const entries: SrsMistakeEntry[] = [
      { ...base, box: 3, correctCount: 2 }, // 派生畢業，無 graduated 欄位
      { ...base, box: 3, correctCount: 1 }, // 未達標
      { ...base, box: 1, correctCount: 0, graduated: true }, // 顯式畢業
    ];
    const due = getDueSrsEntries(entries);
    expect(due).toHaveLength(1);
    expect(due[0].box).toBe(3);
    expect(due[0].correctCount).toBe(1);
  });
});

describe("golden vectors: dailyReward", () => {
  for (const v of vectors.dailyReward) {
    it(`streak=${v.streak} → ${v.expGems} 寶石`, () => {
      expect(dailyRewardForStreak(v.streak)).toBe(v.expGems);
    });
  }
});

describe("golden vectors: milestone", () => {
  for (const v of vectors.milestone) {
    it(`streakAfter=${v.streakAfter} → ${v.expGems} 寶石`, () => {
      expect(streakMilestoneReward(v.streakAfter)).toBe(v.expGems);
    });
  }
});

describe("golden vectors: examXp", () => {
  for (const v of vectors.examXp) {
    it(`${v.$case} → ${v.expXp}`, () => {
      expect(
        xpForLesson({
          correctCount: v.correctCount,
          perfect: v.perfect,
          firstPerfect: v.firstPerfect,
          isWeekend: v.isWeekend,
          isExam: v.isExam,
        }),
      ).toBe(v.expXp);
    });
  }
});

describe("golden vectors: league", () => {
  const g = vectors.league;
  const input = { weekKey: g.weekKey, tier: g.tier as LeagueTierId, salt: g.salt };
  // weekKey=2026-08-24（週一）；週三 12:00 與週日 23:59 均為本地時區
  const wednesdayNoon = new Date(2026, 7, 26, 12, 0);
  const sundayNight = new Date(2026, 7, 30, 23, 59);

  it("15 個 bot 名單逐字一致且組內去重", () => {
    const bots = botsForWeek(input);
    const names = bots.map(b => b.name);
    expect(names).toEqual(g.names);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(BOT_NAME_POOL).toContain(name);
  });

  for (const v of g.bots) {
    it(`bot${v.botIndex}（${v.expName}）目標 ${v.expGoal}，週三午 ${v.expXpWednesdayNoon}，週日夜 ${v.expXpSundayNight}`, () => {
      expect(botsForWeek(input)[v.botIndex].name).toBe(v.expName);
      expect(botWeeklyGoal({ ...input, botIndex: v.botIndex })).toBe(v.expGoal);
      expect(botXpAt({ ...input, botIndex: v.botIndex, date: wednesdayNoon })).toBe(v.expXpWednesdayNoon);
      expect(botXpAt({ ...input, botIndex: v.botIndex, date: sundayNight })).toBe(v.expXpSundayNight);
    });
  }
});

describe("golden vectors: chestSlot", () => {
  function makeLessons(count: number): PathLessonMeta[] {
    return Array.from({ length: count }, (_, i) => ({
      id: `book-u1-l${i + 1}`,
      title: `第 ${i + 1} 課`,
      unitNumber: 1,
      unitTitle: "第一單元",
      kpIndex: i + 1,
      kpTotal: count,
      questionCount: 10,
    }));
  }

  for (const v of vectors.chestSlot) {
    it(`單元內完成第 ${v.lessonsCompletedInUnit} 課後應有 ${v.expChests} 個寶箱`, () => {
      const slots = computeChestsForBook("book", makeLessons(v.lessonsCompletedInUnit));
      expect(slots.length).toBe(v.expChests);
    });
  }
});

// ============================================================
// 補充單測
// ============================================================

describe("latchUnlocked（只進不出賬本）", () => {
  it("空賬本 + 新解鎖 = 新解鎖", () => {
    expect(latchUnlocked([], ["a", "b"])).toEqual(["a", "b"]);
  });

  it("進度倒退（當前集合縮水）不會回鎖", () => {
    expect(latchUnlocked(["streak-7", "streak-30"], ["streak-3"])).toEqual([
      "streak-7",
      "streak-30",
      "streak-3",
    ]);
  });

  it("重複 id 去重，且保持 prevLedger 原順序", () => {
    expect(latchUnlocked(["a", "b"], ["b", "c", "a", "c"])).toEqual(["a", "b", "c"]);
  });

  it("不修改入參", () => {
    const prev = ["a"];
    const current = ["a", "b"];
    latchUnlocked(prev, current);
    expect(prev).toEqual(["a"]);
    expect(current).toEqual(["a", "b"]);
  });
});

describe("reviewHeartReward（複習補心，雙端同口徑）", () => {
  it("答對數不足門檻不補心", () => {
    expect(reviewHeartReward(REVIEW_HEART_MIN_CORRECT - 1, 0)).toBe(0);
    expect(reviewHeartReward(0, 0)).toBe(0);
  });

  it("達到門檻補 1 顆", () => {
    expect(reviewHeartReward(REVIEW_HEART_MIN_CORRECT, 0)).toBe(REVIEW_HEART_REWARD);
    expect(reviewHeartReward(REVIEW_HEART_MIN_CORRECT + 10, 2)).toBe(REVIEW_HEART_REWARD);
  });

  it("可用錯題不足五道時，完成整輪仍能迴心", () => {
    expect(reviewHeartReward(3, 0, 3)).toBe(1);
    expect(reviewHeartReward(2, 0, 3)).toBe(0);
    expect(reviewHeartReward(1, 0, 1)).toBe(1);
    expect(reviewHeartReward(0, 0, 0)).toBe(0);
    expect(reviewHeartReward(3, 0, Number.NaN)).toBe(0);
  });

  it("滿心不再補，也不會補出上限", () => {
    expect(reviewHeartReward(20, MAX_HEARTS)).toBe(0);
    expect(reviewHeartReward(20, MAX_HEARTS + 3)).toBe(0);
    expect(reviewHeartReward(20, MAX_HEARTS - 1)).toBe(1);
  });
});

describe("first-cosmetic 成就（初始白送不算數）", () => {
  const starterIds = getStarterCosmetics().map(c => c.id);
  const achievement = ALL_ACHIEVEMENTS.find(a => a.id === "first-cosmetic")!;
  const snapshot = (ownedIds: string[]): AchievementProgressSnapshot => ({
    xp: 0,
    streak: 0,
    lifetimeGems: 0,
    completedLessons: {},
    perfectedLessons: {},
    ownedCosmetics: Object.fromEntries(ownedIds.map(id => [id, true])),
    mistakesBank: [],
  });

  it("只擁有全部初始美妝時進度為 0", () => {
    expect(achievement.getProgress(snapshot(starterIds))).toBe(0);
  });

  it("只擁有部分初始美妝（老檔缺項）時進度仍為 0", () => {
    expect(achievement.getProgress(snapshot(starterIds.slice(0, 1)))).toBe(0);
  });

  it("買到第一件非初始美妝即達標", () => {
    expect(
      achievement.getProgress(snapshot([...starterIds.slice(0, 1), "skin_panda"])),
    ).toBe(1);
  });
});

describe("dailyRewardForStreak 邊界", () => {
  it("負數連勝按 0 處理", () => {
    expect(dailyRewardForStreak(-5)).toBe(5);
  });

  it("超過 7 封頂在最後一檔 30", () => {
    expect(dailyRewardForStreak(8)).toBe(30);
    expect(dailyRewardForStreak(365)).toBe(30);
  });

  it("6 天 → 25", () => {
    expect(dailyRewardForStreak(6)).toBe(25);
  });
});
