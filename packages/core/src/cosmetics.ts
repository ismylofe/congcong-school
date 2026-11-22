/**
 * cosmetics.ts —— 美妝道具目錄（吉祥物皮膚 + UI 主題 + 課程背景）
 *
 * 設計原則（公益專案特別約束）：
 *   - 所有皮膚都能透過遊戲內 gems 解鎖
 *   - 沒有"premium 限定"或"充值專屬"
 *   - 不影響遊戲數值，**純美學**
 *   - 每個 cosmetic 都能在前端零依賴渲染（SVG / CSS / 內建圖示），不依賴外部素材
 *
 * 三種品類：
 *   1. mascot_skin   —— 吉祥物皮膚（帽子/眼鏡/披風等裝扮疊加）
 *   2. ui_theme      —— UI 主題色（影響 primary 色、按鈕色等 CSS 變數）
 *   3. lesson_backdrop —— 課程頁背景圖案（學習時的氛圍）
 */

export type CosmeticType = "mascot_skin" | "ui_theme" | "lesson_backdrop";

export type CosmeticRarity = "common" | "rare" | "epic" | "legendary";

export interface CosmeticItem {
  id: string;
  type: CosmeticType;
  /** 中文名 */
  name: string;
  /** 一句話描述 */
  description: string;
  /** 價格（gems），免費物品填 0 */
  cost: number;
  rarity: CosmeticRarity;
  /** 是否新手預設擁有 */
  starter?: boolean;
}

// ============================================================
// Mascot 皮膚（疊加 SVG 裝飾，由 MascotSkinOverlay 渲染）
// ============================================================

export const MASCOT_SKINS: CosmeticItem[] = [
  {
    id: "skin_default",
    type: "mascot_skin",
    name: "原版聰聰",
    description: "我們最熟悉的貓熊聰聰",
    cost: 0,
    rarity: "common",
    starter: true,
  },
  {
    id: "skin_graduate",
    type: "mascot_skin",
    name: "學士帽",
    description: "戴上學士帽的聰聰，學者氣質滿分",
    cost: 80,
    rarity: "common",
  },
  {
    id: "skin_glasses",
    type: "mascot_skin",
    name: "圓框眼鏡",
    description: "復古圓框眼鏡，文藝青年聰聰",
    cost: 100,
    rarity: "common",
  },
  {
    id: "skin_party",
    type: "mascot_skin",
    name: "派對錐帽",
    description: "彩虹色派對帽，每天都是節日",
    cost: 150,
    rarity: "rare",
  },
  {
    id: "skin_crown",
    type: "mascot_skin",
    name: "金色皇冠",
    description: "學習路上的小國王/小女王",
    cost: 250,
    rarity: "rare",
  },
  {
    id: "skin_wizard",
    type: "mascot_skin",
    name: "法師尖帽",
    description: "知識就是魔法",
    cost: 300,
    rarity: "epic",
  },
  {
    id: "skin_astronaut",
    type: "mascot_skin",
    name: "太空人頭盔",
    description: "向知識的宇宙出發！",
    cost: 500,
    rarity: "legendary",
  },
  {
    id: "skin_sunglasses",
    type: "mascot_skin",
    name: "酷炫墨鏡",
    description: "酷到不行的墨鏡聰聰",
    cost: 120,
    rarity: "common",
  },
  {
    id: "skin_pirate",
    type: "mascot_skin",
    name: "海盜船長",
    description: "揚帆出海尋知識寶藏",
    cost: 220,
    rarity: "rare",
  },
  {
    id: "skin_headphones",
    type: "mascot_skin",
    name: "DJ 耳機",
    description: "戴上耳機就能聽見學習節奏",
    cost: 180,
    rarity: "rare",
  },
  {
    id: "skin_laurel",
    type: "mascot_skin",
    name: "桂冠加身",
    description: "勝利者才能戴的金色桂冠",
    cost: 280,
    rarity: "epic",
  },
  {
    id: "skin_bowtie",
    type: "mascot_skin",
    name: "紳士領結",
    description: "戴上領結就是優雅的小學者",
    cost: 60,
    rarity: "common",
  },
];

// ============================================================
// UI 主題（CSS 變數）
// ============================================================

export interface UiThemeData {
  /** 主色（按鈕、強調） */
  primary: string;
  primaryDark: string;
  /** 次要強調色 */
  accent: string;
  /** 頁面背景 */
  bg: string;
  /** 是否暗色主題（dark mode）。開啟時整套灰階 token 反轉 */
  isDark?: boolean;
  /** 卡片背景（暗色主題必填，亮色可預設） */
  cardBg?: string;
  /** 卡片邊框/分隔色 */
  borderSoft?: string;
  /** 主文字色 */
  ink?: string;
  /** 次要文字色 */
  inkLight?: string;
  /** 更弱的文字/icon */
  inkSofter?: string;
  /** 兜底深灰 */
  bgSoft?: string;
  bgSofter?: string;
}

