/**
 * league.ts —— 本地模擬聯賽（Wave E1）單一事實源
 *
 * 純單機聯賽：每週把使用者和 15 個「影子同學」（bot）放進同一個 16 人小組，
 * bot 的名字、周目標 XP、每日活躍曲線全部由 seed 確定性生成——
 * 同一臺裝置（同 salt）同一周同一段位，任何時刻重算得到完全相同的榜單。
 *
 * 確定性來源：
 *   seed = mix64(djb2Hash(`${weekKey}#${tier}#${salt}`))
 *   - weekKey：本週週一的 YYYY-MM-DD（本地時區），見 weekKeyFor
 *   - tier：段位 id（bronze/silver/...）
 *   - salt：每臺裝置一次性生成的穩定隨機串（store 持久化）
 *
 * iOS `Domain/League.swift` 必須逐字鏡像：BOT_NAME_POOL 全文同序、
 * 所有常量同值、所有取模偏移（0x1000/0x2000/0x3000/0x4000/0x5000 系）同值,
 * 保證同 salt 同周同段位雙端同榜。spec/golden-vectors.json 的 `league`
 * 組是雙端對照的黃金向量。
 */

import { U64_MASK, djb2Hash, mix64 } from "./rng";
import { dayIndexInWeek, weekStartKey } from "./week";

// ============================================================
// 🏆 段位
// ============================================================

export type LeagueTierId = "bronze" | "silver" | "gold" | "sapphire" | "ruby" | "diamond";

export interface LeagueTier {
  id: LeagueTierId;
  /** 兒童友好中文名 */
  name: string;
  /** 段位順序（0 = 最低） */
  order: number;
  /** 段位主題色 */
  color: string;
}

/** 6 個段位，order 升序。 */
export const LEAGUE_TIERS: readonly LeagueTier[] = [
  { id: "bronze", name: "青銅聯賽", order: 0, color: "#CD7F32" },
  { id: "silver", name: "白銀聯賽", order: 1, color: "#A8B8C8" },
  { id: "gold", name: "黃金聯賽", order: 2, color: "#FFC800" },
  { id: "sapphire", name: "藍寶石聯賽", order: 3, color: "#1CB0F6" },
  { id: "ruby", name: "紅寶石聯賽", order: 4, color: "#E0115F" },
  { id: "diamond", name: "鑽石聯賽", order: 5, color: "#54D7EC" },
] as const;

/** 按 id 取段位（無效 id 落回青銅，容錯老檔）。 */
export function leagueTier(id: string): LeagueTier {
  return LEAGUE_TIERS.find(t => t.id === id) ?? LEAGUE_TIERS[0];
}

/** 晉級後的段位 id（鑽石封頂）。 */
export function nextTierId(id: LeagueTierId): LeagueTierId {
  const t = leagueTier(id);
  return (LEAGUE_TIERS[Math.min(t.order + 1, LEAGUE_TIERS.length - 1)]).id;
}

/** 降級後的段位 id（青銅保底）。 */
export function prevTierId(id: LeagueTierId): LeagueTierId {
  const t = leagueTier(id);
  return (LEAGUE_TIERS[Math.max(t.order - 1, 0)]).id;
}

// ============================================================
// 🔓 解鎖 & 小組構成
// ============================================================

/** 累計完成 10 節課後解鎖聯賽（與現有 teaser 文案一致）。 */
export const UNLOCK_LESSONS = 10;

/** 小組總人數：使用者 + 15 個影子同學。 */
export const LEAGUE_GROUP_SIZE = 16;
/** 每組影子同學（bot）數。 */
export const LEAGUE_BOT_COUNT = 15;

// ============================================================
// 📅 周鍵
// ============================================================

/**
 * 本週週一的 YYYY-MM-DD（本地時區）。週一自身返回當天。
 *
 * 「一週」的定義在 week.ts（weekStartKey / weekDateKeys / dayIndexInWeek），
 * 聯賽、週報、連勝日曆共用同一份實現；這裡只保留歷史名字作為別名，
 * 不允許再寫第二份周視窗邏輯。
 */
export const weekKeyFor = weekStartKey;

// ============================================================
// 🤖 影子同學（bot）
// ============================================================

export interface LeagueBot {
  /** 穩定 id：`bot-${weekKey}-${tier}-${botIndex}` */
  id: string;
  /** 兒童友好中文暱稱（當週組內去重） */
  name: string;
}

