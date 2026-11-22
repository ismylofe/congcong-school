import { ArrowLeft } from "@/components/icons";
import { SoundLink } from "@/components/SoundLink";
import { cn } from "@/lib/cn";

/**
 * InnerHeader — 統一內頁頂欄
 *
 * 用於所有二級頁面（課文列表、故事列表、閱讀器、答題等），
 * 確保返回按鈕、標題、副標題、右側插槽風格一致。
 *
 * 結構：  ← 返回  |  標題 + [badge]  |  右側插槽
 *                  |  副標題          |
 *
 * flatOnDesktop：列表頁入 AppShell 殼後傳 true —— lg+ 退化為中央列內的
 * 普通標題行（去白底/邊框/sticky/返回鍵，標題放大）；閱讀器等沉浸頁
 * 不傳，保持原全寬 sticky 頂欄。
 */

interface InnerHeaderProps {
  backHref: string;
  title: string;
  subtitle?: string;
  /** 標題旁的小徽章 */
  badge?: React.ReactNode;
  /** 右側插槽（進度、按鈕等） */
  right?: React.ReactNode;
  /** 頂欄下方附加內容（進度條等） */
  bottom?: React.ReactNode;
  /** lg+ 退化為中央列內標題行（AppShell 殼內的列表頁用） */
  flatOnDesktop?: boolean;
}

export function InnerHeader({
  backHref,
  title,
  subtitle,
  badge,
  right,
  bottom,
  flatOnDesktop = false,
}: InnerHeaderProps) {
  return (
    <div
      className={cn(
        "bg-white border-b border-bg-softer sticky top-0 z-10",
        flatOnDesktop && "lg:static lg:bg-transparent lg:border-0",
      )}
    >
      <div
        className={cn(
          "max-w-md lg:max-w-6xl mx-auto flex items-center gap-3 px-4 py-2.5",
          flatOnDesktop && "lg:max-w-none lg:px-0 lg:py-3",
        )}
      >
        <SoundLink
          href={backHref}
          aria-label="返回"
          className={cn(
            "ui-icon-button text-ink-light hover:text-primary hover:bg-bg-soft transition-colors shrink-0",
            flatOnDesktop && "lg:hidden",
          )}
        >
          <ArrowLeft className="w-5 h-5" />
        </SoundLink>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-1.5 leading-snug">
            {badge}
            <h1
              className={cn(
                "text-base lg:text-lg font-extrabold text-ink break-words min-w-0",
                flatOnDesktop && "lg:text-2xl",
              )}
            >
              {title}
            </h1>
          </div>
          {subtitle && (
            <div
              className={cn(
                "text-sm text-ink-light mt-1 leading-relaxed",
                flatOnDesktop && "lg:text-sm lg:mt-1.5",
              )}
            >
              {subtitle}
            </div>
          )}
        </div>
        {right ? (
          <div className="shrink-0">{right}</div>
        ) : (
          null
        )}
      </div>
      {bottom}
    </div>
  );
}
