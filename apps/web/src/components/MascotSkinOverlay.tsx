"use client";

/**
 * MascotSkinOverlay —— 吉祥物皮膚的 SVG 疊加層。
 *
 * 這是 Mascot.tsx 內部 <svg viewBox="0 0 120 120"> 的子元素，
 * 根據裝備的 skin id 渲染對應的帽子 / 眼鏡 / 配件 SVG。
 *
 * 配件沿用 iOS 的位置錨點，Web 材質透過例項獨立的漸變增強體積感。
 * 錨點參考熊貓主體幾何：
 *   - 頭中心 ≈ (60, 46)，半徑 ≈ 36（頭頂邊緣 y ≈ 10）
 *   - 耳朵 (32, 21) / (88, 21)
 *   - 雙眼水平 y ≈ 48
 *   - 脖頸/胸口 ≈ y 88
 *
 * 所有裝飾只用基礎 SVG primitive（path/circle/rect/ellipse），零外部依賴。
 */

import * as React from "react";

const GOLD = "var(--mascot-gold, #FFC800)";
const GOLD_DARK = "var(--mascot-gold-band, #E0A800)";
const DARK = "var(--mascot-dark, #2E2E2E)";

interface MascotSkinOverlayProps {
  skinId?: string | null;
}

export function MascotSkinOverlay({ skinId }: MascotSkinOverlayProps) {
  const id = "panda-skin-" + React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  if (!skinId || skinId === "skin_default") return null;
  const materials = {
    gold: ["#ffe19b", "#e8bc51", "#b98126"],
    "gold-band": ["#d8af5e", "#bc8e35", "#93651e"],
    dark: ["#555956", "#343936", "#212723"],
    purple: ["#ae92df", "#8560c5", "#60409a"],
    blue: ["#80c8e2", "#4da4cb", "#297da6"],
    red: ["#e58d90", "#c95f66", "#a43e48"],
  };
  const variables = Object.fromEntries(Object.keys(materials).map(name =>
    ["--mascot-" + name, "url(#" + id + "-" + name + ")"]));
  return <g style={variables as React.CSSProperties}>
    <defs>{Object.entries(materials).map(([name, colors]) => <linearGradient
      key={name} id={id + "-" + name} x1="0" y1="0" x2=".4" y2="1">
      <stop stopColor={colors[0]} /><stop offset=".55" stopColor={colors[1]} />
      <stop offset="1" stopColor={colors[2]} />
    </linearGradient>)}</defs>
    <Accessory skinId={skinId} />
  </g>;
}

function Accessory({ skinId }: MascotSkinOverlayProps) {
  switch (skinId) {
    case "skin_graduate":
      return <GraduateCap />;
    case "skin_glasses":
      return <RoundGlasses />;
    case "skin_party":
      return <PartyHat />;
    case "skin_crown":
      return <GoldCrown />;
    case "skin_wizard":
      return <WizardHat />;
    case "skin_astronaut":
      return <AstronautHelmet />;
    case "skin_sunglasses":
      return <Sunglasses />;
    case "skin_pirate":
      return <PirateHat />;
    case "skin_headphones":
      return <Headphones />;
    case "skin_laurel":
      return <LaurelWreath />;
    case "skin_bowtie":
      return <BowTie />;
    case "skin_default":
    case null:
    case undefined:
    default:
      return null;
  }
}

// ============================================================
// 學士帽：帽帶 + 菱形方板 + 金流蘇（iOS: band(42..78,16..26) + board(60,2)-(100,17)-(60,32)-(20,17)）
// ============================================================
function GraduateCap() {
  return (
    <g>
      <path d="M 42 16 L 78 16 L 76 26 L 44 26 Z" fill={DARK} />
      <path d="M 60 2 L 100 17 L 60 32 L 20 17 Z" fill={DARK} />
      {/* 流蘇 */}
      <path d="M 96 18 Q 103 25 100 34" fill="none" stroke={GOLD} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="100" cy="37" r="4" fill={GOLD} />
    </g>
  );
}

