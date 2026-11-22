"use client";

/**
 * PathMap — 多鄰國式蛇形學習路徑
 *
 * - 頂部 sticky banner：隨滾動切換顯示當前可見單元（不同 unit 不同顏色）
 * - 單元之間用細分隔條（橫線 + 居中標題），不再用大 SectionCard
 * - 節點蛇形左右擺動 (snake offset)
 * - 節點狀態：completed / current / locked
 * - 每 N 課插入寶箱節點
 */

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ArrowLeft, Lightning, Lock, Star, Crown, Chest, Book, Trophy } from "@/components/icons";
import { cn } from "@/lib/cn";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import { LessonStartModal } from "./LessonStartModal";
import { ChestModal } from "./ChestModal";
import { Mascot } from "./Mascot";
import { SoundLink } from "./SoundLink";
import { useToast } from "./Toast";
import {
  computeChestsForBook,
  rollChestReward,
  type ChestSlot,
  type ChestRewardTier,
} from "@/lib/chestLogic";
import { useProgressStore } from "@/store/progress";
import type { PathLessonMeta, LessonStatus } from "@cstf/core";

export type { PathLessonMeta, LessonStatus };

/**
 * 單元挑戰節點（⚔️ exam 課）的展示中繼資料 —— 由 BookPathView
 * 按「該單元全部普通課完成 → 解鎖」的規則計算好傳入。
 */
export interface ExamNodeMeta {
  lessonId: string;
  questionCount: number;
  /** 該單元全部普通課已完成 → 可挑戰 */
  unlocked: boolean;
  /** 已通關（completedLessons 有記錄） */
  completed: boolean;
  /** accuracy ≥ 0.8 → 征服（獎盃金色態） */
  conquered: boolean;
}

interface PathMapProps {
  bookId: string;
  lessons: PathLessonMeta[];
  /** lessonId → status */
  statuses: Record<string, LessonStatus>;
  /** lessonId → 星數 (1-3) */
  stars?: Record<string, number>;
  /** 教材標籤（如 "數學 · 一年級下冊"），併入 sticky banner 頂部，替代獨立的頁面 header */
  headerLabel?: ReactNode;
  /** 是否展示 GUIDEBOOK 按鈕；點選跳到 /book/{bookId}/guide/{activeUnitNum}/ */
  hasGuide?: boolean;
  /** ← 返回按鈕目標路徑；不傳則不渲染返回按鈕 */
  backHref?: string;
  /** 在 sticky banner 上方渲染的插槽內容（隨 banner 一起 sticky） */
  topSlot?: ReactNode;
  /** 單元挑戰節點：unitNumber → meta（預設 = 該單元沒有挑戰課） */
  exams?: Record<number, ExamNodeMeta>;
}

type UnitItem =
  | { kind: "lesson"; lesson: PathLessonMeta }
  | { kind: "chest"; slot: ChestSlot }
  | { kind: "exam"; unitNumber: number; unitTitle: string; meta: ExamNodeMeta };

interface ActiveChestState {
  slot: ChestSlot;
  /** 本次開箱抽到的獎勵 */
  gems: number;
  /** 獎勵檔位（common/rare/epic）—— ChestModal 按檔位分層演出 */
  tier: ChestRewardTier;
}

/** A course keeps one accent; section labels distinguish units. */
const COURSE_COLOR = { bg: "#58CC02", shadow: "#58A700" };
function unitColor(_index: number) { return COURSE_COLOR; }

