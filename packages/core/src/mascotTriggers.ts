/**
 * mascotTriggers.ts —— 上下文感知的 Mascot 表情/反應決策
 *
 * Duolingo 讓 mascot 顯得"有人設"的關鍵：不同情境給不同情緒而非永遠只有
 * happy/sad 二選一。本檔案把 LessonRunner 的執行時上下文對映成具體的
 * MascotMood + MascotReaction，讓 Mascot 看起來像在"讀懂"使用者。
 *
 * 純函式 + 零依賴，方便單元測試。
 */

import type { MascotMood, MascotReaction } from "./types";

export interface MascotTriggerContext {
  /** 這次答題對錯 */
  isCorrect: boolean;
  /** 是否本節課全程零失誤（包括這一題） */
  isPerfectSession: boolean;
  /** 這一題在本 session 已嘗試幾次（多次答錯同題時 > 1） */
  attemptCount: number;
  /** 當前剩餘心數 */
  remainingHearts: number;
  /** 答完這一題之後的 combo */
  combo: number;
  /** 本節課最大 combo */
  maxCombo: number;
  /** 答到第幾題 (0-indexed) / 總題數 */
  index: number;
  total: number;
  /** 本 session 已答對題數 */
  totalCorrectInSession: number;
}

/**
 * 決定 mascot 的"持續表情"（happy/cheer/sad/think/proud/embarrassed...）
 *
 * 這是 reactTo 之外的"基底心情"，會在動畫結束後保持。
 */
export function decideMascotMood(ctx: MascotTriggerContext): MascotMood {
  const isLastQuestion = ctx.index + 1 >= ctx.total;

  if (ctx.isCorrect) {
    // 完美 session 的最後一題答對 → 全程滿分 → 驕傲
    if (isLastQuestion && ctx.isPerfectSession) return "proud";
    // 心數告急卻答對 → 鬆一口氣，開心
    if (ctx.remainingHearts === 1) return "happy";
    // 高 combo → 歡呼
    if (ctx.combo >= 5) return "cheer";
    return "happy";
  }

  // 答錯分支
  // 心數告急時答錯 → 尷尬（要失敗了）
  if (ctx.remainingHearts <= 1) return "embarrassed";
  // 重複答錯同題 → 失望
  if (ctx.attemptCount >= 2) return "sad";
  // 一般答錯 → 思考重來
  return "think";
}

/**
 * 決定 mascot 的"一次性反應動畫"。
 *
 * 這是 react 動畫的觸發，相同 reaction 透過 reactKey 重置觸發。
 */
export function decideMascotReaction(ctx: MascotTriggerContext): MascotReaction {
  const isLastQuestion = ctx.index + 1 >= ctx.total;

  if (ctx.isCorrect) {
    // 完美 session 通關的最後一題 → 升級特效
    if (isLastQuestion && ctx.isPerfectSession) return "levelup";
    // 連擊里程碑 → 同樣升級特效（更隆重）
    if (ctx.combo === 3 || ctx.combo === 5 || ctx.combo === 10) return "levelup";
    return "correct";
  }

  return "wrong";
}

/**
 * 答題反饋氣泡文案池：按情緒 mood 分組。
 * showBubble 時根據 mood 抽一句，比無腦 PRAISE/COMFORT 更有人味。
 */
export const BUBBLES_BY_MOOD: Record<MascotMood, readonly string[]> = {
  happy: ["太棒!", "答對啦!", "繼續!", "漂亮!", "對的!"],
  cheer: ["完美!", "好厲害!", "超厲害!", "無敵!", "棒棒的!"],
  proud: ["你太棒了!", "實力派!", "學習高手!", "我為你驕傲!"],
  sad: ["別灰心!", "再來一次!", "差一點點!", "下次一定!"],
  think: ["想想看?", "再仔細一點!", "別急!", "慢慢來!"],
  embarrassed: ["小心呀!", "保住心心!", "穩住!", "深呼吸!"],
  wave: ["加油!", "我們一起!"],
  surprise: ["哇!", "咦?", "厲害厲害!"],
};

export function pickBubble(mood: MascotMood): string {
  const pool = BUBBLES_BY_MOOD[mood] ?? BUBBLES_BY_MOOD.happy;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * 把 mood 對映到 SpeechBubble 的 tone（neutral/primary/danger）
 */
export function moodToTone(mood: MascotMood): "neutral" | "primary" | "danger" {
  switch (mood) {
    case "cheer":
    case "proud":
    case "happy":
      return "primary";
    case "sad":
    case "embarrassed":
      return "danger";
    default:
      return "neutral";
  }
}
