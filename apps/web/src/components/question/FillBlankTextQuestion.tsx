"use client";

/**
 * 文字填空題：用於語文 / 英語 / 科學的術語填空。
 * 螢幕漢字鍵盤：把正確答案的字和干擾字打散，學生直接點字填寫。
 *
 * 答案是 1-6 個漢字 / 1 個英文單詞。
 */

import { useMemo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { QuestionPrompt } from "./QuestionPrompt";
import { MathText } from "@/components/MathText";
import { TTSButton } from "@/components/TTSButton";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import { useAutoNarrate } from "@/lib/useAutoNarrate";
import type { QuestionRendererProps } from "./QuestionRenderer";

/**
 * 常用漢字池 —— 用於生成干擾項，涵蓋小學低年級高頻字。
 */
const DISTRACTOR_POOL =
  "的一是了不人我在有他這中大來上個國到說們為子和你地出會也時要就可以對生能而著事前裡所去行過家十用發天如然作方成者多日都三小軍二無同麼經法當起與好看學進種將還分此心前把把道文些將主實重新明體開它合已從提力此面理由她長角期將再想許讓向又物被全書走給最便位加將些別幾義路反條其化或接將片向才助戰持區住四帶運段切反確據形今指兩打西再至張頭走知活步往什";

/** 簡易偽隨機 —— 基於 question id 做穩定 shuffle，每次渲染保持一致 */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 16807 + 0) % 2147483647;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 英文干擾字母池（web-lesson-14）：小寫母音 + 高頻子音，不再混中文字 */
const EN_VOWELS = "aeiou";
const EN_CONSONANTS = "bcdfghklmnprstwy";

/** 根據答案生成候選字列表（答案字 + 干擾字，打散） */
function buildCandidates(answerStr: string, questionId: number): string[] {
  // === 英文單詞答案：干擾項用小寫字母（母音/子音合理配比），不混中文字 ===
  if (/^[a-zA-Z][a-zA-Z\s'-]*$/.test(answerStr.trim())) {
    const answerChars = [
      ...new Set(answerStr.toLowerCase().replace(/[^a-z-]/g, "").split("")),
    ];
    const need = Math.max(9, answerChars.length + 4);
    const distractorCount = need - answerChars.length;
    // 干擾項約 1/3 母音、2/3 子音，貼近英文字母的自然分佈
    const vowelWanted = Math.max(1, Math.round(distractorCount / 3));
    const vowelPool = seededShuffle(
      EN_VOWELS.split("").filter(c => !answerChars.includes(c)),
      questionId + 13,
    );
    const consonantPool = seededShuffle(
      EN_CONSONANTS.split("").filter(c => !answerChars.includes(c)),
      questionId + 7,
    );
    const distractors = vowelPool.slice(0, Math.min(vowelWanted, vowelPool.length));
    distractors.push(...consonantPool.slice(0, distractorCount - distractors.length));
    return seededShuffle([...answerChars, ...distractors], questionId);
  }

  const answerChars = [...new Set(answerStr.split(""))];
  // 干擾字數量：至少讓總數 >= 9，最多 12
  const need = Math.max(9, answerChars.length + 4);
  const distractorCount = need - answerChars.length;

  const pool = DISTRACTOR_POOL.split("").filter(c => !answerChars.includes(c));
  // 從池中選干擾字（用 seed 穩定）
  const shuffledPool = seededShuffle(pool, questionId + 7);
  const distractors = shuffledPool.slice(0, distractorCount);

  const all = [...answerChars, ...distractors];
  return seededShuffle(all, questionId);
}

export function FillBlankTextQuestion({
  question,
  answer,
  phase,
  isCorrect,
  onChange,
  locked = false,
}: QuestionRendererProps) {
  const disabled = phase === "checked";
  const cancelNarrate = useAutoNarrate([question.audio?.question], question.id);

  const candidates = useMemo(
    () => buildCandidates(question.answer, question.id),
    [question.answer, question.id],
  );

  function handleKey(k: string) {
    if (locked || disabled) return; // 遮罩開啟時停擺（webrunner-5）
    cancelNarrate();
    playSfx("tap");
    haptic("light");
    if (k === "⌫") {
      onChange(answer.slice(0, -1));
      return;
    }
    // 限制長度，防止誤操作
    if (answer.length >= Math.max(10, question.answer.trim().length)) return;
    onChange(answer + k);
  }

  let displayCls =
    "w-full min-h-[68px] text-3xl font-extrabold text-center px-4 py-4 rounded-2xl border-2 flex items-center justify-center";
  if (disabled) {
    displayCls = cn(
      displayCls,
      isCorrect
        ? "border-primary bg-primary/20 text-primary-dark"
        : "border-danger bg-danger/15 text-danger-dark",
    );
  } else {
    displayCls = cn(displayCls, "border-secondary bg-white text-ink shadow-glow");
  }

  // 鍵盤列數：候選字 <= 9 用 3 列，否則 4 列
  const cols = candidates.length <= 9 ? 3 : 4;

  return (
    <div className="w-full">
      <QuestionPrompt text={question.question} audio={question.audio?.question} locked={locked} />

      {/* 答案顯示區 */}
      <motion.div
        className={displayCls}
        initial={{ scale: 0.98, opacity: 0.6 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", damping: 18, stiffness: 260 }}
      >
        {answer ? <span className="min-w-0 break-all">{answer}</span> : <span className="text-ink-light text-xl font-bold">{/[a-zA-Z]/.test(question.answer) ? "點下方字母作答" : "點下方漢字作答"}</span>}
      </motion.div>

      {phase === "checked" && !isCorrect && (
        <motion.div
          initial={{ y: 6, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="mt-3 text-center text-sm text-ink-light"
        >
          正確答案：
          <span className="font-extrabold text-primary-dark">{question.answer}</span>
        </motion.div>
      )}

      {/* 漢字鍵盤 */}
      <div
        className="mt-6 grid gap-3 select-none"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
        {candidates.map((ch, i) => (
          <motion.button
            key={`${ch}-${i}`}
            type="button"
            disabled={disabled}
            onClick={() => handleKey(ch)}
            className={cn(
              "ui-key h-14 rounded-2xl text-2xl font-extrabold bg-white border-2 border-bg-softer text-ink",
              "hover:border-secondary/60 active:translate-y-[2px] active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors",
            )}
            style={{ boxShadow: "0 3px 0 0 var(--shadow-card-color)" }}
          >
            {ch}
          </motion.button>
        ))}
        {/* 退格鍵 */}
        <motion.button
          type="button"
          disabled={disabled}
          onClick={() => handleKey("⌫")}
          aria-label="刪除最後一個字"
          className={cn(
            "ui-key h-14 rounded-2xl text-2xl font-extrabold bg-white border-2 border-bg-softer text-danger",
            "hover:border-danger/40 active:translate-y-[2px] active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors",
          )}
          style={{ boxShadow: "0 3px 0 0 var(--shadow-card-color)" }}
        >
          ⌫
        </motion.button>
      </div>
    </div>
  );
}
