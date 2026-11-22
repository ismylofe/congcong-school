/**
 * immersiveRoutes.ts —— 「沉浸式路由」的單一事實源
 *
 * 沉浸頁 = 使用者正在專注答題 / 閱讀的整屏頁面。這些頁面：
 *   - 不顯示底部固定導航（BottomNav），否則會蓋住底部的「檢查 / 繼續」按鈕；
 *   - 不彈全屏結算 Modal（LeagueWatcher / DailyRewardWatcher 等全域看門人），
 *     否則會把使用者從答題流裡硬生生打斷。
 *
 * ⚠️ 新增任何整屏答題 / 閱讀路由，只需在下面這一張表裡加一行；
 *    **不要**再在元件裡各寫一份字首陣列——歷史上正是因為三個元件各抄一遍，
 *    /jump/ 與 /review/runner/ 被漏掉，底欄蓋住了「檢查」按鈕。
 */

/** 沉浸式路徑的匹配規則（對 usePathname() 的返回值求值）。 */
export const IMMERSIVE_PATTERNS: readonly RegExp[] = [
  /** Delayed number-sense verification has its own answer controls. */
  /^\/number-sense\/review(\/|$)/,
  /** 單元知識手冊是獨立閱讀流，不讓固定主導航遮擋分頁操作。 */
  /^\/book\/[^/]+\/guide(\/|$)/,
  /** 課程答題 /lesson/{book}/{lesson}/ */
  /^\/lesson(\/|$)/,
  /** 跳級測試 /jump/ */
  /^\/jump(\/|$)/,
  /** 錯題複習 runner /review/runner/（注意：錯題本列表 /review/ 仍保留導航） */
  /^\/review\/runner(\/|$)/,
  /** 課文閱讀器 /reading/{book}/{passage}/（列表頁 /reading/{book}/ 保留導航） */
  /^\/reading\/[^/]+\/[^/]+/,
  /** 故事閱讀器 /stories/{book}/{story}/（列表頁 /stories/{book}/ 保留導航） */
  /^\/stories\/[^/]+\/[^/]+/,
];

/** 該路徑是否是沉浸式頁面（答題 / 閱讀器）。 */
export function isImmersivePath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return IMMERSIVE_PATTERNS.some(re => re.test(pathname));
}
