import { promises as fs } from "fs";
import path from "path";
import type { SiteIndex } from "@/types";

/**
 * 「數一數」示範單元掛在原專案一年級數學（g1up）上。
 * 預設只上架台灣版教材時 g1up 不存在，頁面改顯示「即將推出」。（僅供伺服器端／建置時使用）
 */
export const NUMBER_SENSE_BOOK_ID = "g1up";

export async function isNumberSensePublished(): Promise<boolean> {
  try {
    const p = path.join(process.cwd(), "public", "data", "index.json");
    const index: SiteIndex = JSON.parse(await fs.readFile(p, "utf-8"));
    return index.books.some(book => book.id === NUMBER_SENSE_BOOK_ID);
  } catch {
    return false;
  }
}
