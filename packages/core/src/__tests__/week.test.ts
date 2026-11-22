/**
 * week.test.ts —— 日曆周（週一起）單一事實源
 *
 * 雙端週報 / 連勝日曆 / 聯賽週榜共用這套定義，邊界必須釘死：
 * 週日歸屬上一週、跨月、跨年、月末補齊。
 */

import { describe, expect, it } from "vitest";
import {
  dateKey,
  dayIndexInWeek,
  isDateKey,
  parseDateKey,
  weekDateKeys,
  weekStartKey,
} from "../week";
import { weekKeyFor } from "../league";

describe("dateKey / isDateKey / parseDateKey", () => {
  it("按本地時區格式化，月日補零", () => {
    expect(dateKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(dateKey(new Date(2026, 11, 31, 0, 0))).toBe("2026-12-31");
  });

  it("迴環：parseDateKey(dateKey(d)) 是當天 00:00", () => {
    const d = parseDateKey("2026-08-26")!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(26);
    expect(d.getHours()).toBe(0);
    expect(dateKey(d)).toBe("2026-08-26");
  });

  it("非法鍵判假且解析為 null（不拋異常）", () => {
    for (const bad of ["", "2026-8-26", "2026/08/26", "2026-13-01", "2026-02-30", "abc"]) {
      expect(isDateKey(bad)).toBe(false);
      expect(parseDateKey(bad)).toBeNull();
    }
    expect(isDateKey("2028-02-29")).toBe(true); // 閏年真實存在
  });
});

describe("weekStartKey：週一起的日曆周", () => {
  it("週一返回當天（0 點與 23:59 同鍵）", () => {
    expect(weekStartKey(new Date(2026, 7, 24, 0, 0))).toBe("2026-08-24");
    expect(weekStartKey(new Date(2026, 7, 24, 23, 59))).toBe("2026-08-24");
  });

  it("週中回退到本週一", () => {
    expect(weekStartKey(new Date(2026, 7, 26, 12, 0))).toBe("2026-08-24");
  });

  it("週日仍屬上一週（不是新一週的開始）", () => {
    expect(weekStartKey(new Date(2026, 7, 30, 23, 59))).toBe("2026-08-24");
    expect(weekStartKey(new Date(2026, 7, 31, 0, 0))).toBe("2026-08-31");
  });

  it("跨月：8/1 是週六，週一在 7 月", () => {
    expect(weekStartKey(new Date(2026, 7, 1, 9, 0))).toBe("2026-07-27");
  });

  it("跨年：2027-01-01 是週五，週一在 2026 年 12 月", () => {
    expect(weekStartKey(new Date(2027, 0, 1, 9, 0))).toBe("2026-12-28");
  });

  it("league 的 weekKeyFor 就是同一份實現（不存在第二套周視窗）", () => {
    expect(weekKeyFor).toBe(weekStartKey);
    const d = new Date(2026, 7, 29, 20, 0);
    expect(weekKeyFor(d)).toBe(weekStartKey(d));
  });
});

describe("weekDateKeys：一週 7 天，週一 → 週日", () => {
  it("從周鍵展開 7 天", () => {
    expect(weekDateKeys("2026-08-24")).toEqual([
      "2026-08-24",
      "2026-08-25",
      "2026-08-26",
      "2026-08-27",
      "2026-08-28",
      "2026-08-29",
      "2026-08-30",
    ]);
  });

  it("傳周內任意一天（含週日）都歸一到同一周", () => {
    const expected = weekDateKeys("2026-08-24");
    expect(weekDateKeys("2026-08-27")).toEqual(expected);
    expect(weekDateKeys("2026-08-30")).toEqual(expected);
  });

  it("跨月：7/27 那周尾巴落在 8 月", () => {
    expect(weekDateKeys("2026-07-27")).toEqual([
      "2026-07-27",
      "2026-07-28",
      "2026-07-29",
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
      "2026-08-02",
    ]);
  });

  it("跨年：2026-12-28 那周跨進 2027", () => {
    expect(weekDateKeys("2026-12-28")).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ]);
  });

  it("非法鍵回退到本週（長度仍是 7，且首日是本週一）", () => {
    const keys = weekDateKeys("壞鍵");
    expect(keys).toHaveLength(7);
    expect(keys[0]).toBe(weekStartKey());
  });

  it("每一天的 dayIndexInWeek 與下標一致", () => {
    const keys = weekDateKeys("2026-08-24");
    keys.forEach((k, i) => {
      expect(dayIndexInWeek("2026-08-24", parseDateKey(k)!)).toBe(i);
    });
  });
});

describe("dayIndexInWeek 邊界", () => {
  it("上週日為 -1，下週一為 7", () => {
    expect(dayIndexInWeek("2026-08-24", new Date(2026, 7, 23, 12, 0))).toBe(-1);
    expect(dayIndexInWeek("2026-08-24", new Date(2026, 7, 31, 12, 0))).toBe(7);
  });

  it("同一天不同時刻天序相同", () => {
    expect(dayIndexInWeek("2026-08-24", new Date(2026, 7, 26, 0, 1))).toBe(2);
    expect(dayIndexInWeek("2026-08-24", new Date(2026, 7, 26, 23, 59))).toBe(2);
  });
});

import { weeklyStudyReport } from '../week';
describe('weekly learning, independent from XP',()=>{
  it('counts zero-XP completed lessons and an explicit activity without inventing XP',()=>{
    const report=weeklyStudyReport({xpHistory:{'2026-10-16':0},lessonHistory:{'2026-10-16':1},studyDays:{'2026-10-17':true}},new Date(2026,9,17));
    expect(report.activeDays).toBe(2);expect(report.totalXp).toBe(0);expect(report.totalLessons).toBe(1);
  });
  it('uses actual reading timestamps and ignores invalid dates and future activities',()=>{
    const report=weeklyStudyReport({xpHistory:{},lessonHistory:{},studyDays:{'2026-10-18':true},completedReadings:{a:'2026-10-15',b:'unknown',c:'2026-02-30'}},new Date(2026,9,17));
    expect(report.activeDays).toBe(1);
  });
  it('keeps the Monday–Sunday window at a year boundary',()=>{
    const report=weeklyStudyReport({xpHistory:{'2026-12-31':5,'2027-01-04':50},lessonHistory:{'2027-01-01':1}},new Date(2027,0,3));
    expect(report.thisWeek[0].date).toBe('2026-12-28');expect(report.totalXp).toBe(5);expect(report.activeDays).toBe(2);
  });
});