// ============================================================
// 圓框眼鏡（iOS: 雙圓 r12 @ (45,48)/(75,48) + 鼻樑）
// ============================================================
function RoundGlasses() {
  return (
    <g>
      <circle cx="45" cy="48" r="12" fill="none" stroke="#4A3A2A" strokeWidth="2.6" />
      <circle cx="75" cy="48" r="12" fill="none" stroke="#4A3A2A" strokeWidth="2.6" />
      <line x1="57" y1="47" x2="63" y2="47" stroke="#4A3A2A" strokeWidth="2.4" />
      {/* 鏡片反光 */}
      <path d="M 39 43 Q 44 39 50 42" stroke="#FFFFFF" strokeWidth="1.4" fill="none" opacity="0.7" />
      <path d="M 69 43 Q 74 39 80 42" stroke="#FFFFFF" strokeWidth="1.4" fill="none" opacity="0.7" />
    </g>
  );
}

// ============================================================
// 派對錐帽（iOS: 三角 (60,-4)-(44,28)-(76,28)，三色分層 + 白絨球）
// ============================================================
function PartyHat() {
  return (
    <g>
      <path d="M 60 -4 L 44 28 L 76 28 Z" fill="#FF6B9D" />
      <path d="M 60 -4 L 52 12 L 68 12 Z" fill="#FFD166" />
      <path d="M 48 22 L 72 22 L 76 28 L 44 28 Z" fill="#4ECDC4" />
      <circle cx="60" cy="-4" r="5" fill="#FFFFFF" />
    </g>
  );
}

// ============================================================
// 金色皇冠（iOS: 五峰 (30,28)-(40,10)-(50,22)-(60,6)-(70,22)-(80,10)-(90,28) + 深金環帶 + 紅寶石）
// ============================================================
function GoldCrown() {
  return (
    <g>
      <path d="M 30 28 L 40 10 L 50 22 L 60 6 L 70 22 L 80 10 L 90 28 Z" fill={GOLD} />
      <rect x="30" y="25" width="60" height="8" rx="3" fill={GOLD_DARK} />
      <circle cx="60" cy="8" r="3.2" fill="#FF6B6B" />
    </g>
  );
}

// ============================================================
// 法師尖帽（iOS: 紫三角 (62,-8)-(38,30)-(86,30) + 深紫帽簷 + 金星）
// ============================================================
function WizardHat() {
  return (
    <g>
      <path d="M 62 -8 L 38 30 L 86 30 Z" fill="var(--mascot-purple, #7C3AED)" />
      <rect x="34" y="26" width="56" height="9" rx="4" fill="#5B21B6" />
      {/* 小金星 */}
      <path
        d="M 58 4 L 60.6 10 L 67 10 L 62 14 L 64 20 L 58 16 L 52 20 L 54 14 L 49 10 L 55.4 10 Z"
        fill={GOLD}
      />
    </g>
  );
}

// ============================================================
// 宇航員頭盔（iOS: 大球罩 (60,48) r46 半透明 + 高光弧）
// ============================================================
function AstronautHelmet() {
  return (
    <g>
      <circle cx="60" cy="48" r="46" fill="#BFE3F7" opacity="0.30" stroke="#DCE9F0" strokeWidth="4" />
      {/* 左上高光弧（對應 iOS 200°→250° 弧） */}
      <path
        d="M 24.3 35 A 38 38 0 0 1 47 12.3"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="5"
        strokeLinecap="round"
        opacity="0.75"
      />
    </g>
  );
}