export function PathMap({
  bookId,
  lessons,
  statuses,
  stars = {},
  headerLabel,
  hasGuide,
  backHref,
  topSlot,
  exams,
}: PathMapProps) {
  const [activeLesson, setActiveLesson] = useState<PathLessonMeta | null>(null);
  const [activeChest, setActiveChest] = useState<ActiveChestState | null>(null);
  // 點開的單元挑戰（彈 LessonStartModal 挑戰版）
  const [activeExam, setActiveExam] = useState<{
    meta: ExamNodeMeta;
    unitNumber: number;
  } | null>(null);
  const toast = useToast();

  const claimedChests = useProgressStore(s => s.claimedChests);
  const addGems = useProgressStore(s => s.addGems);
  const claimChest = useProgressStore(s => s.claimChest);

  // 寶箱插槽：每 N 課一個，穩定 id
  const chestSlots = useMemo(() => computeChestsForBook(bookId, lessons), [bookId, lessons]);
  const chestByAfterLesson = useMemo(() => {
    const m = new Map<string, ChestSlot>();
    for (const c of chestSlots) m.set(c.afterLessonId, c);
    return m;
  }, [chestSlots]);

  // 按單元分組，合併 lesson + chest 為一個 unitItems 列表；
  // 單元末尾追加 ⚔️ 挑戰節點（該單元有 exam 課時）
  const byUnit = useMemo(() => {
    const map = new Map<number, { title: string; label?: string; items: UnitItem[] }>();
    for (const l of lessons) {
      if (!map.has(l.unitNumber)) map.set(l.unitNumber, { title: l.unitTitle, label: l.unitLabel, items: [] });
      map.get(l.unitNumber)!.items.push({ kind: "lesson", lesson: l });
      const chest = chestByAfterLesson.get(l.id);
      if (chest) {
        map.get(l.unitNumber)!.items.push({ kind: "chest", slot: chest });
      }
    }
    if (exams) {
      for (const [unitNum, group] of map) {
        const meta = exams[unitNum];
        if (meta) {
          group.items.push({
            kind: "exam",
            unitNumber: unitNum,
            unitTitle: group.title,
            meta,
          });
        }
      }
    }
    return map;
  }, [lessons, chestByAfterLesson, exams]);

  const unitEntries = useMemo(() => Array.from(byUnit.entries()), [byUnit]);

  // sticky banner：跟隨滾動指示當前可見的單元
  const sectionRefs = useRef(new Map<number, HTMLDivElement | null>());
  const [activeUnitNum, setActiveUnitNum] = useState<number>(unitEntries[0]?.[0] ?? 1);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const observer = new IntersectionObserver(
      entries => {
        // 找到所有 isIntersecting 的 unit，取最靠上的那個
        const visible = entries
          .filter(e => e.isIntersecting)
          .map(e => Number((e.target as HTMLElement).dataset.unit ?? "0"))
          // Printed unit numbers can follow preparation/activity IDs such as101.
          .sort((a, b) => unitEntries.findIndex(([n]) => n === a) - unitEntries.findIndex(([n]) => n === b));
        if (visible.length > 0) {
          setActiveUnitNum(visible[0]);
        }
      },
      {
        // 觀察"進入螢幕上半部分"的元素
        rootMargin: "-80px 0px -55% 0px",
        threshold: 0,
      },
    );
    sectionRefs.current.forEach(el => {
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [unitEntries]);

  function handleChestClick(slot: ChestSlot) {
    const afterStatus = statuses[slot.afterLessonId];
    const unlocked = afterStatus === "completed";
    if (!unlocked) {
      playSfx("tap");
      haptic("light");
      return;
    }
    playSfx("tap");
    haptic("medium");
    if (claimedChests[slot.id]) {
      // 已領取的寶箱不再進入開箱流程（避免開出 +0 的挫敗感）
      toast.info("這個寶箱已經開過啦");
      return;
    }
    const reward = rollChestReward();
    claimChest(slot.id);
    addGems(reward.gems);
    setActiveChest({ slot, gems: reward.gems, tier: reward.tier });
  }

  function handleExamClick(unitNumber: number, meta: ExamNodeMeta) {
    if (!meta.unlocked) {
      playSfx("tap");
      haptic("light");
      toast.info("先完成本單元全部課程，就能開啟挑戰啦");
      return;
    }
    playSfx("tap");
    haptic("medium");
    setActiveExam({ meta, unitNumber });
  }

  // 當前 sticky banner 對應的單元中繼資料
  const activeUnitIndex = unitEntries.findIndex(([n]) => n === activeUnitNum);
  const safeIndex = activeUnitIndex >= 0 ? activeUnitIndex : 0;
  const activeUnit = unitEntries[safeIndex];
  const color = unitColor(safeIndex);
  const activeUnitTitle = activeUnit?.[1]?.title ?? "";

  // ⚡ 跳級入口（E2）：當前可見單元「整個單元都還鎖著」時，banner 上出現
  // 「跳到這裡」——測試透過即可解鎖之前全部課程（口徑見 /jump/）
  const activeUnitFullyLocked = useMemo(() => {
    const group = byUnit.get(activeUnitNum);
    if (!group) return false;
    const unitLessons = group.items.filter(
      (it): it is Extract<UnitItem, { kind: "lesson" }> => it.kind === "lesson",
    );
    return (
      unitLessons.length > 0 &&
      unitLessons.every(it => (statuses[it.lesson.id] ?? "locked") === "locked")
    );
  }, [byUnit, activeUnitNum, statuses]);

  return (
    <div className="w-full max-w-md mx-auto lg:max-w-none lg:mx-0 px-4 lg:px-0 pb-6">
      {/* === sticky 單元 banner === */}
      <div
        className="sticky top-0 lg:top-4 z-20 -mx-4 px-4 lg:mx-0 lg:px-0 pt-2 pb-4 bg-bg"
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={activeUnitNum}
            initial={{ y: -8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -8, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="path-banner rounded-2xl px-4 py-4 flex items-center gap-3"
            style={{
              backgroundColor: color.bg,
              boxShadow: `0 4px 0 0 ${color.shadow}`,
            }}
          >
            {backHref && (
              <SoundLink
                href={backHref}
                aria-label="返回"
                className="shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-xl path-banner-action hover:bg-white/15 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" aria-hidden />
              </SoundLink>
            )}
            <div className="min-w-0 flex-1">
              {/* 小標籤行：subject + textbookName · 第 N 單元 */}
              <div className="flex items-center gap-1.5 text-sm font-bold leading-snug min-w-0 flex-wrap">
                {headerLabel && (
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    {headerLabel}
                  </span>
                )}
                <span className="opacity-60">·</span>
                <span className="whitespace-nowrap">{activeUnit?.[1]?.label ?? `第 ${activeUnitNum} 單元`}</span>
              </div>
              {/* 大字單元標題 */}
              <div className="text-xl font-bold leading-snug break-words tracking-tight mt-1.5">
                {activeUnitTitle}
              </div>
            </div>
            {activeUnitFullyLocked && (
              <SoundLink href={`/jump/?book=${bookId}&unit=${activeUnitNum}`} hapticIntensity="medium"
                className="shrink-0 inline-flex items-center gap-1.5 px-2 min-h-11 rounded-xl path-banner-action hover:bg-white/15 transition-colors text-xs font-bold"
                aria-label={`跳級測驗：直接跳到${activeUnit?.[1]?.label ?? `第 ${activeUnitNum} 單元`}`}>
                <Lightning className="w-4 h-4" aria-hidden /><span>跳級</span>
              </SoundLink>
            )}
            {hasGuide && (
              <SoundLink
                href={`/book/${bookId}/guide/${activeUnitNum}/`}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 h-11 rounded-xl font-bold text-sm tracking-tight path-banner-action hover:bg-white/15 transition-colors"
                aria-label="開啟知識手冊"
              >
                <Book className="w-4 h-4" aria-hidden />
                <span className="hidden sm:inline">知識手冊</span>
              </SoundLink>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {topSlot && <div className="mb-3">{topSlot}</div>}

      {/* === 連續蛇形路徑（單元邊界只作為視覺分隔 label，不中斷路徑） === */}
      <div className="pt-2">
        <UnitPath
          entries={unitEntries}
          statuses={statuses}
          stars={stars}
          claimedChests={claimedChests}
          onLesson={setActiveLesson}
          onChest={handleChestClick}
          onExam={handleExamClick}
          sectionRefs={sectionRefs}
        />
      </div>

      {activeLesson && (
        <LessonStartModal
          open={!!activeLesson}
          onClose={() => setActiveLesson(null)}
          bookId={bookId}
          lessonId={activeLesson.id}
          title={activeLesson.title}
          questionCount={activeLesson.questionCount}
          unitNumber={activeLesson.unitNumber}
          unitLabel={activeLesson.unitLabel}
          kpIndex={activeLesson.kpIndex}
          kpTotal={activeLesson.kpTotal}
        />
      )}

      {activeChest && (
        <ChestModal
          open={!!activeChest}
          gems={activeChest.gems}
          tier={activeChest.tier}
          onClose={() => setActiveChest(null)}
        />
      )}

      {activeExam && (
        <LessonStartModal
          open={!!activeExam}
          onClose={() => setActiveExam(null)}
          bookId={bookId}
          lessonId={activeExam.meta.lessonId}
          title={byUnit.get(activeExam.unitNumber)?.label
            ? `${byUnit.get(activeExam.unitNumber)!.title}挑戰`
            : `第 ${activeExam.unitNumber} 單元挑戰`}
          questionCount={activeExam.meta.questionCount}
          unitNumber={activeExam.unitNumber}
          unitLabel={byUnit.get(activeExam.unitNumber)?.label}
          kpIndex={0}
          kpTotal={0}
          isExam
        />
      )}

    </div>
  );
}

/**
 * 單元內部的蛇形路徑渲染：
 * - 舞臺最大寬 440px；窄容器保留文字寬度並收攏橫向偏移，避免溢位
 * - SVG cubic bezier 連線相鄰節點（控制點放在中點 y 上，自然形成 S 曲線）
 * - 節點與文字採用正常文件流；連接線根據實際行高測量繪製
 */
const STAGE_WIDTH = 440;
const NODE_SIZE = 72;


interface UnitPathProps {
  entries: Array<[number, { title: string; label?: string; items: UnitItem[] }]>;
  statuses: Record<string, LessonStatus>;
  stars: Record<string, number>;
  claimedChests: Record<string, boolean>;
  onLesson: (l: PathLessonMeta) => void;
  onChest: (slot: ChestSlot) => void;
  onExam: (unitNumber: number, meta: ExamNodeMeta) => void;
  sectionRefs: React.MutableRefObject<Map<number, HTMLDivElement | null>>;
}

function UnitPath({
  entries,
  statuses,
  stars,
  claimedChests,
  onLesson,
  onChest,
  onExam,
  sectionRefs,
}: UnitPathProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState<{ width: number; height: number; points: Array<{ x: number; y: number }> }>({ width: STAGE_WIDTH, height: 0, points: [] });
  const flat = useMemo(() => entries.flatMap(([unitNum, group], unitOrderIndex) =>
    group.items.map((item, index) => ({ item, unitNum, unitTitle: group.title, unitLabel: group.label, firstInUnit: index === 0, unitOrderIndex }))), [entries]);

  useLayoutEffect(() => {
    const stage = containerRef.current;
    if (!stage) return;
    const measure = () => {
      const width = stage.clientWidth;
      const offsetLimit = Math.min(110, Math.max(0, (width - 176) / 2 - 12));
      // Measure flow rows, not animated transforms. Labels and separators own real height.
      const points = Array.from(stage.querySelectorAll<HTMLElement>("[data-path-node]")).map((row, index) => ({
        x: snakeOffset(index) / 110 * offsetLimit,
        y: row.offsetTop + NODE_SIZE / 2,
      }));
      const next = { width, height: stage.clientHeight, points };
      setGeometry(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    stage.querySelectorAll("[data-path-entry]").forEach(row => observer.observe(row));
    return () => observer.disconnect();
  }, [flat, statuses]);

  return (
    <div ref={containerRef} data-path-stage className="relative w-full max-w-[440px] mx-auto pt-6 pb-4">


      {flat.map((entry, index) => {
        const item = entry.item;
        return <div key={item.kind === "lesson" ? item.lesson.id : item.kind === "exam" ? item.meta.lessonId : item.slot.id}
          data-path-entry data-unit={entry.firstInUnit ? entry.unitNum : undefined}
          ref={entry.firstInUnit ? el => { sectionRefs.current.set(entry.unitNum, el); } : undefined}>
          {entry.firstInUnit && entry.unitOrderIndex > 0 && (
            <div data-unit-divider className="relative flex items-center justify-center gap-3 pt-2 pb-8">
              <span className="h-px flex-1 bg-bg-softer" />
              <div className="max-w-[75%] text-center text-sm font-bold leading-relaxed text-ink-light bg-bg-soft px-2">
                {entry.unitLabel ?? `第 ${entry.unitNum} 單元`} · {entry.unitTitle}
              </div>
              <span className="h-px flex-1 bg-bg-softer" />
            </div>
          )}
          <div data-path-node className="relative flex justify-center pb-11">
            <div className="relative w-44 max-w-full" style={{ left: `calc(${snakeOffset(index) / 110} * min(110px, max(0px, (100% - 200px) / 2)))` }}>
              {item.kind === "lesson" ? <PathNode lesson={item.lesson} status={statuses[item.lesson.id] || "locked"}
                stars={stars[item.lesson.id] ?? 0} breatheDelay={0} color={unitColor(entry.unitOrderIndex)} onSelect={() => onLesson(item.lesson)} />
              : item.kind === "exam" ? <ExamNode meta={item.meta} stars={stars[item.meta.lessonId] ?? 0}
                breatheDelay={0} onSelect={() => onExam(item.unitNumber, item.meta)} />
              : <ChestNode unlocked={statuses[item.slot.afterLessonId] === "completed"} claimed={!!claimedChests[item.slot.id]}
                breatheDelay={0} onSelect={() => onChest(item.slot)} />}
            </div>
          </div>
        </div>;
      })}

      {geometry.points.map((point, index) => {
        if (index < 2 || (index - 2) % 8 !== 0) return null;
        const edge = point.x >= 0 ? { left: 4 } : { right: 4 };
        return <div key={`companion-${index}`} aria-hidden className="absolute pointer-events-none" style={{ ...edge, top: point.y - 24 }}>
          <Mascot size={64} mood="happy" animate={false} />
        </div>;
      })}
    </div>
  );
}

/** 蛇形偏移：固定 8 步迴圈 (0, +60, +110, +60, 0, -60, -110, -60) px —— 明顯 S 形 */
const SNAKE_PATTERN = [0, 60, 110, 60, 0, -60, -110, -60];
function snakeOffset(index: number): number {
  return SNAKE_PATTERN[index % SNAKE_PATTERN.length];
}

interface PathNodeProps {
  lesson: PathLessonMeta;
  status: LessonStatus;
  stars: number;
  breatheDelay: number;
  /** 所屬單元的迴圈色（web-shell-15）：current 節點底色/陰影/光暈隨單元色 */
  color: { bg: string; shadow: string };
  onSelect: () => void;
}

/** #RRGGBB → rgba 字串（光暈用） */
function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 0xff}, ${(n >> 8) & 0xff}, ${n & 0xff}, ${alpha})`;
}

function PathNode({ lesson, status, stars, breatheDelay, color, onSelect }: PathNodeProps) {
  const isLocked = status === "locked";
  const isCurrent = status === "current";
  const isCompleted = status === "completed";

  const node = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35, delay: breatheDelay * 0.4 }}
      className="flex flex-col items-center relative"
    >
      <motion.div
        animate={{ y: 0 }}
        transition={
          !isLocked
            ? { duration: 2.6, repeat: Infinity, ease: "easeInOut", delay: breatheDelay }
            : { duration: 0 }
        }
        whileHover={!isLocked ? { y: -2 } : undefined}
        whileTap={!isLocked ? { y: 4 } : undefined}
        className={cn(
          "path-disc relative rounded-full flex items-center justify-center",
          "transition-colors duration-200",
          isCurrent && "path-node-current text-white",
          isLocked && "bg-bg-softer text-ink-softer",
          isCompleted && "bg-gold text-white",
        )}
        style={{
          // current 節點底色/陰影/光暈跟隨單元迴圈色（UNIT_COLORS）
          backgroundColor: isCurrent ? color.bg : undefined,
          boxShadow: isLocked
            ? "0 3px 0 0 var(--shadow-card-color)"
            : isCompleted
              ? "0 5px 0 0 #c89600"
              : `0 5px 0 0 ${color.shadow}`,
          ...(isCurrent
            ? ({ "--node-glow-color": hexToRgba(color.bg, 0.35) } as CSSProperties)
            : null),
        }}
      >
        {isLocked && <Star className="w-9 h-9 fill-current text-[#c4c4c4]" strokeWidth={0} />}
        {isCurrent && <Star className="w-8 h-8 fill-white" />}
        {isCompleted && (lesson.questionCount < 3 ? <Check className="w-8 h-8" /> : <Crown className="w-8 h-8 fill-white" />)}

        {/* 星數小角標 */}
        {isCompleted && stars > 0 && lesson.questionCount >= 3 && (
          <div className="absolute -bottom-1 -right-1 bg-white rounded-full px-1.5 py-0.5 shadow inline-flex items-center gap-0.5 text-gold">
            {Array.from({ length: stars }).map((_, i) => (
              <Star key={i} className="w-2.5 h-2.5 fill-current" />
            ))}
          </div>
        )}
      </motion.div>

      {/* 課程標題：只在 current 節點上顯示（避免視覺擁擠） */}
      {isCurrent && (
        <div data-path-label className="path-label mt-3 px-2 bg-bg rounded-lg text-center text-sm font-bold leading-relaxed text-ink">
          {lesson.title}
        </div>
      )}
    </motion.div>
  );

  if (isLocked) {
    return <div className="cursor-not-allowed">{node}</div>;
  }
  return (
    <button
      type="button"
      onClick={() => {
        playSfx("tap");
        haptic("light");
        onSelect();
      }}
      className="block w-full"
      title={lesson.title}
    >
      {node}
    </button>
  );
}

interface ChestNodeProps {
  unlocked: boolean;
  claimed: boolean;
  breatheDelay: number;
  onSelect: () => void;
}

function ChestNode({ unlocked, claimed, breatheDelay, onSelect }: ChestNodeProps) {
  const node = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35, delay: breatheDelay * 0.4 }}
      className="flex flex-col items-center"
    >
      <motion.div
        animate={unlocked && !claimed ? { y: [0, -4, 0] } : { y: 0 }}
        transition={
          unlocked && !claimed
            ? { duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: breatheDelay }
            : { duration: 0 }
        }
        whileHover={unlocked ? { y: -2 } : undefined}
        whileTap={unlocked ? { y: 4 } : undefined}
        className={cn(
          "path-disc relative rounded-full flex items-center justify-center",
          !unlocked && "bg-bg-softer text-ink-softer",
          unlocked && !claimed && "bg-warning text-white",
          claimed && "bg-bg-soft text-warning/60",
        )}
        style={{
          boxShadow: !unlocked
            ? "0 3px 0 0 var(--shadow-card-color)"
            : claimed
              ? "0 3px 0 0 var(--shadow-card-color)"
              : "0 5px 0 0 #c89600",
        }}
      >
        {!unlocked ? (
          <Lock className="w-7 h-7" />
        ) : (
          <Chest className="w-8 h-8" />
        )}

        {/* 未領取時的脈衝光圈 */}
        {unlocked && !claimed && (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full pointer-events-none"
            animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0, 0.4] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            style={{ boxShadow: "0 0 0 6px rgba(255, 200, 0, 0.35)" }}
          />
        )}
      </motion.div>
    </motion.div>
  );

  return (
    <button
      type="button"
      onClick={onSelect}
      className={unlocked ? "block w-full" : "block w-full cursor-not-allowed"}
      aria-label={claimed ? "已領取的寶箱" : unlocked ? "開啟寶箱" : "未解鎖寶箱"}
    >
      {node}
    </button>
  );
}

// ============================================================
// ⚔️ 單元挑戰節點（獎盃）—— 紫金配色，區別於普通課程節點
//   locked    ：灰色 + 點按提示「先完成本單元全部課程」
//   unlocked  ：紫底金邊獎盃 + 脈衝光圈（可挑戰）
//   completed ：紫底 + 星數角標（通關但未征服）
//   conquered ：金色獎盃（accuracy ≥ 0.8 征服態）
// ============================================================

interface ExamNodeProps {
  meta: ExamNodeMeta;
  stars: number;
  breatheDelay: number;
  onSelect: () => void;
}

function ExamNode({ meta, stars, breatheDelay, onSelect }: ExamNodeProps) {
  const { unlocked, completed, conquered } = meta;

  const background = !unlocked
    ? "var(--app-bg-softer, #E5E5E5)"
    : conquered
      ? "linear-gradient(160deg, #FFC800, #FF9600)"
      : "linear-gradient(160deg, #CE82FF, #7C3AED)";
  const shadow = !unlocked
    ? "0 3px 0 0 var(--shadow-card-color)"
    : conquered
      ? "0 5px 0 0 #C89600, 0 0 18px rgba(255,200,0,0.45)"
      : "0 5px 0 0 #6B21A8";

  const node = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35, delay: breatheDelay * 0.4 }}
      className="flex flex-col items-center"
    >
      <motion.div
        animate={unlocked && !completed ? { y: [0, -4, 0] } : { y: 0 }}
        transition={
          unlocked && !completed
            ? { duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: breatheDelay }
            : { duration: 0 }
        }
        whileHover={unlocked ? { y: -2 } : undefined}
        whileTap={unlocked ? { y: 4 } : undefined}
        className={cn(
          "path-disc relative rounded-full flex items-center justify-center",
          !unlocked && "text-ink-softer",
          unlocked && "text-white",
        )}
        style={{
          background,
          boxShadow: shadow,
          // 紫金配色：可挑戰 / 已通關（未征服）時掛一圈金邊
          border: unlocked && !conquered ? "3px solid #FFC800" : "none",
        }}
      >
        {!unlocked ? <Lock className="w-7 h-7" /> : <Trophy className="w-8 h-8" />}

        {/* 可挑戰：金色脈衝光圈 */}
        {unlocked && !completed && (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full pointer-events-none"
            animate={{ scale: [1, 1.22, 1], opacity: [0.45, 0, 0.45] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            style={{ boxShadow: "0 0 0 6px rgba(255, 200, 0, 0.4)" }}
          />
        )}

        {/* 通關星數角標 */}
        {completed && stars > 0 && (
          <div className="absolute -bottom-1 -right-1 bg-white rounded-full px-1.5 py-0.5 shadow inline-flex items-center gap-0.5 text-gold">
            {Array.from({ length: stars }).map((_, i) => (
              <Star key={i} className="w-2.5 h-2.5 fill-current" />
            ))}
          </div>
        )}
      </motion.div>

      {/* 節點小標籤 */}
      <div data-path-label
        className={cn(
          "path-label mt-3 px-2 bg-bg-soft rounded-lg text-center text-sm font-bold leading-relaxed",
          !unlocked ? "text-ink-softer" : conquered ? "text-gold" : "text-purple-600",
        )}
      >
        {conquered ? "已征服 ⚔️" : "單元挑戰"}
      </div>
    </motion.div>
  );

  return (
    <button
      type="button"
      onClick={onSelect}
      className={unlocked ? "block w-full" : "block w-full cursor-not-allowed"}
      aria-label={
        !unlocked
          ? "單元挑戰（先完成本單元全部課程）"
          : conquered
            ? "單元挑戰（已征服）"
            : completed
              ? "單元挑戰（已通關，可再戰）"
              : "開始單元挑戰"
      }
      title="單元挑戰"
    >
      {node}
    </button>
  );
}
