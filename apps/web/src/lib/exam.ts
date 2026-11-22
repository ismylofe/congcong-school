/**
 * exam.ts —— 單元挑戰（exam 課）的 web 側小工具
 *
 * 單元挑戰課 id 形如 "{bookId}-u{n}-exam"，由 build-data 在該單元
 * exam 題數 ≥4 時產出；outline 的 unit 帶 examLessonId/examQuestionCount。
 * XP 倍率真值在 @cstf/core economy（EXAM_XP_MULTIPLIER）。
 */

/** 單元挑戰「征服」線：accuracy ≥ 0.8 → 獎盃金色態（與 iOS 同口徑） */
export const EXAM_CONQUER_ACCURACY = 0.8;

/** 是否為單元挑戰課 id（"{bookId}-u{n}-exam"） */
export function isExamLessonId(id: string): boolean {
  return /-u\d+-exam$/.test(id);
}