export interface LeagueWeekInput {
  weekKey: string;
  tier: LeagueTierId;
  /** 每臺裝置一次性生成的穩定隨機串（store 持久化） */
  salt: string;
}

/**
 * 兒童友好中文暱稱池（36 個）。
 * ⚠️ iOS 側必須逐字同序鏡像——順序參與去重抽取的結果。
 */
export const BOT_NAME_POOL: readonly string[] = [
  "小猴淘淘", "兔子朵朵", "貓熊團團", "小鹿靈靈", "狐狸悠悠", "小象壯壯",
  "企鵝冰冰", "小貓咪咪", "小狗旺旺", "松鼠果果", "小鳥啾啾", "海豚藍藍",
  "小馬奔奔", "刺蝟球球", "無尾熊抱抱", "小龍騰騰", "河馬呼呼", "小羊咩咩",
  "青蛙呱呱", "蜜蜂嗡嗡", "貓頭鷹慧慧", "小熊憨憨", "倉鼠豆豆", "鸚鵡花花",
  "小鯨魚泡泡", "蝸牛慢慢", "小老虎威威", "浣熊樂樂", "長頸鹿高高", "小恐龍吼吼",
  "雪人白白", "星星閃閃", "月亮彎彎", "太陽暖暖", "彩虹七七", "雲朵飄飄",
] as const;

/** 各段位 bot 周目標 XP 區間（閉區間）。 */
export const TIER_XP_RANGES: Record<LeagueTierId, { min: number; max: number }> = {
  bronze: { min: 40, max: 260 },
  silver: { min: 80, max: 420 },
  gold: { min: 120, max: 600 },
  sapphire: { min: 160, max: 800 },
  ruby: { min: 200, max: 1000 },
  diamond: { min: 240, max: 1200 },
};

/** 當週種子：mix64(djb2(`${weekKey}#${tier}#${salt}`))。 */
function leagueSeed(input: LeagueWeekInput): bigint {
  return mix64(djb2Hash(`${input.weekKey}#${input.tier}#${input.salt}`));
}

/** seed 派生的取模抽樣：mix64(seed + offset) % count。 */
function draw(seed: bigint, offset: number, count: number): number {
  if (count <= 0) return 0;
  return Number(mix64((seed + BigInt(offset)) & U64_MASK) % BigInt(count));
}

/**
 * 當週 15 個影子同學（名字在名池內不放回抽取，組內必然去重）。
 * botIndex ∈ [0, 14] 與返回陣列下標一致，是 botXpAt 的輸入。
 */
export function botsForWeek(input: LeagueWeekInput): LeagueBot[] {
  const seed = leagueSeed(input);
  const pool = [...BOT_NAME_POOL];
  const bots: LeagueBot[] = [];
  for (let i = 0; i < LEAGUE_BOT_COUNT; i++) {
    const idx = draw(seed, 0x1000 + i, pool.length);
    const [name] = pool.splice(idx, 1);
    bots.push({ id: `bot-${input.weekKey}-${input.tier}-${i}`, name });
  }
  return bots;
}

/**
 * 某 bot 的周目標 XP（段位區間內均勻取值，seed 確定）。
 * 週日 23:59 之後 botXpAt 收斂到該值。
 */
export function botWeeklyGoal(input: LeagueWeekInput & { botIndex: number }): number {
  const seed = leagueSeed(input);
  const range = TIER_XP_RANGES[input.tier];
  const span = range.max - range.min + 1;
  return range.min + draw(seed, 0x2000 + input.botIndex, span);
}

/**
 * 某 bot 在 date 時刻的累計周 XP。性質（受測試保護）：
 *   - 週一 00:00 起步為 0，隨時間單調不減；
 *   - 早於本週返回 0，晚於本週返回周目標全額；
 *   - 已過整天按「每日份額」累加（7 天權重曲線由 seed 確定，權重 1..9）；
 *   - 今天的份額按小時線性推進：bot 有 seed 確定的活躍時段
 *     [startHour ∈ 6..10, endHour ∈ 18..23]，時段前 0%、時段後 100%；
 *   - 全程整數運算（floor），雙端可逐位對齊。
 */
