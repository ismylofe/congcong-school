/**
 * backup.ts —— 存檔備份中立信封（BackupEnvelope v1，雙端互通）
 *
 * 設計目標：
 *   - web / iOS 匯出、匯入都走同一個 JSON 信封，欄位命名與平臺無關；
 *   - 零依賴手寫校驗（validateBackup），不引入 zod 等庫；
 *   - 瞬態狀態（紅心恢復計時、進行中的課程會話、今日 XP 等）不進信封，
 *     hearts 本身允許攜帶（匯入後即時可用），預設時回滿；
 *   - 前向相容策略（見 validateBackup 註釋）。
 *
 * 校驗契約：
 *   - ok === false ⇔ 信封結構性不可用（非物件 / schema 不符 / version 非正整數 /
 *     data 非物件）。此時 data 為 undefined，errors 說明致命原因。
 *   - ok === true 時 data 一定是補全預設值後的完整 BackupEnvelope；
 *     errors 記錄被丟棄或替換為預設值的欄位（作為可展示的"修復日誌"，可為空陣列）。
 */

import type { Question } from "./types";
import { DEFAULT_EQUIPPED } from "./cosmetics";
import { MAX_HEARTS, DEFAULT_DAILY_GOAL, INITIAL_FREEZES } from "./economy";
import { normalizeReadingMap } from "./reading";
import { normalizeNumberProgress, type NumberProgress } from "./numberSense";
import { isDateKey } from "./week";

// ============================================================
// 型別
// ============================================================

export const BACKUP_SCHEMA = "cstf-backup" as const;

/**
 * 信封格式代號。**保持 1**，理由與已知限制見下。
 *
 * 已知限制（v1 內的一次語義變更，2026-08 雙端 key 空間統一）：
 *   `completedReadings` 的**鍵空間**從"兩端各寫各的"（web `passage-{id}-listen` /
 *   `story-{id}`，iOS 裸 `{id}` / `{id}-followup`）改成了統一的規範閱讀 id
 *   `reading:{kind}:{rawId}`（見 reading.ts）。當前兩端的 buildBackup /
 *   validateBackup 都**無條件**用 normalizeReadingMap 歸一化，所以新端讀任何時代的
 *   檔案都正確；但**混版視窗內舊客戶端匯入新檔，會把所有閱讀讀成未讀**
 *   （只丟已讀標記與"這篇領過 XP"的記錄，不會損壞其它欄位，重裝新版後再導一次即可復原）。
 *
 * 為什麼不升到 2：
 *   1. 升版本救不了舊客戶端 —— 舊端的前向相容策略是"version 更大也照讀已知欄位"
 *      （見 validateBackup 註釋與 iOS Backup.swift），它並不按 version 分支解析
 *      completedReadings，所以 v2 和 v1 在舊端的結果一模一樣；
 *   2. 新客戶端也不需要 version 來分支 —— 歸一化本來就是無條件的、冪等的，
 *      normalizeReadingMap 同時認得新舊兩套鍵；
 *   3. 真正的代價是雙端 skew：iOS `Domain/Backup.swift` 的 `Backup.version`
 *      與 spec/golden-vectors.json 必須同步改，任何一側漏改就會出現"同一版本的
 *      兩端匯出不同 version"，比現在這條有據可查的限制更難排查。
 *   → 結論：只作**語義標註**，不動版本號。真要升版，必須三處（此常量 /
 *      iOS Backup.version / golden-vectors）同一次提交一起改。
 */
export const BACKUP_VERSION = 1;

export type BackupPlatform = "ios" | "web";

/** completedLessons 裡單條課程結果（與 LessonResult 對齊，但完全自包含）。 */
export interface BackupLessonResult {
  stars: 1 | 2 | 3;
  accuracy: number; // 0-1
  completedAt: string; // ISO
}

/**
 * 錯題本條目 —— 只導可跨端復原 SRS 狀態的最小欄位。
 * question 是題面快照（可選）：iOS/web 本地題庫齊全時可省略，
 * 攜帶時匯入端優先使用快照展示。
 */