// ============================================================
// 酷炫墨鏡（iOS: 圓角矩形鏡片 (31,39,27,19)/(62,39,27,19) + 粗橋 + 反光）
// ============================================================
function Sunglasses() {
  return (
    <g>
      <rect x="31" y="39" width="27" height="19" rx="7" fill={DARK} />
      <rect x="62" y="39" width="27" height="19" rx="7" fill={DARK} />
      <line x1="58" y1="45" x2="62" y2="45" stroke={DARK} strokeWidth="4" />
      <path d="M 36 54 L 46 42" stroke="#FFFFFF" strokeWidth="2.2" opacity="0.5" />
    </g>
  );
}

// ============================================================
// 海盜船長（iOS: 大三角帽 (18,26)-(60,4)-(102,26) + 紅帽帶 + 白圓徽 + 左眼罩）
// ============================================================
function PirateHat() {
  return (
    <g>
      <path d="M 18 26 L 60 4 L 102 26 L 96 32 L 24 32 Z" fill={DARK} />
      <rect x="22" y="24" width="76" height="9" rx="4" fill="#8B0000" />
      <circle cx="60" cy="17" r="5" fill="#FFFFFF" />
      {/* 左眼罩 + 綁帶 */}
      <circle cx="45" cy="48" r="11" fill={DARK} />
      <line x1="24" y1="40" x2="92" y2="44" stroke={DARK} strokeWidth="2.6" />
    </g>
  );
}

// ============================================================
// DJ 耳機（iOS: 頭梁弧 (60,46) r44 藍 + 兩側深藍耳罩）
// ============================================================
function Headphones() {
  return (
    <g>
      <path
        d="M 18.7 31 A 44 44 0 0 1 101.3 31"
        fill="none"
        stroke="var(--mascot-blue, #1CB0F6)"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <rect x="10" y="40" width="16" height="26" rx="7" fill="var(--mascot-blue, #1899D6)" />
      <rect x="94" y="40" width="16" height="26" rx="7" fill="var(--mascot-blue, #1899D6)" />
    </g>
  );
}

// ============================================================
// 桂冠（iOS: 雙側弧枝 (60,52) r42 綠 + 葉片）
// ============================================================
function LaurelWreath() {
  const leaves: React.ReactNode[] = [];
  for (const dir of [1, -1] as const) {
    for (let k = 0; k < 4; k++) {
      const ang = (dir > 0 ? 310 : 230) + k * (dir > 0 ? 18 : -18);
      const rad = (ang * Math.PI) / 180;
      // Node and browser trig can differ in the last decimal; keep SSR stable.
      const cx = Number((60 + Math.cos(rad) * 42).toFixed(3));
      const cy = Number((52 + Math.sin(rad) * 42).toFixed(3));
      leaves.push(
        <ellipse
          key={`${dir}-${k}`}
          cx={cx}
          cy={cy}
          rx="5"
          ry="3"
          fill="#6ABE30"
          transform={`rotate(${ang + 90} ${cx} ${cy})`}
        />,
      );
    }
  }
  return (
    <g>
      {/* 右側弧（300°→20°）與左側弧（240°→160°，逆向） */}
      <path
        d="M 81 15.6 A 42 42 0 0 1 99.5 66.4"
        fill="none"
        stroke="#4C9A2A"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <path
        d="M 39 15.6 A 42 42 0 0 0 20.5 66.4"
        fill="none"
        stroke="#4C9A2A"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      {leaves}
      {/* 頂部紅絲帶 */}
      <path d="M 56 8 L 60 4 L 64 8 L 60 12 Z" fill="#FF4B4B" />
    </g>
  );
}

// ============================================================
// 紳士領結（iOS: 胸口 y≈88，兩翼 (44..56)/(64..76) + 深紅結節）
// ============================================================
function BowTie() {
  return (
    <g>
      <path d="M 44 88 L 56 82 L 56 96 L 44 94 Z" fill="var(--mascot-red, #E5484D)" />
      <path d="M 76 88 L 64 82 L 64 96 L 76 94 Z" fill="var(--mascot-red, #E5484D)" />
      <circle cx="60" cy="89" r="4.6" fill="#B8353A" />
    </g>
  );
}
