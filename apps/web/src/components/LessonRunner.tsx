"use client";
import { uiMotion } from "@/lib/motion";
import Link from 'next/link';
import { numberSkillForLesson, NUMBER_LESSONS, type NumberPracticeEvidence } from '@cstf/core/numberSense';

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useAnimation, useReducedMotion } from "framer-motion";
import dynamic from "next/dynamic";
import {
  Close,
  Flame,
  BookOpen,
  Target,
  XCircle,
  Lightning,
  Gem,
  Star,
  Heart,
} from "@/components/icons";
import type { Lesson, KnowledgeSummary } from "@/types";
import { dateKey } from "@cstf/core/week";
import { gradeAnswer } from "@/lib/grade";
import { cn } from "@/lib/cn";
import { SoundLink } from "./SoundLink";
import { MathText } from "@/components/MathText";
import { useProgressStore, MAX_HEARTS, HEART_REFILL_COST, type LessonOutcome } from "@/store/progress";
import {
  XP_PER_CORRECT,
  THREE_STAR_ACCURACY,
  TWO_STAR_ACCURACY,
  WEEKEND_XP_MULTIPLIER,
  EXAM_XP_MULTIPLIER,
  starsFromAccuracy,
  xpForLesson,
  isWeekendXpActive,
} from "@cstf/core/economy";
import { isExamLessonId, EXAM_CONQUER_ACCURACY } from "@/lib/exam";
import type { Quest } from "@cstf/core/quests";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import { useProgressTicker, formatMsCountdown } from "@/lib/useProgressTicker";
import { rollChestReward, type ChestSlot, type ChestRewardTier } from "@/lib/chestLogic";
import { HeartsBar } from "./HeartsBar";
import { HeartTimer } from "./HeartTimer";
import { QuestionRenderer, type QuestionPhase } from "./question/QuestionRenderer";
import { shouldIgnoreKey, isButtonTarget } from "./question/keyboard";
import { Mascot, type MascotMood, type MascotReaction } from "./Mascot";
import { MuteToggle, AutoNarrateToggle, useSyncMute } from "./MuteToggle";
import { TTSButton } from "./TTSButton";
import { useIntroNarration } from "@/lib/useIntroNarration";
import { NarrationNextButton } from "./NarrationNextButton";
import { useAutoNarrate } from "@/lib/useAutoNarrate";
import { uiAudio } from "@/lib/uiAudio";
import { playTTS } from "@/lib/tts";
import { ChestModal } from "./ChestModal";
import {
  decideMascotMood,
  decideMascotReaction,
  pickBubble,
  moodToTone,
  type MascotTriggerContext,
} from "@/lib/mascotTriggers";
import { getCosmeticById, type LessonBackdrop } from "@/lib/cosmetics";
import { CountingWarmup } from "./CountingWarmup";
import { lessonWarmupKind, resumeWarmupHandbook } from "@/lib/lessonWarmup";
import { SchoolWarmup } from './SchoolWarmup';
import { hasLessonProgress, restoreQuestionSession } from "@/lib/lessonSession";
import { lessonContentKey } from "@cstf/core/content";
import { LessonTime } from "@/lib/lessonTime";
import { answerReady } from "@/lib/questionDraft";
import type { QuestionType } from "@cstf/core";

/** 仿 Duolingo 題型膠囊文案（紫色 NEW WORD tag） */
function questionTagLabel(type: QuestionType): string {
  switch (type) {
    case "choice":
      return "選擇題";
    case "true_false":
      return "判斷題";
    case "fill_blank":
    case "calculation":
      return "計算填空";
    case "fill_blank_text":
      return "文字填空";
    case "word_order":
      return "排序";
    case "matching":
      return "連線配對";
    default:
      return "新題";
  }
}

// 重型/條件渲染的子元件：按需載入以減小 LessonRunner 初始 chunk
const FeedbackPanel = dynamic(
  () => import("./FeedbackPanel").then(m => ({ default: m.FeedbackPanel })),
  { ssr: false },
);
const Modal = dynamic(
  () => import("./Modal").then(m => ({ default: m.Modal })),
  { ssr: false },
);
const SpeechBubble = dynamic(
  () => import("./SpeechBubble").then(m => ({ default: m.SpeechBubble })),
  { ssr: false },
);
const ComboOverlay = dynamic(
  () => import("./ComboOverlay").then(m => ({ default: m.ComboOverlay })),
  { ssr: false },
);

/** 齒輪小圖示（僅課程頂欄移動端設定入口用，避免動 icons.tsx） */
function GearIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.09a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

/**
 * 頂欄下方一條小提示：「再答對 N 題就能拿到 三/二 星」
 *
 * 計算邏輯：假設剩餘題全對，最終準確率是 (correctCount + remaining) / total。
 * 反推"還差幾道連續答對就能跨過 0.95 / 0.75 閾值"。
 *
 * 首答口徑：answered = 已首答過的題數（錯題重排的復答不影響）。
 */
function StarDistanceHint({
  correctCount,
  answered,
  total,
}: {
  correctCount: number;
  answered: number;
  total: number;
}) {
  const remaining = total - answered;
  if (remaining <= 0 || total === 0) return null;

  // 當前所需答對數（達到三星 / 二星 的閾值 —— @cstf/core 單一事實源）
  const need3 = Math.ceil(THREE_STAR_ACCURACY * total);
  const need2 = Math.ceil(TWO_STAR_ACCURACY * total);

  // 還差多少道才能拿到對應星
  const missingFor3 = Math.max(0, need3 - correctCount);
  const missingFor2 = Math.max(0, need2 - correctCount);

  // 選優先順序最高的提示：三星仍然可達？否則二星？否則不顯示
  let label: string | null = null;
  let starsToShow = 0;
  let highlight = false;
  if (missingFor3 <= remaining) {
    label = `還差 ${missingFor3} 題就 三星`;
    starsToShow = 3;
    if (missingFor3 <= 1) highlight = true;
  } else if (missingFor2 <= remaining) {
    label = `還差 ${missingFor2} 題就 二星`;
    starsToShow = 2;
    if (missingFor2 <= 1) highlight = true;
  }

  if (!label) return null;

  return (
    <div className="max-w-md lg:max-w-2xl mx-auto w-full px-5 pt-2">
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={
          highlight
            ? { opacity: 1, y: 0, scale: [1, 1.04, 1] }
            : { opacity: 1, y: 0, scale: 1 }
        }
        transition={
          highlight
            ? { scale: { duration: 1.6, repeat: Infinity, ease: "easeInOut" } }
            : { duration: 0.3 }
        }
        className={cn(
          "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-extrabold border-2",
          highlight
            ? "border-warning bg-warning/15 text-warning"
            : "border-bg-softer bg-white text-ink-light",
        )}
      >
        <span className="inline-flex items-center gap-0.5 text-gold">
          {Array.from({ length: starsToShow }).map((_, i) => (
            <Star key={i} className="w-3 h-3 fill-current" />
          ))}
        </span>
        <span>{label}</span>
      </motion.div>
    </div>
  );
}

interface LessonRunnerProps {
  lesson: Lesson;
  /** 本節課緊跟的寶箱 slot（由 page.tsx 預計算） */
  chestSlot?: ChestSlot | null;
  nextLessonId?: string;
}

/** 結算頁的任務進度快照：before = 通關記賬前，after = 記賬後 */
interface QuestSnapshot {
  quest: Quest;
  before: number;
  after: number;
}

/**
 * 一次性通關成果快照。傳給 CompletionScreen 展示，
 * 避免 CompletionScreen 直接訪問中間態。
 */
interface SessionStats {
  /** 通關記賬原子結算單（recordLessonComplete 返回值） */
  outcome: LessonOutcome;
  accuracy: number;
  firstCorrect: number;
  totalQuestions: number;
  correctedCount: number;
  numberSenseEvidence?: NumberPracticeEvidence;
  practiceOnly: boolean;
  perfect: boolean;
  /** 本節是否享受週末雙倍 XP */
  weekend: boolean;
  /** ⚔️ 是否單元挑戰課（XP ×2，寶石 drip 不翻倍） */
  isExam: boolean;
  /** 單元征服：挑戰課 accuracy ≥ 0.8 */
  conquered: boolean;
  maxCombo: number;
  durationSec: number;
  chestReward: { slot: ChestSlot; gems: number; tier: ChestRewardTier } | null;
  /** 今天三條任務的 before/after 進度（任務進度幕用） */
  quests: QuestSnapshot[];
}

