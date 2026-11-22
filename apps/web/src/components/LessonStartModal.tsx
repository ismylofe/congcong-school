"use client";
import { numberSkillForLesson } from "@cstf/core/numberSense";

/**
 * LessonStartModal — 點選路徑節點後彈出的課程摘要卡
 *
 * 多鄰國風格：小卡片顯示課程標題、題目數、預計 XP，下方一個大"開始"按鈕。
 * 若紅心為 0，按鈕禁用並顯示下一顆心的倒計時。
 */

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { Mascot } from "./Mascot";
import { Lightning, Heart, Gem } from "./icons";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import { useProgressStore } from "@/store/progress";
import { useProgressTicker, formatMsCountdown } from "@/lib/useProgressTicker";
import {
  XP_PER_CORRECT,
  WEEKEND_XP_MULTIPLIER,
  EXAM_XP_MULTIPLIER,
  HEART_REFILL_COST,
  isWeekendXpActive,
} from "@cstf/core/economy";
import { useToast } from "./Toast";
import {
  resumableSession,
  remainingQuestionCount,
  sessionAnsweredCount,
} from "@/lib/lessonSession";

interface LessonStartModalProps {
  open: boolean;
  onClose: () => void;
  bookId: string;
  lessonId: string;
  title: string;
  questionCount: number;
  unitNumber: number;
  unitLabel?: string;
  kpIndex: number;
  kpTotal: number;
  /** ⚔️ 單元挑戰課：XP ×2 預估 + 挑戰徽章（kpIndex/kpTotal 不展示） */
  isExam?: boolean;
}

