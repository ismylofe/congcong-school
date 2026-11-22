/**
 * backup.test.ts —— BackupEnvelope v1 校驗契約
 *
 * 契約：
 *   - ok=false 僅限結構性損壞（非物件 / schema 錯 / version 壞 / data 壞）；
 *   - ok=true 時 data 是補全預設後的完整信封，errors 是欄位級修復日誌；
 *   - 未知欄位忽略、缺欄位補預設、壞型別欄位重置為預設並記日誌；
 *   - version > 1 前向相容（不拒收）。
 */

import { describe, expect, it } from "vitest";
import {
  BACKUP_SCHEMA,
  BACKUP_VERSION,
  buildBackup,
  validateBackup,
} from "../backup";
import { DEFAULT_EQUIPPED } from "../cosmetics";
import { readingId } from "../reading";
import { DEFAULT_DAILY_GOAL, INITIAL_FREEZES, MAX_HEARTS } from "../economy";
import type { Question } from "../types";

const sampleQuestion: Question = {
  id: 3,
  type: "choice",
  score: 5,
  difficulty: 2,
  knowledge_point: "兩位數加法",
  question: "12 + 25 = ?",
  options: ["36", "37", "38", "39"],
  answer: "37",
  explanation: "個位 2+5=7，十位 1+2=3。",
};

describe("buildBackup", () => {
  it("預設欄位自動補預設，產出可迴環校驗的合法信封", () => {
    const env = buildBackup({ platform: "ios", data: { xp: 120, streak: 7 } });
    expect(env.schema).toBe(BACKUP_SCHEMA);
    expect(env.version).toBe(BACKUP_VERSION);
    expect(env.platform).toBe("ios");
    expect(env.exportedAt).toBeTruthy();
    expect(env.data.xp).toBe(120);
    expect(env.data.streak).toBe(7);
    // 補預設
    expect(env.data.hearts).toBe(MAX_HEARTS);
    expect(env.data.dailyGoal).toBe(DEFAULT_DAILY_GOAL);
    expect(env.data.streakFreezes).toBe(INITIAL_FREEZES);
    expect(env.data.equipped).toEqual(DEFAULT_EQUIPPED);
    expect(env.data.completedLessons).toEqual({});
    expect(env.data.mistakesBank).toEqual([]);

    // 迴環：JSON 序列化後仍透過校驗且無修復日誌
    const result = validateBackup(JSON.parse(JSON.stringify(env)));
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.data).toEqual(env);
  });

  it("顯式 undefined 欄位不覆蓋預設值", () => {
    const env = buildBackup({ platform: "web", data: { xp: undefined } });
    expect(env.data.xp).toBe(0);
  });
});

describe("validateBackup: 合法信封", () => {
  it("完整欄位全部保留", () => {
    const env = buildBackup({
      platform: "web",
      exportedAt: "2026-08-25T10:00:00.000Z",
      data: {
        xp: 999,
        streak: 30,
        lastActiveDate: "2026-08-25",
        gems: 500,
        lifetimeGems: 1200,
        hearts: 3,
        joinedDate: "2026-01-01",
        completedLessons: {
          "g1up-u1-kp0": { stars: 3, accuracy: 1, completedAt: "2026-08-01T00:00:00Z" },
        },
        completedReadings: { "chinese-g1up-p1": "2026-08-02" },
        perfectedLessons: { "g1up-u1-kp0": true },
        mistakesBank: [
          {
            lessonId: "g1up-u2-kp1",
            questionId: 3,
            box: 2,
            correctCount: 1,
            nextReviewDate: "2026-08-26",
            graduated: false,
            question: sampleQuestion,
          },
        ],
        claimedChests: { "chest-5": true },
        claimedStreakRewards: { "7": true },
        claimedQuests: { "2026-08-25:earnXP-60": true },
        lastDailyRewardDate: "2026-08-25",
        unlockedAchievements: { first_lesson: true },
        claimedAchievements: { first_lesson: true },
        ownedCosmetics: { skin_default: true },
        equipped: { mascotSkin: "skin_panda", uiTheme: "theme_dark", lessonBackdrop: "backdrop_space" },
        xpHistory: { "2026-08-25": 60 },
        leagueTier: "gold",
        leagueWeekKey: "2026-W35",
      },
    });
    const result = validateBackup(env);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.data).toEqual(env);
    expect(result.data!.data.mistakesBank[0].question?.answer).toBe("37");
    expect(result.data!.data.claimedQuests).toEqual({ "2026-08-25:earnXP-60": true });
  });
});

