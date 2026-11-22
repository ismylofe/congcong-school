"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { uiMotion } from "@/lib/motion";
import { motion } from "framer-motion";
import { CheckCircle, XCircle } from "@/components/icons";
import { Modal } from "@/components/Modal";
import { MathText } from "@/components/MathText";
import { TTSButton } from "@/components/TTSButton";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import { useAutoNarrate } from "@/lib/useAutoNarrate";
import { uiAudio } from "@/lib/uiAudio";
import {
  useProgressStore,
  REPORT_KIND_LABELS,
  type ReportKind,
} from "@/store/progress";
import type { Question } from "@/types";

/** 🚩 報錯掛點上下文：提供了才顯示小旗子按鈕 */
export interface ReportContext {
  lessonId: string;
  question: Question;
  /** 當次作答（可選） */
  userAnswer?: string;
}

interface FeedbackPanelProps {
  isCorrect: boolean;
  explanation: string;
  explanationAudio?: string | null;
  onContinue: () => void;
  /** 題目報錯（E2 小旗子）：不傳則不渲染旗子按鈕 */
  reportContext?: ReportContext | null;
}

const PRAISE_POOL = ["答對了！", "做得好！", "繼續保持！", "太棒了！"];
const COMFORT_POOL = ["再想想", "差一點", "加油", "沒關係", "下次就對！"];

/** 小旗子圖示（僅報錯入口用，不動 icons.tsx） */
function FlagIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 8 2a6 6 0 0 0 3-.75V14a6 6 0 0 1-3 .75c-3 0-5-2-8-2a6 6 0 0 0-4 1.5" />
    </svg>
  );
}

const REPORT_OPTIONS: Array<{ kind: ReportKind; emoji: string }> = [
  { kind: "question_wrong", emoji: "✏️" },
  { kind: "answer_should_count", emoji: "✅" },
  { kind: "audio_issue", emoji: "🔊" },
];