export interface UiTheme extends CosmeticItem {
  type: "ui_theme";
  data: UiThemeData;
}

export const UI_THEMES: UiTheme[] = [
  {
    id: "theme_default",
    type: "ui_theme",
    name: "Duolingo 綠",
    description: "經典清爽的草地綠",
    cost: 0,
    rarity: "common",
    starter: true,
    data: {
      primary: "#58CC02",
      primaryDark: "#58A700",
      accent: "#1CB0F6",
      bg: "#F7F7F7",
    },
  },
  {
    id: "theme_ocean",
    type: "ui_theme",
    name: "海洋藍",
    description: "像在大海裡學習",
    cost: 200,
    rarity: "common",
    data: {
      primary: "#1CB0F6",
      primaryDark: "#1899D6",
      accent: "#58CC02",
      bg: "#EFF8FE",
    },
  },
  {
    id: "theme_sakura",
    type: "ui_theme",
    name: "櫻花粉",
    description: "粉嫩可愛的春天",
    cost: 200,
    rarity: "common",
    data: {
      primary: "#FF7AB6",
      primaryDark: "#E5588E",
      accent: "#FFC800",
      bg: "#FDF3F8",
    },
  },
  {
    id: "theme_sunshine",
    type: "ui_theme",
    name: "陽光黃",
    description: "充滿活力的金色",
    cost: 250,
    rarity: "rare",
    data: {
      primary: "#FFB200",
      primaryDark: "#E59800",
      accent: "#FF6B6B",
      bg: "#FFF9E8",
    },
  },
  {
    id: "theme_galaxy",
    type: "ui_theme",
    name: "星空紫",
    description: "深邃神秘的宇宙紫",
    cost: 400,
    rarity: "epic",
    data: {
      primary: "#A855F7",
      primaryDark: "#7C3AED",
      accent: "#FFC800",
      bg: "#F5EEFF",
    },
  },
  {
    id: "theme_mint",
    type: "ui_theme",
    name: "薄荷青",
    description: "清新提神的薄荷青綠",
    cost: 220,
    rarity: "common",
    data: {
      primary: "#10B981",
      primaryDark: "#059669",
      accent: "#FBBF24",
      bg: "#ECFDF5",
    },
  },
  {
    id: "theme_coral",
    type: "ui_theme",
    name: "珊瑚紅",
    description: "溫暖熱情的活力珊瑚",
    cost: 300,
    rarity: "rare",
    data: {
      primary: "#FF6B6B",
      primaryDark: "#E5484D",
      accent: "#1CB0F6",
      bg: "#FFF4F4",
    },
  },
  {
    id: "theme_aurora",
    type: "ui_theme",
    name: "極光",
    description: "夢幻的北極極光藍綠",
    cost: 500,
    rarity: "legendary",
    data: {
      primary: "#22D3EE",
      primaryDark: "#0891B2",
      accent: "#A855F7",
      bg: "#ECFEFF",
    },
  },
  // ===== Dark themes =====
  {
    id: "theme_midnight",
    type: "ui_theme",
    name: "暗夜模式",
    description: "護眼的深色介面，傍晚學習不刺眼",
    cost: 350,
    rarity: "epic",
    data: {
      primary: "#58CC02",
      primaryDark: "#3B9A00",
      accent: "#1CB0F6",
      bg: "#0F1419",
      isDark: true,
      cardBg: "#1B2230",
      borderSoft: "#2A3343",
      ink: "#F1F5F9",
      inkLight: "#CBD5E1",
      inkSofter: "#94A3B8",
      bgSoft: "#0F1419",
      bgSofter: "#1B2230",
    },
  },
  {
    id: "theme_obsidian",
    type: "ui_theme",
    name: "曜石黑",
    description: "極簡純黑配霓虹藍，酷炫十足",
    cost: 480,
    rarity: "legendary",
    data: {
      primary: "#1CB0F6",
      primaryDark: "#0E7FB8",
      accent: "#A855F7",
      bg: "#08090C",
      isDark: true,
      cardBg: "#13151B",
      borderSoft: "#1F2330",
      ink: "#F8FAFC",
      inkLight: "#CBD5E1",
      inkSofter: "#94A3B8",
      bgSoft: "#08090C",
      bgSofter: "#13151B",
    },
  },
];