describe("claimedQuests 隨檔攜帶（每日任務領取賬本）", () => {
  it("匯出 → 匯入後領取賬本原樣保留，不會重複領獎", () => {
    const claimed: Record<string, true> = {
      "2026-08-25:earnXP-60": true,
      "2026-08-25:readTexts-1": true,
    };
    const env = buildBackup({ platform: "web", data: { claimedQuests: claimed } });
    const result = validateBackup(JSON.parse(JSON.stringify(env)));
    expect(result.ok).toBe(true);
    expect(result.data!.data.claimedQuests).toEqual(claimed);
  });

  it("老檔（v1 早期無該欄位）預設為空物件，不報錯", () => {
    const result = validateBackup({
      schema: BACKUP_SCHEMA,
      version: 1,
      exportedAt: "2026-08-25T10:00:00.000Z",
      platform: "ios",
      data: { xp: 10 },
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.data!.data.claimedQuests).toEqual({});
  });

  it("壞型別重置為空並記修復日誌", () => {
    const result = validateBackup({
      schema: BACKUP_SCHEMA,
      version: 1,
      platform: "web",
      data: { claimedQuests: "nope" },
    });
    expect(result.ok).toBe(true);
    expect(result.data!.data.claimedQuests).toEqual({});
    expect(result.errors.some(e => e.includes("claimedQuests"))).toBe(true);
  });
});

describe("completedReadings 歸一化（雙端同一 key 空間）", () => {
  const PASSAGE = "chinese-g1up-p3";
  const STORY = "chinese-g3up-s1";

  it("匯出端把 web 歷史鍵升級成規範鍵", () => {
    const env = buildBackup({
      platform: "web",
      data: {
        completedReadings: {
          [`passage-${PASSAGE}-listen`]: "2026-08-02",
          [`passage-${PASSAGE}-followup`]: "2026-08-03",
          [`story-${STORY}`]: "2026-08-04",
        },
      },
    });
    expect(env.data.completedReadings).toEqual({
      [readingId("listen", PASSAGE)]: "2026-08-02",
      [readingId("followup", PASSAGE)]: "2026-08-03",
      [readingId("story", STORY)]: "2026-08-04",
    });
  });

  it("匯入端把 iOS 歷史鍵升級成同一批規範鍵（互通）", () => {
    const iosEnv = {
      schema: BACKUP_SCHEMA,
      version: 1,
      exportedAt: "2026-08-25T10:00:00.000Z",
      platform: "ios",
      data: {
        completedReadings: {
          [PASSAGE]: "2026-08-02",
          [`${PASSAGE}-followup`]: "2026-08-03",
          [STORY]: "2026-08-04",
        },
      },
    };
    const webEnv = buildBackup({
      platform: "web",
      data: {
        completedReadings: {
          [`passage-${PASSAGE}-listen`]: "2026-08-02",
          [`passage-${PASSAGE}-followup`]: "2026-08-03",
          [`story-${STORY}`]: "2026-08-04",
        },
      },
    });
    expect(validateBackup(iosEnv).data!.data.completedReadings).toEqual(
      webEnv.data.completedReadings,
    );
  });

  it("值為空串的老檔匯入後不再是空串（否則會被真值判斷當成未讀、重複領 XP）", () => {
    const iosEnv = {
      schema: BACKUP_SCHEMA,
      version: 1,
      exportedAt: "2026-08-25T10:00:00.000Z",
      platform: "ios",
      // iOS 早期只存"讀過哪些"（Set），匯出時值一律是空串
      data: { completedReadings: { [PASSAGE]: "", [STORY]: "" } },
    };
    const d = validateBackup(iosEnv).data!.data.completedReadings;
    expect(Object.keys(d).sort()).toEqual([
      readingId("listen", PASSAGE),
      readingId("story", STORY),
    ]);
    for (const v of Object.values(d)) expect(v).not.toBe("");
  });

  it("規範鍵迴環穩定（冪等，不產生修復日誌）", () => {
    const env = buildBackup({
      platform: "ios",
      data: { completedReadings: { [readingId("story", STORY)]: "2026-08-04" } },
    });
    const result = validateBackup(JSON.parse(JSON.stringify(env)));
    expect(result.errors).toEqual([]);
    expect(result.data).toEqual(env);
  });
});

describe("validateBackup: 缺欄位給預設", () => {
  it("data 為空物件時全部補預設", () => {
    const result = validateBackup({
      schema: "cstf-backup",
      version: 1,
      exportedAt: "2026-08-25T10:00:00.000Z",
      platform: "ios",
      data: {},
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    const d = result.data!.data;
    expect(d.xp).toBe(0);
    expect(d.streak).toBe(0);
    expect(d.hearts).toBe(MAX_HEARTS);
    expect(d.dailyGoal).toBe(DEFAULT_DAILY_GOAL);
    expect(d.streakFreezes).toBe(INITIAL_FREEZES);
    expect(d.completedLessons).toEqual({});
    expect(d.completedReadings).toEqual({});
    expect(d.mistakesBank).toEqual([]);
    expect(d.equipped).toEqual(DEFAULT_EQUIPPED);
    // 可選欄位預設時不出現
    expect(d.joinedDate).toBeUndefined();
    expect(d.perfectedLessons).toBeUndefined();
    expect(d.claimedAchievements).toBeUndefined();
    expect(d.leagueTier).toBeUndefined();
    expect(d.leagueWeekKey).toBeUndefined();
  });

  it("platform/exportedAt 缺失不致命", () => {
    const result = validateBackup({ schema: "cstf-backup", version: 1, data: {} });
    expect(result.ok).toBe(true);
    expect(result.data!.platform).toBe("web");
    expect(result.data!.exportedAt).toBe("");
  });
});

describe("validateBackup: 未知欄位忽略（前向相容）", () => {
  it("信封層與 data 層的未知欄位都被丟棄且不報錯", () => {
    const result = validateBackup({
      schema: "cstf-backup",
      version: 1,
      exportedAt: "2026-08-25T10:00:00.000Z",
      platform: "web",
      futureTopLevel: { anything: true },
      data: {
        xp: 10,
        futureFeatureState: [1, 2, 3],
        anotherUnknown: "hello",
      },
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.data!.data.xp).toBe(10);
    expect((result.data!.data as unknown as Record<string, unknown>)["futureFeatureState"]).toBeUndefined();
    expect((result.data! as unknown as Record<string, unknown>)["futureTopLevel"]).toBeUndefined();
  });

  it("version=2 的未來備份仍可匯入（只讀已知欄位）", () => {
    const result = validateBackup({
      schema: "cstf-backup",
      version: 2,
      exportedAt: "2027-01-01T00:00:00.000Z",
      platform: "ios",
      data: { xp: 5000, newV2Field: { nested: true } },
    });
    expect(result.ok).toBe(true);
    expect(result.data!.version).toBe(2);
    expect(result.data!.data.xp).toBe(5000);
  });
});

describe("validateBackup: 壞型別", () => {
  it("非物件輸入直接拒收", () => {
    for (const bad of [null, undefined, 42, "not json", [1, 2]]) {
      const result = validateBackup(bad);
      expect(result.ok).toBe(false);
      expect(result.data).toBeUndefined();
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("schema / version / data 結構性損壞拒收", () => {
    expect(validateBackup({ schema: "other-app", version: 1, data: {} }).ok).toBe(false);
    expect(validateBackup({ schema: "cstf-backup", version: 0, data: {} }).ok).toBe(false);
    expect(validateBackup({ schema: "cstf-backup", version: 1.5, data: {} }).ok).toBe(false);
    expect(validateBackup({ schema: "cstf-backup", version: "1", data: {} }).ok).toBe(false);
    expect(validateBackup({ schema: "cstf-backup", version: 1 }).ok).toBe(false);
    expect(validateBackup({ schema: "cstf-backup", version: 1, data: [] }).ok).toBe(false);
  });

  it("欄位級壞型別重置為預設並記入修復日誌，整體仍可匯入", () => {
    const result = validateBackup({
      schema: "cstf-backup",
      version: 1,
      exportedAt: "2026-08-25T10:00:00.000Z",
      platform: "android", // 非法平臺 → web
      data: {
        xp: "many", // 壞型別 → 0
        streak: -5, // 負數 → 0
        gems: 100, // 合法保留
        lastActiveDate: 20260825, // 壞型別 → ""
        completedLessons: {
          good: { stars: 2, accuracy: 0.9, completedAt: "2026-08-01T00:00:00Z" },
          badStars: { stars: 9, accuracy: 2, completedAt: "x" }, // stars→1, accuracy 截到 1
          dropped: "not an object", // 丟棄
        },
        mistakesBank: [
          { lessonId: "l1", questionId: 1, box: 7 }, // box 非法 → 省略 box
          { questionId: 2 }, // 缺 lessonId → 丟棄
          "junk", // 丟棄
        ],
        xpHistory: { "2026-08-25": 60, "2026-08-24": "sixty" }, // 壞值丟棄
        equipped: { mascotSkin: 42 }, // 壞型別分量回退預設
      },
    });
    expect(result.ok).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);

    const d = result.data!.data;
    expect(result.data!.platform).toBe("web");
    expect(d.xp).toBe(0);
    expect(d.streak).toBe(0);
    expect(d.gems).toBe(100);
    expect(d.lastActiveDate).toBe("");
    expect(Object.keys(d.completedLessons).sort()).toEqual(["badStars", "good"]);
    expect(d.completedLessons["badStars"]).toEqual({ stars: 1, accuracy: 1, completedAt: "x" });
    expect(d.mistakesBank).toEqual([{ lessonId: "l1", questionId: 1 }]);
    expect(d.xpHistory).toEqual({ "2026-08-25": 60 });
    expect(d.equipped).toEqual(DEFAULT_EQUIPPED);
  });
});
