/**
 * lessonSession —— 「未完成課程會話」的判定口徑單一事實源（webrunner-7）。
 *
 * 之前三處各寫各的：
 *   - LessonStartModal 用 `index > 0`（index 其實是"答對數"，全答錯時恆為 0 → 不提示、也沒有重開入口）
 *   - LessonRunner 恢復只看 lessonId（一題未答的空會話也會被當成"有進度"，從而跳過課前知識講解）
 *   - ContinueLearningCard 用 correctCount + mistakeCount
 * 統一為：**同一課程 + 已儲存學習階段或實際作答** 才算可續會話；剩餘題數一律看持久化佇列長度。
 */

import type { ActiveLessonSession } from "@/store/progress";

/** 本次會話已經首答過的題數（答對 + 答錯）—— 全答錯也算作答過 */
export function sessionAnsweredCount(session: ActiveLessonSession): number {
  return session.correctCount + session.mistakeCount;
}

/**
 * 會話是否有可恢復的學習階段或實際作答。
 * solvedIds / index 只是兜底：老版本會話（無 queueIds/solvedIds）也能正確判定。
 */
export function hasLessonProgress(
  session: ActiveLessonSession | null | undefined,
): session is ActiveLessonSession {
  if (!session) return false;
  if (session.stage === "intro" || session.stage === "practice") return true;
  if (sessionAnsweredCount(session) > 0) return true;
  if ((session.solvedIds?.length ?? 0) > 0) return true;
  return session.index > 0;
}

/** 該課程是否有可續的會話；有則返回它，否則 null */
export function resumableSession(
  session: ActiveLessonSession | null | undefined,
  lessonId: string,
): ActiveLessonSession | null {
  if (!session || session.lessonId !== lessonId) return null;
  return hasLessonProgress(session) ? session : null;
}

/**
 * 還剩多少題要做。
 * 優先用持久化佇列長度（含錯題重排回隊尾的題，口徑與課內進度一致）；
 * 老會話沒有 queueIds 時退回 total - index。
 */
export function remainingQuestionCount(
  session: ActiveLessonSession,
  total: number,
): number {
  const queued = session.queueIds?.length ?? 0;
  if (queued > 0) return Math.min(queued, total);
  return Math.max(0, total - session.index);
}

/** Restore feedback without grading again; reconcile older snapshots and changed content. */
export function restoreQuestionSession(session: ActiveLessonSession, ids: number[], contentKey?: string) {
  // Equal IDs do not establish equal prompts, answers or explanations. Unversioned
  // legacy sessions restart once; the runner explains this and retains earned rewards.
  if (contentKey !== undefined && session.contentKey !== contentKey) return null;
  const valid = new Set(ids);
  const solved = [...new Set(session.solvedIds ?? ids.slice(0, session.index))].filter(id => valid.has(id));
  const pending = [...new Set(session.queueIds ?? ids.slice(session.index))].filter(id => valid.has(id) && !solved.includes(id));
  const explicitCurrent = session.currentId != null && valid.has(session.currentId);
  let currentId = explicitCurrent ? session.currentId! : pending.shift() ?? null;
  const phase: "checked" | "answering" = explicitCurrent && session.phase === "checked" && typeof session.checkedCorrect === "boolean" ? "checked" : "answering";
  const queue = pending.filter(id => !(phase === "answering" && id === currentId));
  const known = new Set([...solved, ...queue, ...(currentId == null ? [] : [currentId])]);
  for (const id of ids) if (!known.has(id)) queue.push(id);
  // All former questions may have disappeared in a content update.
  if (currentId == null) currentId = queue.shift() ?? null;
  // Legacy snapshots store the unsolved fresh prefix followed by retried mistakes.
  const freshRemaining = Math.max(0, ids.length - session.correctCount - session.mistakeCount);
  const attempted = session.attemptedIds ?? [...solved, ...(session.queueIds ?? []).slice(freshRemaining)];
  return {
    currentId, queue, solved, phase,
    answer: explicitCurrent ? session.draftAnswer ?? "" : "",
    isCorrect: phase === "checked" ? session.checkedCorrect! : null,
    attempted: attempted.filter(id => valid.has(id)),
  };
}
