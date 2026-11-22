"use client";

import { useEffect, useState } from "react";
import type { SiteIndex } from "@/types";

/**
 * 目前網站上架的教材 id（來自 public/data/index.json）。
 *
 * localStorage 裡可能還留著舊版（原專案）教材的 activeBookId、進行中的課程或錯題；
 * 那些教材已不再建置，連過去會是 404。凡是要依舊資料產生連結或出題的地方，
 * 先用這份清單確認教材還在。
 */
let cache: Promise<Set<string>> | null = null;

export function loadPublishedBookIds(): Promise<Set<string>> {
  cache ??= fetch("/data/index.json", { cache: "no-store" })
    .then(response => {
      if (!response.ok) throw new Error(`index.json unavailable: ${response.status}`);
      return response.json() as Promise<SiteIndex>;
    })
    .then(index => new Set(index.books.map(book => book.id)))
    .catch(error => {
      cache = null; // 下次再試，不要把一次失敗快取起來
      throw error;
    });
  return cache;
}

/** 載入中或載入失敗時回傳 null；呼叫端在 null 時應保守處理（例如先不顯示連結）。 */
export function usePublishedBookIds(): Set<string> | null {
  const [ids, setIds] = useState<Set<string> | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadPublishedBookIds().then(
      set => { if (!cancelled) setIds(set); },
      () => { /* 讀不到清單時維持 null */ },
    );
    return () => { cancelled = true; };
  }, []);
  return ids;
}

/** 從課程 id（`{bookId}-u{N}-kp{M}` 或 `{bookId}-u{N}-exam`）取出教材 id。 */
export function lessonBookId(lessonId: string): string | null {
  return /^(.+?)-u\d+-(?:kp\d+|exam)$/.exec(lessonId)?.[1] ?? null;
}
