import type { Metadata, Viewport } from "next";
import { LEARNER_BOOT_SCRIPT } from "@/lib/learnerProfiles";
import { Nunito } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { BottomNav } from "@/components/BottomNav";
import { ToastProvider } from "@/components/Toast";
import { DailyRewardWatcher } from "@/components/DailyRewardWatcher";
import { AchievementWatcher } from "@/components/AchievementWatcher";
import { IntroAudioUnlock } from "@/components/IntroAudioUnlock";
import { LeagueWatcher } from "@/components/LeagueWatcher";

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "聰聰學堂",
  description: "全科免費、人人都能學的國小 AI 學習平台",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "聰聰學堂",
    statusBarStyle: "default",
  },
  icons: {
    icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#58CC02" },
    { media: "(prefers-color-scheme: dark)", color: "#131F24" },
  ],
};

/**
 * 首屏內聯腳本：水合前讀 localStorage，提前把 .theme-dark 掛到 <html>，
 * 防止深色使用者看到一幀白底閃屏。邏輯與 ThemeProvider 保持一致：
 *   裝備暗色美妝主題 強制暗；否則看三態偏好（dark / system+系統深色）。
 * 順帶註冊 Service Worker（殼層預快取 + 課程 JSON/音訊 SWR）。
 */
const bootScript = `
(function () {
  ${LEARNER_BOOT_SCRIPT}
  try {
    var DARK_THEMES = { theme_midnight: "#0F1419", theme_obsidian: "#08090C" };
    var equipped = "";
    try {
      var raw = localStorage.getItem(learnerKey("csf-progress-v1"));
      if (raw) equipped = (JSON.parse(raw).state || {}).equippedTheme || "";
    } catch (e) {}
    var mode = localStorage.getItem(learnerKey("csf-theme-mode"));
    var sysDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    var cosmeticDark = Object.prototype.hasOwnProperty.call(DARK_THEMES, equipped);
    var dark = cosmeticDark || mode === "dark" || (mode !== "light" && sysDark);
    if (dark) {
      var root = document.documentElement;
      root.classList.add("theme-dark");
      root.style.colorScheme = "dark";
      root.style.backgroundColor = cosmeticDark ? DARK_THEMES[equipped] : "#131F24";
    }
  } catch (e) {}
  if ("serviceWorker" in navigator && ${process.env.NODE_ENV === "production"}) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js").catch(function () {});
    });
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW" className={nunito.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      {/* 底部導航的高度補償由 BottomNav 自帶的佔位條負責（web-lesson-15）：
          課程 / 閱讀器等沉浸頁導航隱藏時不再留 64px 死空隙 */}
      <body className="min-h-screen bg-bg">
        <ThemeProvider>
          <ToastProvider>
            <DailyRewardWatcher />
            <AchievementWatcher />
            <LeagueWatcher />
            <IntroAudioUnlock />
            {children}
            <BottomNav />
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