export function botXpAt(input: LeagueWeekInput & { botIndex: number; date: Date }): number {
  const { botIndex, date } = input;
  const seed = leagueSeed(input);
  const goal = botWeeklyGoal(input);

  // 7 天權重（週一..週日），每天 1..9
  const weights: number[] = [];
  for (let d = 0; d < 7; d++) {
    weights.push(1 + draw(seed, 0x3000 + botIndex * 0x10 + d, 9));
  }
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  // 累計到第 d 天（含）應得的 XP：floor(goal * ΣW / W)，cum(6) == goal
  const cum = (d: number): number => {
    let w = 0;
    for (let i = 0; i <= d; i++) w += weights[i];
    return Math.floor((goal * w) / totalWeight);
  };

  const dayIndex = dayIndexInWeek(input.weekKey, date);
  if (dayIndex < 0) return 0;
  if (dayIndex > 6) return goal;

  const prevCum = dayIndex === 0 ? 0 : cum(dayIndex - 1);
  const todayShare = cum(dayIndex) - prevCum;

  // 今日按小時推進：活躍時段 [startHour, endHour] 內線性，兩端截斷
  const startHour = 6 + draw(seed, 0x4000 + botIndex, 5); // 6..10
  const endHour = 18 + draw(seed, 0x5000 + botIndex, 6); // 18..23
  const hour = date.getHours();
  const clamped = Math.min(Math.max(hour - startHour, 0), endHour - startHour);
  const todayPortion = Math.floor((todayShare * clamped) / (endHour - startHour));

  return prevCum + todayPortion;
}

// ============================================================
// 📊 實時榜單
// ============================================================

export interface StandingEntry {
  /** 是否為使用者本人 */
  isUser: boolean;
  /** bot 下標（0..14）；使用者為 null */
  botIndex: number | null;
  xp: number;
  /** 名次 1..16 */
  rank: number;
}

/**
 * 把使用者實時插入 16 人榜單：XP 降序；同分使用者靠前；bot 同分按下標升序。
 */
export function standings(input: { userXp: number; botXps: number[] }): StandingEntry[] {
  const rows = [
    { isUser: true, botIndex: null as number | null, xp: input.userXp },
    ...input.botXps.map((xp, i) => ({ isUser: false, botIndex: i as number | null, xp })),
  ];
  rows.sort((a, b) => {
    if (a.xp !== b.xp) return b.xp - a.xp;
    if (a.isUser !== b.isUser) return a.isUser ? -1 : 1;
    return (a.botIndex ?? -1) - (b.botIndex ?? -1);
  });
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

/** 使用者當前名次（1..16）。 */
export function userRank(input: { userXp: number; botXps: number[] }): number {
  return standings(input).find(r => r.isUser)!.rank;
}

// ============================================================
// 🎁 週一結算
// ============================================================

/** 前 5 名晉級（鑽石封頂）。 */
export const PROMOTE_ZONE = 5;
/** 後 5 名降級（青銅保底），即名次 ≥ 12。 */
export const DEMOTE_ZONE = 5;

/** 名次寶石獎勵表（4-5 名同檔 40；6 名及以後 0）。 */
export const RANK_GEM_REWARDS: Record<number, number> = {
  1: 100,
  2: 80,
  3: 60,
  4: 40,
  5: 40,
};

/** 晉級額外寶石。 */
export const PROMOTION_BONUS_GEMS = 20;

export interface LeagueSettleResult {
  promoted: boolean;
  demoted: boolean;
  /** 名次獎勵 +（晉級時）晉級獎勵 */
  gems: number;
}

/**
 * 按上週末終值名次結算：
 *   - rank ≤ 5 晉級（tierId 為鑽石時封頂不晉級，也不發晉級獎勵）；
 *   - rank ≥ 12 降級（tierId 為青銅時保底不降級）；
 *   - gems = RANK_GEM_REWARDS[rank]（預設 0）+ 晉級時 PROMOTION_BONUS_GEMS。
 * 不傳 tierId 時按可晉可降處理（呼叫方自行封頂/保底則請傳入）。
 */
export function settleRank(rank: number, tierId?: LeagueTierId): LeagueSettleResult {
  const promoted = rank <= PROMOTE_ZONE && tierId !== "diamond";
  const demoted = rank >= LEAGUE_GROUP_SIZE - DEMOTE_ZONE + 1 && tierId !== "bronze";
  const gems = (RANK_GEM_REWARDS[rank] ?? 0) + (promoted ? PROMOTION_BONUS_GEMS : 0);
  return { promoted, demoted, gems };
}