export function LessonRunner({ lesson, chestSlot = null, nextLessonId }: LessonRunnerProps) {
  useSyncMute();
  useProgressTicker(); // 紅心實時恢復
  const router = useRouter();
  const recordComplete = useProgressStore(s => s.recordLessonComplete);
  const addMistake = useProgressStore(s => s.addMistake);
  const loseHeart = useProgressStore(s => s.loseHeart);
  const upsertLessonSession = useProgressStore(s => s.upsertLessonSession);
  const clearLessonSession = useProgressStore(s => s.clearLessonSession);
  const addGems = useProgressStore(s => s.addGems);
  const claimChest = useProgressStore(s => s.claimChest);
  const buyHeartRefill = useProgressStore(s => s.buyHeartRefill);
  const addLearningTimeMs = useProgressStore(s => s.addLearningTimeMs);
  const chestAlreadyClaimed = useProgressStore(
    s => !!(chestSlot && s.claimedChests[chestSlot.id]),
  );
  const hearts = useProgressStore(s => s.hearts);
  const lastReviewHeartDate = useProgressStore(s => s.lastReviewHeartDate);
  const reviewHeartClaimed = lastReviewHeartDate === dateKey(new Date());
  const gems = useProgressStore(s => s.gems);
  const backdropId = useProgressStore(s => s.equippedBackdrop);
  const backdropStyle = useMemo<React.CSSProperties>(() => {
    const item = getCosmeticById(backdropId) as LessonBackdrop | undefined;
    if (!item || item.type !== "lesson_backdrop" || item.id === "backdrop_default") {
      return { background: "var(--app-bg, #FFFFFF)" };
    }
    // Keep equipped backgrounds visible while preserving dark-mode text contrast.
    return {
      background: `linear-gradient(var(--lesson-backdrop-overlay, transparent), var(--lesson-backdrop-overlay, transparent)), ${item.data.background}`,
    };
  }, [backdropId]);
  const prefersReduced = useReducedMotion();

  // 週末雙倍 XP（本地時間週六/週日）—— 所見即所得：預覽/飄字/結算全部按 ×2 顯示
  const [weekend] = useState(() => isWeekendXpActive());
  // ⚔️ 單元挑戰課：XP 總額 ×2（與週末可疊加 = ×4），寶石 drip 不翻倍
  const isExam = isExamLessonId(lesson.id);
  const numberSkill = numberSkillForLesson(lesson.id);
  const warmupKind = lessonWarmupKind(lesson);
  const xpMultiplier =
    (isExam ? EXAM_XP_MULTIPLIER : 1) * (weekend ? WEEKEND_XP_MULTIPLIER : 1);
  const xpPerCorrectShown = XP_PER_CORRECT * xpMultiplier;

  const questions = useMemo(() => lesson.questions, [lesson]);
  const contentKey = useMemo(() => lessonContentKey(lesson), [lesson]);
  const [contentUpdated, setContentUpdated] = useState(false);
  const total = questions.length;
  const questionById = useMemo(
    () => new Map(questions.map(q => [q.id, q])),
    [questions],
  );

  // 等待從 zustand persist 恢復已儲存的會話後再渲染，避免閃爍
  const [ready, setReady] = useState(false);
  // === 錯題重排佇列（REQUEUE，parity-14）===
  // currentId = 正在作答的題；queue = 之後待答的題（答錯的會被 push 回隊尾）
  const [currentId, setCurrentId] = useState<number | null>(
    () => questions[0]?.id ?? null,
  );
  const [queue, setQueue] = useState<number[]>(() => questions.slice(1).map(q => q.id));
  /** 已答對（離場）的題目 id，進度條口徑 */
  const [solved, setSolved] = useState<number[]>([]);
  /** 已首答過的題目 id 集合（accuracy 首答口徑；復答不重複計） */
  const attemptedRef = useRef<Set<number>>(new Set());
  /** 每次換題 +1，驅動題卡進出場動畫（同一題重排回來也要重新入場） */
  const [serveKey, setServeKey] = useState(0);
  const checkedServe = useRef(-1);
  const continuedServe = useRef(-1);
  const settled = useRef(false);

  const [answer, setAnswer] = useState("");
  const [hintLevels, setHintLevels] = useState<Record<number, number>>({});
  const [visualDraft, setVisualDraft] = useState<number[]>([]);
  const independentIds = useRef<Set<number>>(new Set());
  const [timeLimited, setTimeLimited] = useState(false);
  const [phase, setPhase] = useState<QuestionPhase>("answering");
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  /** 首答答對數（星級/XP 口徑） */
  const [correctCount, setCorrectCount] = useState(0);
  /** 首答答錯數（= missed 集合大小） */
  const [mistakeCount, setMistakeCount] = useState(0);
  const [done, setDone] = useState(false);
  const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);
  // 失敗頁僅在「使用者主動退出且 0 心」時出現；0 心進入時在恢復邏輯裡決定彈 Gate 還是失敗頁
  const [failed, setFailed] = useState(false);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  /** session 內累計 XP（首答口徑，展示 + 持久化） */
  const [sessionXp, setSessionXp] = useState(0);
  // +XP 飄字動畫佇列
  const [xpFloats, setXpFloats] = useState<
    { id: number; startX: number; startY: number; endX: number; endY: number }[]
  >([]);
  const xpFloatIdRef = useRef(0);
  const xpTargetRef = useRef<HTMLDivElement>(null);
  const [mascotReact, setMascotReact] = useState<MascotReaction>(null);
  const [mascotReactKey, setMascotReactKey] = useState(0);
  /** Mascot 當前的"持續表情"，由 mascotTriggers 上下文決定 */
  const [mascotMood, setMascotMood] = useState<MascotMood>("happy");
  const [bubbleText, setBubbleText] = useState<string | null>(null);
  const [bubbleTone, setBubbleTone] = useState<"neutral" | "primary" | "danger">("neutral");
  const [bubbleKey, setBubbleKey] = useState(0);
  const [comboOverlay, setComboOverlay] = useState<{ combo: number; key: number } | null>(null);
  // 標記是否曾經出現過連擊/彈層 —— 僅在首次需要時才 mount，觸發 dynamic chunk 按需載入
  const [comboMounted, setComboMounted] = useState(false);
  const [exitConfirmMounted, setExitConfirmMounted] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  // 斷心遮罩（web-lesson-5）：0 心時點「繼續」才彈，期間不清除會話
  const [gateMounted, setGateMounted] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  // 移動端設定小彈層（web-lesson-9）
  const [settingsMounted, setSettingsMounted] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showIntro, setShowIntro] = useState((lesson.knowledge !== null && !numberSkill) || warmupKind !== null);
  const questionScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (questionScrollRef.current) questionScrollRef.current.scrollTop = 0;
  }, [serveKey, ready, showIntro]);
  const [introPage, setIntroPage] = useState(0);
  const [introCompletedPages, setIntroCompletedPages] = useState<number[]>([]);
  const [warmupCounted, setWarmupCounted] = useState<number[]>([]);
  const [showHandbook, setShowHandbook] = useState(false);
  /**
   * 🔒 互動閘門（webrunner-5）：任何遮罩開啟時，題目區的鍵盤快捷鍵 / 點選 /
   * 配對題自動提交都必須停擺 —— 否則使用者在斷心遮罩前敲數字鍵就能把題判掉。
   */
  const locked = showExitConfirm || gateOpen || showSettings || showIntro || contentUpdated || timeLimited;

  const shakeControls = useAnimation();
  const progressControls = useAnimation();

  const lessonTime = useRef(new LessonTime());
  const bubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const comboTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 會話恢復：掛載時若存在同課程的持久化進度，恢復佇列/連擊/XP（web-lesson-12）
  useEffect(() => {
    // 先結算離線期間的自然迴心，再判斷 0 心入口
    useProgressStore.getState().refreshHearts();
    const stored = useProgressStore.getState().activeLesson;
    let sessionRestored = false;
    // 學習階段、草稿和反饋都可恢復；舊版已經結束的空佇列重新開課。
    const restored = stored && stored.lessonId === lesson.id && hasLessonProgress(stored)
      ? restoreQuestionSession(stored, questions.map(q => q.id), contentKey) : null;
    if (stored && restored?.currentId != null) {
      setCurrentId(restored.currentId);
      setQueue(restored.queue);
      setSolved(restored.solved);
      setPhase(restored.phase);
      setAnswer(restored.answer);
      setIsCorrect(restored.isCorrect);
      setCorrectCount(stored.correctCount);
      setMistakeCount(stored.mistakeCount);
      setCombo(stored.combo);
      setMaxCombo(stored.maxCombo ?? stored.combo);
      setSessionXp(stored.sessionXp ?? stored.correctCount * XP_PER_CORRECT);
      attemptedRef.current = new Set(restored.attempted);
      setHintLevels(stored.hintLevels ?? {});
      setVisualDraft(Array.isArray(stored.visualDraft) ? stored.visualDraft.filter(n => Number.isInteger(n) && n >= 0 && n < 10) : []);
      independentIds.current = new Set(Array.isArray(stored.independentIds) ? stored.independentIds.filter(id => questionById.has(id)) : []);
      lessonTime.current.reset(stored.activeTimeMs);
      setIntroPage(stored.introPage ?? 0);
      setShowHandbook(resumeWarmupHandbook(warmupKind, stored));
      setIntroCompletedPages(stored.introCompletedPages ?? []);
      setWarmupCounted(stored.warmupCounted ?? []);
      setShowIntro(stored.stage === "intro");
      sessionRestored = true;
    } else if (stored) {
      if (stored.lessonId === lesson.id && hasLessonProgress(stored) && stored.contentKey !== contentKey) setContentUpdated(true);
      // 切換到了新課程 / 舊版本留下的空會話 → 丟棄
      useProgressStore.getState().clearLessonSession();
    }
    // 0 心進入：有可續會話 → 彈斷心遮罩（可補心續課 / 去複習迴心）；
    // 全新開課 → 失敗頁（附迴心倒計時）
    if (!sessionRestored && useProgressStore.getState().dailyTimeLimitReached()) setTimeLimited(true);
    if (!numberSkill && useProgressStore.getState().hearts <= 0) {
      if (sessionRestored) {
        setGateMounted(true);
        setGateOpen(true);
      } else {
        setFailed(true);
      }
    }
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id]);

  // 持久化會話：只要還在答題，就把核心進度寫回 store
  useEffect(() => {
    if (!ready || done || failed || timeLimited) return;
    const persistedQueue = phase === "answering" && currentId != null ? [currentId, ...queue] : queue;
    upsertLessonSession({
      lessonId: lesson.id,
      index: solved.length,
      correctCount,
      mistakeCount,
      combo,
      startedAt: Date.now(), // retained for older clients; never used to infer elapsed time
      activeTimeMs: lessonTime.current.snapshot(),
      queueIds: persistedQueue,
      solvedIds: solved,
      maxCombo,
      sessionXp,
      stage: showIntro ? "intro" : "practice",
      introPage, introMode: showHandbook ? "handbook" : "warmup", introCompletedPages, warmupCounted,
      currentId, draftAnswer: answer, phase, checkedCorrect: isCorrect,
      attemptedIds: [...attemptedRef.current], totalQuestions: total,
      contentKey, hintLevels, visualDraft, independentIds: [...independentIds.current],
    });
  }, [
    ready,
    done,
    failed,
    showIntro,
    lesson.id,
    phase,
    currentId,
    queue,
    solved,
    correctCount,
    mistakeCount,
    combo,
    maxCombo,
    sessionXp,
    upsertLessonSession, answer, isCorrect, introPage, introCompletedPages, warmupCounted, total, showHandbook, contentKey, hintLevels, visualDraft, timeLimited,
  ]);

  // 通關時清除持久化會話。
  // ⚠️ failed 不清檔（webrunner-1）：失敗頁也提供「再來一次」，而斷心遮罩的
  // 「退出」承諾過「回來接著上次繼續」—— 清檔會直接毀掉整節課進度。
  useEffect(() => {
    if (done) {
      clearLessonSession();
    }
  }, [done, clearLessonSession]);

  // 💗 紅心自然恢復後自動收起斷心遮罩（webrunner-2）：
  // 遮罩是 dismissible={false} 的，沒有這條 effect 使用者會被鎖死在彈層裡。
  useEffect(() => {
    if (!gateOpen || hearts <= 0) return;
    setGateOpen(false);
    // 與「補心續課」同一分支：反饋看完了就端上下一題，答題中則原地接著答
    if (phase === "checked") serveNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gateOpen, hearts, phase]);

  // Daily allowance and completion use the same clock. Flush on hide, navigation,
  // BFCache entry and each heartbeat; no timestamps survive as running clocks.
  function flushLessonTime(pause = false) {
    const { deltaMs, totalMs } = lessonTime.current.checkpoint(pause);
    if (deltaMs > 0) addLearningTimeMs(deltaMs);
    const active = useProgressStore.getState().activeLesson;
    if (active?.lessonId === lesson.id && active.contentKey === contentKey) {
      upsertLessonSession({ ...active, activeTimeMs: totalMs });
    }
    return totalMs;
  }

  useEffect(() => {
    if (!ready || done || failed || timeLimited || showExitConfirm || gateOpen || showSettings || contentUpdated) return;
    const resume = () => { if (document.visibilityState === "visible") lessonTime.current.start(); };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushLessonTime(true);
      else resume();
    };
    const onHide = () => { flushLessonTime(true); };
    resume();
    const interval = setInterval(() => flushLessonTime(), 15_000);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("pageshow", resume);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("pageshow", resume);
      flushLessonTime(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, done, failed, timeLimited, showExitConfirm, gateOpen, showSettings, contentUpdated, lesson.id]);

  const current = currentId != null ? questionById.get(currentId) : undefined;
  const answeredFirst = correctCount + mistakeCount;
  const progress =
    total > 0 ? (Math.min(solved.length, total) / total) * 100 : 0;

  // 進度條寬度動畫（只在答對時前進：solved 才計入）
  useEffect(() => {
    progressControls.start({
      width: `${progress}%`,
      transition: { duration: 0.4, ease: "easeOut" },
    });
  }, [progress, progressControls]);

  function triggerReact(kind: MascotReaction) {
    setMascotReact(kind);
    setMascotReactKey(k => k + 1);
  }

  function showBubble(text: string, tone: "neutral" | "primary" | "danger" = "neutral", duration = 1800) {
    setBubbleText(text);
    setBubbleTone(tone);
    setBubbleKey(k => k + 1);
    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    bubbleTimerRef.current = setTimeout(() => setBubbleText(null), duration);
  }

  function showComboOverlay(c: number) {
    setComboMounted(true);
    setComboOverlay({ combo: c, key: Date.now() });
    if (comboTimerRef.current) clearTimeout(comboTimerRef.current);
    comboTimerRef.current = setTimeout(() => setComboOverlay(null), 1400);
    // 播放連擊里程碑語音
    const comboLabel = c === 3 ? "連擊 三連!" : c === 5 ? "連擊 五連!" : c === 10 ? "連擊 十連!" : null;
    if (comboLabel) void playTTS(uiAudio(comboLabel));
  }

  // 卸載時清計時器
  useEffect(() => {
    return () => {
      if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
      if (comboTimerRef.current) clearTimeout(comboTimerRef.current);
    };
  }, []);

  /**
   * 答錯 / 跳過共用的"判錯"流程：
   * 進入 checked 相位 → 錯題 push 回隊尾 → 清連擊、（首答）記錯題、扣心
   * → 觸感音效 + 抖動 + 氣泡 + 心碎音。0 心不立即失敗：點繼續時彈 Gate。
   */
  function applyWrongAnswer(firstAttempt: boolean) {
    if (!current) return;
    setIsCorrect(false);
    setPhase("checked");

    // ♻️ 錯題重排：答錯的題回到隊尾，全部做對才能結算（parity-14）
    setQueue(q => [...q, current.id]);

    // === 上下文感知的 mascot mood/reaction 決策 ===
    const triggerCtx: MascotTriggerContext = {
      isCorrect: false,
      isPerfectSession: false,
      attemptCount: firstAttempt ? 1 : 2,
      remainingHearts: numberSkill ? MAX_HEARTS : Math.max(0, hearts - 1),
      combo: 0,
      maxCombo,
      index: answeredFirst,
      total,
      totalCorrectInSession: correctCount,
    };
    const nextMood = decideMascotMood(triggerCtx);
    const nextReaction = decideMascotReaction(triggerCtx);
    setMascotMood(nextMood);

    setCombo(0);
    if (firstAttempt) {
      setMistakeCount(m => m + 1);
      addMistake(lesson.id, lesson.title, current);
    }

    // ★ T+0ms ★ 重觸覺 + 錯音
    haptic("heavy");
    playSfx("wrong");

    // ★ T+35ms ★ Mascot 反應（錯峰）
    setTimeout(() => triggerReact(nextReaction), 35);

    // ★ T+50ms ★ 題區抖動
    if (!prefersReduced) {
      setTimeout(() => {
        shakeControls.start({
          x: [0, -8, 8, -5, 5, 0],
          transition: { duration: 0.45 },
        });
      }, 50);
    }

    // ★ T+50ms ★ 氣泡按 mood
    setTimeout(
      () => showBubble(pickBubble(nextMood), moodToTone(nextMood), 1800),
      50,
    );

    // ★ T+120ms ★ 心碎音效（錯峰避免和 wrong 重疊）
    if (!numberSkill) setTimeout(() => playSfx("heartLoss"), 120);

    if (!numberSkill) loseHeart();
  }

  /** 跳過本題：不判分，直接按答錯處理（與多鄰國 SKIP 語義一致） */
  function skipQuestion() {
    if (locked || checkedServe.current === serveKey) return;
    if (!current || phase !== "answering") return;
    checkedServe.current = serveKey;
    const firstAttempt = !attemptedRef.current.has(current.id);
    attemptedRef.current.add(current.id);
    // 清掉已選答案，反饋階段只高亮正確答案
    setAnswer("");
    applyWrongAnswer(firstAttempt);
  }

  function handleCheck() {
    if (locked || checkedServe.current === serveKey) return;
    if (!current || phase !== "answering") return;
    if (!answerReady(current, answer)) return;
    checkedServe.current = serveKey;
    const firstAttempt = !attemptedRef.current.has(current.id);
    attemptedRef.current.add(current.id);
    const ok = gradeAnswer(current, answer);
    if (firstAttempt && ok && !hintLevels[current.id] && current.numberTask?.stage !== 'guided') independentIds.current.add(current.id);
    if (!ok) {
      applyWrongAnswer(firstAttempt);
      return;
    }
    setIsCorrect(true);
    setPhase("checked");

    // ✅ 答對：立刻離場（solved 計入進度條）
    setSolved(s => [...s, current.id]);

    // === 上下文感知的 mascot mood/reaction 決策 ===
    const newCombo = combo + 1;
    const triggerCtx: MascotTriggerContext = {
      isCorrect: true,
      isPerfectSession: mistakeCount === 0,
      attemptCount: firstAttempt ? 1 : 2,
      remainingHearts: hearts,
      combo: newCombo,
      maxCombo: Math.max(maxCombo, newCombo),
      index: answeredFirst,
      total,
      totalCorrectInSession: correctCount + (firstAttempt ? 1 : 0),
    };
    const nextMood = decideMascotMood(triggerCtx);
    const nextReaction = decideMascotReaction(triggerCtx);
    setMascotMood(nextMood);

    // XP / 星級按首答口徑：錯題重排後的復答不再加 XP（與結算入賬值對齊）
    if (firstAttempt) {
      setCorrectCount(c => c + 1);
      setSessionXp(xp => xp + XP_PER_CORRECT);
    }
    setCombo(newCombo);
    setMaxCombo(mc => (newCombo > mc ? newCombo : mc));

    // ★ T+0ms ★ 觸覺立即響應
    haptic("light");
    // ★ T+0ms ★ 音效（Web Audio 幾乎零延遲）
    playSfx("correct");

    // +XP 飄字：從螢幕中間飛到頂欄 XP 徽章（僅首答有 XP）
    if (firstAttempt && typeof window !== "undefined" && xpTargetRef.current) {
      const rect = xpTargetRef.current.getBoundingClientRect();
      const endX = rect.left + rect.width / 2;
      const endY = rect.top + rect.height / 2;
      const startX = window.innerWidth / 2;
      const startY = window.innerHeight * 0.45;
      const id = ++xpFloatIdRef.current;
      setXpFloats(list => [...list, { id, startX, startY, endX, endY }]);
    }

    // ★ T+35ms ★ Mascot 反應（錯峰，讓使用者先聽到聲音再看到動作）
    setTimeout(() => triggerReact(nextReaction), 35);

    // ★ T+200ms ★ 進度條脈衝：combo 越高，幅度越大（遞增刺激）
    if (!prefersReduced) {
      const pulseAmp = Math.min(1.6 + newCombo * 0.05, 2.1);
      setTimeout(() => {
        progressControls.start({
          scaleY: [1, pulseAmp, 1],
          transition: { duration: 0.35 },
        });
      }, 200);
    }

    // ★ T+50ms ★ 氣泡：按 mood 選擇文案
    setTimeout(
      () => showBubble(pickBubble(nextMood), moodToTone(nextMood), 1400),
      50,
    );

    // ★ T+320ms ★ Combo 里程碑
    if (newCombo === 3 || newCombo === 5 || newCombo === 10) {
      setTimeout(() => {
        playSfx("combo");
        showComboOverlay(newCombo);
      }, 320);
    }
  }

  /** 上一題收尾後端上下一題（錯題已在判錯時回到隊尾） */
  function serveNext() {
    const [next, ...rest] = queue;
    setCurrentId(next ?? null);
    setQueue(rest);
    setServeKey(k => k + 1);
    setAnswer("");
    setVisualDraft([]);
    setIsCorrect(null);
    setPhase("answering");
    setMascotMood("happy");
  }

  /** 通關結算：原子記賬 + 任務進度快照 + 凍結展示資料 */
  function finishLesson() {
    if (settled.current) return;
    settled.current = true;
    const accuracy = total > 0 ? correctCount / total : 0;
    const perfect = mistakeCount === 0 && total >= 3;
    const store = useProgressStore.getState();

    // 首次三星（該課歷史首次達 3 星）額外獎勵 —— 寫入前只讀快照判斷，
    // 真正的 perfectedLessons 標記由 recordLessonComplete 內部完成
    const alreadyPerfected = !!store.perfectedLessons[lesson.id];
    const firstPerfect = total >= 3 && starsFromAccuracy(accuracy) === 3 && !alreadyPerfected;
    // XP 公式單一事實源：@cstf/core xpForLesson（挑戰 ×2 → 週末再 ×2，可疊加）
    const xp = xpForLesson({
      correctCount,
      perfect,
      firstPerfect,
      isWeekend: weekend,
      isExam,
    });

    // 通關寶箱命中：有 chestSlot 且尚未領取
    const chestReward =
      chestSlot && !chestAlreadyClaimed
        ? { slot: chestSlot, ...rollChestReward() }
        : null;

    // 🗓️ 任務進度快照（記賬前），任務進度幕用 before → after 做推進動畫
    const questsToday = store.todayQuests();
    const before = questsToday.map(q => store.questProgress(q.kind));

    // 寫入 store（記錄 + 寶箱領取；首次完美的標記在 recordComplete 內部）
    if (chestReward) {
      claimChest(chestReward.slot.id);
      addGems(chestReward.gems);
    }
    const stageQuestions = (stage: 'independent' | 'transfer') => questions.filter(q => q.numberTask?.stage === stage);
    const numberSenseEvidence: NumberPracticeEvidence | undefined = numberSkill ? {
      independentCorrect: stageQuestions('independent').filter(q => independentIds.current.has(q.id)).length,
      independentTotal: stageQuestions('independent').length,
      transferCorrect: stageQuestions('transfer').filter(q => independentIds.current.has(q.id)).length,
      transferTotal: stageQuestions('transfer').length,
      hintsUsed: Object.values(hintLevels).filter(n => n > 0).length,
    } : undefined;
    const outcome = recordComplete(lesson.id, lesson.title, accuracy, xp, { questionCount: total, numberSense: numberSenseEvidence });
    const after = useProgressStore.getState();
    const quests: QuestSnapshot[] = questsToday.map((q, i) => ({
      quest: q,
      before: before[i],
      after: after.questProgress(q.kind),
    }));

    // 凍結一份展示快照供 CompletionScreen 用
    setSessionStats({
      outcome,
      numberSenseEvidence,
      accuracy,
      firstCorrect: correctCount, totalQuestions: total, correctedCount: mistakeCount, practiceOnly: total < 3,
      perfect,
      weekend,
      isExam,
      conquered: isExam && accuracy >= EXAM_CONQUER_ACCURACY,
      maxCombo,
      durationSec: Math.round(flushLessonTime(true) / 1000),
      chestReward,
      quests,
    });
    setDone(true);
  }

  function handleContinue() {
    if (locked) return;
    if (failed || done || phase !== "checked" || continuedServe.current === serveKey) return;
    continuedServe.current = serveKey;
    if (isCorrect) {
      if (queue.length === 0) {
        finishLesson();
        return;
      }
      serveNext();
      return;
    }
    // 答錯致 0 心：反饋面板看完、點繼續時才彈斷心遮罩（web-lesson-5）
    if (!numberSkill && hearts <= 0) {
      setGateMounted(true);
      setGateOpen(true);
      return;
    }
    serveNext();
  }

  // 配對題（web-lesson-11）：全部配完自動提交 canonical answer
  useEffect(() => {
    if (locked) return; // 遮罩開啟時不許自動判分（webrunner-5）
    if (phase !== "answering" || !current || current.type !== "matching") return;
    if (!answer.trim()) return;
    if (gradeAnswer(current, answer)) handleCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answer, phase, currentId, locked]);

  // ⌨️ 鍵盤快捷鍵（web-lesson-3）：Enter 提交 / 繼續，空格 繼續。
  // 數字選選項在各題目元件內實現（1-4 選項、1/2 判斷、1-8 配對、數字鍵盤）。
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (shouldIgnoreKey(e)) return;
      if (!ready || done || failed) return;
      if (locked) return;
      if (phase === "answering") {
        if (e.key === "Enter") {
          if (isButtonTarget(e)) return; // 焦點在按鈕上交給原生 click
          if (answer.trim()) {
            e.preventDefault();
            handleCheck();
          }
        }
        return;
      }
      // checked 相位：Enter / 空格 繼續
      if (e.key === "Enter" || e.key === " ") {
        if (isButtonTarget(e)) return;
        e.preventDefault();
        handleContinue();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  /**
   * 失敗後"重新開始"：本元件是純客戶端渲染，router.refresh() 不會重置
   * client state，必須手動把整個會話 state 歸零後從第一題重來。
   */
  function resetSession() {
    clearLessonSession();
    settled.current = false;
    checkedServe.current = -1; continuedServe.current = -1;
    setHintLevels({}); setVisualDraft([]); independentIds.current.clear();
    setCurrentId(questions[0]?.id ?? null);
    setQueue(questions.slice(1).map(q => q.id));
    setSolved([]);
    attemptedRef.current = new Set();
    setServeKey(k => k + 1);
    setAnswer("");
    setPhase("answering");
    setIsCorrect(null);
    setCorrectCount(0);
    setMistakeCount(0);
    setDone(false);
    setSessionStats(null);
    setFailed(false);
    setCombo(0);
    setMaxCombo(0);
    setSessionXp(0);
    setXpFloats([]);
    setMascotMood("happy");
    setBubbleText(null);
    setComboOverlay(null);
    setGateOpen(false);
    lessonTime.current.reset();
  }

  function handleRequestExit() {
    playSfx("tap");
    haptic("light");
    // 尚未判分時直接退出；已儲存的講解階段與草稿仍可續學。
    if (attemptedRef.current.size === 0 && solved.length === 0) {
      router.push(`/book/${lesson.bookId}/`);
      return;
    }
    setExitConfirmMounted(true);
    setShowExitConfirm(true);
  }

  function handleConfirmExit() {
    // 普通退出只離開頁面；持久化會話留給下次續學，重開由開始面板負責。
    playSfx("tap");
    haptic("light");
    router.push(`/book/${lesson.bookId}/`);
  }

  // ===== 斷心遮罩的三個出口 =====
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
    // 原地續課：判錯時錯題已回到隊尾 → 端上下一題；
    // 0 心恢復入口（answering 相位）直接關遮罩接著答當前題
    if (phase === "checked") serveNext();
  }

  function handleGateReview() {
    playSfx("tap");
    haptic("light");
    // 會話保留（不清除 activeLesson），複習完回來無縫續課
    router.push(`/review/runner/?from=hearts&lesson=${encodeURIComponent(lesson.id)}`);
  }

  function handleGateExit() {
    playSfx("tap");
    haptic("medium");
    setGateOpen(false);
    // 遮罩承諾過「回來接著上次繼續」→ 保留 activeLesson 直接返回（與 iOS onQuit 一致）。
    // 絕不能走 setFailed(true)：那會連帶清掉整節課的進度。
    router.push(`/book/${lesson.bookId}/`);
  }

  // ============ 首次載入佔位（等待 persist 恢復）============
  if (!ready) {
    return (
      <main className="min-h-screen bg-bg-soft flex items-center justify-center">
        <Mascot mood="think" size={100} />
      </main>
    );
  }

  if (timeLimited) return <main className="min-h-screen flex flex-col items-center justify-center text-center px-5 gap-4">
    <Mascot mood="happy" size={100}/><h1 className="text-2xl font-extrabold text-ink">今天先休息一下</h1>
    <p className="text-ink-light">今天的學習時間到了，已經開始的課程可以接著完成。</p>
    <Link className="btn-chunky-primary px-6" href={`/book/${lesson.bookId}/`}>回到學習路徑</Link>
  </main>;
  // ============ 完成頁 ============
  if (done && sessionStats) {
    return (
      <CompletionScreen
        lesson={lesson}
        stats={sessionStats}
        onNext={numberSkill === "apply" ? () => router.push("/number-sense/") : nextLessonId && !useProgressStore.getState().dailyTimeLimitReached() ? () => router.push(`/lesson/${lesson.bookId}/${nextLessonId}/`) : undefined}
        onBack={() => router.push(`/book/${lesson.bookId}/`)}
      />
    );
  }

  // ============ 失敗頁 ============
  if (failed) {
    return (
      <FailScreen
        lesson={lesson}
        onRetry={resetSession}
        onBack={() => router.push(`/book/${lesson.bookId}/`)}
      />
    );
  }

  // ============ 知識點講解（首次進入） ============
  if (contentUpdated) {
    return <main className="min-h-screen bg-bg-soft flex flex-col items-center justify-center px-5 gap-5 text-center">
      <Mascot mood="think" size={100} />
      <h1 className="text-2xl font-extrabold text-ink">先重新練一次吧</h1>
      <p className="max-w-sm text-ink-light">上次的練習需要重新核對，我們從這節課開頭再練。已經獲得的獎勵還在。</p>
      <button className="btn-chunky-primary px-8" onClick={() => setContentUpdated(false)}>開始學習</button>
    </main>;
  }
  if (showIntro && warmupKind === "count" && !showHandbook) {
    return <CountingWarmup counted={warmupCounted} onCount={id => setWarmupCounted(ids => ids.includes(id) ? ids : [...ids, id])}
      onStart={() => setShowIntro(false)} onHelp={() => setShowHandbook(true)} onExit={() => router.push(`/book/${lesson.bookId}/`)} />;
  }
  if (showIntro && warmupKind === 'school' && !showHandbook) {
    return <SchoolWarmup selected={warmupCounted[0]} onSelect={floor => setWarmupCounted([floor])}
      onStart={() => setShowIntro(false)} onHelp={() => setShowHandbook(true)} onExit={() => router.push(`/book/${lesson.bookId}/`)} />;
  }
  if (showIntro && lesson.knowledge) {
    return (
      <IntroCard
        lesson={lesson}
        knowledge={lesson.knowledge}
        pageIdx={introPage} setPageIdx={setIntroPage} completedPages={introCompletedPages}
        onPageComplete={page => setIntroCompletedPages(pages => pages.includes(page) ? pages : [...pages, page])}
        onStart={() => setShowIntro(false)}
        onExit={() => router.push(`/book/${lesson.bookId}/`)}
      />
    );
  }

  if (!current) {
    // 資料異常兜底（題目為空的課程）
    return (
      <main className="min-h-screen bg-bg-soft flex items-center justify-center">
        <Mascot mood="think" size={100} />
      </main>
    );
  }

  // ============ 答題中 ============
  return (
    <motion.main
      animate={shakeControls}
      className="lesson-screen flex flex-col relative"
      style={backdropStyle}
    >
      {/* +XP 飄字層 —— fixed 定位獨立於 layout，不影響滾動 */}
      <div className="pointer-events-none fixed inset-0 z-50">
        <AnimatePresence>
          {xpFloats.map(f => (
            <motion.div
              key={f.id}
              initial={{
                x: f.startX,
                y: f.startY,
                opacity: 0,
                scale: 0.4,
              }}
              animate={{
                x: [f.startX, (f.startX + f.endX) / 2, f.endX],
                y: [f.startY, f.startY - 30, f.endY],
                opacity: [0, 1, 1, 0],
                scale: [0.4, 1.25, 1.05, 0.7],
              }}
              transition={{ duration: 0.95, ease: "easeOut", times: [0, 0.15, 0.7, 1] }}
              onAnimationComplete={() =>
                setXpFloats(list => list.filter(x => x.id !== f.id))
              }
              className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center gap-1 px-3 py-1 rounded-full bg-gradient-to-r from-secondary to-secondary-dark text-white font-extrabold text-base"
              style={{
                boxShadow: "0 4px 0 0 #0d7aa8, 0 0 20px rgba(28, 176, 246, 0.4)",
                top: 0,
                left: 0,
              }}
            >
              <Lightning className="w-4 h-4" />
              +{xpPerCorrectShown}
              {isExam && (
                <span className="ml-0.5 text-[10px] font-extrabold bg-white/25 rounded-full px-1.5 py-0.5">
                  挑戰×2
                </span>
              )}
              {weekend && (
                <span className="ml-0.5 text-[10px] font-extrabold bg-white/25 rounded-full px-1.5 py-0.5">
                  週末×2
                </span>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* 大型 Combo Overlay —— 首次連擊時才 mount，避免冷啟動載入 */}
      {comboMounted && (
        <ComboOverlay
          triggerKey={comboOverlay?.key ?? 0}
          combo={comboOverlay?.combo ?? 0}
          visible={!!comboOverlay}
        />
      )}

      {/* 退出確認 —— 使用者第一次點關閉按鈕時才 mount */}
      {exitConfirmMounted && (
      <Modal ariaLabel="退出課程" open={showExitConfirm} onClose={() => setShowExitConfirm(false)}>
        <div className="flex flex-col items-center text-center">
          <Mascot mood="happy" size={96} />
          <h2 className="text-2xl font-extrabold text-ink mt-3">先休息一下？</h2>
          <p className="text-ink-light mt-2 mb-5">進度已儲存在這個瀏覽器，下次回來接著學。</p>
          <div className="flex flex-col gap-3 w-full">
            <button
              onClick={() => {
                playSfx("tap");
                haptic("light");
                setShowExitConfirm(false);
              }}
              className="btn-chunky-primary w-full"
            >
              繼續學習
            </button>
            <button
              onClick={handleConfirmExit}
              className="btn-chunky-ghost w-full"
            >
              儲存並退出
            </button>
          </div>
        </div>
      </Modal>
      )}

      {/* 💔 斷心遮罩（web-lesson-5）：0 心 + 看完反饋點繼續時彈出，不清會話 */}
      {gateMounted && (
      <Modal open={gateOpen} dismissible={false} ariaLabel="紅心用完了">
        <div className="flex flex-col items-center text-center">
          <Mascot mood="sad" size={96} />
          <h2 className="text-2xl font-extrabold text-ink mt-3">紅心用完了！</h2>
          <p className="text-ink-light mt-2">
            {reviewHeartClaimed ? "今天的複習迴心已經領取，紅心會慢慢恢復。也可以先鞏固練習。" : "補滿紅心繼續闖關，或者免費鞏固練習迴心。"}
          </p>
          <div className="mt-3 inline-flex items-center gap-1.5 text-sm font-extrabold text-secondary-dark">
            <Gem className="w-4 h-4" />
            <span className="tabular-nums">當前寶石 {gems}</span>
          </div>
          <div className="flex flex-col gap-3 w-full mt-5">
            <button
              onClick={handleGateRefill}
              disabled={gems < HEART_REFILL_COST}
              className={
                gems >= HEART_REFILL_COST
                  ? "btn-chunky-primary w-full"
                  : "btn-chunky-disabled w-full"
              }
            >
              <span className="inline-flex items-center justify-center gap-1.5">
                <Gem className="w-4 h-4" />
                用 {HEART_REFILL_COST} 寶石補滿繼續
              </span>
            </button>
            {gems < HEART_REFILL_COST && (
              <p className="text-xs text-ink-softer -mt-1">{reviewHeartClaimed ? "寶石不足，可以先休息或鞏固練習。" : "寶石不足，也可以免費鞏固練習迴心。"}</p>
            )}
            <button onClick={handleGateReview} className="btn-chunky-secondary w-full">
              {reviewHeartClaimed ? "去鞏固練習（今日迴心已領取）" : "去鞏固練習迴心"}
            </button>
            <p className="text-xs text-ink-softer -mt-1">做完複習回來，這節課會接著上次繼續</p>
            <button onClick={handleGateExit} className="btn-chunky-ghost w-full">
              先退出，進度幫你留著
            </button>
          </div>
        </div>
      </Modal>
      )}

      {/* ⚙️ 移動端設定小彈層（web-lesson-9）：音效 / 自動朗讀 */}
      {settingsMounted && (
      <Modal open={showSettings} onClose={() => setShowSettings(false)} ariaLabel="課程設定">
        <div className="flex flex-col">
          <h2 className="text-xl font-extrabold text-ink text-center mb-4">課程設定</h2>
          <div className="flex items-center justify-between py-3 border-b border-bg-softer">
            <span className="font-bold text-ink">自動朗讀</span>
            <AutoNarrateToggle />
          </div>
          <div className="flex items-center justify-between py-3">
            <span className="font-bold text-ink">音效</span>
            <MuteToggle />
          </div>
          <button
            onClick={() => {
              playSfx("tap");
              haptic("light");
              setShowSettings(false);
            }}
            className="btn-chunky-primary w-full mt-4"
          >
            好了
          </button>
        </div>
      </Modal>
      )}

      {/* Top bar: close, progress, combo, XP, hearts */}
      <div className="lesson-toolbar bg-white border-b border-bg-softer">
        <div className="max-w-md lg:max-w-2xl mx-auto px-3 py-2.5 flex items-center gap-2">
          <button
            type="button"
            onClick={handleRequestExit}
            className="ui-icon-button -ml-1 text-ink-light hover:text-ink hover:bg-bg-softer transition-colors shrink-0"
            aria-label="退出課程"
          >
            <Close className="w-5 h-5" />
          </button>
          <div className="flex-1 h-3 bg-bg-softer rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-primary rounded-full origin-left"
              animate={progressControls}
              initial={{ width: "0%" }}
              style={{ boxShadow: "inset 0 2px 0 rgba(255,255,255,0.35)" }}
            />
          </div>

          {/* Combo 徽章（頂欄） */}
          <AnimatePresence>
            {combo >= 3 && (
              <motion.div
                key={combo}
                initial={{ scale: 0, rotate: -20, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: "spring", damping: 12, stiffness: 260 }}
                className="h-8 px-2.5 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-warning to-gold text-white font-extrabold text-sm shadow-md tabular-nums"
              >
                <Flame className="w-4 h-4" />
                x{combo}
              </motion.div>
            )}
          </AnimatePresence>

          {/* 本節已得 XP 徽章（飄字目標）—— 週末按 ×2 顯示並掛角標 */}
          <motion.div
            ref={xpTargetRef}
            animate={
              sessionXp > 0
                ? { scale: [1, 1.22, 1] }
                : { scale: 1 }
            }
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="relative h-8 px-2.5 inline-flex items-center gap-1 rounded-full border-2 border-secondary/40 text-secondary-dark bg-secondary/10 font-extrabold text-sm select-none tabular-nums"
            aria-label="本節已得 XP"
          >
            <Lightning className="w-4 h-4" />
            <span>{sessionXp * xpMultiplier}</span>
            {xpMultiplier > 1 && (
              <span
                className="absolute -top-2 -right-2 text-[9px] leading-none font-extrabold text-white rounded-full px-1.5 py-0.5"
                style={{
                  background: isExam
                    ? "linear-gradient(135deg, #CE82FF, #7C3AED)"
                    : "linear-gradient(135deg, #1CB0F6, #1899D6)",
                  boxShadow: isExam ? "0 2px 0 0 #6b21a8" : "0 2px 0 0 #0d7aa8",
                }}
                aria-label={
                  isExam && weekend
                    ? "挑戰 + 週末雙倍 XP"
                    : isExam
                      ? "單元挑戰雙倍 XP"
                      : "週末雙倍 XP"
                }
              >
                ×{xpMultiplier}
              </span>
            )}
          </motion.div>

          {/* 桌面端（lg+）：完整紅心條 + 迴心倒計時 + 朗讀/音效開關 */}
          <div className="hidden lg:flex items-center gap-2">
            {numberSkill ? <span className="text-sm font-bold text-secondary-dark">放心試</span> : <HeartsBar total={MAX_HEARTS} remaining={hearts} />}
            {!numberSkill && <HeartTimer />}
            <AutoNarrateToggle />
            <MuteToggle />
          </div>

          {/* 移動端（<lg）：❤️×N 單徽章 + 齒輪設定，進度條重回視覺主角 */}
          <div className="flex lg:hidden items-center gap-1.5">
            {numberSkill ? <span className="text-xs font-extrabold text-secondary-dark whitespace-nowrap">放心試</span> : <div
              className={cn(
                "h-8 px-2 inline-flex items-center gap-0.5 rounded-full border-2 font-extrabold text-sm tabular-nums select-none",
                hearts > 0
                  ? "border-danger/30 bg-danger/10 text-danger"
                  : "border-bg-softer bg-bg-soft text-ink-softer",
              )}
              aria-label={`剩餘 ${hearts} 顆紅心`}
            >
              <Heart className={cn("w-4 h-4", hearts > 0 && "fill-current")} />
              <span>×{hearts}</span>
            </div>}
            {!numberSkill && hearts === 0 && <HeartTimer />}
            <button
              type="button"
              onClick={() => {
                playSfx("tap");
                haptic("light");
                setSettingsMounted(true);
                setShowSettings(true);
              }}
              className="ui-icon-button text-ink-light hover:text-ink hover:bg-bg-softer transition-colors"
              aria-label="課程設定"
            >
              <GearIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div ref={questionScrollRef} className="lesson-content">
      {/* 三星距離提示（動態：剩 N 題就三星 / 二星，臨近時會更激勵） */}
      {total >= 3 && !numberSkill && <StarDistanceHint
        correctCount={correctCount}
        answered={answeredFirst}
        total={total}
      />}

      {/* 吉祥物 + 氣泡 */}
      <div className="lesson-mascot max-w-md lg:max-w-2xl mx-auto w-full px-4 flex items-end gap-3" data-has-message={!!bubbleText}>
        <Mascot
          mood={phase === "checked" ? mascotMood : "happy"}
          size={72}
          reactTo={mascotReact}
          reactKey={mascotReactKey}
        />
        <div className="mb-2 h-8 flex items-end">
          <AnimatePresence mode="wait">
            {bubbleText && (
              <SpeechBubble key={bubbleKey} text={bubbleText} tone={bubbleTone} />
            )}
          </AnimatePresence>
        </div>
      </div>

      {total < 3 && <p className="max-w-md mx-auto px-5 pt-3 text-sm text-ink-light">微練習 · 先試一試，再透過更多情境鞏固</p>}

      {/* Question area */}
      <div className="lesson-body flex flex-col items-center justify-start">
        <div className="w-full max-w-md lg:max-w-2xl">
          {/* "NEW WORD" 紫色膠囊 tag —— 仿 Duolingo 題型標籤 */}
          <div className={cn("mb-3 inline-flex items-center gap-1.5 flex-wrap", numberSkill && "hidden")}>
            {/* ⚔️ 單元挑戰徽章（紫金） */}
            {isExam && (
              <span
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-white text-[11px] font-extrabold tracking-wider"
                style={{
                  background: "linear-gradient(135deg, #CE82FF, #7C3AED)",
                  border: "1.5px solid #FFC800",
                }}
              >
                ⚔️ 單元挑戰
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary/10 text-secondary-dark text-[11px] font-extrabold uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
              {questionTagLabel(current.type)}
            </span>
            {/* 錯題重答提示：這題之前答錯過，重排回來了 */}
            {attemptedRef.current.has(current.id) && phase === "answering" && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-warning/15 text-warning text-[11px] font-extrabold">
                <Flame className="w-3 h-3" />
                再試一次
              </span>
            )}
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={serveKey}
              initial={{ x: 12, y: 4, opacity: 0 }}
              animate={{ x: 0, y: 0, opacity: 1 }}
              exit={{ x: -12, y: 0, opacity: 0 }}
              transition={uiMotion.enter}
            >
              <QuestionRenderer
                question={current}
                answer={answer}
                phase={phase}
                isCorrect={isCorrect}
                onChange={setAnswer}
                locked={locked}
                visualDraft={visualDraft} onVisualDraft={setVisualDraft}
                hintLevel={hintLevels[current.id] ?? 0}
                onHint={() => { if (!locked && phase === 'answering') setHintLevels(levels => ({ ...levels, [current.id]: Math.min(2, (levels[current.id] ?? 0) + 1) })); }}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {lesson.knowledge && <details className="lesson-handbook max-w-md lg:max-w-2xl w-full">
        <summary className="cursor-pointer min-h-11 flex items-center text-secondary-dark font-bold">聰聰的講解手冊</summary>
        <div className="rounded-2xl bg-white border-2 border-bg-softer p-4 text-ink leading-relaxed space-y-3">
          <MathText text={lesson.knowledge.core_concept} />
          <TTSButton src={lesson.knowledge.audio?.core_concept} label="朗讀知識講解" />
          <MathText text={lesson.knowledge.key_formula} />
          <MathText text={lesson.knowledge.tips} />
        </div>
      </details>}
      </div>

      {/* a11y: 螢幕閱讀器實時播報答題結果（僅 sr-only） */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {phase === "checked" && isCorrect === true && `回答正確。${current.explanation ?? ""}`}
        {phase === "checked" && isCorrect === false &&
          `回答錯誤。正確答案是：${current.answer}。${current.explanation ?? ""}`}
      </div>

      {/* Bottom: SKIP / CHECK 雙按鈕（仿 Duolingo 真機底欄） */}
      {phase === "answering" && (
        <div className="lesson-actions bg-white border-t-2 border-bg-softer">
          <div className="max-w-md lg:max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
            <button
              type="button"
              onClick={skipQuestion}
              className="btn-chunky-ghost px-6"
              aria-label="跳過本題"
            >
              跳過
            </button>
            <button
              onClick={handleCheck}
              disabled={!answerReady(current, answer)}
              className={answerReady(current, answer) ? "flex-1 btn-chunky-primary" : "flex-1 btn-chunky-disabled"}
            >
              檢查
            </button>
          </div>
        </div>
      )}

      {phase === "checked" && (
        <FeedbackPanel
          isCorrect={isCorrect ?? false}
          explanation={current.explanation}
          explanationAudio={current.audio?.explanation ?? null}
          onContinue={handleContinue}
          reportContext={{
            lessonId: lesson.id,
            question: current,
            userAnswer: answer || undefined,
          }}
        />
      )}
    </motion.main>
  );
}

// ============================================================
// 完成 / 失敗子頁
// ============================================================

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function CompletionScreen({ lesson, stats, onBack, onNext }: { lesson: Lesson; stats: SessionStats; onBack: () => void; onNext?: () => void }) {
  const { outcome } = stats;
  const skill = numberSkillForLesson(lesson.id);
  const [chestOpen, setChestOpen] = useState(false);
  useEffect(() => { playSfx("complete"); haptic("success"); }, []);
  const heading = stats.practiceOnly ? "完成一次微練習" : stats.correctedCount > 0 ? "你把錯題改對了！" : "本節練習完成！";
  return <main className="min-h-screen bg-bg-soft px-5 py-8">
    <div className="max-w-md mx-auto text-center">
      <Mascot mood="cheer" size={100} />
      <h1 className="text-2xl font-extrabold text-ink mt-3">{heading}</h1>
      <p className="text-ink-light mt-2">{lesson.title}</p>
      {skill && stats.numberSenseEvidence && <div className="mt-4 p-4 rounded-2xl bg-secondary/10 text-left text-ink space-y-2">
        <p className="font-extrabold">今天練習了：{NUMBER_LESSONS[skill].goal}</p>
        <p>無提示首答：{stats.numberSenseEvidence.independentCorrect}/{stats.numberSenseEvidence.independentTotal} · 換情境：{stats.numberSenseEvidence.transferCorrect}/{stats.numberSenseEvidence.transferTotal}</p>
        <p>{stats.numberSenseEvidence.hintsUsed > 0 ? `有 ${stats.numberSenseEvidence.hintsUsed} 題看過提示。會求助、會改錯也在進步。` : "這次沒有查看提示。"}</p>
        <p>明天用新題看看還會不會，今天先不標成“隔天仍會”。</p>
        <Link href="/number-sense/" className="min-h-11 inline-flex items-center text-secondary-dark font-bold underline">查看單元學習記錄</Link>
      </div>}
      {skill ? null : stats.practiceOnly ? <p className="mt-3 text-sm text-ink-light">一次作答是一個開始。再練不同情境，才能更瞭解這個知識點。</p> :
        <div className="flex justify-center gap-2 mt-4" aria-label={`本次練習 ${outcome.stars} 星`}>
          {[1, 2, 3].map(n => <Star key={n} className={cn("w-9 h-9", n <= outcome.stars ? "text-gold fill-current" : "text-ink-softer")} />)}
        </div>}
      <div className="grid grid-cols-2 gap-3 mt-5">
        <StatCard label="首次答對" value={`${stats.firstCorrect}/${stats.totalQuestions}`} color={stats.accuracy >= .8 ? "text-primary-dark" : "text-ink"} />
        <StatCard label={stats.correctedCount > 0 ? "重練後答對" : "練習結束答對"} value={`${stats.totalQuestions}/${stats.totalQuestions}`} color="text-primary-dark" />
        <StatCard label="經驗" value={`+${outcome.xpGained}`} color="text-secondary-dark" />
        <StatCard label="寶石" value={`+${outcome.gemsGained + outcome.milestoneGems + (stats.chestReward?.gems ?? 0)}`} color="text-secondary-dark" icon="gem" />
      </div>
      {stats.correctedCount > 0 && <p className="mt-4 text-sm text-ink">認真改對了 {stats.correctedCount} 道題。首答成績幫你找到要鞏固的地方，改錯也是進步。</p>}
      <div className="mt-4 rounded-2xl border-2 border-bg-softer bg-white p-4 text-left text-sm text-ink space-y-2">
        <p>🔥 連續學習 {outcome.streakAfter} 天 · 前臺學習用時 {formatTime(stats.durationSec)}</p>
        {outcome.dailyGoalReachedNow && <p>🎯 今日目標達成，獎勵已到賬</p>}
        {outcome.milestoneGems > 0 && <p>🎉 連勝里程碑！+{outcome.milestoneGems} 寶石已到賬</p>}
        {stats.conquered && <p>⚔️ 單元挑戰達標</p>}
        {stats.quests.map(({ quest, after }) => <p key={quest.id}>{after >= quest.target ? "✓" : "○"} {quest.title} · {Math.min(after, quest.target)}/{quest.target}</p>)}
      </div>
      {stats.chestReward && <button type="button" className="min-h-11 mt-3 text-secondary-dark font-bold" onClick={() => setChestOpen(true)}>看看寶箱獎勵（已到賬）</button>}
      <button autoFocus type="button" className="btn-chunky-primary w-full mt-5" onClick={onNext ?? onBack}>{skill === "apply" ? "回到單元，看看進步" : onNext ? "下一課" : "回到學習路徑"}</button>
      {onNext && <button type="button" className="min-h-11 mt-2 text-ink-light font-bold" onClick={onBack}>先休息一下</button>}
      <p className="text-xs text-ink-light mt-3">學習成果已儲存 · 每日任務獎勵可在“我的”領取</p>
      {stats.chestReward && <ChestModal open={chestOpen} gems={stats.chestReward.gems} tier={stats.chestReward.tier} onClose={() => setChestOpen(false)} />}
    </div>
  </main>;
}

function StatCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string;
  color: string;
  icon?: "gem";
}) {
  return (
    <div
      className="bg-white rounded-2xl p-3 border-2 border-bg-softer text-center"
      style={{ boxShadow: "0 4px 0 0 var(--shadow-card-color)" }}
    >
      <div className="text-[10px] uppercase tracking-wider text-ink-softer font-extrabold flex items-center justify-center gap-1">
        {icon === "gem" && <Gem className="w-3 h-3 text-secondary" />}
        {label}
      </div>
      <div className={`text-xl font-extrabold tabular-nums mt-1 ${color}`}>
        {value}
      </div>
    </div>
  );
}

// ============================================================
// IntroCard — 多鄰國 Tips 風格的分步講解
// 每屏只講一件事（core_concept / key_formula / common_mistakes / tips）
// 為小朋友設計：吉祥物反應 + 多層音效 + 彈性動畫 + 鼓勵氣泡
// ============================================================

type IntroTone = "concept" | "rule" | "mistake" | "tip";

interface IntroPage {
  tone: IntroTone;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  accent: string; // hex，用於進度點和底部裝飾
  mascotMood: MascotMood; // 每頁吉祥物心情
  bubbleText: string; // 吉祥物氣泡鼓勵語
  /** 該頁要按順序自動播的所有 TTS 音訊。單欄位頁只有一段，mistake 頁有多段。 */
  audioSrcs?: Array<string | null | undefined>;
  /** 給標題旁的 TTSButton 用的"代表音訊"。單段頁 = audioSrcs[0]；多段頁留空，避免重複。 */
  titleAudio?: string;
  /** 自定義 render，可接收當前播放索引（僅 mistake 頁用） */
  render: (playingIdx: number) => React.ReactNode;
}

function IntroCard({
  lesson,
  knowledge,
  pageIdx, setPageIdx, completedPages, onPageComplete,
  onStart,
  onExit,
}: {
  lesson: Lesson;
  knowledge: KnowledgeSummary;
  pageIdx: number;
  setPageIdx: React.Dispatch<React.SetStateAction<number>>;
  completedPages: number[];
  onPageComplete: (page: number) => void;
  onStart: () => void;
  onExit: () => void;
}) {
  // 動態組裝存在的頁面（缺欄位自動跳過）
  const pages: IntroPage[] = [];
  if (knowledge.core_concept) {
    pages.push({
      tone: "concept",
      title: "這是什麼？",
      icon: BookOpen,
      iconBg: "bg-secondary/15",
      iconColor: "text-secondary-dark",
      accent: "#1CB0F6",
      mascotMood: "think",
      bubbleText: "一起學！",
      audioSrcs: [knowledge.audio?.core_concept],
      titleAudio: knowledge.audio?.core_concept,
      render: () => (
        <p className="text-ink leading-relaxed text-lg">
          <MathText text={knowledge.core_concept} />
        </p>
      ),
    });
  }
  if (knowledge.key_formula) {
    pages.push({
      tone: "rule",
      title: "記住這個！",
      icon: Target,
      iconBg: "bg-primary/15",
      iconColor: "text-primary-dark",
      accent: "#58CC02",
      mascotMood: "wave",
      bubbleText: "超級重要!",
      audioSrcs: [knowledge.audio?.key_formula],
      titleAudio: knowledge.audio?.key_formula,
      render: () => (
        <div className="bg-bg-soft border-2 border-bg-softer rounded-2xl px-5 py-5 text-center">
          <div className="text-xl text-ink font-bold leading-relaxed">
            <MathText text={knowledge.key_formula} />
          </div>
        </div>
      ),
    });
  }
  if (Array.isArray(knowledge.common_mistakes) && knowledge.common_mistakes.length > 0) {
    pages.push({
      tone: "mistake",
      title: "一起想一想",
      icon: XCircle,
      iconBg: "bg-danger/15",
      iconColor: "text-danger-dark",
      accent: "#FF4B4B",
      mascotMood: "surprise",
      bubbleText: "一起學！",
      audioSrcs: knowledge.audio?.common_mistakes,
      render: (playingIdx: number) => (
        <ul className="space-y-3">
          {knowledge.common_mistakes.map((m, i) => {
            const isPlaying = i === playingIdx;
            return (
              <li
                key={i}
                className={cn(
                  "flex items-start gap-3 rounded-2xl px-4 py-3 border-2 transition-all duration-300",
                  isPlaying
                    ? "bg-danger/15 border-danger ring-4 ring-danger/20 scale-[1.02]"
                    : "bg-danger/5 border-danger/20",
                )}
              >
                <div
                  className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 transition-colors",
                    isPlaying
                      ? "bg-danger text-white"
                      : "bg-danger/20 text-danger-dark",
                  )}
                >
                  <XCircle className="w-4 h-4" />
                </div>
                <div className="flex-1 text-ink leading-relaxed text-base">
                  <MathText text={m} />
                </div>
                <TTSButton
                  src={knowledge.audio?.common_mistakes?.[i] ?? null}
                  size="sm"
                  label="朗讀"
                  disabled={narration.status === "playing" || narration.status === "loading"}
                  onPlay={narration.locked ? narration.start : undefined}
                />
              </li>
            );
          })}
        </ul>
      ),
    });
  }
  if (knowledge.tips) {
    pages.push({
      tone: "tip",
      title: "學習小妙招",
      icon: Lightning,
      iconBg: "bg-warning/20",
      iconColor: "text-warning",
      accent: "#FFC800",
      mascotMood: "cheer",
      bubbleText: "你最棒!",
      audioSrcs: [knowledge.audio?.tips],
      titleAudio: knowledge.audio?.tips,
      render: () => (
        <p className="text-ink leading-relaxed text-lg">
          <MathText text={knowledge.tips} />
        </p>
      ),
    });
  }

  // 異常保護：知識點全是空的就直接開始
  useEffect(() => {
    if (pages.length === 0) onStart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [direction, setDirection] = useState<1 | -1>(1);
  const [mascotReactKey, setMascotReactKey] = useState(0);
  const isLast = pageIdx >= pages.length - 1;
  const current = pages[pageIdx];
  const contentSources = current?.audioSrcs ?? [];
  const narration = useIntroNarration(
    [uiAudio(current?.bubbleText ?? ""), ...(current?.audioSrcs ?? [])],
    `${lesson.id}:${pageIdx}`,
    contentSources.some(Boolean),
    completedPages.includes(pageIdx),
  );
  useEffect(() => { if (narration.status === "done") onPageComplete(pageIdx); }, [narration.status, pageIdx, onPageComplete]);
  const cancelNarrate = narration.cancel;
  const bubbleCount = uiAudio(current?.bubbleText ?? "") ? 1 : 0;
  const playingContent = narration.status === "playing" ? narration.segment - bubbleCount : -1;
  const playableMistakes = contentSources.map((src, i) => src ? i : -1).filter(i => i >= 0);
  const playingMistakeIdx = playingContent >= 0 ? (playableMistakes[playingContent] ?? -1) : -1;

  // 進入每一頁時：觸發吉祥物反應動畫 + 分層音效
  // 注意：依賴裡只放 pageIdx，不能放 current（current 是 pages[pageIdx]，每次渲染都是新物件引用，會觸發無限迴圈）
  useEffect(() => {
    if (pages.length === 0) return;
    setMascotReactKey(k => k + 1);
    // 圖示徽章彈入時再補一聲輕響（和動畫節拍一致）
    const t = setTimeout(() => playSfx("progressTick"), 140);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageIdx]);

  function goNext() {
    if (narration.locked) return;
    cancelNarrate();
    if (isLast) {
      // 最後一步：從"學"過渡到"練"，多層音效 + 強反饋
      playSfx("unlock");
      setTimeout(() => playSfx("star"), 120);
      haptic("medium");
      setTimeout(() => haptic("heavy"), 140);
      onStart();
      return;
    }
    // 翻頁：tap + star 疊加，帶來清脆的"咔嗒+叮"雙層反饋
    playSfx("tap");
    setTimeout(() => playSfx("star", { volume: 0.6 }), 60);
    haptic("light");
    setDirection(1);
    setPageIdx(i => i + 1);
  }

  function goPrev() {
    if (pageIdx === 0) return;
    cancelNarrate();
    playSfx("tap");
    haptic("light");
    setDirection(-1);
    setPageIdx(i => i - 1);
  }

  if (!current) return null;
  const Icon = current.icon;

  return (
    <main className="min-h-screen bg-bg flex flex-col overflow-x-hidden">
      {/* 頂欄：關閉 + 進度點 */}
      <div className="bg-white border-b border-bg-softer">
        <div className="max-w-md lg:max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              playSfx("tap");
              haptic("light");
              onExit();
            }}
            className="w-11 h-11 inline-flex items-center justify-center text-ink-light hover:text-ink transition-colors shrink-0"
            aria-label="退出課程"
          >
            <Close className="w-6 h-6" />
          </button>
          <div className="flex-1 flex items-center justify-center gap-1.5">
            {pages.map((p, i) => {
              const active = i === pageIdx;
              const done = i < pageIdx;
              return (
                <motion.span
                  key={i}
                  animate={{
                    width: active ? 24 : 8,
                    backgroundColor: done ? p.accent : active ? current.accent : "#E5E5E5",
                  }}
                  transition={{ type: "spring", damping: 22, stiffness: 260 }}
                  className="h-2 rounded-full"
                />
              );
            })}
          </div>
          <div className="text-xs font-extrabold text-ink-softer tabular-nums shrink-0 w-10 text-right">
            {pageIdx + 1}/{pages.length}
          </div>
        </div>
      </div>

      {/* 單元 & 課程標題（小） */}
      <div className="max-w-md lg:max-w-2xl mx-auto w-full px-5 pt-3 text-center">
        <div className="text-xs font-bold text-ink-softer uppercase tracking-wide">
          {lesson.unitLabel ?? `第 ${lesson.unitNumber} 單元`} · {lesson.unitTitle}
        </div>
        <div className="text-base font-extrabold text-ink-light mt-0.5 truncate">
          {lesson.title}
        </div>
      </div>

      {/* 主內容：單頁聚焦 */}
      <div className="flex-1 flex items-center px-5 py-4">
        <div className="max-w-md lg:max-w-2xl mx-auto w-full">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={pageIdx}
              custom={direction}
              initial={{ x: direction * 12, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: direction * -12, opacity: 0 }}
              transition={{ type: "spring", damping: 20, stiffness: 240 }}
              className="flex flex-col items-center text-center"
            >
              {/* 吉祥物 + 氣泡 */}
              <div className="flex items-end gap-2 mb-2 min-h-[96px]">
                <motion.div
                  initial={{ y: 14, scale: 0.8, opacity: 0 }}
                  animate={{ y: 0, scale: 1, opacity: 1 }}
                  transition={{ type: "spring", damping: 12, stiffness: 220, delay: 0.05 }}
                >
                  <Mascot
                    mood={current.mascotMood}
                    size={84}
                    reactTo="levelup"
                    reactKey={mascotReactKey}
                  />
                </motion.div>
                <motion.div
                  initial={{ y: 8, scale: 0, opacity: 0 }}
                  animate={{ y: 0, scale: 1, opacity: 1 }}
                  transition={{ type: "spring", damping: 14, stiffness: 240, delay: 0.18 }}
                  className="mb-3"
                >
                  <SpeechBubble
                    text={current.bubbleText}
                    tone={
                      current.tone === "mistake"
                        ? "danger"
                        : current.tone === "concept" || current.tone === "rule"
                        ? "primary"
                        : "neutral"
                    }
                  />
                </motion.div>
              </div>

              {/* 圖示徽章 + 脈衝光環 */}
              <motion.div
                initial={{ scale: 0.5, rotate: -20, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ type: "spring", damping: 10, stiffness: 220, delay: 0.12 }}
                className="relative mb-4"
              >
                {/* 脈衝光圈 */}
                <motion.div
                  aria-hidden
                  animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute inset-0 rounded-full"
                  style={{ backgroundColor: `${current.accent}33` }}
                />
                {/* 懸浮漂浮的圖示圓 */}
                <motion.div
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                  className={`relative w-20 h-20 rounded-full ${current.iconBg} flex items-center justify-center`}
                  style={{ boxShadow: `0 6px 0 0 ${current.accent}44` }}
                >
                  <motion.div
                    animate={{ rotate: [0, -6, 6, -4, 4, 0] }}
                    transition={{ duration: 0.9, delay: 0.3 }}
                  >
                    <Icon className={`w-10 h-10 ${current.iconColor}`} />
                  </motion.div>
                </motion.div>
              </motion.div>

              {/* 標題 */}
              <motion.div
                initial={{ y: 12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ type: "spring", damping: 16, stiffness: 260, delay: 0.2 }}
                className="flex items-center justify-center gap-3 mb-4"
              >
                <h1 className="text-3xl font-extrabold text-ink leading-tight">
                  {current.title}
                </h1>
                {current.titleAudio && (
                  <TTSButton src={current.titleAudio} label="朗讀講解"
                    disabled={narration.status === "playing" || narration.status === "loading"}
                    onPlay={narration.locked ? narration.start : undefined} />
                )}
              </motion.div>

              {/* 內容（繼承父級居中） */}
              <motion.div
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.28, duration: 0.35 }}
                className="w-full max-w-prose mx-auto"
              >
                {current.render(playingMistakeIdx)}
              </motion.div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <button type="button" className="min-h-11 mx-auto px-5 py-3 text-secondary-dark font-bold" onClick={() => { cancelNarrate(); onStart(); }}>先試試，講解可以隨時再看</button>
      {/* 底部：上一步 + 主按鈕 */}
      <div className="bg-white border-t-2 border-bg-softer" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {narration.locked && (narration.muted || narration.status === "error") && <div className="max-w-md lg:max-w-2xl mx-auto px-5 pt-3 text-center text-sm text-ink-light" role="status">
          {narration.locked && narration.muted ? (
            <><span>當前已靜音，可以閱讀後繼續。</span><button type="button" onClick={narration.continueWithoutAudio} className="ml-3 min-h-11 inline-flex items-center font-bold text-secondary-dark underline">閱讀後繼續</button></>
          ) : narration.locked && narration.status === "error" ? (
            <><span>語音暫時無法播放。</span><button type="button" onClick={narration.start} className="ml-3 min-h-11 inline-flex items-center font-bold text-secondary-dark underline">重新播放</button><button type="button" onClick={narration.continueWithoutAudio} className="ml-3 min-h-11 inline-flex items-center font-bold text-ink-light underline">閱讀後繼續</button></>
          ) : null}
        </div>}
        <div className="max-w-md lg:max-w-2xl mx-auto px-5 py-4 flex items-center gap-3">
          {pageIdx > 0 ? (
            <motion.button
              type="button"
              onClick={goPrev}
              whileTap={{ scale: 0.94 }}
              aria-label="上一步"
              className="btn-chunky-ghost shrink-0 !px-4 text-xl"
            >
              ←
            </motion.button>
          ) : null}
          <NarrationNextButton
            locked={narration.locked}
            progress={narration.progress}
            isLast={isLast}
            onClick={goNext}
          />
        </div>
      </div>
    </main>
  );
}

