"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { QuestionPrompt } from "./QuestionPrompt";
import { MathText } from "@/components/MathText";
import { TTSButton } from "@/components/TTSButton";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import { playTTS } from "@/lib/tts";
import { useAutoNarrate } from "@/lib/useAutoNarrate";
import { shouldIgnoreKey } from "./keyboard";
import { correctChoiceLetter } from "@/lib/grade";
import type { QuestionRendererProps } from "./QuestionRenderer";

interface Ripple {
  id: number;
  x: number;
  y: number;
}

export function ChoiceQuestion({
  question,
  answer,
  phase,
  isCorrect,
  onChange,
  locked = false,
  hidePrompt = false,
}: QuestionRendererProps & { hidePrompt?: boolean }) {
  const correctLetter = correctChoiceLetter(question);
  const [ripples, setRipples] = useState<Record<string, Ripple[]>>({});
  const idRef = useRef(0);

  // 自動朗讀題幹（只在進入該題時一次；點選項立即打斷）
  const cancelNarrate = useAutoNarrate([question.audio?.question], question.id);

  /** 選中某個選項（點選 / 鍵盤共用）：朗讀 + 音效 + 觸感 + 寫回 answer */
  function selectLetter(letter: string) {
    if (locked || phase === "checked") return;
    cancelNarrate();
    // 選中選項時自動朗讀該選項
    const idx = letter.charCodeAt(0) - 65;
    const optAudio = question.audio?.options?.[idx];
    if (optAudio) void playTTS(optAudio);
    playSfx("tap");
    haptic("light");
    onChange(letter);
  }

  function handleTap(letter: string, e: React.MouseEvent<HTMLButtonElement>) {
    if (locked || phase === "checked") return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const id = ++idRef.current;
    setRipples(prev => ({ ...prev, [letter]: [...(prev[letter] ?? []), { id, x, y }] }));
    setTimeout(() => {
      setRipples(prev => ({
        ...prev,
        [letter]: (prev[letter] ?? []).filter(r => r.id !== id),
      }));
    }, 600);
    selectLetter(letter);
  }

  // 鍵盤快捷鍵（web-lesson-3）：數字 1-4 選選項
  useEffect(() => {
    if (locked || phase !== "answering") return; // 遮罩開啟時不接管鍵盤（webrunner-5）
    const onKeyDown = (e: KeyboardEvent) => {
      if (shouldIgnoreKey(e)) return;
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > Math.min(4, question.options.length)) return;
      e.preventDefault();
      selectLetter(String.fromCharCode(64 + n));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, question.id, locked]);

  const hasOptionAudio = question.audio?.options?.some(Boolean);
  return (
    <div className="w-full">
      {!hidePrompt && <QuestionPrompt text={question.question} audio={question.audio?.question} locked={locked} />}

      <div className="space-y-3">
        {question.options.map((opt, idx) => {
          const letter = String.fromCharCode(65 + idx); // A B C D
          const display = /^[A-D][.、]/.test(opt) ? opt.replace(/^[A-D][.、]\s*/, "") : opt;
          const selected = answer === letter;
          const isThisCorrect = letter === correctLetter;

          let cls = "option-card";
          if (phase === "checked") {
            if (isThisCorrect) cls = "option-card option-card-correct";
            else if (selected && !isCorrect) cls = "option-card option-card-wrong";
          } else if (selected) {
            cls = "option-card option-card-selected";
          }

          // 答錯時在正確選項上播放脈衝高亮，引導使用者注意
          const shouldPulse = phase === "checked" && !isCorrect && isThisCorrect;

          const optionAudio = question.audio?.options?.[idx] ?? null;
          return (
            <div key={idx} className="flex items-stretch gap-2">
              <motion.button
                type="button"
                aria-pressed={selected}
                disabled={locked || phase === "checked"}
                onClick={e => handleTap(letter, e)}
                className={cn("flex-1 text-left flex items-center gap-3 relative", cls)}
                animate={
                  shouldPulse
                    ? {
                        boxShadow: [
                          "0 2px 0 0 #58a700, 0 0 0 0 rgba(88,204,2,0.6)",
                          "0 2px 0 0 #58a700, 0 0 0 12px rgba(88,204,2,0)",
                          "0 2px 0 0 #58a700, 0 0 0 0 rgba(88,204,2,0.6)",
                        ],
                      }
                    : undefined
                }
                transition={shouldPulse ? { duration: 0.45, repeat: 1 } : undefined}
              >
                <span className="flex-1">
                  <MathText text={display} />
                </span>
                {/* Duolingo 風格：右下角數字角標（1/2/3/4）
                    僅在有物理鍵盤的桌面端（pointer:fine）顯示 —— 觸屏上是噪音 */}
                <motion.span
                  animate={
                    selected
                      ? { scale: [1, 1.18, 1], borderColor: "#1CB0F6", color: "#1CB0F6" }
                      : { scale: 1 }
                  }
                  transition={{ duration: 0.25 }}
                  className="keyboard-hint ml-3 w-7 h-7 rounded-md border-2 border-bg-softer hidden [@media(pointer:fine)]:flex items-center justify-center font-extrabold text-ink-softer text-xs tabular-nums shrink-0"
                >
                  {idx + 1}
                </motion.span>

                {/* Ripple */}
                {(ripples[letter] ?? []).map(r => (
                  <span
                    key={r.id}
                    className="ripple-dot text-secondary"
                    style={{ left: r.x - 8, top: r.y - 8, width: 16, height: 16 }}
                  />
                ))}
              </motion.button>
              {hasOptionAudio && (
                <div className="w-11 shrink-0 flex items-center justify-center">
                  <TTSButton
                    src={optionAudio}
                    size="sm"
                    disabled={locked}
                    label={`朗讀選項 ${letter}`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
