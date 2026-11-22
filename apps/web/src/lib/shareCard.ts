"use client";

/**
 * shareCard.ts —— 分享卡純本地渲染（E2）
 *
 * 兩款版式（canvas 繪製，零網路依賴）：
 *   1. 連勝卡  renderStreakCard：品牌綠底 + 聰聰簡筆 + 大火焰數字
 *      + 本週 7 格日曆 + slogan
 *   2. 徽章卡  renderBadgeCard：星星/獎盃徽章 + 課程名或成就名
 *      （結算三星幕、成就領取時刻共用）
 *
 * 分發：shareCardBlob 優先 navigator.share（移動端系統分享面板），
 * 不支援時降級為下載 PNG。全程不上傳任何伺服器。
 */

// 品牌色（與 tailwind 設計 token 同源的 Duolingo 派生色板）
const BRAND_GREEN = "#58CC02";
const BRAND_GREEN_DARK = "#46A302";
const FLAME_ORANGE = "#FF9600";
const GOLD = "#FFC800";
const EEL = "#4B4B4B";

export const SHARE_SLOGAN = "聰聰學堂 · 和聰聰一起天天進步";

/** 連勝卡的一格（週一到週日） */
export interface ShareWeekCell {
  /** "一"…"日" */
  label: string;
  /** 當天有學習記錄 */
  active: boolean;
  isToday: boolean;
}

export interface StreakCardInput {
  streak: number;
  week: ShareWeekCell[];
}

export interface BadgeCardInput {
  /** 頂部小標題，如「三星通關」「成就解鎖」 */
  heading: string;
  /** 主標題：課程名 / 成就名 */
  title: string;
  /** 副標題（可選）：成就描述、教材名等 */
  subtitle?: string;
  /** 三星卡傳 3；不傳則畫獎盃徽章 */
  stars?: number;
}

const W = 1000;
const H = 1250;

function makeCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  return { canvas, ctx };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const FONT = `-apple-system, "PingFang TC", "Microsoft JhengHei", "Noto Sans TC", sans-serif`;

/** 品牌綠漸變底 + 頂部裝飾泡泡 */
function paintBrandBackground(ctx: CanvasRenderingContext2D) {
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, BRAND_GREEN);
  grad.addColorStop(1, BRAND_GREEN_DARK);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // 半透明裝飾圓
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  for (const [cx, cy, r] of [
    [120, 140, 130],
    [900, 90, 90],
    [960, 1120, 150],
    [60, 1180, 100],
  ] as const) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** 聰聰簡筆（熊貓）：白團子 + 黑耳黑眼圈 + 小黑鼻（幾何對齊 Mascot.tsx） */
