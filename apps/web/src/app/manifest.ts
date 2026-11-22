import type { MetadataRoute } from "next";

// output: "export" 下 metadata route 需要顯式宣告為靜態
export const dynamic = "force-static";

/**
 * PWA Web App Manifest（critic-7）
 *
 * 圖示：聰聰熊貓 SVG（maskable + any），路徑見 public/icons/。
 * iOS 主屏圖示由 layout.tsx 的 apple-touch-icon（PNG）負責。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "聰聰學堂 · 國小全科免費學習",
    short_name: "聰聰學堂",
    description: "全科免費、人人都能學的國小 AI 學習平台，和貓熊聰聰一起天天進步",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F7F7F7",
    theme_color: "#58CC02",
    lang: "zh-TW",
    icons: [
      {
        src: "/icons/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
