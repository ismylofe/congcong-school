/**
 * league.test.ts —— 本地模擬聯賽的行為單測
 * （黃金向量對照在 goldenVectors.test.ts 的 league 組，這裡測邊界與性質）
 */

import { describe, expect, it } from "vitest";
import {
  BOT_NAME_POOL,
  DEMOTE_ZONE,
  LEAGUE_BOT_COUNT,
  LEAGUE_GROUP_SIZE,
  LEAGUE_TIERS,
  PROMOTE_ZONE,
  PROMOTION_BONUS_GEMS,
  RANK_GEM_REWARDS,
  TIER_XP_RANGES,
  UNLOCK_LESSONS,
  botWeeklyGoal,
  botXpAt,
  botsForWeek,
  leagueTier,
  nextTierId,
  prevTierId,
  settleRank,
  standings,
  userRank,
  weekKeyFor,
  type LeagueTierId,
} from "../league";

const WEEK: { weekKey: string; tier: LeagueTierId; salt: string } = {
  weekKey: "2026-08-24",
  tier: "gold",
  salt: "unit-test-salt",
};

// ============================================================
// weekKeyFor
// ============================================================

describe("weekKeyFor", () => {
  it("週一返回當天", () => {
    expect(weekKeyFor(new Date(2026, 7, 24, 0, 0))).toBe("2026-08-24");
    expect(weekKeyFor(new Date(2026, 7, 24, 23, 59))).toBe("2026-08-24");
  });

  it("週中（週二/週三）回落到本週一", () => {
    expect(weekKeyFor(new Date(2026, 7, 25, 10, 0))).toBe("2026-08-24");
    expect(weekKeyFor(new Date(2026, 7, 26, 12, 0))).toBe("2026-08-24");
  });

  it("週日屬於同一周（不提前進入下一週）", () => {
    // 2026-08-30 是週日
    expect(weekKeyFor(new Date(2026, 7, 30, 23, 59))).toBe("2026-08-24");
    // 下一天（週一）才換周
    expect(weekKeyFor(new Date(2026, 7, 31, 0, 0))).toBe("2026-08-31");
  });

  it("跨月：8 月 1 日（週六）的週一在 7 月", () => {
    expect(weekKeyFor(new Date(2026, 7, 1, 9, 0))).toBe("2026-07-27");
  });

  it("跨年：2027-01-01（週五）的週一在 2026-12-28", () => {
    expect(weekKeyFor(new Date(2027, 0, 1, 9, 0))).toBe("2026-12-28");
  });
});

// ============================================================
// 段位表
// ============================================================

describe("LEAGUE_TIERS", () => {
  it("6 段位 order 連續升序", () => {
    expect(LEAGUE_TIERS.map(t => t.id)).toEqual([
      "bronze", "silver", "gold", "sapphire", "ruby", "diamond",
    ]);
    LEAGUE_TIERS.forEach((t, i) => expect(t.order).toBe(i));
  });

  it("每段位有 XP 區間且隨段位遞增", () => {
    let prevMin = 0;
    for (const t of LEAGUE_TIERS) {
      const range = TIER_XP_RANGES[t.id];
      expect(range.min).toBeGreaterThan(prevMin);
      expect(range.max).toBeGreaterThan(range.min);
      prevMin = range.min;
    }
  });

  it("nextTierId 鑽石封頂 / prevTierId 青銅保底", () => {
    expect(nextTierId("bronze")).toBe("silver");
    expect(nextTierId("ruby")).toBe("diamond");
    expect(nextTierId("diamond")).toBe("diamond");
    expect(prevTierId("diamond")).toBe("ruby");
    expect(prevTierId("silver")).toBe("bronze");
    expect(prevTierId("bronze")).toBe("bronze");
  });

  it("leagueTier 無效 id 容錯落回青銅", () => {
    expect(leagueTier("legendary").id).toBe("bronze");
    expect(leagueTier("gold").name).toBe("黃金聯賽");
  });

  it("解鎖線為 10 節課", () => {
    expect(UNLOCK_LESSONS).toBe(10);
  });
});

// ============================================================
// botsForWeek
// ============================================================

describe("botsForWeek", () => {
  it("15 個 bot，名字全部來自名池且組內去重", () => {
    const bots = botsForWeek(WEEK);
    expect(bots.length).toBe(LEAGUE_BOT_COUNT);
    expect(LEAGUE_GROUP_SIZE).toBe(LEAGUE_BOT_COUNT + 1);
    const names = bots.map(b => b.name);
    expect(new Set(names).size).toBe(LEAGUE_BOT_COUNT);
    for (const name of names) expect(BOT_NAME_POOL).toContain(name);
  });

  it("名池 ≥32 且本身無重複", () => {
    expect(BOT_NAME_POOL.length).toBeGreaterThanOrEqual(32);
    expect(new Set(BOT_NAME_POOL).size).toBe(BOT_NAME_POOL.length);
  });

  it("同輸入結果穩定；換 salt / 換周 / 換段位結果不同", () => {
    expect(botsForWeek(WEEK)).toEqual(botsForWeek(WEEK));
    const otherSalt = botsForWeek({ ...WEEK, salt: "another-salt" });
    const otherWeek = botsForWeek({ ...WEEK, weekKey: "2026-08-31" });
    const otherTier = botsForWeek({ ...WEEK, tier: "ruby" });
    const base = botsForWeek(WEEK).map(b => b.name).join(",");
    expect(otherSalt.map(b => b.name).join(",")).not.toBe(base);
    expect(otherWeek.map(b => b.name).join(",")).not.toBe(base);
    expect(otherTier.map(b => b.name).join(",")).not.toBe(base);
  });

  it("id 按 weekKey/tier/botIndex 穩定編碼", () => {
    const bots = botsForWeek(WEEK);
    expect(bots[0].id).toBe("bot-2026-08-24-gold-0");
    expect(bots[14].id).toBe("bot-2026-08-24-gold-14");
  });
});

