"use client";

/**
 * keyboard.ts —— 題目元件共享的鍵盤快捷鍵守衛。
 *
 * 全域 keydown 快捷鍵必須避開：
 *   - IME 輸入中（isComposing）
 *   - 帶修飾鍵的組合鍵（Cmd/Ctrl/Alt，留給瀏覽器）
 *   - 焦點在 input / textarea / contenteditable 時（使用者在打字）
 */
export function shouldIgnoreKey(e: KeyboardEvent): boolean {
  if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return true;
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  if (t.closest?.('[role="dialog"][aria-modal="true"]')) return true;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || t.isContentEditable;
}

/** 焦點是否在按鈕上（Enter/空格交給按鈕原生 click，避免雙觸發） */
export function isButtonTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "BUTTON" || t.tagName === "A");
}
