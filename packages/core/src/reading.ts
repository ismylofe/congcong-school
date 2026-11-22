/**
 * reading.ts —— 閱讀完成 id 的單一事實源（雙端互通的 key 空間）
 *
 * 背景：歷史上兩端各寫各的 key，completedReadings 的鍵空間零交集——
 *   web ：`passage-{passageId}-listen` / `passage-{passageId}-followup` / `story-{storyId}`
 *   iOS ：`{passageId}`（聽讀）/ `{passageId}-followup`（跟讀）/ `{storyId}`（故事）
 * 導致備份互通時閱讀進度 100% 失配（匯入後全部顯示未讀，還能重複領 XP）。
 *
 * 現在統一為：`reading:{kind}:{rawId}`
 *   - rawId 是資料層的原始 id（Passage.id / Story.id，形如 `chinese-g1up-p3`、`chinese-g3up-s1`），
 *     不帶任何平臺前字尾；
 *   - BackupEnvelope.completedReadings 裡只允許出現這種規範鍵（buildBackup / validateBackup
 *     會自動歸一化）；兩端本地儲存也應在遷移時用 normalizeReadingMap 整表升級。
 *
 * 值的契約：條目的值是完成日期，**歸一化後一定非空**（日期不詳時寫
 * {@link UNKNOWN_COMPLETION_DATE}）。所以"這篇讀沒讀過"一律按**鍵是否存在**判斷
 * （`map[key] != null`），不要寫成 `if (map[key])` —— 兩套口徑正是重複領 XP 的老病根。
 *
 * ⚠️ iOS `Domain/Reading.swift` 必須逐行鏡像 readingId / normalizeReadingId 的規則。
 */

/** 閱讀活動的三種型別：課文聽讀 / 課文跟讀 / 故事閱讀（含測驗）。 */
export type ReadingKind = "listen" | "followup" | "story";

/** 規範鍵字首。 */
export const READING_ID_PREFIX = "reading";

const READING_KINDS: readonly ReadingKind[] = ["listen", "followup", "story"];

/** 規範閱讀完成 id：`reading:{kind}:{rawId}`。 */
export function readingId(kind: ReadingKind, rawId: string): string {
  return `${READING_ID_PREFIX}:${kind}:${rawId}`;
}

/** 解析規範 id；不是規範格式（或 kind 未知）返回 null。 */
export function parseReadingId(
  id: string,
): { kind: ReadingKind; rawId: string } | null {
  const head = `${READING_ID_PREFIX}:`;
  if (!id.startsWith(head)) return null;
  const rest = id.slice(head.length);
  const sep = rest.indexOf(":");
  if (sep <= 0) return null;
  const kind = rest.slice(0, sep) as ReadingKind;
  const rawId = rest.slice(sep + 1);
  if (!READING_KINDS.includes(kind) || rawId === "") return null;
  return { kind, rawId };
}

/**
 * 故事 id 的形態：`{bookId}-s{序號}`（如 `chinese-g3up-s1`）。
 * 課文 id 是 `{bookId}-p{序號}`（如 `chinese-g1up-p3`），兩者不會互相誤判。
 */
const STORY_ID_RE = /-s\d+$/;

/**
 * 把歷史 id 歸一化成規範 id（已是規範 id 則原樣返回，**冪等**）。
 *
 * 消歧規則（按順序匹配，先長後短，避免字首/字尾互吃）：
 *   1. `reading:{kind}:{raw}`   → 原樣（已規範）
 *   2. `story-{raw}`            → story        （web 故事）
 *   3. `passage-{raw}-followup` → followup     （web 跟讀）
 *   4. `passage-{raw}-listen`   → listen       （web 聽讀）
 *   5. `passage-{raw}`          → listen       （web 早期無字尾寫法，按聽讀處理）
 *   6. `{raw}-followup`         → followup     （iOS 跟讀）
 *   7. 裸 `{raw}`               → raw 命中 `-s\d+` 時是 story，否則是 listen
 *      （iOS 聽讀與故事都用裸 id，只能靠 id 形態區分；web 不存在裸 id，
 *        所以這條規則不會誤傷 web 老檔。）
 *
 * 無法識別的空串返回空串，交給呼叫方丟棄。
 */
