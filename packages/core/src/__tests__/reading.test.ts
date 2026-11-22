/**
 * reading.test.ts —— 閱讀完成 id 的雙端歸一化契約
 *
 * 關鍵性質：
 *   - web 三種歷史格式與 iOS 三種歷史格式落到同一個規範鍵（key 空間交集 = 全集）；
 *   - normalizeReadingId 冪等；
 *   - 整表歸一化衝突時保留較早完成日期，且與遍歷順序無關。
 */

import { describe, expect, it } from "vitest";
import {
  UNKNOWN_COMPLETION_DATE,
  normalizeReadingId,
  normalizeReadingMap,
  parseReadingId,
  readingId,
} from "../reading";

const PASSAGE = "chinese-g1up-p3";
const STORY = "chinese-g3up-s1";

describe("readingId / parseReadingId", () => {
  it("規範格式為 reading:{kind}:{rawId}", () => {
    expect(readingId("listen", PASSAGE)).toBe("reading:listen:chinese-g1up-p3");
    expect(readingId("followup", PASSAGE)).toBe("reading:followup:chinese-g1up-p3");
    expect(readingId("story", STORY)).toBe("reading:story:chinese-g3up-s1");
  });

  it("能解析回 kind + rawId", () => {
    expect(parseReadingId(readingId("followup", PASSAGE))).toEqual({
      kind: "followup",
      rawId: PASSAGE,
    });
  });

  it("非規範/未知 kind 解析為 null", () => {
    expect(parseReadingId(PASSAGE)).toBeNull();
    expect(parseReadingId("reading:sing:x")).toBeNull();
    expect(parseReadingId("reading::x")).toBeNull();
    expect(parseReadingId("reading:listen:")).toBeNull();
  });
});

describe("normalizeReadingId：web 歷史格式", () => {
  it("passage-{id}-listen → listen", () => {
    expect(normalizeReadingId(`passage-${PASSAGE}-listen`)).toBe(
      readingId("listen", PASSAGE),
    );
  });

  it("passage-{id}-followup → followup（不會被裸 -followup 規則吃掉字首）", () => {
    expect(normalizeReadingId(`passage-${PASSAGE}-followup`)).toBe(
      readingId("followup", PASSAGE),
    );
  });

  it("story-{id} → story", () => {
    expect(normalizeReadingId(`story-${STORY}`)).toBe(readingId("story", STORY));
  });

  it("passage-{id}（無字尾的早期寫法）按聽讀處理", () => {
    expect(normalizeReadingId(`passage-${PASSAGE}`)).toBe(readingId("listen", PASSAGE));
  });
});

describe("normalizeReadingId：iOS 歷史格式", () => {
  it("裸課文 id → listen", () => {
    expect(normalizeReadingId(PASSAGE)).toBe(readingId("listen", PASSAGE));
  });

  it("{id}-followup → followup", () => {
    expect(normalizeReadingId(`${PASSAGE}-followup`)).toBe(
      readingId("followup", PASSAGE),
    );
  });

  it("裸故事 id（-s\\d+ 形態）→ story，不會誤判成聽讀", () => {
    expect(normalizeReadingId(STORY)).toBe(readingId("story", STORY));
    expect(normalizeReadingId("english-g5up-s12")).toBe(
      readingId("story", "english-g5up-s12"),
    );
  });
});

describe("normalizeReadingId：雙端交集與冪等", () => {
  it("web / iOS 同一篇課文聽讀落到同一個鍵", () => {
    expect(normalizeReadingId(`passage-${PASSAGE}-listen`)).toBe(
      normalizeReadingId(PASSAGE),
    );
  });

  it("web / iOS 同一篇課文跟讀落到同一個鍵", () => {
    expect(normalizeReadingId(`passage-${PASSAGE}-followup`)).toBe(
      normalizeReadingId(`${PASSAGE}-followup`),
    );
  });

  it("web / iOS 同一個故事落到同一個鍵", () => {
    expect(normalizeReadingId(`story-${STORY}`)).toBe(normalizeReadingId(STORY));
  });

  it("冪等：規範 id 再歸一化仍是自己", () => {
    for (const id of [
      `passage-${PASSAGE}-listen`,
      `passage-${PASSAGE}-followup`,
      `story-${STORY}`,
      PASSAGE,
      `${PASSAGE}-followup`,
      STORY,
    ]) {
      const once = normalizeReadingId(id);
      expect(normalizeReadingId(once)).toBe(once);
    }
  });

  it("空串 / 只有字首的殘缺鍵返回空串", () => {
    expect(normalizeReadingId("")).toBe("");
    expect(normalizeReadingId("   ")).toBe("");
    expect(normalizeReadingId("story-")).toBe("");
    expect(normalizeReadingId("passage-")).toBe("");
    expect(normalizeReadingId("-followup")).toBe("");
  });
});

