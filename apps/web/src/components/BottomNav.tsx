"use client";

/**
 * BottomNav —— 移動端底部固定導航欄
 *
 * 5 個真實 tab：學習 / 排行榜 / 錯題本 / 商店 / 我的
 */

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Home as HomeIcon,
  Shield as Trophy,
  Bookmark,
  ShoppingBag,
  User,
  type IconProps,
} from "@/components/LearningIcon";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import { useProgressStore } from "@/store/progress";
import { ALL_COSMETICS } from "@/lib/cosmetics";
import { hasUnseenAchievements } from "@/lib/achievements";
import { isImmersivePath } from "@/lib/immersiveRoutes";
import type { ComponentType } from "react";

interface NavItem {
  href: string;
  label: string;
  Icon: ComponentType<IconProps>;
  /** 命中字首判斷 active */
  matchPrefix: string;
  /** 啟用態主色 */
  activeColor: string;
  /** 啟用態背景 */
  activeBg: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "學習",
    Icon: HomeIcon,
    matchPrefix: "/",
    activeColor: "text-secondary-dark",
    activeBg: "bg-secondary/10",
  },
  {
    href: "/league/",
    label: "排行榜",
    Icon: Trophy,
    matchPrefix: "/league",
    activeColor: "text-secondary-dark",
    activeBg: "bg-secondary/10",
  },
  {
    href: "/review/",
    label: "錯題本",
    Icon: Bookmark,
    matchPrefix: "/review",
    activeColor: "text-secondary-dark",
    activeBg: "bg-secondary/10",
  },
  {
    href: "/shop/",
    label: "商店",
    Icon: ShoppingBag,
    matchPrefix: "/shop",
    activeColor: "text-secondary-dark",
    activeBg: "bg-secondary/10",
  },
  {
    href: "/profile/",
    label: "我的",
    Icon: User,
    matchPrefix: "/profile",
    activeColor: "text-secondary-dark",
    activeBg: "bg-secondary/10",
  },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.matchPrefix === "/") {
    return (
      pathname === "/" ||
      /^\/(grade|book|lesson|stories|reading)\//.test(pathname)
    );
  }
  return pathname.startsWith(item.matchPrefix);
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function BottomNav() {
  const pathname = usePathname() ?? "/";
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const selectedGrade = useProgressStore(s => s.selectedGrade);
  const mistakes = useProgressStore(s => s.mistakesBank);
  const gems = useProgressStore(s => s.gems);
  const ownedCosmetics = useProgressStore(s => s.ownedCosmetics);
  const claimableQuestCount = useProgressStore(s => s.claimableQuestCount);
  // claimableQuestCount 是派生函式（引用恆定），訂閱其依賴欄位驅動徽章實時重新整理
  useProgressStore(
    s =>
      `${s.dailyQuestDate}|${s.lastXpDate}|${s.todayXp}|${s.dailyLessons}|${s.dailyReviews}|${s.dailyReadings}|${Object.keys(s.claimedQuests).length}`,
  );

  // 錯題本徽章：今日可複習的數量
  const today = todayStr();
  const reviewBadge = hydrated
    ? mistakes.filter(m => !m.nextReviewDate || m.nextReviewDate <= today).length
    : 0;

  // 商店徽章：有任何當前 gems 買得起且未擁有的道具就亮紅點
  const shopHasAffordable = hydrated
    ? ALL_COSMETICS.some(c => !ownedCosmetics[c.id] && c.cost > 0 && gems >= c.cost)
    : false;

  // 個人中心徽章：可領取的每日任務（計數優先），其次未讀成就紅點
  const claimableQuests = hydrated ? claimableQuestCount() : 0;
  const profileHasUnseen = hydrated && hasUnseenAchievements();

  // 沉浸式路徑（課程 / 跳級 / 複習 runner / 閱讀器）隱藏底部導航，
  // 否則固定底欄會蓋住這些頁面底部的「檢查 / 繼續」按鈕。
  if (!hydrated || (pathname === "/" && selectedGrade == null) || isImmersivePath(pathname)) return null;

  const navItems = NAV_ITEMS;

  function getBadge(item: NavItem): { count?: number; dot?: boolean } | null {
    if (item.matchPrefix === "/review" && reviewBadge > 0) return { count: reviewBadge };
    if (item.matchPrefix === "/shop" && shopHasAffordable) return { dot: true };
    if (item.matchPrefix === "/profile") {
      if (claimableQuests > 0) return { count: claimableQuests };
      if (profileHasUnseen) return { dot: true };
    }
    return null;
  }

  return (
    <>
    {/* 佔位條：把頁面內容頂出固定導航的高度（含安全區），
        代替舊版全域 body pb-16 —— 導航隱藏時佔位也隨之消失 */}
    <div
      aria-hidden="true"
      className="md:hidden"
      style={{ height: "calc(4.25rem + max(env(safe-area-inset-bottom), 0px))" }}
    />
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t-2 border-bg-softer"
      style={{
        paddingBottom: "max(env(safe-area-inset-bottom), 0px)",
      }}
      aria-label="主導航"
    >
      <div className="grid grid-cols-5 max-w-md mx-auto h-[68px]">
        {navItems.map(item => {
          const active = isActive(pathname, item);
          const Icon = item.Icon;
          const badge = getBadge(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => {
                playSfx("tap");
                haptic("light");
              }}
              className="flex flex-col items-center justify-center gap-1 select-none relative"
              aria-label={
                badge?.count
                  ? `${item.label}（${badge.count} 項待辦）`
                  : badge?.dot
                    ? `${item.label}（有新內容）`
                    : item.label
              }
              aria-current={active ? "page" : undefined}
            >
              <div
                className={`relative flex items-center justify-center w-12 h-9 rounded-xl border-2 transition-colors ${
                  active ? `${item.activeBg} border-secondary/50` : "border-transparent"
                }`}
              >
                <Icon
                  className={`w-8 h-8 ${
                    active ? item.activeColor : "text-ink-softer"
                  }`}
                />
                {badge?.count && badge.count > 0 ? (
                  <span
                    className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-danger text-white text-[9px] font-extrabold inline-flex items-center justify-center border-2 border-white tabular-nums"
                    aria-hidden="true"
                  >
                    {badge.count > 99 ? "99+" : badge.count}
                  </span>
                ) : badge?.dot ? (
                  <span
                    className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-danger border-2 border-white"
                    aria-hidden="true"
                  />
                ) : null}
              </div>
              <span
                className={`text-xs font-bold leading-none ${
                  active ? item.activeColor : "text-ink-softer"
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
    </>
  );
}