export interface BackupMistake {
  lessonId: string;
  questionId: number;
  box?: 1 | 2 | 3;
  correctCount?: number;
  nextReviewDate?: string; // YYYY-MM-DD
  graduated?: boolean;
  question?: Question;
}

/** 已裝扮項（key 與 cosmetics.DEFAULT_EQUIPPED 一致）。 */
export interface BackupEquipped {
  mascotSkin: string;
  uiTheme: string;
  lessonBackdrop: string;
}

export interface BackupData {
  xp: number;
  streak: number;
  lastActiveDate: string; // YYYY-MM-DD
  streakFreezes: number;
  gems: number;
  lifetimeGems: number;
  hearts: number;
  dailyGoal: number;
  joinedDate?: string; // YYYY-MM-DD
  completedLessons: Record<string, BackupLessonResult>;
  /**
   * 閱讀完成表：規範閱讀 id → 完成日期（YYYY-MM-DD）。
   * 鍵一律是 reading.ts 的 `reading:{kind}:{rawId}`（buildBackup / validateBackup
   * 都會用 normalizeReadingMap 歸一化歷史鍵），雙端共用同一個 key 空間。
   *
   * 值保證非空：日期不詳的老檔條目會寫成 `UNKNOWN_COMPLETION_DATE`。
   * 判斷"讀過沒有"看**鍵是否存在**，別對值做真值判斷。
   */
  completedReadings: Record<string, string>;
  perfectedLessons?: Record<string, true>;
  mistakesBank: BackupMistake[];
  claimedChests: Record<string, true>;
  /** key 為里程碑天數的字串形式（JSON 鍵天然是字串） */
  claimedStreakRewards: Record<string, true>;
  /**
   * 每日任務領取賬本，鍵格式 `"YYYY-MM-DD:questId"`（questId 形如 `earnXP-60`）。
   * 必須隨檔攜帶：否則匯入端把它當瞬態清空、又從 xpHistory 復原了今日 XP，
   * 已領過的任務會立刻回到"可領取"，匯出再匯入就能無限刷寶石。
   */
  claimedQuests: Record<string, true>;
  lastDailyRewardDate: string; // YYYY-MM-DD，"" = 從未領取
  unlockedAchievements: Record<string, true>;
  claimedAchievements?: Record<string, true>;
  ownedCosmetics: Record<string, true>;
  equipped: BackupEquipped;
  /** 日期 → 當日 XP */
  xpHistory: Record<string, number>;
  /** Optional Web activity ledger. Zero-XP learning must survive a backup. */
  studyDays?: Record<string, true>;
  /** Optional dated Web lesson totals, including repeated practice. */
  lessonHistory?: Record<string, number>;
  numberSenseProgress?: NumberProgress;
  /** 聯賽段位 id（"bronze" 等）。寬鬆保留為 string，未知段位由匯入端降級 */
  leagueTier?: string;
  leagueWeekKey?: string;
}

export interface BackupEnvelope {
  schema: typeof BACKUP_SCHEMA;
  version: number;
  exportedAt: string; // ISO
  platform: BackupPlatform;
  data: BackupData;
}

export interface BackupValidationResult {
  ok: boolean;
  /** ok 時為規整後的完整信封；否則 undefined */
  data?: BackupEnvelope;
  /** ok=false：致命原因；ok=true：欄位級修復日誌（可為空） */
  errors: string[];
}

// ============================================================
// buildBackup —— 匯出端構造信封（缺欄位自動補預設）
// ============================================================

function defaultData(): BackupData {
  return {
    xp: 0,
    streak: 0,
    lastActiveDate: "",
    streakFreezes: INITIAL_FREEZES,
    gems: 0,
    lifetimeGems: 0,
    hearts: MAX_HEARTS,
    dailyGoal: DEFAULT_DAILY_GOAL,
    completedLessons: {},
    completedReadings: {},
    mistakesBank: [],
    claimedChests: {},
    claimedStreakRewards: {},
    claimedQuests: {},
    lastDailyRewardDate: "",
    unlockedAchievements: {},
    ownedCosmetics: {},
    equipped: { ...DEFAULT_EQUIPPED },
    xpHistory: {},
  };
}

