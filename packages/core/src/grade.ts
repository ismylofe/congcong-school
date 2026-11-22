/**
 * grade.ts — 答案判分邏輯
 *
 * 不同題型有不同的判分規則。容忍：空格、全/半形、中英文標點、數字格式。
 */

import type { Question } from "./types";

const TRUE_VALUES = new Set(["对", "對", "正确", "正確", "true", "T", "✓", "√", "Y", "yes"]);
const FALSE_VALUES = new Set(["错", "錯", "错误", "錯誤", "false", "F", "✗", "×", "N", "no"]);

function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/，/g, ",")
    .replace(/。/g, ".")
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/：/g, ":");
}

/** 把分數 "3/4" 之類規範化 */
function normalizeNumeric(s: string): string {
  return normalize(s)
    .replace(/[^\d\-./%a-z]/g, "") // 去掉單位/漢字（保留數字、分數、百分號、字母用於"米"等）
    .replace(/^0+(\d)/, "$1");
}

/** Resolve full option text first: an answer such as "a < b" is not label A. */
export function correctChoiceLetter(question: Pick<Question, "answer" | "options">): string | null {
  const correct = question.answer.trim();
  const options = question.options ?? [];
  const strip = (text: string) => text.replace(/^[A-D][.、]\s*/i, "");
  let index = options.findIndex(option => option.trim() === correct);
  if (index < 0) index = options.findIndex(option => normalize(option) === normalize(correct));
  if (index < 0) index = options.findIndex(option => normalize(strip(option)) === normalize(correct));
  if (index >= 0) return String.fromCharCode(65 + index);
  const label = correct.match(/^([A-D])(?:$|[.、]\s*)/i)?.[1].toUpperCase() ?? null;
  return label && label.charCodeAt(0) - 65 < options.length ? label : null;
}

export function gradeAnswer(question: Question, userAnswer: string): boolean {
  if (!userAnswer || !userAnswer.trim()) return false;
  const correct = question.answer;

  switch (question.type) {
    case "true_false": {
      const u = normalize(userAnswer);
      const c = normalize(correct);
      const userIsTrue = TRUE_VALUES.has(userAnswer.trim()) || TRUE_VALUES.has(u);
      const userIsFalse = FALSE_VALUES.has(userAnswer.trim()) || FALSE_VALUES.has(u);
      const correctIsTrue = TRUE_VALUES.has(correct.trim()) || TRUE_VALUES.has(c);
      if (userIsTrue || userIsFalse) return userIsTrue === correctIsTrue;
      return u === c;
    }

    case "choice": {
      const label = correctChoiceLetter(question);
      return label !== null && userAnswer.normalize("NFKC").trim().toUpperCase() === label;
    }

    case "fill_blank":
    case "calculation":
    case "word_problem": {
      // 多種容錯：完全相等、normalize 相等、純數字相等
      if (normalize(userAnswer) === normalize(correct)) return true;
      const un = normalizeNumeric(userAnswer);
      const cn = normalizeNumeric(correct);
      if (un && cn && un === cn) return true;
      // 數值容差（小數）
      const uf = parseFloat(un);
      const cf = parseFloat(cn);
      if (!isNaN(uf) && !isNaN(cf) && Math.abs(uf - cf) < 1e-6) return true;
      return false;
    }

    case "fill_blank_text": {
      // 文字填空（中文 / 英文單詞）— 去空格、去大小寫、去標點嚴格對比
      return normalizeText(userAnswer) === normalizeText(correct);
    }

    case "word_order": {
      // 使用者答案應該是用逗號連線的詞語序列
      const u = normalizeWordOrder(userAnswer);
      const c = normalizeWordOrder(correct);
      return u === c;
    }

    case "matching": {
      // 配對：A-1,B-2,C-3,D-4 順序無關，集合相等即可
      const userPairs = parseMatchingAnswer(userAnswer);
      const correctPairs = parseMatchingAnswer(correct);
      if (userPairs.size !== correctPairs.size) return false;
      for (const [k, v] of userPairs) {
        if (correctPairs.get(k) !== v) return false;
      }
      return true;
    }

    default:
      return normalize(userAnswer) === normalize(correct);
  }
}

/** 文字填空規範化：trim、小寫、去空格、去標點 */
function normalizeText(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[，。！？：；,.!?:;()（）"'`]/g, "");
}

/** 排序題規範化：去掉空格，統一英文逗號 */
function normalizeWordOrder(s: string): string {
  return s.trim().replace(/，/g, ",").replace(/\s+/g, "");
}

/** 解析連線答案 "A-1,B-2,C-3,D-4" → Map { A: 1, B: 2, ... } */
function parseMatchingAnswer(s: string): Map<string, string> {
  const map = new Map<string, string>();
  const cleaned = s.trim().replace(/，/g, ",").replace(/\s+/g, "");
  if (!cleaned) return map;
  for (const pair of cleaned.split(",")) {
    const [k, v] = pair.split("-");
    if (k && v) map.set(k.toUpperCase(), v);
  }
  return map;
}
