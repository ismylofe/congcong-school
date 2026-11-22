/**
 * week.ts —— 「一週」與「日期鍵」的單一事實源
 *
 * 雙端（web / iOS）凡是涉及"本週"的功能——聯賽週榜、週報、連勝日曆——
 * 都必須用這裡的日曆周定義，**不允許**再出現"最近滾動 7 天"之類的第二套視窗。
 *
 * 約定：
 *   - 日期鍵統一為本地時區的 `YYYY-MM-DD`（dateKey）；
 *   - 一週從**週一**開始、到**週日**結束（中國校歷習慣）；
 *   - 周鍵（weekKey）= 該週週一的 dateKey；
 *   - 全部按本地日曆日計算，不做 UTC 換算，跨月 / 跨年 / 夏令時都安全。
 *
 * ⚠️ iOS `Domain/Week.swift`（或等價工具）必須鏡像同一套定義：
 *    weekStartKey / weekDateKeys / dayIndexInWeek 三個函式逐行對齊。
 */

/** 本地時區下把 Date 格式化成 `YYYY-MM-DD`。 */
export function dateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** `YYYY-MM-DD` 是否是結構合法的日期鍵（含真實存在性校驗，如 2026-02-30 為假）。 */
export function isDateKey(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const [y, m, d] = key.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const probe = new Date(y, m - 1, d);
  return (
    probe.getFullYear() === y && probe.getMonth() === m - 1 && probe.getDate() === d
  );
}

/**
 * 解析日期鍵為**本地時區當天 00:00** 的 Date。
 * 非法鍵返回 null（呼叫方自行兜底，絕不拋異常炸掉渲染）。
 */
export function parseDateKey(key: string): Date | null {
  if (!isDateKey(key)) return null;
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * date 所在**日曆周**的週一的日期鍵（本地時區）。週一自身返回當天。
 *
 * 例：2026-08-30（週日）→ 2026-08-24；2026-08-31（週一）→ 2026-08-31。
 */
export function weekStartKey(date: Date = new Date()): string {
  const day = date.getDay(); // 0=週日..6=週六
  const offset = (day + 6) % 7; // 距本週週一的天數
  return dateKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() - offset));
}

/**
 * 一週 7 天的日期鍵，**週一 → 週日**順序（下標 0..6 即 dayIndexInWeek）。
 *
 * 入參既可以是周鍵本身，也可以是該周內任意一天的日期鍵——內部一律先歸一到
 * 週一，避免呼叫方各自"先算週一"造成偏差。非法鍵回退到"今天所在的周"。
 */
export function weekDateKeys(key: string): string[] {
  const parsed = parseDateKey(key);
  const monday = parsed
    ? new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate() - ((parsed.getDay() + 6) % 7))
    : parseDateKey(weekStartKey())!;
  return Array.from({ length: 7 }, (_, i) =>
    dateKey(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)),
  );
}

/**
 * date 相對 weekKey 那一週週一的天序（週一=0 … 週日=6；早於週一為負，晚於週日 >6）。
 * 用本地日曆日的差值計算，對夏令時用 round 兜底。非法 weekKey 回退到本週。
 */
export function dayIndexInWeek(weekKey: string, date: Date): number {
  const monday = parseDateKey(weekKey) ?? parseDateKey(weekStartKey())!;
  const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((midnight.getTime() - monday.getTime()) / 86_400_000);
}

/** Weekly activity and XP are separate facts. The UI uses this same projection. */
export function weeklyStudyReport(input: {
  xpHistory: Record<string, number>;
  lessonHistory: Record<string, number>;
  studyDays?: Record<string, true>;
  completedReadings?: Record<string, string>;
}, now = new Date()) {
  const keys = weekDateKeys(weekStartKey(now));
  const previous = weekDateKeys(dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7)));
  const thisWeek = keys.map((date, i) => ({
    date, label: ["一", "二", "三", "四", "五", "六", "日"][i],
    xp: input.xpHistory[date] ?? 0,
    isToday: date === dateKey(now),
    studied: date <= dateKey(now) && (
      input.studyDays?.[date] === true || (input.xpHistory[date] ?? 0) > 0 ||
      (input.lessonHistory[date] ?? 0) > 0 ||
      Object.values(input.completedReadings ?? {}).some(value => completionDay(value) === date)
    ),
  }));
  const totalXp = thisWeek.reduce((n, d) => n + d.xp, 0);
  const totalLessons = keys.reduce((n, k) => n + (input.lessonHistory[k] ?? 0), 0);
  return {
    thisWeek, totalXp, totalLessons,
    activeDays: thisWeek.filter(d => d.studied).length,
    maxXp: Math.max(10, ...thisWeek.map(d => d.xp)),
    xpDelta: totalXp - previous.reduce((n, k) => n + (input.xpHistory[k] ?? 0), 0),
    lessonDelta: totalLessons - previous.reduce((n, k) => n + (input.lessonHistory[k] ?? 0), 0),
  };
}

/** ISO timestamps use the learner's local day; backup date-only strings stay local. */
export function completionDay(value: string): string | null {
  if (isDateKey(value)) return value;
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : dateKey(parsed);
}
