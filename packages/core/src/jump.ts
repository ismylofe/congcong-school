/**
 * jump.ts —— 跳級測試（jump ahead）抽題純函式
 *
 * 規則（雙埠徑）：
 *   - 從目標單元之前所有單元的課程題庫裡均勻抽 JUMP_TEST_SIZE 道題；
 *   - 透過線 JUMP_PASS_ACCURACY；
 *   - 抽樣是純函式：同一 seed + 同一題庫 → 同一結果，方便測試與"重試換一套題"
 *     （重試時換 seed 即可）；
 *   - 均勻 = 按課程輪轉取題（round-robin），每節課被抽到的題數最多差 1，
 *     保證靠前 / 靠後的單元都被覆蓋；
 *   - 題庫不足 size 時全取（仍做確定性洗牌）。
 *
 * 注意：跳級測試是合成會話，不寫 completedLessons；透過後由呼叫端批次
 * 標記之前未完成課程 completed{stars:1, accuracy:0.8}，不發 XP / 寶石。
 */

import type { Question } from "./types";
import { djb2Hash, mix64, U64_MASK } from "./rng";

/** 跳級測試題數 */
export const JUMP_TEST_SIZE = 15;
/** 跳級透過線（正確率 ≥ 0.80） */
export const JUMP_PASS_ACCURACY = 0.8;

/** 一節前置課程的題目來源 */
export interface JumpQuestionSource {
  lessonId: string;
  questions: Question[];
}

/** 抽出的題目（保留來源課程 id，便於錯題歸檔 / 報錯定位） */
export interface JumpSampledQuestion {
  lessonId: string;
  question: Question;
}

/** SplitMix64 計數流 → [0,1) 浮點（僅 TS 端內部使用，無跨端黃金向量要求）。 */
function makeRng(seedStr: string): () => number {
  let state = djb2Hash(seedStr);
  return () => {
    state = (state + 1n) & U64_MASK;
    // 取高 53 位構造 [0,1) 雙精度
    return Number(mix64(state) >> 11n) / 2 ** 53;
  };
}

/** 確定性 Fisher–Yates 洗牌（原地，返回同一陣列）。 */
function shuffleInPlace<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * 從全部前置課程的題庫均勻抽 size 道題。
 *
 * @param sources 目標單元之前所有課程的題目（按課程分組）
 * @param size    抽題數，預設 JUMP_TEST_SIZE
 * @param seed    隨機種子字串；預設 "jump"。重試可傳新 seed 換一套題
 *
 * 保證：
 *   - 去重：同一課程內相同題目 id 只保留一次；
 *   - 均勻：題庫充足時各課程被抽題數最多相差 1；
 *   - 不足：可用題總數 ≤ size 時全部返回；
 *   - 確定性：同 (sources, size, seed) 輸出完全一致。
 */
export function sampleJumpQuestions(
  sources: JumpQuestionSource[],
  size: number = JUMP_TEST_SIZE,
  seed = "jump",
): JumpSampledQuestion[] {
  if (size <= 0) return [];

  // 1. 每節課內部去重（按題目 id），並各自確定性洗牌
  const groups: JumpSampledQuestion[][] = [];
  for (const src of sources) {
    const seen = new Set<number>();
    const group: JumpSampledQuestion[] = [];
    for (const q of src.questions) {
      if (seen.has(q.id)) continue;
      seen.add(q.id);
      group.push({ lessonId: src.lessonId, question: q });
    }
    if (group.length === 0) continue;
    shuffleInPlace(group, makeRng(`${seed}#${src.lessonId}`));
    groups.push(group);
  }

  const total = groups.reduce((n, g) => n + g.length, 0);
  const targetSize = Math.min(size, total);
  if (targetSize === 0) return [];

  // 2. 課程順序確定性洗牌（避免總是從第一單元開始佔滿名額）
  shuffleInPlace(groups, makeRng(`${seed}#groups`));

  // 3. 輪轉取題：每輪從每節課取 1 道，直到取滿
  const picked: JumpSampledQuestion[] = [];
  let round = 0;
  while (picked.length < targetSize) {
    let tookAny = false;
    for (const group of groups) {
      if (picked.length >= targetSize) break;
      if (round < group.length) {
        picked.push(group[round]);
        tookAny = true;
      }
    }
    if (!tookAny) break; // 所有課程都取空（理論上到不了這裡，兜底防死迴圈）
    round++;
  }

  // 4. 出題順序整體再洗一次，避免同一課程的題總是相鄰
  return shuffleInPlace(picked, makeRng(`${seed}#order`));
}
