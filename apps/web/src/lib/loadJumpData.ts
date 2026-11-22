import type { PathLessonMeta } from '@cstf/core';
import type { JumpQuestionSource } from '@cstf/core/jump';
import type { Lesson } from '@/types';

interface JumpOutline {
  lessons: PathLessonMeta[];
  units?: Array<{ unit_number: number; title: string; label?: string }>;
}

/** A jump may only assess an existing destination and a complete prerequisite bank. */
export async function loadJumpData(bookId: string, unitNumber: number, fetcher: typeof fetch = fetch) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(bookId) || !Number.isInteger(unitNumber) || unitNumber < 1) {
    throw new Error('跳級連結不完整，回到學習頁面再試一次吧');
  }
  const outlineRes = await fetcher(`/data/books/${bookId}/outline.json`);
  if (!outlineRes.ok) throw new Error('教材沒有載入出來，請返回學習頁面重試');
  const outline: JumpOutline = await outlineRes.json();
  const target = outline.units?.find(unit => unit.unit_number === unitNumber);
  const targetLesson = outline.lessons.find(lesson => lesson.unitNumber === unitNumber);
  if (!target && !targetLesson) throw new Error('這個單元不存在，請回到學習頁面重新選擇');
  // Curriculum order can interleave practice themes with numbered units.
  const firstTarget = outline.lessons.findIndex(lesson => lesson.unitNumber === unitNumber);
  const prior = firstTarget < 0 ? [] : outline.lessons.slice(0, firstTarget);
  if (!prior.length) throw new Error('前面還沒有課程，不需要跳級哦');
  const sources: JumpQuestionSource[] = await Promise.all(prior.map(async meta => {
    const response = await fetcher(`/data/books/${bookId}/lessons/${meta.id}.json`);
    if (!response.ok) throw new Error('部分題目沒有載入出來，請返回後重試');
    const lesson: Lesson = await response.json();
    if (!Array.isArray(lesson.questions) || !lesson.questions.length) {
      throw new Error('部分題目沒有載入出來，請返回後重試');
    }
    return { lessonId: meta.id, questions: lesson.questions };
  }));
  return { sources, priorLessonIds: prior.map(lesson => lesson.id), unitTitle: target?.title ?? targetLesson!.unitTitle,
    unitLabel: target?.label ?? targetLesson?.unitLabel ?? `第 ${unitNumber} 單元` };
}