describe("normalizeReadingMap", () => {
  it("整表歸一化，兩端老檔合併後無重複條目", () => {
    const merged = normalizeReadingMap({
      [`passage-${PASSAGE}-listen`]: "2026-08-02",
      [PASSAGE]: "2026-08-05",
      [`story-${STORY}`]: "2026-07-30",
      [STORY]: "2026-08-01",
    });
    expect(Object.keys(merged).sort()).toEqual([
      readingId("listen", PASSAGE),
      readingId("story", STORY),
    ]);
  });

  it("衝突保留較早日期，且與遍歷順序無關", () => {
    const a = normalizeReadingMap({
      [`passage-${PASSAGE}-listen`]: "2026-08-02",
      [PASSAGE]: "2026-08-05",
    });
    const b = normalizeReadingMap({
      [PASSAGE]: "2026-08-05",
      [`passage-${PASSAGE}-listen`]: "2026-08-02",
    });
    expect(a).toEqual(b);
    expect(a[readingId("listen", PASSAGE)]).toBe("2026-08-02");
  });

  it("同日的 ISO 時間戳與純日期共存時取純日期（字典序較小）", () => {
    const m = normalizeReadingMap({
      [`passage-${PASSAGE}-listen`]: "2026-08-02T09:30:00.000Z",
      [PASSAGE]: "2026-08-02",
    });
    expect(m[readingId("listen", PASSAGE)]).toBe("2026-08-02");
  });

  it("空日期不覆蓋真實日期", () => {
    expect(
      normalizeReadingMap({
        [`passage-${PASSAGE}-listen`]: "",
        [PASSAGE]: "2026-08-02",
      })[readingId("listen", PASSAGE)],
    ).toBe("2026-08-02");
  });

  it("非字串值與空鍵被丟棄", () => {
    const m = normalizeReadingMap({
      [PASSAGE]: "2026-08-02",
      "": "2026-08-02",
      broken: 7 as unknown as string,
    });
    expect(m).toEqual({ [readingId("listen", PASSAGE)]: "2026-08-02" });
  });

  it("值為空串的老檔：條目保留，值換成佔位符（結果裡絕不出現空串）", () => {
    // iOS 早期匯出的 completedReadings 值就是空串（只有鍵有意義）
    const m = normalizeReadingMap({
      [PASSAGE]: "",
      [`${PASSAGE}-followup`]: "   ",
      [`story-${STORY}`]: "",
    });
    expect(m).toEqual({
      [readingId("listen", PASSAGE)]: UNKNOWN_COMPLETION_DATE,
      [readingId("followup", PASSAGE)]: UNKNOWN_COMPLETION_DATE,
      [readingId("story", STORY)]: UNKNOWN_COMPLETION_DATE,
    });
    // 真值口徑與存在性口徑必須得到同一個結論，否則會重複發 XP
    for (const v of Object.values(m)) {
      expect(Boolean(v)).toBe(true);
      expect(v != null).toBe(true);
    }
  });

  it("佔位符冪等：再歸一化一次結果不變", () => {
    const once = normalizeReadingMap({ [PASSAGE]: "" });
    expect(normalizeReadingMap(once)).toEqual(once);
  });

  it("佔位符永遠輸給真實日期（兩個方向都是）", () => {
    const key = readingId("listen", PASSAGE);
    expect(
      normalizeReadingMap({
        [PASSAGE]: UNKNOWN_COMPLETION_DATE,
        [`passage-${PASSAGE}-listen`]: "2026-08-02",
      })[key],
    ).toBe("2026-08-02");
    expect(
      normalizeReadingMap({
        [`passage-${PASSAGE}-listen`]: "2026-08-02",
        [PASSAGE]: UNKNOWN_COMPLETION_DATE,
      })[key],
    ).toBe("2026-08-02");
  });

  it("聽讀 / 跟讀 / 故事互不串鍵", () => {
    const m = normalizeReadingMap({
      [PASSAGE]: "2026-08-02",
      [`${PASSAGE}-followup`]: "2026-08-03",
      [STORY]: "2026-08-04",
    });
    expect(m).toEqual({
      [readingId("listen", PASSAGE)]: "2026-08-02",
      [readingId("followup", PASSAGE)]: "2026-08-03",
      [readingId("story", STORY)]: "2026-08-04",
    });
  });
});
