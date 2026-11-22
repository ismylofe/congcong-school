import type { SubjectId, Book } from "./types";

/**
 * 學科配置 —— 每個學科都有顯示名稱、配色和 Tailwind 類名。
 * 新增學科只需要加一條即可。
 */

export interface SubjectConfig {
  id: SubjectId;
  label: string;
  /** 徽章：邊框 / 背景 / 文字 Tailwind 類 */
  badgeClasses: string;
  /** 主色（用於圖示等強調場景） */
  accent: "primary" | "danger" | "secondary" | "warning";
}

export const SUBJECTS: Record<SubjectId, SubjectConfig> = {
  math: {
    id: "math",
    label: "數學",
    badgeClasses: "border-primary/40 bg-primary/10 text-primary-dark",
    accent: "primary",
  },
  chinese: {
    id: "chinese",
    label: "國語",
    badgeClasses: "border-danger/40 bg-danger/10 text-danger-dark",
    accent: "danger",
  },
  english: {
    id: "english",
    label: "英語",
    badgeClasses: "border-secondary/40 bg-secondary/10 text-secondary-dark",
    accent: "secondary",
  },
  science: {
    id: "science",
    label: "自然",
    badgeClasses: "border-warning/40 bg-warning/10 text-ink",
    accent: "warning",
  },
};

/** 容錯：老資料可能沒有 subject 欄位，預設返回 math */
export function resolveSubject(book: Pick<Book, "subject">): SubjectConfig {
  const id: SubjectId = book.subject ?? "math";
  return SUBJECTS[id] ?? SUBJECTS.math;
}
