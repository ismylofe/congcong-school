"use client";

/**
 * SubjectBadge — 學科徽章
 *
 * 顯示學科名（數學 / 語文 / 英語...）的彩色膠囊，
 * 根據學科配置自動選取顏色。
 */

import type { Book } from "@/types";
import { resolveSubject } from "@/lib/subjects";

interface SubjectBadgeProps {
  book: Pick<Book, "subject">;
  size?: "sm" | "md";
  className?: string;
}

export function SubjectBadge({ book, size = "sm", className }: SubjectBadgeProps) {
  const subject = resolveSubject(book);
  const sizeClass =
    size === "md"
      ? "h-7 px-3 text-sm"
      : "h-5 px-1.5 text-[11px] leading-none";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border-2 font-extrabold tracking-tight ${sizeClass} ${subject.badgeClasses} ${className ?? ""}`}
    >
      {subject.label}
    </span>
  );
}
