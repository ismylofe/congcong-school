/**
 * quests.ts —— 每日任務（Daily Quests）單一事實源
 *
 * 與 iOS `Domain/Quests.swift` 逐行對齊：同一天雙端必須給出完全相同的
 * 三條任務（同 kind / 同 target / 同 reward / 同順序）。
 *
 * 確定性來源：日期字串（YYYY-MM-DD）→ djb2 滾動雜湊 → SplitMix64
 * finalizer 雪崩 → 對候選池取模。雜湊原語抽在 rng.ts（quests / league 共用），
 * TS 端用 BigInt 模擬 Swift 的 UInt64 環繞運算（&+ / &*），位運算逐位一致；
 * spec/golden-vectors.json 的 `quests` 組是雙端對照的黃金向量。
 */

import { U64_MASK, djb2Hash, mix64 as mix } from "./rng";

export type QuestKind = "earnXP" | "finishLessons" | "reviewMistakes" | "readTexts";

export interface Quest {
  kind: QuestKind;
  /** 目標計數（earnXP 為 XP 數，其餘為次數） */
  target: number;
  /** 完成獎勵（寶石） */
  reward: number;
  /** 當日內穩定的 id —— 領取賬本以 `"${date}:${id}"` 記賬 */
  id: string;
  /** 兒童友好中文標題（與 iOS 文案一致） */
  title: string;
}

function makeQuest(kind: QuestKind, target: number, reward: number): Quest {
  return { kind, target, reward, id: `${kind}-${target}`, title: questTitle(kind, target) };
}

/** 與 iOS `Quest.title` 完全一致的中文文案。 */
export function questTitle(kind: QuestKind, target: number): string {
  switch (kind) {
    case "earnXP":         return `獲得 ${target} 點經驗`;
    case "finishLessons":  return `完成 ${target} 個小節`;
    case "reviewMistakes": return `複習 ${target} 道錯題`;
    case "readTexts":      return `讀完 ${target} 篇課文或故事`;
  }
}

/**
 * 候選池 —— 與 iOS `Quests.pool` 逐項一致（順序也一致，
 * 因為 pick 是「按 kind 過濾後取模」，順序參與結果）。
 */
export const QUEST_POOL: readonly Quest[] = [
  makeQuest("earnXP", 30, 10),
  makeQuest("earnXP", 60, 15),
  makeQuest("earnXP", 100, 25),
  makeQuest("finishLessons", 1, 10),
  makeQuest("finishLessons", 2, 20),
  makeQuest("finishLessons", 3, 30),
  makeQuest("reviewMistakes", 1, 10),
  makeQuest("reviewMistakes", 3, 20),
  makeQuest("readTexts", 1, 15),
  makeQuest("readTexts", 2, 25),
];

/**
 * 給定日期（YYYY-MM-DD）的三條每日任務，確定性生成：
 *   - 第一條必為 earnXP；
 *   - 後兩條從 finishLessons / reviewMistakes / readTexts 中不放回抽取，
 *     因此一天內三條任務 kind 兩兩不同；
 *   - 同一天任何時刻、任何端呼叫結果完全一致。
 */
export function dailyQuests(dateString: string): Quest[] {
  const hash = mix(djb2Hash(dateString));

  const index = (count: number, salt: bigint): number => {
    if (count <= 0) return 0;
    return Number(mix((hash + salt) & U64_MASK) % BigInt(count));
  };
  const pick = (kind: QuestKind, salt: bigint): Quest => {
    const options = QUEST_POOL.filter(q => q.kind === kind);
    return options[index(options.length, salt)];
  };

  // 與 iOS 一致：先抽走 firstKind（不放回），再在剩餘裡抽 secondKind
  const rest: QuestKind[] = ["finishLessons", "reviewMistakes", "readTexts"];
  const [firstKind] = rest.splice(index(rest.length, 0x11n), 1);
  const secondKind = rest[index(rest.length, 0x22n)];

  return [pick("earnXP", 0x01n), pick(firstKind, 0x33n), pick(secondKind, 0x44n)];
}