export interface BuildBackupInput {
  platform: BackupPlatform;
  /** 預設用當前時刻 ISO */
  exportedAt?: string;
  /** 進度欄位（可部分給出，缺失補預設） */
  data?: Partial<BackupData>;
}

/**
 * 構造一個合法的 v1 信封。傳入的 data 可以只給部分欄位。
 * completedReadings 一律歸一化成規範閱讀 id，信封裡只存在一個 key 空間。
 */
export function buildBackup(input: BuildBackupInput): BackupEnvelope {
  const data: BackupData = { ...defaultData(), ...stripUndefined(input.data ?? {}) };
  data.completedReadings = normalizeReadingMap(data.completedReadings);
  return {
    schema: BACKUP_SCHEMA,
    version: BACKUP_VERSION,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    platform: input.platform,
    data,
  };
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}

// ============================================================
// validateBackup —— 匯入端零依賴校驗
// ============================================================

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** 非負數字，壞型別/負數 → fallback，並記一條修復日誌。 */
function readNonNegNumber(
  obj: Record<string, unknown>,
  key: string,
  fallback: number,
  log: string[],
): number {
  const v = obj[key];
  if (v === undefined) return fallback;
  if (!isFiniteNumber(v) || v < 0) {
    log.push(`data.${key} 型別或取值非法，已重置為預設值 ${fallback}`);
    return fallback;
  }
  return v;
}

function readString(
  obj: Record<string, unknown>,
  key: string,
  fallback: string,
  log: string[],
): string {
  const v = obj[key];
  if (v === undefined) return fallback;
  if (typeof v !== "string") {
    log.push(`data.${key} 不是字串，已重置為預設值`);
    return fallback;
  }
  return v;
}

function readOptionalString(
  obj: Record<string, unknown>,
  key: string,
  log: string[],
): string | undefined {
  const v = obj[key];
  if (v === undefined) return undefined;
  if (typeof v !== "string") {
    log.push(`data.${key} 不是字串，已忽略`);
    return undefined;
  }
  return v;
}

/** Record<string, true>：只保留值為 truthy 的鍵。 */
function readFlagRecord(
  obj: Record<string, unknown>,
  key: string,
  log: string[],
): Record<string, true> {
  const v = obj[key];
  if (v === undefined) return {};
  if (!isRecord(v)) {
    log.push(`data.${key} 不是物件，已重置為空`);
    return {};
  }
  const out: Record<string, true> = {};
  for (const [k, val] of Object.entries(v)) {
    if (val) out[k] = true;
  }
  return out;
}

/** Record<string, string>（completedReadings）。 */
function readStringRecord(
  obj: Record<string, unknown>,
  key: string,
  log: string[],
): Record<string, string> {
  const v = obj[key];
  if (v === undefined) return {};
  if (!isRecord(v)) {
    log.push(`data.${key} 不是物件，已重置為空`);
    return {};
  }
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === "string") out[k] = val;
    else log.push(`data.${key}["${k}"] 不是字串，已丟棄`);
  }
  return out;
}

/** Record<string, number>（xpHistory）。 */
function readNumberRecord(
  obj: Record<string, unknown>,
  key: string,
  log: string[],
): Record<string, number> {
  const v = obj[key];
  if (v === undefined) return {};
  if (!isRecord(v)) {
    log.push(`data.${key} 不是物件，已重置為空`);
    return {};
  }
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v)) {
    if (isFiniteNumber(val) && val >= 0) out[k] = val;
    else log.push(`data.${key}["${k}"] 不是合法數字，已丟棄`);
  }
  return out;
}

function readCompletedLessons(
  obj: Record<string, unknown>,
  log: string[],
): Record<string, BackupLessonResult> {
  const v = obj["completedLessons"];
  if (v === undefined) return {};
  if (!isRecord(v)) {
    log.push("data.completedLessons 不是物件，已重置為空");
    return {};
  }
  const out: Record<string, BackupLessonResult> = {};
  for (const [lessonId, raw] of Object.entries(v)) {
    if (!isRecord(raw)) {
      log.push(`data.completedLessons["${lessonId}"] 不是物件，已丟棄`);
      continue;
    }
    const starsRaw = raw["stars"];
    const stars: 1 | 2 | 3 =
      starsRaw === 1 || starsRaw === 2 || starsRaw === 3 ? starsRaw : 1;
    if (stars !== starsRaw) {
      log.push(`data.completedLessons["${lessonId}"].stars 非法，已按 1 星處理`);
    }
    const accRaw = raw["accuracy"];
    const accuracy = isFiniteNumber(accRaw) ? Math.min(1, Math.max(0, accRaw)) : 0;
    const completedAt = typeof raw["completedAt"] === "string" ? raw["completedAt"] : "";
    out[lessonId] = { stars, accuracy, completedAt };
  }
  return out;
}