// ============================================================
// botXpAt
// ============================================================

describe("botXpAt", () => {
  it("週一 00:00 起步為 0；早於本週為 0", () => {
    for (let i = 0; i < LEAGUE_BOT_COUNT; i++) {
      expect(botXpAt({ ...WEEK, botIndex: i, date: new Date(2026, 7, 24, 0, 0) })).toBe(0);
      expect(botXpAt({ ...WEEK, botIndex: i, date: new Date(2026, 7, 23, 18, 0) })).toBe(0);
    }
  });

  it("整週逐小時單調不減，週日深夜收斂到周目標，晚於本週恆為周目標", () => {
    for (let i = 0; i < LEAGUE_BOT_COUNT; i++) {
      const goal = botWeeklyGoal({ ...WEEK, botIndex: i });
      let prev = -1;
      for (let d = 0; d < 7; d++) {
        for (let h = 0; h < 24; h++) {
          const xp = botXpAt({ ...WEEK, botIndex: i, date: new Date(2026, 7, 24 + d, h, 30) });
          expect(xp).toBeGreaterThanOrEqual(prev);
          expect(Number.isInteger(xp)).toBe(true);
          prev = xp;
        }
      }
      expect(prev).toBe(goal);
      expect(botXpAt({ ...WEEK, botIndex: i, date: new Date(2026, 8, 2, 8, 0) })).toBe(goal);
    }
  });

  it("周目標落在段位區間內（抽查全部段位）", () => {
    for (const t of LEAGUE_TIERS) {
      const range = TIER_XP_RANGES[t.id];
      for (let i = 0; i < LEAGUE_BOT_COUNT; i++) {
        const goal = botWeeklyGoal({ weekKey: WEEK.weekKey, tier: t.id, salt: WEEK.salt, botIndex: i });
        expect(goal).toBeGreaterThanOrEqual(range.min);
        expect(goal).toBeLessThanOrEqual(range.max);
      }
    }
  });
});

// ============================================================
// standings / userRank
// ============================================================

describe("standings", () => {
  it("XP 降序排 16 人，rank 1..16", () => {
    const botXps = Array.from({ length: 15 }, (_, i) => (i + 1) * 10); // 10..150
    const rows = standings({ userXp: 85, botXps });
    expect(rows.length).toBe(LEAGUE_GROUP_SIZE);
    rows.forEach((r, i) => expect(r.rank).toBe(i + 1));
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].xp).toBeLessThanOrEqual(rows[i - 1].xp);
    }
    // 85 落在 80 與 90 之間 → 使用者排在 150..90（7 個）之後 = 第 8 名
    expect(userRank({ userXp: 85, botXps })).toBe(8);
  });

  it("同分使用者靠前", () => {
    const botXps = [100, 100, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const rows = standings({ userXp: 100, botXps });
    expect(rows[0].isUser).toBe(true);
    expect(rows[0].rank).toBe(1);
  });

  it("bot 同分按下標升序，使用者 botIndex 為 null", () => {
    const botXps = [50, 50, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const rows = standings({ userXp: 0, botXps });
    expect(rows.slice(0, 3).map(r => r.botIndex)).toEqual([0, 1, 2]);
    const user = rows.find(r => r.isUser)!;
    expect(user.botIndex).toBeNull();
  });
});

// ============================================================
// settleRank
// ============================================================

describe("settleRank", () => {
  it("名次獎勵表：1→100, 2→80, 3→60, 4-5→40, 6+→0（未疊加晉級獎勵）", () => {
    expect(RANK_GEM_REWARDS).toEqual({ 1: 100, 2: 80, 3: 60, 4: 40, 5: 40 });
    expect(PROMOTION_BONUS_GEMS).toBe(20);
  });

  it("前 5 晉級（+20 寶石），後 5 降級，其餘原地", () => {
    expect(PROMOTE_ZONE).toBe(5);
    expect(DEMOTE_ZONE).toBe(5);
    expect(settleRank(1)).toEqual({ promoted: true, demoted: false, gems: 120 });
    expect(settleRank(2)).toEqual({ promoted: true, demoted: false, gems: 100 });
    expect(settleRank(3)).toEqual({ promoted: true, demoted: false, gems: 80 });
    expect(settleRank(4)).toEqual({ promoted: true, demoted: false, gems: 60 });
    expect(settleRank(5)).toEqual({ promoted: true, demoted: false, gems: 60 });
    expect(settleRank(6)).toEqual({ promoted: false, demoted: false, gems: 0 });
    expect(settleRank(11)).toEqual({ promoted: false, demoted: false, gems: 0 });
    expect(settleRank(12)).toEqual({ promoted: false, demoted: true, gems: 0 });
    expect(settleRank(16)).toEqual({ promoted: false, demoted: true, gems: 0 });
  });

  it("鑽石封頂：第 1 名不再晉級也無晉級獎勵，仍拿名次獎勵", () => {
    expect(settleRank(1, "diamond")).toEqual({ promoted: false, demoted: false, gems: 100 });
    expect(settleRank(5, "diamond")).toEqual({ promoted: false, demoted: false, gems: 40 });
  });

  it("青銅保底：第 16 名不降級", () => {
    expect(settleRank(16, "bronze")).toEqual({ promoted: false, demoted: false, gems: 0 });
    expect(settleRank(1, "bronze")).toEqual({ promoted: true, demoted: false, gems: 120 });
  });
});