export function normalizeReadingId(legacyId: string): string {
  const id = legacyId.trim();
  if (id === "") return "";

  if (parseReadingId(id)) return id;

  if (id.startsWith("story-")) {
    const raw = id.slice("story-".length);
    return raw === "" ? "" : readingId("story", raw);
  }

  if (id.startsWith("passage-")) {
    let raw = id.slice("passage-".length);
    let kind: ReadingKind = "listen";
    if (raw.endsWith("-followup")) {
      raw = raw.slice(0, -"-followup".length);
      kind = "followup";
    } else if (raw.endsWith("-listen")) {
      raw = raw.slice(0, -"-listen".length);
    }
    return raw === "" ? "" : readingId(kind, raw);
  }

  if (id.endsWith("-followup")) {
    const raw = id.slice(0, -"-followup".length);
    return raw === "" ? "" : readingId("followup", raw);
  }

  return readingId(STORY_ID_RE.test(id) ? "story" : "listen", id);
}

/**
 * 完成日期未知時的佔位值。
 *
 * 為什麼不能留空串：`completedReadings` 的值只是"完成憑證"，各處讀取口徑不一
 * （`map[key] != null` vs `if (map[key])`）。一旦某條的值是空串，真值口徑會判它
 * **未完成**、存在性口徑判它**已完成** —— 同一份資料兩套結論，卡片顯示"已讀"
 * 卻還能再領一次 XP（歷史上 iOS 匯出的值就是空串，匯入 web 後每篇都能重複領）。
 * 歸一化後一律保證"值非空"，任何口徑都得到一致結論。
 *
 * 取值刻意不是日期形態：它是"讀過，但不知道哪天"的誠實表達，
 * 不會被誤當成 1970 之類的假日期顯示給小朋友。
 */
export const UNKNOWN_COMPLETION_DATE = "unknown";

/** 這個完成時間是不是"讀過但日期不詳"（空串 / 佔位值）。 */
function isUnknownCompletion(v: string): boolean {
  return v.trim() === "" || v === UNKNOWN_COMPLETION_DATE;
}

/**
 * 整表歸一化（匯入側 + 本地遷移共用）。
 *
 * - 值是完成日期（`YYYY-MM-DD`，老檔裡可能是 ISO 時間戳，兩種都保留原樣）；
 * - 多個歷史鍵歸到同一個規範鍵時**保留較早的完成日期**：先比日期部分（前 10 位），
 *   同日再取字典序較小者（即 `2026-08-02` 優於 `2026-08-02T09:00:00Z`），
 *   保證與遍歷順序無關、雙端結果一致；
 * - 空鍵 / 非字串值直接丟棄；
 * - 空串（或純空白）日期不覆蓋已有的真實日期，且**不會原樣留在結果裡**——
 *   會寫成 {@link UNKNOWN_COMPLETION_DATE}，保證輸出中不存在"值為空串"的條目；
 * - 冪等：對結果再跑一次得到完全相同的表。
 */
export function normalizeReadingMap(
  map: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(map ?? {})) {
    if (typeof rawValue !== "string") continue;
    const key = normalizeReadingId(rawKey);
    if (key === "") continue;
    // 日期不詳的條目也是"讀過"，只是丟了日期：換成佔位值，絕不留空串
    const value = rawValue.trim() === "" ? UNKNOWN_COMPLETION_DATE : rawValue;
    const prev = out[key];
    out[key] = prev === undefined ? value : earlierCompletion(prev, value);
  }
  return out;
}

/** 兩個完成時間取較早的一個（日期不詳的一方永遠輸給有真實日期的一方）。 */
function earlierCompletion(a: string, b: string): string {
  if (isUnknownCompletion(a)) return isUnknownCompletion(b) ? UNKNOWN_COMPLETION_DATE : b;
  if (isUnknownCompletion(b)) return a;
  const da = a.slice(0, 10);
  const db = b.slice(0, 10);
  if (da !== db) return da < db ? a : b;
  return a <= b ? a : b;
}
