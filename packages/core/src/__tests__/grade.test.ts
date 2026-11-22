/**
 * grade.test.ts —— 選擇題判分：內容型答案與位置字母的解析優先順序
 *
 * 背景：題庫中部分 choice 題的 answer 直接存選項內容（"bookstore"、"a < b"、"an"）。
 * 舊邏輯取首字元當位置字母，"an"→A、"a < b"→A，導致答對判錯、錯項被高亮（全庫 145 題）。
 * 修復後：先按選項內容反查，查不到再按首字元當位置字母。
 */

import { describe, expect, it } from "vitest";
import type { Question } from "../types";
import { gradeAnswer } from "../grade";

function choiceQ(options: string[], answer: string): Question {
  return {
    id: 1,
    type: "choice",
    score: 5,
    difficulty: 1,
    knowledge_point: "kp",
    question: "q",
    options,
    answer,
    explanation: "",
  };
}

/** UI 提交的是位置字母（A=第1個選項） */
const pick = (i: number) => String.fromCharCode(65 + i);

describe("gradeAnswer: choice 內容型答案（內容優先反查）", () => {
  it("答案內容以 a–d 開頭時不得誤當位置字母（英語 an / bookstore）", () => {
    // english-g6down-u5-exam #14：He has ____ idea. 選項 a/an/some/two，答案 "an"
    const q = choiceQ(["a", "an", "some", "two"], "an");
    expect(gradeAnswer(q, pick(1))).toBe(true); // 選 an（位置 B）
    expect(gradeAnswer(q, pick(0))).toBe(false); // 選 a 不再被誤判對
    expect(gradeAnswer(q, pick(2))).toBe(false);
  });

  it("答案內容是比較式 a < b（數學 a×½=b×⅓）", () => {
    // g6up-u1-kp2 #9：選項 a>b / a<b / a=b / 無法比較，答案 "a < b"
    const q = choiceQ(["a > b", "a < b", "a = b", "無法比較"], "a < b");
    expect(gradeAnswer(q, pick(1))).toBe(true); // 選 a<b
    expect(gradeAnswer(q, pick(0))).toBe(false); // 選 a>b 不再被誤判對
  });

  it("答案內容是單個字母（數學 a×5/4=b×4/5=c，最大的是 b）", () => {
    // g6up-u1-exam #7：選項 b/a/c/一樣大，答案 "b" 指內容 b（位置 A）
    const q = choiceQ(["b", "a", "c", "一樣大"], "b");
    expect(gradeAnswer(q, pick(0))).toBe(true); // 選內容 b
    expect(gradeAnswer(q, pick(1))).toBe(false); // 選 a 不再被誤判對
  });

  it("內容大小寫 / 空格容錯", () => {
    const q = choiceQ(["the", "a", "an", "/"], "The");
    expect(gradeAnswer(q, pick(0))).toBe(true);
    expect(gradeAnswer(q, pick(2))).toBe(false);
  });

  it("選項帶 A. 字首時也能按內容反查", () => {
    const q = choiceQ(["A. 蘋果", "B. 香蕉", "C. 橘子", "D. 梨"], "橘子");
    expect(gradeAnswer(q, pick(2))).toBe(true);
  });
});

describe("gradeAnswer: choice 位置字母答案（回退路徑不迴歸）", () => {
  it("答案是小寫位置字母 b → 第2個選項", () => {
    const q = choiceQ(["60秒", "30秒", "90秒", "120秒"], "b");
    expect(gradeAnswer(q, pick(1))).toBe(true);
    expect(gradeAnswer(q, pick(0))).toBe(false);
  });

  it("答案是大寫位置字母 B → 第2個選項", () => {
    const q = choiceQ(["60秒", "30秒", "90秒", "120秒"], "B");
    expect(gradeAnswer(q, pick(1))).toBe(true);
  });

  it("答案帶 'B. 內容' 格式 → 第2個選項", () => {
    const q = choiceQ(["60秒", "30秒", "90秒", "120秒"], "B. 30秒");
    expect(gradeAnswer(q, pick(1))).toBe(true);
  });

  it("選項恰為字母 ABCD、答案 'A' → 仍第1個選項（goldenVectors 場景）", () => {
    const q = choiceQ(["A", "B", "C", "D"], "A");
    expect(gradeAnswer(q, pick(0))).toBe(true);
    expect(gradeAnswer(q, pick(1))).toBe(false);
  });

  it("答案既不在選項中也非字母 → 全部判錯", () => {
    const q = choiceQ(["甲", "乙", "丙", "丁"], "戊");
    expect(gradeAnswer(q, pick(0))).toBe(false);
    expect(gradeAnswer(q, pick(4 - 1))).toBe(false);
  });
});