// ============================================================
// 課程背景（lesson backdrop）—— 答題時的頁面氛圍
// ============================================================

export interface BackdropData {
  /** 背景漸變 / 圖案 CSS */
  background: string;
  /** 是否需要頂層半透明白罩防止背景吃掉文字 */
  needsOverlay?: boolean;
}

export interface LessonBackdrop extends CosmeticItem {
  type: "lesson_backdrop";
  data: BackdropData;
}

export const LESSON_BACKDROPS: LessonBackdrop[] = [
  {
    id: "backdrop_default",
    type: "lesson_backdrop",
    name: "乾淨簡潔",
    description: "預設的純淨背景",
    cost: 0,
    rarity: "common",
    starter: true,
    data: { background: "#F7F7F7" },
  },
  {
    id: "backdrop_clouds",
    type: "lesson_backdrop",
    name: "藍天白雲",
    description: "在雲朵裡學習",
    cost: 120,
    rarity: "common",
    data: {
      background:
        "linear-gradient(180deg, #BFE3F7 0%, #E6F3FB 50%, #FFFFFF 100%)",
    },
  },
  {
    id: "backdrop_forest",
    type: "lesson_backdrop",
    name: "森林晨光",
    description: "清晨的森林透著陽光",
    cost: 150,
    rarity: "common",
    data: {
      background:
        "linear-gradient(180deg, #D7F0CF 0%, #EDF8E5 60%, #FFFFFF 100%)",
    },
  },
  {
    id: "backdrop_sunset",
    type: "lesson_backdrop",
    name: "黃昏彩霞",
    description: "傍晚的天空是橘粉色",
    cost: 200,
    rarity: "rare",
    data: {
      background:
        "linear-gradient(180deg, #FFD7B3 0%, #FFE9D6 50%, #FFFFFF 100%)",
    },
  },
  {
    id: "backdrop_starfield",
    type: "lesson_backdrop",
    name: "星空夜",
    description: "深邃的紫色星空",
    cost: 350,
    rarity: "epic",
    data: {
      background:
        "radial-gradient(ellipse at top, #2A1B5C 0%, #1A0F3D 60%, #0F0822 100%)",
      needsOverlay: true,
    },
  },
  {
    id: "backdrop_sakura",
    type: "lesson_backdrop",
    name: "櫻花飄落",
    description: "粉色花瓣的春日",
    cost: 220,
    rarity: "rare",
    data: {
      background:
        "linear-gradient(180deg, #FFE0EC 0%, #FFF0F6 50%, #FFFFFF 100%)",
    },
  },
  {
    id: "backdrop_ocean",
    type: "lesson_backdrop",
    name: "深海漫遊",
    description: "在海底世界學習",
    cost: 280,
    rarity: "rare",
    data: {
      background:
        "linear-gradient(180deg, #93C5FD 0%, #BFDBFE 50%, #DBEAFE 100%)",
    },
  },
  {
    id: "backdrop_aurora",
    type: "lesson_backdrop",
    name: "極光夜",
    description: "極地夜空的彩色光帶",
    cost: 480,
    rarity: "legendary",
    data: {
      background:
        "linear-gradient(180deg, #064E3B 0%, #047857 30%, #0E7490 60%, #312E81 100%)",
      needsOverlay: true,
    },
  },
];

// ============================================================
// 全部目錄 + 查詢函式
// ============================================================

export const ALL_COSMETICS: CosmeticItem[] = [
  ...MASCOT_SKINS,
  ...UI_THEMES,
  ...LESSON_BACKDROPS,
];

export function getCosmeticById(id: string): CosmeticItem | undefined {
  return ALL_COSMETICS.find(c => c.id === id);
}

export function getCosmeticsByType(type: CosmeticType): CosmeticItem[] {
  return ALL_COSMETICS.filter(c => c.type === type);
}

export function getStarterCosmetics(): CosmeticItem[] {
  return ALL_COSMETICS.filter(c => c.starter);
}

/**
 * 預設裝備（首次啟動 / migrate 兜底用）
 */
export const DEFAULT_EQUIPPED = {
  mascotSkin: "skin_default",
  uiTheme: "theme_default",
  lessonBackdrop: "backdrop_default",
} as const;

export const RARITY_COLORS: Record<CosmeticRarity, string> = {
  common: "#9CA3AF",
  rare: "#1CB0F6",
  epic: "#A855F7",
  legendary: "#FFC800",
};

export const RARITY_LABELS: Record<CosmeticRarity, string> = {
  common: "普通",
  rare: "稀有",
  epic: "史詩",
  legendary: "傳說",
};