function readMistakesBank(
  obj: Record<string, unknown>,
  log: string[],
): BackupMistake[] {
  const v = obj["mistakesBank"];
  if (v === undefined) return [];
  if (!Array.isArray(v)) {
    log.push("data.mistakesBank 不是陣列，已重置為空");
    return [];
  }
  const out: BackupMistake[] = [];
  v.forEach((raw, i) => {
    if (!isRecord(raw)) {
      log.push(`data.mistakesBank[${i}] 不是物件，已丟棄`);
      return;
    }
    const lessonId = raw["lessonId"];
    const questionId = raw["questionId"];
    if (typeof lessonId !== "string" || !isFiniteNumber(questionId)) {
      log.push(`data.mistakesBank[${i}] 缺少 lessonId/questionId，已丟棄`);
      return;
    }
    const entry: BackupMistake = { lessonId, questionId };
    const box = raw["box"];
    if (box === 1 || box === 2 || box === 3) entry.box = box;
    if (isFiniteNumber(raw["correctCount"]) && (raw["correctCount"] as number) >= 0) {
      entry.correctCount = raw["correctCount"] as number;
    }
    if (typeof raw["nextReviewDate"] === "string") {
      entry.nextReviewDate = raw["nextReviewDate"];
    }
    if (typeof raw["graduated"] === "boolean") entry.graduated = raw["graduated"];
    // 題面快照：寬鬆透傳（只要求是物件且帶數字 id），匯入端展示前自行兜底
    const q = raw["question"];
    if (isRecord(q) && isFiniteNumber(q["id"])) {
      entry.question = q as unknown as Question;
    }
    out.push(entry);
  });
  return out;
}

function readEquipped(
  obj: Record<string, unknown>,
  log: string[],
): BackupEquipped {
  const fallback: BackupEquipped = { ...DEFAULT_EQUIPPED };
  const v = obj["equipped"];
  if (v === undefined) return fallback;
  if (!isRecord(v)) {
    log.push("data.equipped 不是物件，已重置為預設裝扮");
    return fallback;
  }
  return {
    mascotSkin:
      typeof v["mascotSkin"] === "string" ? v["mascotSkin"] : fallback.mascotSkin,
    uiTheme: typeof v["uiTheme"] === "string" ? v["uiTheme"] : fallback.uiTheme,
    lessonBackdrop:
      typeof v["lessonBackdrop"] === "string"
        ? v["lessonBackdrop"]
        : fallback.lessonBackdrop,
  };
}

/**
 * 校驗一段未知輸入是否是可匯入的備份信封。
 *
 * 前向相容策略（重要，雙端一致）：
 *   - version 是"資料格式代號"，只增不改語義；
 *   - version > BACKUP_VERSION（未來版本導給舊客戶端）：不拒收——
 *     未知欄位直接忽略，已知欄位照常讀取；v1 欄位承諾永不改型別/語義，
 *     所以舊端讀新檔最多丟失新功能資料，不會損壞；
 *   - version < 1 或非正整數：視為結構損壞，拒收；
 *   - data 內任何未知欄位一律忽略（不報錯），缺失欄位補預設值。
 */