function FailScreen({
  lesson,
  onRetry,
  onBack,
}: {
  lesson: Lesson;
  onRetry: () => void;
  onBack: () => void;
}) {
  const now = useProgressTicker();
  const hearts = useProgressStore(s => s.hearts);
  const lastReviewHeartDate = useProgressStore(s => s.lastReviewHeartDate);
  const reviewHeartClaimed = lastReviewHeartDate === dateKey(new Date());
  const nextHeartAt = useProgressStore(s => s.nextHeartAt);
  const canRetry = hearts > 0;
  const msToNext = nextHeartAt ? Math.max(0, nextHeartAt - now) : 0;

  return (
    <main className="min-h-screen bg-bg-soft flex flex-col items-center justify-center px-5">
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", damping: 18 }}
        className="flex flex-col items-center"
      >
        <Mascot mood="sad" size={140} />
        <h1 className="text-3xl font-extrabold text-danger mt-4">
          {canRetry ? "沒關係，再來一次！" : "紅心用完啦"}
        </h1>
        <p className="text-ink-light mt-2 mb-4">{lesson.title}</p>

        {!canRetry && nextHeartAt && (
          <div className="mb-6 text-center">
            <p className="text-sm text-ink-light">下一顆心還需</p>
            <div className="text-3xl font-extrabold text-danger tabular-nums mt-1">
              {formatMsCountdown(msToNext)}
            </div>
            <p className="text-xs text-ink-softer mt-1">每 5 分鐘恢復 1 顆心</p>
          </div>
        )}

        <div className="flex flex-col gap-3 w-64">
          {!canRetry && <SoundLink href={`/review/runner/?from=hearts&lesson=${encodeURIComponent(lesson.id)}`} className="btn-chunky-secondary">{reviewHeartClaimed ? "鞏固練習（今日迴心已領取）" : "免費鞏固練習迴心"}</SoundLink>}
          <button
            onClick={() => {
              if (!canRetry) return;
              playSfx("unlock");
              haptic("medium");
              onRetry();
            }}
            disabled={!canRetry}
            className={canRetry ? "btn-chunky-primary" : "btn-chunky-disabled"}
          >
            重新開始
          </button>
          <button
            onClick={() => {
              playSfx("tap");
              haptic("light");
              onBack();
            }}
            className="btn-chunky-ghost"
          >
            返回路徑
          </button>
        </div>
      </motion.div>
    </main>
  );
}
