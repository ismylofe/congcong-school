"use client";

/**
 * GradePicker —— 首次進入時的年級選擇引導（仿 Duolingo onboarding 的 "How much do you know?" 步驟）
 *
 * 觸發：useProgressStore.selectedGrade === null
 * 完成後：setSelectedGrade(g) → 跳到 /grade/{g}/
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useProgressStore } from "@/store/progress";
import { Mascot } from "@/components/Mascot";
import { SpeechBubble } from "@/components/SpeechBubble";
import { Apple, Sprout, Tree, Butterfly, Rocket, Trophy, type IconProps } from "@/components/LearningIcon";
import { cn } from "@/lib/cn";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import type { ComponentType } from "react";

interface Option {
  grade: number;
  label: string;
  hint: string;
  Icon: ComponentType<IconProps>;
}

const OPTIONS: Option[] = [
  { grade: 1, label: "我剛上一年級", hint: "剛開始認字 / 學加減", Icon: Apple },
  { grade: 2, label: "我讀二年級", hint: "會簡單加減 / 注音", Icon: Sprout },
  { grade: 3, label: "我讀三年級", hint: "認識更多國字 / 學乘除", Icon: Tree },
  { grade: 4, label: "我讀四年級", hint: "能寫短文 / 學小數", Icon: Butterfly },
  { grade: 5, label: "我讀五年級", hint: "閱讀理解 / 學分數", Icon: Rocket },
  { grade: 6, label: "我讀六年級", hint: "準備升國中", Icon: Trophy },
];

/** availableGrades：有台灣版教材的年級；其他年級標示「即將推出」（仍可進入年級頁查看）。 */
export function GradePicker({ availableGrades }: { availableGrades?: number[] } = {}) {
  const setSelectedGrade = useProgressStore(s => s.setSelectedGrade);
  const [picked, setPicked] = useState<number | null>(null);

  function handleContinue() {
    if (picked == null) return;
    playSfx("star");
    haptic("success");
    setSelectedGrade(picked);
    // 用硬跳轉避免 next.js (output: export + trailingSlash) router.push 偶發 404
    window.location.assign(`/grade/${picked}/`);
  }

  return (
    <main aria-label="選擇年級" className="fixed inset-0 z-50 bg-bg flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-start pt-4 sm:pt-10 px-5 overflow-y-auto pb-6">
        {/* 頂部 mascot + 氣泡 */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", damping: 18 }}
          className="flex items-end gap-3 mb-5 max-w-md w-full"
        >
          <Mascot size={72} mood="wave" />
          <div className="mb-2">
            <SpeechBubble text="你現在讀幾年級呀？" tone="neutral" />
          </div>
        </motion.div>

        {/* 6 個選項 */}
        <div className="w-full max-w-md flex flex-col gap-2.5">
          {OPTIONS.map((opt, i) => {
            const Icon = opt.Icon;
            const selected = picked === opt.grade;
            return (
              <motion.button
                key={opt.grade}
                type="button"
                aria-pressed={selected}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.05 }}
                                onClick={() => {
                  playSfx("tap");
                  haptic("light");
                  setPicked(opt.grade);
                }}
                className={cn(
                  "option-card flex items-center gap-3 px-4 py-3 rounded-2xl border-2 text-left transition-colors select-none",
                  selected
                    ? "option-card-selected"
                    : "border-bg-softer bg-white hover:border-secondary/40"
                )}
                style={{
                  boxShadow: selected
                    ? "0 4px 0 0 #1899D6"
                    : "0 3px 0 0 var(--shadow-card-color)",
                }}
              >
                <div
                  className={cn(
                    "w-11 h-11 rounded-xl flex items-center justify-center shrink-0",
                    "bg-transparent"
                  )}
                >
                  <Icon
                    className={cn(
                      "w-9 h-9",
                      selected ? "text-secondary" : "text-ink-light"
                    )}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    className={cn(
                      "text-base font-extrabold leading-tight",
                      selected ? "text-secondary-dark" : "text-ink"
                    )}
                  >
                    {opt.label}
                    {availableGrades && !availableGrades.includes(opt.grade) && (
                      <span className="ml-2 align-middle rounded-full bg-bg-softer px-2 py-0.5 text-xs font-bold text-ink-light">即將推出</span>
                    )}
                  </div>
                  <div className="text-sm font-medium text-ink-light mt-0.5">{opt.hint}</div>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* 底部 sticky 繼續按鈕 */}
      <div className="shrink-0 border-t-2 border-bg-softer bg-white" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="max-w-md mx-auto px-5 py-4 flex justify-end">
          <AnimatePresence>
            {picked != null && (
              <motion.button
                key="continue"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                onClick={handleContinue}
                className="btn-chunky-primary w-full px-10"
              >
                繼續
              </motion.button>
            )}
          </AnimatePresence>
          {picked == null && (
            <button
              type="button"
              disabled
              className="btn-chunky-disabled w-full px-10"
            >
              繼續
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