function paintPanda(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  const s = size / 100; // 以 100 為基準的比例
  const black = "#2E2E2E";
  const white = "#FBFBFB";
  ctx.save();
  ctx.translate(cx, cy);

  // 耳朵
  ctx.fillStyle = black;
  ctx.beginPath();
  ctx.arc(-24 * s, -34 * s, 13 * s, 0, Math.PI * 2);
  ctx.arc(24 * s, -34 * s, 13 * s, 0, Math.PI * 2);
  ctx.fill();
  // 頭（白團子）
  ctx.fillStyle = white;
  ctx.beginPath();
  ctx.ellipse(0, 0, 40 * s, 37 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  // 黑眼圈
  ctx.fillStyle = black;
  ctx.beginPath();
  ctx.ellipse(-16 * s, -2 * s, 12 * s, 15 * s, -0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(16 * s, -2 * s, 12 * s, 15 * s, 0.15, 0, Math.PI * 2);
  ctx.fill();
  // 白眼窩
  ctx.fillStyle = white;
  ctx.beginPath();
  ctx.arc(-15 * s, -4 * s, 8.5 * s, 0, Math.PI * 2);
  ctx.arc(15 * s, -4 * s, 8.5 * s, 0, Math.PI * 2);
  ctx.fill();
  // 眼珠
  ctx.fillStyle = "#3A3A3A";
  ctx.beginPath();
  ctx.arc(-15 * s, -4 * s, 5 * s, 0, Math.PI * 2);
  ctx.arc(15 * s, -4 * s, 5 * s, 0, Math.PI * 2);
  ctx.fill();
  // 高光
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.arc(-13.5 * s, -5.5 * s, 1.6 * s, 0, Math.PI * 2);
  ctx.arc(16.5 * s, -5.5 * s, 1.6 * s, 0, Math.PI * 2);
  ctx.fill();
  // 鼻子
  ctx.fillStyle = black;
  ctx.beginPath();
  ctx.ellipse(0, 12 * s, 6 * s, 4.5 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  // 嘴（微笑兩瓣）
  ctx.strokeStyle = black;
  ctx.lineWidth = 2 * s;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, 16 * s);
  ctx.lineTo(0, 20 * s);
  ctx.quadraticCurveTo(4 * s, 24 * s, 8 * s, 22 * s);
  ctx.moveTo(0, 20 * s);
  ctx.quadraticCurveTo(-4 * s, 24 * s, -8 * s, 22 * s);
  ctx.stroke();

  ctx.restore();
}

/** 大火焰（連勝卡主視覺） */
function paintFlame(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  const s = size / 100;
  ctx.save();
  ctx.translate(cx, cy);
  // 外焰
  ctx.fillStyle = FLAME_ORANGE;
  ctx.beginPath();
  ctx.moveTo(0, -58 * s);
  ctx.bezierCurveTo(30 * s, -28 * s, 44 * s, -6 * s, 44 * s, 16 * s);
  ctx.bezierCurveTo(44 * s, 44 * s, 24 * s, 60 * s, 0, 60 * s);
  ctx.bezierCurveTo(-24 * s, 60 * s, -44 * s, 44 * s, -44 * s, 16 * s);
  ctx.bezierCurveTo(-44 * s, -8 * s, -26 * s, -30 * s, 0, -58 * s);
  ctx.closePath();
  ctx.fill();
  // 內焰
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.moveTo(0, -14 * s);
  ctx.bezierCurveTo(16 * s, 4 * s, 24 * s, 16 * s, 24 * s, 30 * s);
  ctx.bezierCurveTo(24 * s, 46 * s, 13 * s, 56 * s, 0, 56 * s);
  ctx.bezierCurveTo(-13 * s, 56 * s, -24 * s, 46 * s, -24 * s, 30 * s);
  ctx.bezierCurveTo(-24 * s, 18 * s, -14 * s, 4 * s, 0, -14 * s);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** 五角星（三星卡） */
function paintStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const outer = (i * 2 * Math.PI) / 5 - Math.PI / 2;
    const inner = outer + Math.PI / 5;
    const ox = Math.cos(outer) * r;
    const oy = Math.sin(outer) * r;
    const ix = Math.cos(inner) * r * 0.45;
    const iy = Math.sin(inner) * r * 0.45;
    if (i === 0) ctx.moveTo(ox, oy);
    else ctx.lineTo(ox, oy);
    ctx.lineTo(ix, iy);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** 獎盃（成就卡） */
function paintTrophy(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  const s = size / 100;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = GOLD;
  // 杯身
  ctx.beginPath();
  ctx.moveTo(-34 * s, -50 * s);
  ctx.lineTo(34 * s, -50 * s);
  ctx.bezierCurveTo(34 * s, -8 * s, 18 * s, 12 * s, 0, 12 * s);
  ctx.bezierCurveTo(-18 * s, 12 * s, -34 * s, -8 * s, -34 * s, -50 * s);
  ctx.closePath();
  ctx.fill();
  // 雙耳
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 9 * s;
  ctx.beginPath();
  ctx.arc(-38 * s, -32 * s, 14 * s, Math.PI * 0.4, Math.PI * 1.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(38 * s, -32 * s, 14 * s, Math.PI * 1.5, Math.PI * 2.6);
  ctx.stroke();
  // 杯柄 + 底座
  ctx.fillRect(-6 * s, 12 * s, 12 * s, 16 * s);
  roundRect(ctx, -26 * s, 28 * s, 52 * s, 14 * s, 5 * s);
  ctx.fill();
  // 星星點綴
  paintStar(ctx, 0, -26 * s, 13 * s, "#FFFFFF");
  ctx.restore();
}

/** 底部 slogan + 品牌落款 */
function paintFooter(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = `800 34px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(SHARE_SLOGAN, W / 2, H - 72);
}

/** 文字超寬截斷（加 …） */
function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) {
    t = t.slice(0, -1);
  }
  return `${t}…`;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
  });
}

// ============================================================
// 版式 1：連勝卡
// ============================================================

export async function renderStreakCard(input: StreakCardInput): Promise<Blob> {
  const { canvas, ctx } = makeCanvas();
  paintBrandBackground(ctx);

  // 聰聰
  paintPanda(ctx, W / 2, 240, 200);

  // 大火焰 + 連勝數字
  paintFlame(ctx, W / 2, 560, 260);
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  ctx.font = `900 150px ${FONT}`;
  ctx.fillText(String(input.streak), W / 2, 660);

  ctx.font = `800 56px ${FONT}`;
  ctx.fillText("天連續學習！", W / 2, 780);

  // 本週 7 格日曆卡
  const cardX = 90;
  const cardY = 850;
  const cardW = W - 180;
  const cardH = 200;
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  roundRect(ctx, cardX, cardY, cardW, cardH, 32);
  ctx.fill();

  const cell = cardW / 7;
  input.week.slice(0, 7).forEach((d, i) => {
    const cx = cardX + cell * i + cell / 2;
    // 星期標籤
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = `800 30px ${FONT}`;
    ctx.fillText(d.label, cx, cardY + 58);
    // 圓點
    const cy = cardY + 128;
    const r = 32;
    if (d.isToday) {
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 10, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = d.active ? GOLD : "rgba(255,255,255,0.28)";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    if (d.active) paintFlame(ctx, cx, cy, 44);
  });

  paintFooter(ctx);
  return canvasToBlob(canvas);
}

// ============================================================
// 版式 2：徽章卡（三星通關 / 成就）
// ============================================================

export async function renderBadgeCard(input: BadgeCardInput): Promise<Blob> {
  const { canvas, ctx } = makeCanvas();
  paintBrandBackground(ctx);

  // 聰聰
  paintPanda(ctx, W / 2, 230, 190);

  // 頂部小標題膠囊
  ctx.font = `800 40px ${FONT}`;
  ctx.textAlign = "center";
  const headingW = ctx.measureText(input.heading).width + 96;
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  roundRect(ctx, (W - headingW) / 2, 380, headingW, 84, 42);
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(input.heading, W / 2, 437);

  // 徽章主體
  if (input.stars && input.stars > 0) {
    // 三星排布：中間高兩側低
    const n = Math.min(3, input.stars);
    const positions =
      n === 3
        ? [
            [W / 2 - 190, 640, 92],
            [W / 2, 590, 120],
            [W / 2 + 190, 640, 92],
          ]
        : n === 2
          ? [
              [W / 2 - 110, 620, 100],
              [W / 2 + 110, 620, 100],
            ]
          : [[W / 2, 620, 120]];
    for (const [sx, sy, sr] of positions) {
      ctx.save();
      ctx.shadowColor = "rgba(255,200,0,0.55)";
      ctx.shadowBlur = 50;
      paintStar(ctx, sx, sy, sr, GOLD);
      ctx.restore();
    }
  } else {
    ctx.save();
    ctx.shadowColor = "rgba(255,200,0,0.5)";
    ctx.shadowBlur = 50;
    paintTrophy(ctx, W / 2, 640, 260);
    ctx.restore();
  }

  // 主標題（課程名 / 成就名）
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `900 64px ${FONT}`;
  ctx.fillText(ellipsize(ctx, input.title, W - 160), W / 2, 880);

  // 副標題
  if (input.subtitle) {
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.font = `700 40px ${FONT}`;
    ctx.fillText(ellipsize(ctx, input.subtitle, W - 200), W / 2, 950);
  }

  paintFooter(ctx);
  return canvasToBlob(canvas);
}

// ============================================================
// 分發：navigator.share → 降級下載 PNG
// ============================================================

export type ShareOutcome = "shared" | "downloaded" | "cancelled";

export async function shareCardBlob(
  blob: Blob,
  filename: string,
  text: string,
): Promise<ShareOutcome> {
  try {
    const file = new File([blob], filename, { type: "image/png" });
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [file] })
    ) {
      await navigator.share({ files: [file], text });
      return "shared";
    }
  } catch (err) {
    // 使用者取消系統分享面板：靜默返回
    if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
    // 其他失敗走下載降級
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "downloaded";
}

/** 本週 7 格（週一為首）——連勝卡掛點共用的取數小工具 */
export function buildShareWeek(xpHistory: Record<string, number>): ShareWeekCell[] {
  const labels = ["一", "二", "三", "四", "五", "六", "日"];
  const now = new Date();
  const mondayOffset = (now.getDay() + 6) % 7; // 0 = 週一
  return labels.map((label, i) => {
    const d = new Date();
    d.setDate(d.getDate() + (i - mondayOffset));
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return {
      label,
      active: (xpHistory[key] ?? 0) > 0,
      isToday: i === mondayOffset,
    };
  });
}