export function validateBackup(input: unknown): BackupValidationResult {
  const fatal: string[] = [];

  if (!isRecord(input)) {
    return { ok: false, errors: ["備份內容不是 JSON 物件"] };
  }
  if (input["schema"] !== BACKUP_SCHEMA) {
    fatal.push(`schema 不是 "${BACKUP_SCHEMA}"，這不是聰聰學堂的備份檔案`);
  }
  const version = input["version"];
  if (!isFiniteNumber(version) || !Number.isInteger(version) || version < 1) {
    fatal.push("version 缺失或不是正整數");
  }
  const rawData = input["data"];
  if (!isRecord(rawData)) {
    fatal.push("data 缺失或不是物件");
  }
  if (fatal.length > 0) {
    return { ok: false, errors: fatal };
  }

  const log: string[] = [];
  const d = rawData as Record<string, unknown>;

  // 平臺是中繼資料，壞值不致命
  const platformRaw = input["platform"];
  const platform: BackupPlatform =
    platformRaw === "ios" || platformRaw === "web" ? platformRaw : "web";
  if (platform !== platformRaw) {
    log.push('platform 非法，已按 "web" 處理');
  }
  const exportedAt =
    typeof input["exportedAt"] === "string" ? input["exportedAt"] : "";
  if (exportedAt === "" && input["exportedAt"] !== undefined) {
    log.push("exportedAt 不是字串，已置空");
  }

  const data: BackupData = {
    xp: readNonNegNumber(d, "xp", 0, log),
    streak: readNonNegNumber(d, "streak", 0, log),
    lastActiveDate: readString(d, "lastActiveDate", "", log),
    streakFreezes: readNonNegNumber(d, "streakFreezes", INITIAL_FREEZES, log),
    gems: readNonNegNumber(d, "gems", 0, log),
    lifetimeGems: readNonNegNumber(d, "lifetimeGems", 0, log),
    hearts: readNonNegNumber(d, "hearts", MAX_HEARTS, log),
    dailyGoal: readNonNegNumber(d, "dailyGoal", DEFAULT_DAILY_GOAL, log),
    completedLessons: readCompletedLessons(d, log),
    // 閱讀 id 歸一化：老檔 / 另一端的歷史鍵統一升級到 reading:{kind}:{rawId}
    completedReadings: normalizeReadingMap(readStringRecord(d, "completedReadings", log)),
    mistakesBank: readMistakesBank(d, log),
    claimedChests: readFlagRecord(d, "claimedChests", log),
    claimedStreakRewards: readFlagRecord(d, "claimedStreakRewards", log),
    claimedQuests: readFlagRecord(d, "claimedQuests", log),
    lastDailyRewardDate: readString(d, "lastDailyRewardDate", "", log),
    unlockedAchievements: readFlagRecord(d, "unlockedAchievements", log),
    ownedCosmetics: readFlagRecord(d, "ownedCosmetics", log),
    equipped: readEquipped(d, log),
    xpHistory: readNumberRecord(d, "xpHistory", log),
  };

  // Optional new Web evidence; old clients ignore unknown fields.
  if (d["numberSenseProgress"] !== undefined) data.numberSenseProgress = normalizeNumberProgress(d["numberSenseProgress"]);
  // 可選欄位：給了才帶上
  if (d["lessonHistory"] !== undefined) {
    data.lessonHistory = Object.fromEntries(Object.entries(readNumberRecord(d, "lessonHistory", log)).filter(([key, count]) => isDateKey(key) && Number.isInteger(count) && count >= 0));
  }
  if (d["studyDays"] !== undefined) {
    data.studyDays = Object.fromEntries(Object.entries(readFlagRecord(d, "studyDays", log)).filter(([key]) => isDateKey(key)));
  }
  const joinedDate = readOptionalString(d, "joinedDate", log);
  if (joinedDate !== undefined) data.joinedDate = joinedDate;
  if (d["perfectedLessons"] !== undefined) {
    data.perfectedLessons = readFlagRecord(d, "perfectedLessons", log);
  }
  if (d["claimedAchievements"] !== undefined) {
    data.claimedAchievements = readFlagRecord(d, "claimedAchievements", log);
  }
  const leagueTier = readOptionalString(d, "leagueTier", log);
  if (leagueTier !== undefined) data.leagueTier = leagueTier;
  const leagueWeekKey = readOptionalString(d, "leagueWeekKey", log);
  if (leagueWeekKey !== undefined) data.leagueWeekKey = leagueWeekKey;

  return {
    ok: true,
    data: {
      schema: BACKUP_SCHEMA,
      version: version as number,
      exportedAt,
      platform,
      data,
    },
    errors: log,
  };
}
