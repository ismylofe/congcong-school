"use client";

/**
 * ContinueLearningCard —— Home 頁頂部的"繼續學習"大卡片。
 *
 * 行為：
 *   1. 如果 store 裡有 activeLesson（未完成的課程會話），點選直達那節課
 *   2. 否則不渲染（Home 按年級網格選擇即可）
 *
 * 視覺：Duolingo 風格綠色厚底卡片 + Mascot + 一句召喚 + ▶ CONTINUE 按鈕
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Mascot } from "./Mascot";
import { SubjectBookIcon } from "./LearningIcon";
import { Check, Sparkle } from "@/components/icons";
import { Modal } from "@/components/Modal";
import { SoundLink } from "@/components/SoundLink";
import { useProgressStore } from "@/store/progress";
import { cn } from "@/lib/cn";
import { SUBJECTS } from "@/lib/subjects";
import { usePublishedBookIds } from "@/lib/publishedBooks";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import type { Book, SubjectId } from "@/types";

/** 從 lessonId 反推 bookId —— pattern: {bookId}-u{N}-kp{M} */
function parseBookId(lessonId: string): string | null {
  const m = lessonId.match(/^(.+?)-u\d+-kp\d+$/);
  return m ? m[1] : null;
}

export function ContinueLearningCard({ compact = false, placement = "page" }: { compact?: boolean; placement?: "page" | "rail" } = {}) {
  const activeLesson = useProgressStore(s => s.activeLesson);
  const publishedIds = usePublishedBookIds();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => setHydrated(true), []);

  if (!hydrated || !activeLesson) return null;

  const bookId = parseBookId(activeLesson.lessonId);
  if (!bookId) return null;
  // 進行中的課程屬於已下架教材（或清單還沒載入）→ 不顯示，避免連到不存在的頁面
  if (!publishedIds?.has(bookId)) return null;

  const href = `/lesson/${bookId}/${activeLesson.lessonId}/`;

  if (compact) return (
    <Link href={href} data-placement={placement} className="continue-strip flex items-center gap-3 w-full rounded-2xl border-2 border-bg-softer bg-white p-3 mb-4" onClick={() => { playSfx("tap"); haptic("light"); }}>
      <span className="continue-play w-10 h-10 rounded-xl flex items-center justify-center shrink-0" aria-hidden>▶</span>
      <span className="flex-1 min-w-0"><span className="block text-base font-bold text-ink">繼續上次的練習</span><span className="block text-sm text-ink-light mt-0.5">已答 {activeLesson.correctCount + activeLesson.mistakeCount} 題</span></span>
      <span className="text-secondary-dark" aria-hidden>→</span>
    </Link>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", damping: 18, stiffness: 220 }}
      className="w-full max-w-3xl lg:max-w-6xl mb-6 lg:mb-10"
    >
      <Link
        href={href}
        onClick={() => {
          playSfx("tap");
          haptic("medium");
        }}
        className="group block bg-white rounded-2xl border-2 border-bg-softer p-5 lg:p-7 hover:border-primary transition-colors relative overflow-hidden"
        style={{ boxShadow: "0 2px 0 0 var(--shadow-card-color)" }}
      >
        <div className="flex items-center gap-3 lg:gap-6">
          <motion.div
            animate={{ y: [0, -3, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            className="shrink-0"
          >
            <Mascot mood="wave" size={64} />
          </motion.div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-extrabold text-primary uppercase tracking-wide">
              繼續學習
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 min-w-0">
              <span className="text-base lg:text-2xl font-extrabold text-ink break-words">
                上次的課程還沒做完呢
              </span>
              <Sparkle className="w-3.5 h-3.5 lg:w-5 lg:h-5 text-gold shrink-0" />
            </div>
            <div className="text-xs lg:text-base text-ink-light mt-1 leading-relaxed">
              已答 {activeLesson.correctCount + activeLesson.mistakeCount} 題 · 連擊 ×{activeLesson.combo}
            </div>
          </div>
          <motion.div
            whileHover={{ y: -1 }}
            whileTap={{ y: 3 }}
            className="continue-play shrink-0 w-12 h-12 lg:w-14 lg:h-14 rounded-2xl flex items-center justify-center"
          >
            <span className="text-xl font-bold">▶</span>
          </motion.div>
        </div>

      </Link>
    </motion.div>
  );
}

// ============================================================
// ActiveBookSync —— 掛在 /book/{id} 頁裡的隱形同步器：
// 訪問哪本書，哪本書就成為「當前教材」（activeBookId），
// 首頁據此實現「開啟即路徑」。同時把 selectedGrade 對齊到該書年級。
// ============================================================
export function ActiveBookSync({ bookId, grade }: { bookId: string; grade: number }) {
  // 只在進入該書頁時同步一次（依賴僅 bookId/grade）：
  // 若依賴 store 欄位，會與彈層裡的「換年級」（清空兩者後跳走）競態互寫。
  useEffect(() => {
    const s = useProgressStore.getState();
    if (s.activeBookId !== bookId) s.setActiveBookId(bookId);
    if (s.selectedGrade !== grade) s.setSelectedGrade(grade);
  }, [bookId, grade]);

  return null;
}

// ============================================================
// CurrentBookBadge —— 「當前教材」徽章按鈕 + 換書彈層
// 列出本年級各科教材（選擇即 setActiveBookId 並跳轉），附換年級入口。
// ============================================================

const SUBJECT_ORDER: SubjectId[] = ["math", "chinese", "english", "science"];

function subjectOf(b: Book): SubjectId {
  return (b.subject ?? "math") as SubjectId;
}

export function CurrentBookBadge({
  book,
  gradeBooks,
}: {
  /** 當前所在的教材 */
  book: Book;
  /** 同年級全部教材（服務端傳入，含當前這本） */
  gradeBooks: Book[];
}) {
  const [open, setOpen] = useState(false);
  const [schoolSystem, setSchoolSystem] = useState<"6-3" | "5-4">(book.schoolSystem ?? "6-3");
  useEffect(() => setSchoolSystem(book.schoolSystem ?? "6-3"), [book.id, book.schoolSystem]);
  const router = useRouter();
  const setActiveBookId = useProgressStore(s => s.setActiveBookId);
  const setSelectedGrade = useProgressStore(s => s.setSelectedGrade);

  // 學科序 + 學期序（上冊在前）
  const sorted = gradeBooks.filter(b => (b.schoolSystem ?? "6-3") === schoolSystem).sort((a, b) => {
    const so = SUBJECT_ORDER.indexOf(subjectOf(a)) - SUBJECT_ORDER.indexOf(subjectOf(b));
    if (so !== 0) return so;
    return (a.semester === "up" ? 0 : 1) - (b.semester === "up" ? 0 : 1);
  });

  function choose(b: Book) {
    playSfx("tap");
    haptic("light");
    setOpen(false);
    if (b.id === book.id) return;
    setActiveBookId(b.id);
    router.push(`/book/${b.id}/`);
  }

  function changeGrade() {
    playSfx("tap");
    haptic("light");
    setOpen(false);
    // 清空年級 + 當前教材 → 首頁回到 GradePicker 引導
    setActiveBookId(null);
    setSelectedGrade(null);
    router.push("/");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          playSfx("tap");
          haptic("light");
          setOpen(true);
        }}
        aria-haspopup="dialog"
        aria-label={`目前教材：${book.subjectName ?? ""}${book.textbookName}，點一下切換`}
        className="inline-flex items-center gap-1.5 min-h-11 px-3 rounded-xl bg-white border-2 border-bg-softer hover:border-primary/50 transition-colors select-none min-w-0"
        style={{ boxShadow: "0 2px 0 0 var(--shadow-card-color)" }}
      >
        <SubjectBookIcon subject={subjectOf(book)} className="w-6 h-7 shrink-0" />
        <span className="text-xs font-extrabold text-ink break-words max-w-[150px]">
          {book.subjectName ?? ""}
          {book.textbookName}
        </span>
        <span aria-hidden className="text-ink-softer text-[10px] shrink-0">
          ▾
        </span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} ariaLabel="切換教材">
        <div className="text-lg font-extrabold text-ink leading-tight">切換教材</div>
        <div className="text-xs text-ink-light mt-1 mb-4">
          {book.gradeName}的全部教材，點一下就換
        </div>
        {gradeBooks.some(b => b.schoolSystem === "5-4") && <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label="切換學制">
          {(["6-3", "5-4"] as const).map(value => <button
            key={value} type="button" aria-pressed={schoolSystem === value}
            onClick={() => setSchoolSystem(value)}
            className={`min-h-11 px-4 rounded-xl border-2 font-bold text-sm ${schoolSystem === value ? "border-primary bg-primary/10 text-primary-dark" : "border-bg-softer text-ink"}`}
          >{value === "6-3" ? "六三制" : "五四制"}</button>)}
        </div>}

        <div className="flex flex-col gap-2 max-h-[52vh] overflow-y-auto pr-0.5">
          {sorted.map(b => {
            const isCurrent = b.id === book.id;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => choose(b)}
                className={cn(
                  "flex items-center gap-3 px-3 py-3 rounded-2xl border-2 text-left transition-colors select-none",
                  isCurrent
                    ? "border-secondary bg-secondary/10"
                    : "border-bg-softer bg-white hover:border-primary/40",
                )}
                aria-current={isCurrent ? "true" : undefined}
              >
                <SubjectBookIcon subject={subjectOf(b)} className="w-9 h-10 shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-extrabold text-ink break-words">
                    {b.subjectName ?? ""}
                    {b.textbookName}
                  </span>
                  <span className="block text-[11px] text-ink-light mt-0.5">
                    {b.unitsCount} 單元 · {b.lessonsCount} 個小節
                  </span>
                </span>
                {isCurrent && (
                  <Check className="w-5 h-5 text-primary shrink-0" strokeWidth={3} />
                )}
              </button>
            );
          })}
          {SUBJECT_ORDER.filter(s => !sorted.some(b => subjectOf(b) === s)).map(s => (
            <div
              key={`soon-${s}`}
              aria-label={`${SUBJECTS[s].label}：即將推出`}
              className="flex items-center gap-3 px-3 py-3 rounded-2xl border-2 border-dashed border-bg-softer text-left select-none"
            >
              <SubjectBookIcon subject={s} className="w-9 h-10 shrink-0 opacity-50" />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-extrabold text-ink-light">{SUBJECTS[s].label}</span>
                <span className="block text-[11px] text-ink-light mt-0.5">即將推出</span>
              </span>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-3 border-t-2 border-bg-softer flex items-center justify-between">
          <button
            type="button"
            onClick={changeGrade}
            className="min-h-11 px-2 text-sm font-extrabold text-secondary hover:underline"
          >
            換個年級
          </button>
          <SoundLink
            href={`/grade/${book.grade}/`}
            onClick={() => setOpen(false)}
            className="min-h-11 px-2 text-sm font-extrabold text-ink-light hover:text-ink"
          >
            看年級首頁 →
          </SoundLink>
        </div>
      </Modal>
    </>
  );
}