export function FeedbackPanel({
  isCorrect,
  explanation,
  explanationAudio,
  onContinue,
  reportContext = null,
}: FeedbackPanelProps) {
  const bg = isCorrect ? "bg-primary/10 border-primary" : "bg-danger/10 border-danger";
  const titleColor = isCorrect ? "text-primary-dark" : "text-danger-dark";
  const btnCls = isCorrect ? "btn-chunky-primary" : "btn-chunky-danger";

  const addReport = useProgressStore(s => s.addReport);
  const [sheetOpen, setSheetOpen] = useState(false);
  // 已提交：旗子變成「已收到」態，防止同題重複報
  const [reported, setReported] = useState(false);
  // 彈層用 portal 掛到 body：面板自身帶 transform，fixed 子元素會被它捕獲
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => setPortalReady(true), []);

  const title = useMemo(() => {
    const pool = isCorrect ? PRAISE_POOL : COMFORT_POOL;
    return pool[Math.floor(Math.random() * pool.length)];
  }, [isCorrect]);

  // 面板出現：只播標題語音（"太棒了！" / "再想想"），講解保留手動喇叭
  useAutoNarrate([uiAudio(title)], explanation);

  function submitReport(kind: ReportKind) {
    if (!reportContext) return;
    playSfx("tap");
    haptic("light");
    addReport({
      lessonId: reportContext.lessonId,
      questionId: reportContext.question.id,
      questionText: reportContext.question.question.slice(0, 80),
      kind,
      answerGiven: reportContext.userAnswer || undefined,
    });
    setReported(true);
    setSheetOpen(false);
  }

  return (
    <motion.div
      initial={{ y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={uiMotion.enter}
      data-result={isCorrect ? "correct" : "wrong"}
      className={`lesson-feedback fixed bottom-0 left-0 right-0 z-50 border-t-2 ${bg} backdrop-blur-sm`}
      style={{ boxShadow: "0 -8px 24px rgba(0,0,0,0.06)", paddingBottom: "env(safe-area-inset-bottom)", maxHeight: "85dvh", overflowY: "auto" }}
    >
      <div className="feedback-content max-w-md lg:max-w-2xl mx-auto px-4 py-4 sm:py-5">
        <div className={`flex items-center gap-3 mb-3 font-extrabold text-xl sm:text-2xl ${titleColor}`}>
          <motion.span
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", damping: 12, stiffness: 260, delay: 0.05 }}
            className="inline-flex"
          >
            {isCorrect ? <CheckCircle className="w-8 h-8" /> : <XCircle className="w-8 h-8" />}
          </motion.span>
          <motion.span
            initial={{ x: -10, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.12 }}
            className="flex-1 min-w-0 truncate"
          >
            {title}
          </motion.span>
          {/* 🚩 報錯小旗子（有上下文才顯示） */}
          {reportContext && (
            <button
              type="button"
              onClick={() => {
                if (reported) return;
                playSfx("tap");
                haptic("light");
                setSheetOpen(true);
              }}
              className={`shrink-0 h-11 w-11 inline-flex items-center justify-center rounded-full border-2 transition-colors ${
                reported
                  ? "border-primary/40 bg-primary/10 text-primary cursor-default"
                  : "border-bg-softer bg-white text-ink-softer hover:text-ink hover:border-ink-softer"
              }`}
              aria-label={reported ? "已回報這題的問題" : "回報這題的問題"}
              title={reported ? "已收到你的回報" : "這道題有問題？"}
            >
              {reported ? <CheckCircle className="w-5 h-5" /> : <FlagIcon className="w-4 h-4" />}
            </button>
          )}
        </div>
        <motion.div
          initial={{ y: 6, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="flex items-start gap-2 text-ink text-base leading-relaxed mb-4"
        >
          <div className="flex-1">
            <MathText text={explanation} />
          </div>
          {explanationAudio && (
            <TTSButton src={explanationAudio} size="sm" label="重聽講解" className="mt-0.5" />
          )}
        </motion.div>
        {/* autoFocus：讓桌面端直接按 Enter/空格 繼續（鍵盤快捷鍵 web-lesson-3） */}
        <button
          autoFocus
          onClick={() => {
            playSfx("tap");
            haptic("light");
            onContinue();
          }}
          className={`w-full ${btnCls}`}
        >
          繼續
        </button>
      </div>

      {/* 🚩 報錯對話框：三選一（portal 到 body，避開面板自身的 transform） */}
      {portalReady &&
        createPortal(
      <Modal open={sheetOpen} onClose={() => setSheetOpen(false)} ariaLabel="回報題目問題">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <FlagIcon className="w-5 h-5 text-danger" />
                  <h3 className="text-lg font-extrabold text-ink">這道題怎麼了？</h3>
                </div>
                <p className="text-xs text-ink-light mb-4">
                  你的回報只存在這台裝置，可以在「我的」頁面查看和匯出
                </p>
                <div className="flex flex-col gap-2.5">
                  {REPORT_OPTIONS.map(opt => (
                    <button
                      key={opt.kind}
                      type="button"
                      onClick={() => submitReport(opt.kind)}
                      className="w-full flex items-center gap-3 rounded-2xl border-2 border-bg-softer bg-white px-4 py-3.5 text-left font-extrabold text-ink hover:border-primary/50 transition-colors"
                      style={{ boxShadow: "0 3px 0 0 var(--shadow-card-color)" }}
                    >
                      <span className="text-xl" aria-hidden>
                        {opt.emoji}
                      </span>
                      <span>{REPORT_KIND_LABELS[opt.kind]}</span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    playSfx("tap");
                    setSheetOpen(false);
                  }}
                  className="btn-chunky-ghost w-full mt-4"
                >
                  取消
                </button>
              </div>
      </Modal>,
          document.body,
        )}
    </motion.div>
  );
}