export function LessonStartModal({
  open,
  onClose,
  bookId,
  lessonId,
  title,
  questionCount,
  unitNumber,
  unitLabel,
  kpIndex,
  kpTotal,
  isExam = false,
}: LessonStartModalProps) {
  const router = useRouter();
  const toast = useToast();
  const now = useProgressTicker();
  const hearts = useProgressStore(s => s.hearts);
  const nextHeartAt = useProgressStore(s => s.nextHeartAt);
  const gems = useProgressStore(s => s.gems);
  const buyHeartRefill = useProgressStore(s => s.buyHeartRefill);
  const activeLesson = useProgressStore(s => s.activeLesson);
  const clearLessonSession = useProgressStore(s => s.clearLessonSession);
  const dailyTimeLimitReached = useProgressStore(s => s.dailyTimeLimitReached);

  // hydrate 後才讀時間上限（persist 恢復前恆為未達標，避免水合不一致）
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  // 週末雙倍 XP —— 預估所見即所得
  const [weekend] = useState(() => isWeekendXpActive());

  // 是否存在同一課程的未完成會話？（已開始的課不受時間上限影響）
  // 口徑統一到 lessonSession helper（webrunner-7）：以前用 index > 0，
  // 而 index 其實是"答對數" —— 全答錯的孩子既看不到進度提示也沒有重開入口。
  const resume0 = resumableSession(activeLesson, lessonId);

  // ⏱️ 家長時間關懷：達到每日上限後不再開新課；繼續已開始的課不受影響
  const timeUp = hydrated && !resume0 && dailyTimeLimitReached();
  const isNumberSense = !!numberSkillForLesson(lessonId);
  const canStart = (hearts > 0 || isNumberSense) && !timeUp;
  const msToNext = nextHeartAt ? Math.max(0, nextHeartAt - now) : 0;
  const estimatedXp =
    questionCount *
    XP_PER_CORRECT *
    (isExam ? EXAM_XP_MULTIPLIER : 1) *
    (weekend ? WEEKEND_XP_MULTIPLIER : 1);

  function handleRefillHearts() {
    playSfx("tap");
    haptic("light");
    const ok = buyHeartRefill();
    if (ok) {
      playSfx("unlock");
      haptic("success");
      toast.success("❤️ 紅心已補滿，馬上開始吧！");
    } else {
      playSfx("wrong");
      toast.error("寶石不夠，先去學習攢寶石吧");
    }
  }

  const resume = resume0;
  // 剩餘題數以持久化佇列為準（含錯題重排回隊尾的題），與課內進度同口徑
  const remaining = resume
    ? remainingQuestionCount(resume, questionCount)
    : questionCount;
  const answeredSoFar = resume ? sessionAnsweredCount(resume) : 0;

  function handleStart() {
    if (!canStart) return;
    playSfx("tap");
    haptic("medium");
    router.push(`/lesson/${bookId}/${lessonId}/`);
  }

  function handleRestart() {
    // 放棄舊進度重新開始
    clearLessonSession();
    handleStart();
  }

  return (
    <Modal ariaLabel={title} open={open} onClose={onClose}>
      <div className="flex flex-col items-center text-center">
        <Mascot mood={canStart ? "happy" : "sad"} size={88} />
        <div className="text-[11px] uppercase tracking-wider text-ink-softer mt-4 font-extrabold">
          {isExam ? `${unitLabel ?? `第 ${unitNumber} 單元`} · 單元挑戰` : `${unitLabel ?? `第 ${unitNumber} 單元`} · ${kpIndex + 1}/${kpTotal}`}
        </div>
        <h2 className="text-2xl font-extrabold text-ink mt-2 leading-tight">{title}</h2>

        {questionCount < 3 && !isExam && <p className="mt-3 text-sm text-ink-light">微練習 · 先試一試，之後再用更多情境鞏固。這次不評掌握星級。</p>}
        {isExam && (
          <div
            className="mt-3 inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-white text-xs font-extrabold"
            style={{
              background: "linear-gradient(135deg, #CE82FF, #7C3AED)",
              boxShadow: "0 3px 0 0 #6B21A8",
              border: "2px solid #FFC800",
            }}
          >
            ⚔️ 單元挑戰 · XP 雙倍 ×{EXAM_XP_MULTIPLIER}
          </div>
        )}

        {resume && (
          <div className="mt-4 h-8 inline-flex items-center gap-2 px-3 rounded-full bg-secondary/10 border-2 border-secondary/30 text-secondary-dark text-xs font-extrabold">
            上次做了 {answeredSoFar} 題 · 還剩 {remaining} 題
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 w-full mt-6">
          <div
            className="bg-bg-soft rounded-2xl p-4 border-2 border-bg-softer"
            style={{ boxShadow: "0 3px 0 0 var(--shadow-card-color)" }}
          >
            <div className="text-[11px] uppercase tracking-wider text-ink-softer font-extrabold">
              {resume ? "剩餘題數" : "題目數"}
            </div>
            <div className="text-xl font-extrabold text-ink mt-1 tabular-nums">
              {resume ? remaining : questionCount}
            </div>
          </div>
          <div
            className="bg-bg-soft rounded-2xl p-4 border-2 border-bg-softer"
            style={{ boxShadow: "0 3px 0 0 var(--shadow-card-color)" }}
          >
            <div className="text-[11px] uppercase tracking-wider text-ink-softer font-extrabold">
              可獲得
            </div>
            <div className="text-xl font-extrabold text-secondary flex items-center justify-center gap-1 mt-1 tabular-nums">
              <Lightning className="w-4 h-4" />+{estimatedXp}
            </div>
            {weekend && (
              <div
                className="mt-1 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold text-white"
                style={{
                  background: "linear-gradient(135deg, #1CB0F6, #7c3aed)",
                }}
              >
                週末雙倍 ×2
              </div>
            )}
          </div>
        </div>

        {/* ⏱️ 每日學習時間到上限：溫柔勸休息（家長設定，防沉迷） */}
        {timeUp && (
          <div className="mt-4 w-full rounded-2xl border-2 border-secondary/30 bg-secondary/10 px-4 py-3">
            <div className="text-secondary-dark font-extrabold">
              今天學習時間到啦，休息一下眼睛 🌙
            </div>
            <div className="mt-1 text-xs text-ink-light">
              明天再來繼續闖關吧～已開始的課程不受影響
            </div>
          </div>
        )}

        {isNumberSense && <p className="mt-3 text-sm text-ink-light">這節課可以放心試，做錯不扣紅心。</p>}
        {hearts <= 0 && !isNumberSense && !timeUp && (
          <div className="mt-4 w-full rounded-2xl border-2 border-danger/30 bg-danger/10 px-4 py-3">
            <div className="flex items-center justify-center gap-2 text-danger font-extrabold">
              <Heart className="w-5 h-5" />
              <span>紅心不足</span>
            </div>
            {nextHeartAt && (
              <div className="mt-1 text-xs text-ink-light">
                下一顆心還需{" "}
                <span className="font-extrabold text-danger tabular-nums">
                  {formatMsCountdown(msToNext)}
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={handleRefillHearts}
              disabled={gems < HEART_REFILL_COST}
              className={`w-full mt-3 inline-flex items-center justify-center gap-1.5 rounded-2xl py-2.5 font-extrabold text-sm transition-colors ${
                gems >= HEART_REFILL_COST
                  ? "text-white"
                  : "bg-bg-softer text-ink-softer cursor-not-allowed"
              }`}
              style={
                gems >= HEART_REFILL_COST
                  ? {
                      background: "linear-gradient(135deg, #a855f7, #7c3aed)",
                      boxShadow: "0 4px 0 0 #6b21a8",
                    }
                  : undefined
              }
            >
              <Gem className="w-4 h-4" />
              <span className="tabular-nums">{HEART_REFILL_COST}</span>
              <span>立即補滿紅心</span>
            </button>
            {gems < HEART_REFILL_COST && (
              <div className="mt-1.5 text-[11px] text-ink-softer text-center">
                寶石還差 {HEART_REFILL_COST - gems} 顆
              </div>
            )}
          </div>
        )}

        <button
          onClick={handleStart}
          disabled={!canStart}
          className={canStart ? "btn-chunky-primary w-full mt-6" : "btn-chunky-disabled w-full mt-6"}
        >
          {canStart ? (resume ? "繼續學習" : "開始") : timeUp ? "明天再來" : "等待恢復"}
        </button>

        {resume && canStart && (
          <button
            type="button"
            onClick={handleRestart}
            className="mt-4 text-sm font-bold text-ink-light hover:text-ink transition-colors"
          >
            重新開始這節課
          </button>
        )}
      </div>
    </Modal>
  );
}
