"use client";

/**
 * JumpClient —— ⚡ 跳級測試（jump ahead，E2）
 *
 * 口徑（雙端拍板）：
 *   - 從目標單元之前所有單元的課程題庫均勻抽 15 題（core sampleJumpQuestions）；
 *   - 無課前講解、無跳過；透過線 accuracy ≥ 0.80（core JUMP_PASS_ACCURACY）；
 *   - 透過：之前所有未完成課程批次 completed{stars:1, accuracy:0.8}
 *     （store.jumpAheadComplete，不發 XP/寶石——防刷）+ 慶祝幕 + 返回路徑；
 *   - 失敗：扣 1 顆紅心，可重試（換 seed 換一套題）；0 心時彈補心；
 *   - 測試是合成會話：不寫 completedLessons、不入錯題本、不持久化進度。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { motion, AnimatePresence, useAnimation, useReducedMotion } from "framer-motion";
import {
  sampleJumpQuestions,
  JUMP_TEST_SIZE,
  JUMP_PASS_ACCURACY,
  type JumpQuestionSource,
  type JumpSampledQuestion,
} from "@cstf/core/jump";
import { loadJumpData } from "@/lib/loadJumpData";
import { gradeAnswer } from "@/lib/grade";
import { useProgressStore, MAX_HEARTS, HEART_REFILL_COST } from "@/store/progress";
import { QuestionRenderer, type QuestionPhase } from "@/components/question/QuestionRenderer";
import { Mascot } from "@/components/Mascot";
import { Modal } from "@/components/Modal";
import { SoundLink } from "@/components/SoundLink";
import { MuteToggle, useSyncMute } from "@/components/MuteToggle";
import { Close, Gem, Heart, Lightning, Crown } from "@/components/icons";
import { FeedbackPanel } from "@/components/FeedbackPanel";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";

const ConfettiCanvas = dynamic(
  () => import("@/components/ConfettiCanvas").then(m => ({ default: m.ConfettiCanvas })),
  { ssr: false },
);

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | {
      kind: "ready";
      sources: JumpQuestionSource[];
      priorLessonIds: string[];
      unitTitle: string;
      unitLabel: string;
    };

function newSeed(): string {
  return `jump-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function JumpClient() {
  useSyncMute();
  const router = useRouter();
  const searchParams = useSearchParams();
  const bookId = searchParams.get("book") ?? "";
  const unitNumber = Number(searchParams.get("unit") ?? "0");

  const loseHeart = useProgressStore(s => s.loseHeart);
  const jumpAheadComplete = useProgressStore(s => s.jumpAheadComplete);
  const buyHeartRefill = useProgressStore(s => s.buyHeartRefill);
  const hearts = useProgressStore(s => s.hearts);
  const gems = useProgressStore(s => s.gems);

  // ============ 資料裝載：outline → 前置課程題庫 ============
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    async function fetchAll() {
      try {
        const data = await loadJumpData(bookId, unitNumber);
        if (!cancelled) setLoad({ kind: "ready", ...data });
      } catch (error) {
        if (!cancelled) setLoad({ kind: "error", message: error instanceof Error ? error.message : "題目沒有載入成功，請返回後再試一次" });
      }
    }
    void fetchAll();
    return () => {
      cancelled = true;
    };
  }, [bookId, unitNumber]);

  // ============ 組卷（換 seed = 換一套題） ============
  const [seed, setSeed] = useState(newSeed);
  const questions = useMemo<JumpSampledQuestion[]>(
    () =>
      load.kind === "ready"
        ? sampleJumpQuestions(load.sources, JUMP_TEST_SIZE, seed)
        : [],
    [load, seed],
  );

  // ============ 答題狀態（合成會話：不持久化、不入錯題本） ============
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [phase, setPhase] = useState<QuestionPhase>("answering");
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [result, setResult] = useState<"pass" | "fail" | null>(null);
  const [passedCount, setPassedCount] = useState(0);
  // 0 心補心遮罩（入口 & 重試共用）
  const [gateOpen, setGateOpen] = useState(false);
  const gateCheckedRef = useRef(false);
  const shakeControls = useAnimation();
  const prefersReduced = useReducedMotion();

  // 入口 0 心檢查：先結算自然迴心，仍為 0 → 彈補心
  useEffect(() => {
    if (gateCheckedRef.current) return;
    gateCheckedRef.current = true;
    useProgressStore.getState().refreshHearts();
    if (useProgressStore.getState().hearts <= 0) {
      setGateOpen(true);
    }
  }, []);

  const total = questions.length;
  const current = questions[index] ?? null;
  const progress = total > 0 ? (index / total) * 100 : 0;

  function handleCheck() {
    if (!current || phase !== "answering" || !answer.trim()) return;
    const ok = gradeAnswer(current.question, answer);
    setIsCorrect(ok);
    setPhase("checked");
    if (ok) {
      setCorrectCount(c => c + 1);
      haptic("light");
      playSfx("correct");
    } else {
      haptic("heavy");
      playSfx("wrong");
      if (!prefersReduced) {
        shakeControls.start({ x: [0, -8, 8, -5, 5, 0], transition: { duration: 0.45 } });
      }
    }
  }

  function handleContinue() {
    if (phase !== "checked") return;
    const finalCorrect = correctCount; // isCorrect 已在 handleCheck 計入
    if (index + 1 >= total) {
      finishTest(finalCorrect);
      return;
    }
    setIndex(i => i + 1);
    setAnswer("");
    setIsCorrect(null);
    setPhase("answering");
  }

  function finishTest(finalCorrect: number) {
    const accuracy = total > 0 ? finalCorrect / total : 0;
    if (accuracy >= JUMP_PASS_ACCURACY && load.kind === "ready") {
      // ✅ 透過：批次補標前置課程（不發 XP / 寶石），慶祝
      const marked = jumpAheadComplete(load.priorLessonIds);
      setPassedCount(marked);
      setResult("pass");
      playSfx("complete");
      haptic("success");
    } else {
      // ❌ 失敗：扣 1 顆紅心，可重試
      loseHeart();
      setResult("fail");
      playSfx("wrong", { volume: 0.5 });
      haptic("medium");
    }
  }

  function retry() {
    useProgressStore.getState().refreshHearts();
    if (useProgressStore.getState().hearts <= 0) {
      setGateOpen(true);
      return;
    }
    playSfx("unlock");
    haptic("medium");
    setSeed(newSeed()); // 換一套題
    setIndex(0);
    setAnswer("");
    setIsCorrect(null);
    setPhase("answering");
    setCorrectCount(0);
    setResult(null);
  }

  function exitToPath() {
    playSfx("tap");
    haptic("light");
    router.push(bookId ? `/book/${bookId}/` : "/");
  }

  function handleGateRefill() {
    const ok = buyHeartRefill();
    if (!ok) {
      playSfx("wrong", { volume: 0.35 });
      haptic("medium");
      return;
    }
    playSfx("unlock");
    haptic("success");
    setGateOpen(false);
    // 失敗頁上點補心 → 直接開新一輪
    if (result === "fail") retry();
  }

  // ============ 裝載 / 異常態 ============
  if (load.kind === "loading") {
    return (
      <main className="min-h-screen bg-bg-soft flex flex-col items-center justify-center gap-4">
        <Mascot mood="think" size={100} />
        <div className="text-sm font-extrabold text-ink-light">聰聰正在出題…</div>
      </main>
    );
  }
  if (load.kind === "error") {
    return (
      <main className="min-h-screen bg-bg-soft flex flex-col items-center justify-center px-5 text-center">
        <Mascot mood="sad" size={110} />
        <div className="text-lg font-extrabold text-ink mt-4">{load.message}</div>
        <SoundLink
          href="/"
          hapticIntensity="medium"
          className="btn-chunky-primary px-8 mt-6"
        >
          返回學習頁面
        </SoundLink>
      </main>
    );
  }

  // ============ 結果頁 ============
  if (result === "pass") {
    return (
      <main className="min-h-screen bg-bg-soft flex flex-col items-center justify-center px-5 relative overflow-hidden">
        <ConfettiCanvas active />
        <motion.div
          initial={{ scale: 0.6, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: "spring", damping: 16, stiffness: 220 }}
          className="text-center relative z-10 w-full max-w-sm"
        >
          <Mascot mood="cheer" size={150} reactTo="levelup" reactKey={1} />
          <h1 className="text-4xl font-extrabold text-primary mt-4">跳級成功！</h1>
          <p className="text-ink-light mt-2">
            你通過了前面內容的測驗，可以從{load.unitLabel}
            {load.unitTitle ? `「${load.unitTitle}」` : ""}繼續吧！
          </p>
          <motion.div
            initial={{ scale: 0, y: 10, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            transition={{ delay: 0.45, type: "spring", damping: 11 }}
            className="mt-5 inline-flex items-center gap-2 px-5 py-3 rounded-2xl font-extrabold text-base text-[#132C36]"
            style={{
              background: "linear-gradient(135deg, #FFC800, #FF9600)",
              boxShadow: "0 5px 0 0 #C89600",
            }}
          >
            <Crown className="w-5 h-5" />
            <span>前面 {passedCount} 節課已點亮</span>
          </motion.div>
          <p className="text-[11px] text-ink-softer mt-3">
            跳級點亮的課程算一顆星，隨時可以回去重玩拿三顆星
          </p>
          <button
            autoFocus
            onClick={exitToPath}
            className="btn-chunky-primary w-full mt-8"
          >
            去看新起點
          </button>
        </motion.div>
      </main>
    );
  }

  if (result === "fail") {
    return (
      <main className="min-h-screen bg-bg-soft flex flex-col items-center justify-center px-5">
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", damping: 18 }}
          className="text-center w-full max-w-sm"
        >
          <Mascot mood="sad" size={130} />
          <h1 className="text-3xl font-extrabold text-ink mt-4">差一點點！</h1>
          <p className="text-ink-light mt-2">
            這次答對 <span className="font-extrabold text-ink tabular-nums">{correctCount}/{total}</span>，
            答對 8 成就能跳級。先別灰心，換一套題再試試？
          </p>
          <div className="mt-4 inline-flex items-center gap-1.5 text-sm font-extrabold text-danger">
            <Heart className="w-4 h-4 fill-current" />
            <span>已消耗 1 顆紅心 · 剩餘 {hearts}</span>
          </div>
          <div className="flex flex-col gap-3 mt-8">
            <button
              onClick={retry}
              className={hearts > 0 ? "btn-chunky-primary w-full" : "btn-chunky-disabled w-full"}
              disabled={hearts <= 0 && gems < HEART_REFILL_COST}
            >
              {hearts > 0 ? "再試一次（換一套題）" : "補滿紅心再試"}
            </button>
            <button onClick={exitToPath} className="btn-chunky-ghost w-full">
              先回去把前面學好
            </button>
          </div>
        </motion.div>

        {/* 0 心補心遮罩 */}
        <HeartGateModal
          open={gateOpen}
          gems={gems}
          onRefill={handleGateRefill}
          onExit={exitToPath}
        />
      </main>
    );
  }

  // ============ 答題中 ============
  return (
    <motion.main animate={shakeControls} className="min-h-screen bg-bg-soft flex flex-col">
      {/* 頂欄：退出 + 進度條 + 跳級徽章 + 靜音 */}
      <div className="bg-white border-b border-bg-softer">
        <div className="max-w-md lg:max-w-2xl mx-auto px-3 py-2.5 flex items-center gap-2">
          <button
            type="button"
            onClick={exitToPath}
            className="h-11 w-11 -ml-1 inline-flex items-center justify-center rounded-full text-ink-light hover:text-ink hover:bg-bg-softer transition-colors shrink-0"
            aria-label="離開跳級測驗"
          >
            <Close className="w-5 h-5" />
          </button>
          <div className="flex-1 h-3 bg-bg-softer rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-warning rounded-full"
              initial={{ width: "0%" }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
          <div className="text-xs font-extrabold text-ink-softer tabular-nums shrink-0">
            {index + 1}/{total}
          </div>
          <MuteToggle />
        </div>
      </div>

      {/* 跳級上下文膠囊 */}
      <div className="max-w-md lg:max-w-2xl mx-auto w-full px-5 pt-4 flex items-center gap-2 flex-wrap">
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[#132C36] text-xs font-extrabold"
          style={{
            background: "linear-gradient(135deg, #FFC800, #FF9600)",
            boxShadow: "0 2px 0 0 #C89600",
          }}
        >
          <Lightning className="w-3 h-3" />
          跳級測驗 · 衝向{load.kind === "ready" ? load.unitLabel : `第 ${unitNumber} 單元`}
        </span>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-bg-softer text-ink-light text-[11px] font-extrabold">
          答對 {Math.ceil(total * JUMP_PASS_ACCURACY)} 題過關
        </span>
      </div>

      {/* 題目區 */}
      <div className="flex-1 flex flex-col items-center justify-start px-5 py-4 pb-40">
        <div className="w-full max-w-md lg:max-w-2xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${seed}-${index}`}
              initial={{ x: 30, y: 8, opacity: 0 }}
              animate={{ x: 0, y: 0, opacity: 1 }}
              exit={{ x: -30, y: 0, opacity: 0 }}
              transition={{ type: "spring", damping: 22, stiffness: 240 }}
            >
              {current && (
                <QuestionRenderer
                  question={current.question}
                  answer={answer}
                  phase={phase}
                  isCorrect={isCorrect}
                  onChange={setAnswer}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* a11y：實時播報判分結果 */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {phase === "checked" && isCorrect === true && "回答正確。"}
        {phase === "checked" && isCorrect === false && current &&
          `回答錯誤。正確答案是：${current.question.answer}。`}
      </div>

      {/* 底部：只有「檢查」——跳級測試沒有跳過 */}
      {phase === "answering" && (
        <div className="bg-white border-t-2 border-bg-softer">
          <div className="max-w-md lg:max-w-2xl mx-auto px-5 py-4">
            <button
              onClick={handleCheck}
              disabled={!answer.trim()}
              className={answer.trim() ? "w-full btn-chunky-primary" : "w-full btn-chunky-disabled"}
            >
              檢查
            </button>
          </div>
        </div>
      )}

      {/* 判分反饋（🚩 報錯可用；答錯不扣心、不入錯題本——只看總分） */}
      {phase === "checked" && current && (
        <FeedbackPanel
          isCorrect={isCorrect ?? false}
          explanation={current.question.explanation}
          explanationAudio={current.question.audio?.explanation ?? null}
          onContinue={handleContinue}
          reportContext={{
            lessonId: current.lessonId,
            question: current.question,
            userAnswer: answer || undefined,
          }}
        />
      )}

      {/* 0 心入口遮罩 */}
      <HeartGateModal
        open={gateOpen}
        gems={gems}
        onRefill={handleGateRefill}
        onExit={exitToPath}
      />
    </motion.main>
  );
}

/** 💔 0 心補心遮罩：補滿繼續 / 返回路徑 */
function HeartGateModal({
  open,
  gems,
  onRefill,
  onExit,
}: {
  open: boolean;
  gems: number;
  onRefill: () => void;
  onExit: () => void;
}) {
  return (
    <Modal open={open} dismissible={false} ariaLabel="紅心用完了">
      <div className="flex flex-col items-center text-center">
        <Mascot mood="sad" size={96} />
        <h2 className="text-2xl font-extrabold text-ink mt-3">紅心用完了！</h2>
        <p className="text-ink-light mt-2">跳級測驗要用紅心，補滿再來挑戰吧！</p>
        <div className="mt-3 inline-flex items-center gap-1.5 text-sm font-extrabold text-secondary-dark">
          <Gem className="w-4 h-4" />
          <span className="tabular-nums">目前寶石 {gems}</span>
        </div>
        <div className="flex flex-col gap-3 w-full mt-5">
          <button
            onClick={onRefill}
            disabled={gems < HEART_REFILL_COST}
            className={
              gems >= HEART_REFILL_COST
                ? "btn-chunky-primary w-full"
                : "btn-chunky-disabled w-full"
            }
          >
            <span className="inline-flex items-center justify-center gap-1.5">
              <Gem className="w-4 h-4" />
              用 {HEART_REFILL_COST} 寶石補滿（{MAX_HEARTS} 顆）
            </span>
          </button>
          {gems < HEART_REFILL_COST && (
            <p className="text-xs text-ink-softer -mt-1">
              寶石不夠，先回去學習存一點，紅心也會慢慢恢復
            </p>
          )}
          <button onClick={onExit} className="btn-chunky-ghost w-full">
            返回路徑
          </button>
        </div>
      </div>
    </Modal>
  );
}
