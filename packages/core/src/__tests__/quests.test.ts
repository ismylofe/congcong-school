/**
 * quests.test.ts —— 每日任務確定性與結構約束。
 *
 * spec/golden-vectors.json 的 `quests` 組是 web / iOS 雙端黃金向量：
 * Swift 側（Domain/Quests.swift）對同一日期必須給出完全相同的三元組。
 */

import { describe, expect, it } from "vitest";
import vectors from "../../spec/golden-vectors.json";
import { dailyQuests, QUEST_POOL, questTitle, type QuestKind } from "../quests";

describe("golden vectors: quests（雙端同日同任務）", () => {
  for (const v of vectors.quests) {
    it(`${v.date} → ${v.expQuests.map(q => q.id).join(", ")}`, () => {
      const quests = dailyQuests(v.date);
      expect(
        quests.map(q => ({ kind: q.kind, target: q.target, reward: q.reward, id: q.id })),
      ).toEqual(v.expQuests);
    });
  }
});

describe("dailyQuests 結構約束", () => {
  // 掃一段連續日期，覆蓋各種 hash 分佈
  const dates: string[] = [];
  for (let day = 1; day <= 28; day++) {
    dates.push(`2026-09-${String(day).padStart(2, "0")}`);
    dates.push(`2027-03-${String(day).padStart(2, "0")}`);
  }

  it("同一天多次呼叫完全一致（確定性）", () => {
    for (const d of dates) {
      expect(dailyQuests(d)).toEqual(dailyQuests(d));
    }
  });

  it("每天恰好 3 條", () => {
    for (const d of dates) {
      expect(dailyQuests(d)).toHaveLength(3);
    }
  });

  it("三條任務 kind 兩兩不同", () => {
    for (const d of dates) {
      const kinds = dailyQuests(d).map(q => q.kind);
      expect(new Set(kinds).size).toBe(3);
    }
  });

  it("必含 earnXP 且排在第一位", () => {
    for (const d of dates) {
      expect(dailyQuests(d)[0].kind).toBe("earnXP");
    }
  });

  it("每條任務都來自候選池（id / reward / target 一致）", () => {
    const poolIds = new Map(QUEST_POOL.map(q => [q.id, q]));
    for (const d of dates) {
      for (const q of dailyQuests(d)) {
        const src = poolIds.get(q.id);
        expect(src).toBeDefined();
        expect(q.target).toBe(src!.target);
        expect(q.reward).toBe(src!.reward);
      }
    }
  });
});

describe("questTitle 中文文案", () => {
  const cases: Array<[QuestKind, number, string]> = [
    ["earnXP", 30, "獲得 30 點經驗"],
    ["finishLessons", 2, "完成 2 節小課"],
    ["reviewMistakes", 3, "複習 3 道錯題"],
    ["readTexts", 1, "讀完 1 篇課文或故事"],
  ];
  for (const [kind, target, expected] of cases) {
    it(`${kind}(${target}) → ${expected}`, () => {
      expect(questTitle(kind, target)).toBe(expected);
    });
  }
});
