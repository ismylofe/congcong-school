import { Suspense } from "react";
import { JumpClient } from "./JumpClient";

/**
 * ⚡ 跳級測試（jump ahead，E2）
 *
 * 輕路由：/jump/?book={bookId}&unit={unitNumber}
 * 靜態匯出下用 useSearchParams 讀取參數（Suspense 包裹）。
 */
export default function JumpPage() {
  return (
    <Suspense fallback={null}>
      <JumpClient />
    </Suspense>
  );
}
