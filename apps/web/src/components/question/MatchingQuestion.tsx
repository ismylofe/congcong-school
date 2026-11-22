"use client";

/**
 * 連線題：左列 4 項、右列 4 項，點選配對（web-lesson-11：逐對即時判定）。
 *
 * options: 8 項陣列，前 4 是左列（A/B/C/D），後 4 是右列（1/2/3/4）
 * answer:  "A-1,B-2,C-3,D-4" 形式的字串
 *
 * 互動（與 iOS / 多鄰國一致）：
 *   - 點左列某項 → 高亮，等待選右列
 *   - 點右列某項 → 立即判定該對：
 *       對 → 綠閃 + 雙雙消失（correct 觸感）
 *       錯 → 紅抖 + 復位（不扣心）
 *   - 每對成功立即儲存草稿；完整配對後父級才可判分
 *   - 鍵盤：1-4 選左列，5-8 選右列（桌面端角標提示）
 */

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/cn";
import { QuestionPrompt } from "./QuestionPrompt";
import { MathText } from "@/components/MathText";
import { TTSButton } from "@/components/TTSButton";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import { playTTS } from "@/lib/tts";
import { useAutoNarrate } from "@/lib/useAutoNarrate";
import { shouldIgnoreKey } from "./keyboard";
import { matchingPairs } from "@/lib/questionDraft";
import type { QuestionRendererProps } from "./QuestionRenderer";

const LEFT_KEYS = ["A", "B", "C", "D"] as const;
const RIGHT_KEYS = ["1", "2", "3", "4"] as const;
type LeftKey = (typeof LEFT_KEYS)[number];
type RightKey = (typeof RIGHT_KEYS)[number];

