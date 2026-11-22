"use client";

import { useEffect, useState } from "react";
import { SubjectBookIcon } from "@/components/LearningIcon";
import { SoundLink } from "@/components/SoundLink";
import { useProgressStore } from "@/store/progress";
import { SUBJECTS } from "@/lib/subjects";
import type { Book, SubjectId } from "@/types";

const ORDER: SubjectId[] = ["math", "chinese", "english", "science"];
const TAGLINES: Record<SubjectId, string> = {
  math: "加減乘除 · 邏輯推理", chinese: "生字語詞 · 閱讀寫作",
  english: "聽說讀寫 · 英語入門", science: "探索自然 · 動手實驗",
};

export default function GradeBooks({ books }: { books: Book[] }) {
  const activeBookId = useProgressStore(s => s.activeBookId);
  const [system, setSystem] = useState<"6-3" | "5-4">("6-3");
  useEffect(() => {
    const active = books.find(b => b.id === activeBookId);
    setSystem(active?.schoolSystem ?? "6-3");
  }, [activeBookId, books]);
  const hasFiveFour = books.some(b => b.schoolSystem === "5-4");
  const visible = books.filter(b => (b.schoolSystem ?? "6-3") === system);

  return <div className="space-y-6">
    {hasFiveFour && <div className="flex flex-wrap gap-2" role="group" aria-label="選擇學制">
      {(["6-3", "5-4"] as const).map(value => <button
        key={value} type="button" aria-pressed={system === value} onClick={() => setSystem(value)}
        className={`min-h-11 rounded-xl border-2 px-4 py-2 font-bold ${system === value ? "border-primary bg-primary/10 text-primary-dark" : "border-bg-softer bg-white text-ink"}`}
      >{value === "6-3" ? "六三制（國小六年）" : "五四制（國小五年）"}</button>)}
    </div>}
    {ORDER.map(subjectId => {
      const subjectBooks = visible.filter(b => (b.subject ?? "math") === subjectId)
        .sort((a, b) => Number(a.semester === "down") - Number(b.semester === "down"));
      const subject = SUBJECTS[subjectId];
      if (!subjectBooks.length) return <section key={subjectId}>
        <div className="mb-3 px-1">
          <div className="text-base lg:text-xl font-extrabold text-ink">{subject.label}</div>
          <div className="text-sm text-ink-light mt-0.5">{TAGLINES[subjectId]}</div>
        </div>
        <div aria-label={`${subject.label}：即將推出`} className="flex items-center gap-3 lg:gap-4 rounded-2xl border-2 border-dashed border-bg-softer px-4 py-4 lg:px-5 lg:py-5 text-ink-light">
          <SubjectBookIcon subject={subjectId} className="w-14 h-16 shrink-0 opacity-50" />
          <div className="text-base lg:text-xl font-extrabold">即將推出</div>
        </div>
      </section>;
      return <section key={subjectId}>
        <div className="mb-3 px-1">
          <div className="text-base lg:text-xl font-extrabold text-ink">{subject.label}</div>
          <div className="text-sm text-ink-light mt-0.5">{TAGLINES[subjectId]}</div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-5">
          {subjectBooks.map(book => <SoundLink
            key={book.id} href={`/book/${book.id}/`}
            aria-label={`${subject.label} ${book.textbookName}，${book.unitsCount} 單元${book.activitiesCount ? `，${book.activitiesCount} 個延伸單元` : ""}，${book.lessonsCount} 個小節`}
            hapticIntensity="medium"
            className="duo-chunky-card ui-book-card group relative block rounded-2xl border-2 border-bg-softer select-none overflow-hidden"
          >
            <div className="relative flex items-center gap-3 lg:gap-4 px-4 py-4 lg:px-5 lg:py-5">
              <SubjectBookIcon subject={subjectId} className="w-14 h-16 shrink-0" />
              <div className="flex-1 min-w-0 text-ink">
                <div className="text-base lg:text-xl font-extrabold leading-tight mt-0.5">
                  {book.gradeName}{book.semesterName}
                  {book.editionLabel && <span className="ml-1 text-xs">（{book.editionLabel}）</span>}
                </div>
                {book.publisherLabel && <div className="text-sm font-bold text-ink-light mt-1">{book.publisherLabel}</div>}
                <div className="text-sm text-ink-light mt-1">
                  {book.unitsCount} 單元{book.activitiesCount ? ` · ${book.activitiesCount} 個延伸單元` : ""} · {book.lessonsCount} 個小節
                </div>
                {book.sourceEdition && <div className="text-sm text-ink-light mt-1">{book.sourceEdition}</div>}
              </div>
              <div className="text-ink-softer text-xl font-extrabold shrink-0" aria-hidden>›</div>
            </div>
          </SoundLink>)}
        </div>
      </section>;
    })}
  </div>;
}