export function MatchingQuestion({
  question,
  answer,
  phase,
  isCorrect,
  onChange,
  locked = false,
}: QuestionRendererProps) {
  const disabled = phase === "checked";
  const options = question.options ?? [];
  const cancelNarrate = useAutoNarrate([question.audio?.question], question.id);
  const left = options.slice(0, 4);
  const right = options.slice(4, 8);
  const pairTotal = Math.min(left.length, right.length, 4);

  // canonical answer 解析：{ A: "1", B: "2", ... }
  const answerMap = useMemo(() => {
    const m: Partial<Record<LeftKey, RightKey>> = {};
    for (const part of question.answer.split(",")) {
      const [l, r] = part.trim().split("-");
      const lk = l?.trim().toUpperCase() as LeftKey | undefined;
      const rk = r?.trim() as RightKey | undefined;
      if (lk && rk && (LEFT_KEYS as readonly string[]).includes(lk)) m[lk] = rk;
    }
    return m;
  }, [question.answer]);

  /** 已配對成功（消失）的左鍵集合 */
  const matched = useMemo(() => matchingPairs(question, answer), [question, answer]);
  /** 正在播「綠閃」即將消失的一對 */
  const [vanishing, setVanishing] = useState<{ l: LeftKey; r: RightKey } | null>(null);
  /** 剛配錯正在「紅抖」的一對（key 用於重播動畫） */
  const [wrongPair, setWrongPair] = useState<{ l: LeftKey; r: RightKey; key: number } | null>(null);
  const [activeLeft, setActiveLeft] = useState<LeftKey | null>(null);

  // 題目切換重置
  useEffect(() => {
    setVanishing(null);
    setWrongPair(null);
    setActiveLeft(null);
  }, [question.id]);

  // Only animation state is local. Successful pairs immediately become a saved draft.
  useEffect(() => {
    if (!vanishing) return;
    const timer = setTimeout(() => setVanishing(null), 420);
    return () => clearTimeout(timer);
  }, [vanishing]);

  function optionAudioAt(idx: number) {
    const src = question.audio?.options?.[idx];
    if (src) void playTTS(src);
  }

  function pickLeft(k: LeftKey) {
    if (locked || disabled || matched[k] || vanishing) return;
    cancelNarrate();
    playSfx("tap");
    haptic("light");
    optionAudioAt(LEFT_KEYS.indexOf(k));
    setActiveLeft(activeLeft === k ? null : k);
  }

  function pickRight(rk: RightKey) {
    if (locked || disabled || vanishing) return;
    if (activeLeft === null) return;
    if (Object.values(matched).includes(rk)) return;
    cancelNarrate();
    optionAudioAt(4 + RIGHT_KEYS.indexOf(rk));
    const l = activeLeft;
    setActiveLeft(null);

    if (answerMap[l] === rk) {
      // ✅ 配對正確：綠閃 → 雙雙消失
      playSfx("correct", { volume: 0.55 });
      haptic("light");
      setVanishing({ l, r: rk });
      onChange(Object.entries({ ...matched, [l]: rk }).map(([left, right]) => `${left}-${right}`).join(","));
    } else {
      // ❌ 配對錯誤：紅抖 + 復位（不扣心，與 iOS 一致）
      playSfx("wrong", { volume: 0.35 });
      haptic("medium");
      setWrongPair({ l, r: rk, key: Date.now() });
      setTimeout(() => setWrongPair(null), 520);
    }
  }

  // 鍵盤快捷鍵（web-lesson-3）：左列 1-4，右列 5-8
  useEffect(() => {
    if (locked || phase !== "answering") return; // 遮罩開啟時不接管鍵盤（webrunner-5）
    const onKeyDown = (e: KeyboardEvent) => {
      if (shouldIgnoreKey(e)) return;
      const n = Number(e.key);
      if (!Number.isInteger(n)) return;
      if (n >= 1 && n <= pairTotal) {
        e.preventDefault();
        pickLeft(LEFT_KEYS[n - 1]);
      } else if (n >= 5 && n <= 4 + pairTotal) {
        e.preventDefault();
        pickRight(RIGHT_KEYS[n - 5]);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, question.id, activeLeft, matched, vanishing, pairTotal, locked]);

  const shakeAnim = { x: [0, -7, 7, -5, 5, 0], transition: { duration: 0.42 } };

  /** answerMap[k]（"1"~"4"）→ 右列文字 */
  function rightTextFor(k: LeftKey): string {
    const rk = answerMap[k];
    if (!rk) return "";
    return right[RIGHT_KEYS.indexOf(rk)] ?? "";
  }

  return (
    <div className="w-full">
      <QuestionPrompt text={question.question} audio={question.audio?.question} locked={locked} />

      <p className="text-sm text-ink-light mb-4">先選左側，再選右側，找到對應的一對。</p>
      <div className="grid grid-cols-2 gap-3">
        {/* 左列 */}
        <div className="flex flex-col gap-2">
          {LEFT_KEYS.slice(0, pairTotal).map((k, i) => {
            const txt = left[i] ?? "";
            const isVanishing = vanishing?.l === k;
            const gone = !!matched[k] && !isVanishing;
            const isWrong = wrongPair?.l === k;
            const active = activeLeft === k;
            return (
              <AnimatePresence key={k} initial={false}>
                {!gone && (
                  <motion.button
                    type="button"
                    aria-pressed={active}
                    disabled={disabled || isVanishing}
                    onClick={() => pickLeft(k)}
                    exit={{ scale: 0.6, opacity: 0, transition: { duration: 0.25 } }}
                    animate={isWrong ? shakeAnim : { x: 0 }}
                    className={cn(
                      "option-card matching-option min-w-0 text-left flex items-center gap-2 relative",
                      isVanishing
                        ? "option-card-correct"
                        : isWrong
                          ? "option-card-wrong"
                          : active
                            ? "option-card-selected"
                            : undefined,
                    )}
                  >
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white border-2 border-current text-xs shrink-0">
                      {k}
                    </span>
                    <span className="flex-1 min-w-0 break-words">{txt}</span>
                    {/* 桌面端鍵盤角標 1-4 */}
                    <span className="w-5 h-5 rounded border-2 border-bg-softer hidden lg:flex items-center justify-center font-extrabold text-ink-softer text-[10px] tabular-nums shrink-0">
                      {i + 1}
                    </span>
                  </motion.button>
                )}
              </AnimatePresence>
            );
          })}
        </div>

        {/* 右列 */}
        <div className="flex flex-col gap-2">
          {RIGHT_KEYS.slice(0, pairTotal).map((k, i) => {
            const txt = right[i] ?? "";
            const isVanishing = vanishing?.r === k;
            const gone = Object.values(matched).includes(k) && !isVanishing;
            const isWrong = wrongPair?.r === k;
            const clickable = activeLeft !== null && !disabled && !isVanishing;
            return (
              <AnimatePresence key={k} initial={false}>
                {!gone && (
                  <motion.button
                    type="button"
                    disabled={disabled || isVanishing || activeLeft === null}
                    onClick={() => pickRight(k)}
                    exit={{ scale: 0.6, opacity: 0, transition: { duration: 0.25 } }}
                    animate={isWrong ? shakeAnim : { x: 0 }}
                    className={cn(
                      "option-card matching-option min-w-0 text-left flex items-center gap-2 relative",
                      isVanishing
                        ? "option-card-correct"
                        : isWrong
                          ? "option-card-wrong"
                          : clickable
                            ? undefined
                            : "text-ink-softer cursor-default hover:border-bg-softer hover:bg-white",
                    )}
                  >
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white border-2 border-current text-xs shrink-0">
                      {k}
                    </span>
                    <span className="flex-1 min-w-0 break-words">{txt}</span>
                    {/* 桌面端鍵盤角標 5-8 */}
                    <span className="w-5 h-5 rounded border-2 border-bg-softer hidden lg:flex items-center justify-center font-extrabold text-ink-softer text-[10px] tabular-nums shrink-0">
                      {i + 5}
                    </span>
                  </motion.button>
                )}
              </AnimatePresence>
            );
          })}
        </div>
      </div>

      {/* 進度提示（配到一半時給點正反饋） */}
      {!disabled && Object.keys(matched).length > 0 && Object.keys(matched).length < pairTotal && (
        <div className="mt-3 text-center text-xs font-bold text-ink-softer">
          已配對 {Object.keys(matched).length}/{pairTotal}
        </div>
      )}

      {/* 錯誤兜底（如跳過）：展示左右文字配對列表，不再裸 A-1,B-2 */}
      <AnimatePresence>
        {phase === "checked" && !isCorrect && (
          <motion.div
            initial={{ y: 6, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="mt-4 space-y-2"
          >
            <div className="text-center text-sm font-bold text-ink-light">正確配對：</div>
            {LEFT_KEYS.slice(0, pairTotal).map((k, i) =>
              left[i] ? (
                <div
                  key={k}
                  className="flex items-center gap-2 rounded-xl bg-primary/10 border-2 border-primary/30 px-3 py-2 text-sm text-primary-dark"
                >
                  <span className="font-extrabold flex-1 text-right">{left[i]}</span>
                  <span aria-hidden>→</span>
                  <span className="font-extrabold flex-1">{rightTextFor(k)}</span>
                </div>
              ) : null,
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
