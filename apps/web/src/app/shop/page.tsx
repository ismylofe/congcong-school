"use client";

/**
 * 聰聰衣櫥 —— 用 gems 解鎖吉祥物皮膚 / UI 主題 / 課程背景
 *
 * 公益專案約束：
 *   - 所有道具都能透過遊戲內 gems 解鎖
 *   - 沒有"premium 限定"或"充值專屬"
 *   - 不影響遊戲數值，純美學
 *
 * 寬容器佈局（760px+）：
 *   左側粘性大預覽（Mascot / 主題樣卡 / 背景全屏） + 右側道具網格
 * 移動端：
 *   頂部緊湊預覽 + 下方道具網格
 */

import { useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/components/Toast";
import { themeAccentColors } from "@/lib/themeColors";
import { Sparkle } from "@/components/icons";
import {
  MASCOT_SKINS,
  UI_THEMES,
  LESSON_BACKDROPS,
  RARITY_COLORS,
  RARITY_LABELS,
  type CosmeticItem,
  type LessonBackdrop,
  type UiTheme,
} from "@/lib/cosmetics";
import { useProgressStore, MAX_HEARTS } from "@/store/progress";
import {
  FREEZE_COST,
  MAX_FREEZES,
  HEART_REFILL_COST,
} from "@cstf/core/economy";
import { Mascot } from "@/components/Mascot";
import {
  Gem,
  Check,
  Panda,
  Palette,
  Picture,
  Snowflake,
  Heart,
} from "@/components/icons";
import { GemBadge } from "@/components/GemBadge";
import { SoundLink } from "@/components/SoundLink";
import { AppShell } from "@/components/layout/AppShell";
import { playSfx } from "@/lib/sfx";
import { useThemeMode, useSystemPrefersDark } from "@/lib/themeMode";
import { haptic } from "@/lib/haptic";

type Tab = "mascot_skin" | "ui_theme" | "lesson_backdrop";

const TABS: Array<{
  id: Tab;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "mascot_skin", label: "聰聰裝扮", Icon: Panda },
  { id: "ui_theme", label: "介面主題", Icon: Palette },
  { id: "lesson_backdrop", label: "課堂背景", Icon: Picture },
];

const CATALOGS: Record<Tab, CosmeticItem[]> = {
  mascot_skin: MASCOT_SKINS,
  ui_theme: UI_THEMES,
  lesson_backdrop: LESSON_BACKDROPS,
};

export default function ShopPage() {
  const [tab, setTab] = useState<Tab>("mascot_skin");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [unlockBurstId, setUnlockBurstId] = useState<string | null>(null);
  const toast = useToast();
  const previewRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const gems = useProgressStore(s => s.gems);
  const ownedCosmetics = useProgressStore(s => s.ownedCosmetics);
  const equippedMascotSkin = useProgressStore(s => s.equippedMascotSkin);
  const equippedTheme = useProgressStore(s => s.equippedTheme);
  const equippedBackdrop = useProgressStore(s => s.equippedBackdrop);
  const purchaseCosmetic = useProgressStore(s => s.purchaseCosmetic);
  const equipCosmetic = useProgressStore(s => s.equipCosmetic);

  const items = CATALOGS[tab];

  function isEquipped(item: CosmeticItem) {
    if (item.type === "mascot_skin") return equippedMascotSkin === item.id;
    if (item.type === "ui_theme") return equippedTheme === item.id;
    if (item.type === "lesson_backdrop") return equippedBackdrop === item.id;
    return false;
  }

  function getEquippedId(t: Tab): string {
    if (t === "mascot_skin") return equippedMascotSkin;
    if (t === "ui_theme") return equippedTheme;
    return equippedBackdrop;
  }

  // 選擇只改變預覽；解鎖或裝備必須使用明確的行動按鈕。
  const previewId = selectedItemId ?? getEquippedId(tab);
  const previewItem = useMemo(
    () => items.find(i => i.id === previewId) ?? items[0],
    [items, previewId],
  );

  function handleClick(item: CosmeticItem) {
    playSfx("tap");
    haptic("light");
    const owned = !!ownedCosmetics[item.id];
    if (owned) {
      const ok = equipCosmetic(item.id);
      if (ok) {
        playSfx("star");
        haptic("success");
        toast.success(`已裝備：${item.name}`);
      }
    } else {
      const result = purchaseCosmetic(item.id);
      if (result.ok) {
        playSfx("unlock");
        haptic("success");
        toast.success(`解鎖成功：${item.name}`);
        setUnlockBurstId(item.id);
        window.setTimeout(() => setUnlockBurstId(null), 1400);
      } else {
        playSfx("wrong");
        haptic("heavy");
        toast.error(result.reason ?? "購買失敗");
      }
    }
  }

  function selectItem(item: CosmeticItem) {
    setSelectedItemId(item.id);
    playSfx("tap");
    if ((containerRef.current?.clientWidth ?? 0) < 760) {
      requestAnimationFrame(() => previewRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      }));
    }
  }

  return (
    <AppShell right={null} centerMaxWidth={1080}>
      <main className="min-h-screen px-4 py-6 md:px-0 md:py-2">
        <header className="flex items-start justify-between gap-4 mb-7">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-extrabold text-ink">聰聰衣櫥</h1>
            <p className="text-sm text-ink-light leading-relaxed mt-2">學習賺寶石，解鎖新裝扮。</p>
          </div>
          <GemBadge asLink={false} />
        </header>

        <div ref={containerRef} className="shop-container">
          <div role="tablist" aria-label="裝扮分類" className="grid grid-cols-3 gap-2 mb-6 rounded-2xl bg-white border border-bg-softer p-1">
            {TABS.map((t, index) => {
              const active = tab === t.id;
              const Icon = t.Icon;
              return <button key={t.id} id={`shop-tab-${t.id}`} type="button" role="tab"
                aria-selected={active} aria-controls="shop-catalog" tabIndex={active ? 0 : -1}
                onClick={() => { playSfx("tap"); setTab(t.id); setSelectedItemId(null); }}
                onKeyDown={event => {
                  const next = event.key === "ArrowRight" ? (index + 1) % TABS.length
                    : event.key === "ArrowLeft" ? (index + TABS.length - 1) % TABS.length
                    : event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 : null;
                  if (next === null) return;
                  event.preventDefault(); setTab(TABS[next].id); setSelectedItemId(null);
                  document.getElementById(`shop-tab-${TABS[next].id}`)?.focus();
                }}
                className={`shop-tab rounded-xl text-[13px] sm:text-sm font-bold transition-colors ${active ? "bg-primary/10 text-primary-dark" : "text-ink-light hover:bg-bg-soft"}`}>
                <Icon className="w-[18px] h-[18px] shrink-0" /><span>{t.label}</span>
              </button>;
            })}
          </div>

          <div className="shop-workspace">
            <div ref={previewRef} className="shop-preview">
              <PreviewPane item={previewItem}
                onTryEquip={() => { if (previewItem) handleClick(previewItem); }}
                owned={previewItem ? !!ownedCosmetics[previewItem.id] : false}
                equipped={previewItem ? isEquipped(previewItem) : false}
                canAfford={previewItem ? gems >= previewItem.cost : false} gems={gems} />
              <UnlockBurst active={!!previewItem && unlockBurstId === previewItem.id} />
            </div>

            <section id="shop-catalog" role="tabpanel" aria-labelledby={`shop-tab-${tab}`} tabIndex={0} className="min-w-0">
              <div className="flex items-center justify-between gap-3 mb-4 text-sm text-ink-light">
                <span>{items.length} 件{tab === "mascot_skin" ? "裝扮" : tab === "ui_theme" ? "主題" : "背景"}</span>
                <span>已擁有 {items.filter(item => ownedCosmetics[item.id]).length} 件</span>
              </div>
              <div className="shop-grid" data-shop-grid>
                {items.map(item => <ItemCard key={item.id} item={item}
                  owned={!!ownedCosmetics[item.id]} equipped={isEquipped(item)}
                  selected={previewItem?.id === item.id} onClick={() => selectItem(item)} />)}
              </div>
            </section>
          </div>
        </div>

        <details className="mt-10 rounded-2xl border border-bg-softer bg-white p-5">
          <summary className="cursor-pointer min-h-11 text-base font-bold text-ink">學習補給 <span className="ml-2 text-sm font-normal text-ink-light">連勝護盾與紅心</span></summary>
          <div className="mt-5"><PowerUpsSection /></div>
        </details>
      </main>
    </AppShell>
  );
}

// ============================================================
// ⚡ 紅心 & 連勝 —— 連勝護盾 / 補滿紅心（功能性，非美妝）
// ============================================================
function PowerUpsSection() {
  const toast = useToast();
  const gems = useProgressStore(s => s.gems);
  const freezes = useProgressStore(s => s.streakFreezes);
  const hearts = useProgressStore(s => s.hearts);
  const buyStreakFreeze = useProgressStore(s => s.buyStreakFreeze);
  const buyHeartRefill = useProgressStore(s => s.buyHeartRefill);

  const freezesFull = freezes >= MAX_FREEZES;
  const heartsFull = hearts >= MAX_HEARTS;

  function handleBuyFreeze() {
    playSfx("tap");
    haptic("light");
    if (freezesFull) return;
    if (buyStreakFreeze()) {
      playSfx("unlock");
      haptic("success");
      toast.success("🛡️ 連勝護盾 +1！漏學一天也不怕啦");
    } else {
      playSfx("wrong");
      toast.error("寶石不夠，先去學習存寶石吧");
    }
  }

  function handleBuyRefill() {
    playSfx("tap");
    haptic("light");
    if (heartsFull) return;
    if (buyHeartRefill()) {
      playSfx("unlock");
      haptic("success");
      toast.success("❤️ 紅心已補滿！");
    } else {
      playSfx("wrong");
      toast.error("寶石不夠，先去學習存寶石吧");
    }
  }

  return (
    <section aria-label="紅心與連勝補給">

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* 連勝護盾 */}
        <PowerUpCard
          icon={<Snowflake className="w-8 h-8" />}
          iconColor="#1CB0F6"
          title="連勝護盾"
          desc={`漏學一天時保住連勝。目前有 ${Math.min(freezes, MAX_FREEZES)}/${MAX_FREEZES} 個，每週一學習可補充 1 個。`}
          cost={FREEZE_COST}
          disabled={freezesFull}
          disabledLabel="已滿 2/2"
          canAfford={gems >= FREEZE_COST}
          onBuy={handleBuyFreeze}
        />
        {/* 補滿紅心 */}
        <PowerUpCard
          icon={<Heart className="w-8 h-8" />}
          iconColor="#FF4B4B"
          title="補滿紅心"
          desc={`立刻回滿 ${MAX_HEARTS} 顆紅心，繼續闖關`}
          cost={HEART_REFILL_COST}
          disabled={heartsFull}
          disabledLabel="紅心已滿"
          canAfford={gems >= HEART_REFILL_COST}
          onBuy={handleBuyRefill}
        />
      </div>
    </section>
  );
}

function PowerUpCard({
  icon,
  iconColor,
  title,
  desc,
  cost,
  disabled,
  disabledLabel,
  canAfford,
  onBuy,
}: {
  icon: React.ReactNode;
  iconColor: string;
  title: string;
  desc: string;
  cost: number;
  disabled: boolean;
  disabledLabel: string;
  canAfford: boolean;
  onBuy: () => void;
}) {
  return (
    <div
      className="bg-white rounded-2xl border-2 border-bg-softer p-4 flex flex-col"
      style={{ boxShadow: "0 4px 0 0 var(--shadow-card-color)" }}
    >
      <div className="flex items-center gap-2.5">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: `${iconColor}1a`, color: iconColor }}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-extrabold text-ink leading-tight">{title}</div>
          <div className="text-[11px] text-ink-light leading-snug mt-0.5">{desc}</div>
        </div>
      </div>
      {disabled ? (
        <div className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-2xl min-h-11 py-2 font-extrabold text-sm bg-bg-softer text-ink-light cursor-not-allowed">
          <Check className="w-4 h-4" strokeWidth={3} />
          <span>{disabledLabel}</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={onBuy}
          disabled={!canAfford}
          className={canAfford ? "btn-chunky-secondary mt-3 w-full gap-2" : "btn-chunky-disabled mt-3 w-full gap-2"}
        >
          <Gem className="w-4 h-4" />
          <span className="tabular-nums">{cost}</span>
          <span>{canAfford ? "購買" : "寶石不夠"}</span>
        </button>
      )}
    </div>
  );
}

// ============================================================
// 大預覽面板（左 / 頂）
// ============================================================
function PreviewPane({
  item,
  owned,
  equipped,
  canAfford,
  gems,
  onTryEquip,
}: {
  item: CosmeticItem | undefined;
  owned: boolean;
  equipped: boolean;
  canAfford: boolean;
  /** 當前寶石數（響應式訂閱自父元件，「還差 N」隨之實時更新） */
  gems: number;
  onTryEquip: () => void;
}) {
  if (!item) return null;
  const rarityColor = RARITY_COLORS[item.rarity];

  return (
    <motion.div
      className="shop-preview-card bg-white rounded-3xl border border-bg-softer overflow-hidden"
      style={{ boxShadow: "0 5px 0 0 var(--shadow-card-color)" }}
    >
      {/* 預覽舞臺 */}
      <PreviewStage item={item} />

      {/* 資訊條 */}
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="text-xl font-extrabold text-ink leading-tight flex-1">
            {item.name}
          </h2>
          <span
            className="inline-flex items-center gap-1.5 text-xs text-ink-light px-2 py-1 rounded-full font-medium border border-bg-softer shrink-0"
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: rarityColor }} aria-hidden />
            {RARITY_LABELS[item.rarity]}
          </span>
        </div>
        <p className="text-sm text-ink-light leading-relaxed">{item.description}</p>

        {/* 狀態 / 行動按鈕 */}
        <div className="mt-4">
          {equipped ? (
            <div className="min-h-[50px] inline-flex items-center justify-center rounded-2xl bg-bg-softer text-ink-light font-bold w-full">
              <Check className="w-4 h-4 mr-1.5" strokeWidth={3} />
              已裝備
            </div>
          ) : owned ? (
            <button
              type="button"
              onClick={onTryEquip}
              className="btn-chunky-primary w-full"
            >
              <Check className="w-4 h-4 mr-1.5" strokeWidth={3} />
              立即裝備
            </button>
          ) : canAfford ? (
            <button
              type="button"
              onClick={onTryEquip}
              className="btn-chunky-secondary w-full"
            >
              <Gem className="w-4 h-4 mr-1.5" />
              <span className="tabular-nums">{item.cost}</span>
              <span className="ml-1.5">解鎖</span>
            </button>
          ) : (
            <div role="status" className="rounded-2xl border border-bg-softer bg-bg-soft p-3 text-center">
              <p className="text-sm text-ink-light">還差 <span className="font-bold tabular-nums">{item.cost - gems}</span> 顆寶石</p>
              <SoundLink href="/" className="mt-2 min-h-11 flex items-center justify-center rounded-xl text-sm font-bold text-gem hover:bg-bg-softer">去學習賺寶石</SoundLink>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ============================================================
// 預覽舞臺 —— 根據道具型別渲染不同的全屏式預覽
// ============================================================
function PreviewStage({ item }: { item: CosmeticItem }) {
  const mode = useThemeMode();
  const systemDark = useSystemPrefersDark();
  if (item.type === "mascot_skin") {
    return (
      <div
        className="shop-preview-stage relative flex items-center justify-center"
        style={{
          background:
            "radial-gradient(ellipse at center, var(--app-card, #ECFDF5) 0%, var(--app-bg-soft, #F7F7F7) 70%)",
        }}
      >
        <motion.div
          key={item.id}
          className="shop-mascot"
          initial={{ scale: 0.8, opacity: 0, y: 8 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: "spring", damping: 16, stiffness: 220 }}
        >
          <Mascot size={180} skinOverride={item.id} mood="happy" />
        </motion.div>
      </div>
    );
  }
  if (item.type === "ui_theme") {
    const theme = item as UiTheme;
    const t = theme.data;
    const dark = !!t.isDark || mode === "dark" || (mode === "system" && systemDark);
    const previewColors = themeAccentColors(t.primary, t.primaryDark, t.accent, dark);
    const surface = dark ? (t.isDark ? t.cardBg : "#202F36") : "#FFFFFF";
    const border = dark ? (t.isDark ? t.borderSoft : "#37464F") : "#E5E5E5";
    return (
      <div
        className="relative h-64 px-5 py-5 flex flex-col gap-3"
        style={{ background: dark ? (t.isDark ? t.bg : "#131F24") : t.bg, color: dark ? "#CBD5E1" : "#4B4B4B" }}
      >
        {/* 模擬一個題區卡片 */}
        <div className="rounded-2xl border-2 p-3 flex items-center gap-2 shadow-sm" style={{ background: surface, borderColor: border }}>
          <div
            className="w-8 h-8 rounded-full"
            style={{ background: t.primary }}
          />
          <div className="flex-1">
            <div className="h-2.5 rounded-full w-3/4 mb-1.5" style={{ background: border }} />
            <div className="h-2 rounded-full w-1/2" style={{ background: border }} />
          </div>
        </div>
        {/* 模擬一個 chunky 主按鈕 */}
        <div
          className="rounded-2xl py-3 text-center font-bold text-[19px]"
          style={{
            background: previewColors['--action-primary-bg'],
            color: previewColors['--action-primary-ink'],
            boxShadow: `0 4px 0 0 ${previewColors['--action-primary-edge']}`,
          }}
        >
          檢查
        </div>
        {/* 調色盤色塊 */}
        <div className="flex gap-2 mt-auto">
          <ColorChip color={t.primary} label="主色" />
          <ColorChip color={t.primaryDark} label="深色" />
          <ColorChip color={t.accent} label="點綴" />
        </div>
      </div>
    );
  }
  if (item.type === "lesson_backdrop") {
    const bd = item as LessonBackdrop;
    return (
      <div
        className="shop-preview-stage relative flex items-center justify-center"
        style={{ background: bd.data.background }}
      >
        {/* 半透明白罩（背景太深的暗色 backdrop 用） */}
        {bd.data.needsOverlay && (
          <div className="absolute inset-0 bg-white/40" />
        )}
        {/* 模擬一個題卡片漂浮其上 */}
        <div className="relative bg-white rounded-2xl border-2 border-bg-softer p-4 mx-6 shadow-lg">
          <div className="text-xs text-ink-softer font-extrabold uppercase tracking-wider mb-1">
            示意
          </div>
          <div className="text-sm font-bold text-ink leading-relaxed">
            答題時的背景就會像這樣
          </div>
        </div>
      </div>
    );
  }
  return null;
}

// ============================================================
// 解鎖爆裂動畫 —— 在預覽面板上短暫展示星星 + 閃光
// ============================================================
function UnlockBurst({ active }: { active: boolean }) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl flex items-center justify-center"
          aria-hidden="true"
        >
          {/* 中心圓環 */}
          <motion.div
            initial={{ scale: 0, opacity: 0.8 }}
            animate={{ scale: 4, opacity: 0 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
            className="absolute w-20 h-20 rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(28,176,246,0.55), transparent 70%)",
            }}
          />
          {/* 8 顆散開的星星 */}
          {Array.from({ length: 8 }).map((_, i) => {
            const angle = (i / 8) * Math.PI * 2;
            const dist = 110;
            return (
              <motion.div
                key={i}
                initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
                animate={{
                  x: Math.cos(angle) * dist,
                  y: Math.sin(angle) * dist,
                  opacity: [0, 1, 0],
                  scale: [0.4, 1.2, 0.8],
                  rotate: 360,
                }}
                transition={{ duration: 0.95, ease: "easeOut" }}
                className="absolute text-secondary"
              >
                <Sparkle className="w-5 h-5" />
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ColorChip({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="w-9 h-9 rounded-xl border-2 border-white"
        style={{ background: color, boxShadow: "0 2px 6px rgba(0,0,0,0.12)" }}
      />
      <div className="text-xs font-medium">
        {label}
      </div>
    </div>
  );
}

// ============================================================
// 右側道具卡片
// ============================================================
function ItemCard({
  item,
  owned,
  equipped,
  selected,
  onClick,
}: {
  item: CosmeticItem;
  owned: boolean;
  equipped: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  const rarityColor = RARITY_COLORS[item.rarity];
  return (
    <motion.button
      type="button"
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      data-shop-card
      aria-label={`預覽${item.name}`}
      aria-pressed={selected}
      className="min-w-0 relative bg-white rounded-2xl border overflow-hidden text-left flex flex-col"
      style={{
        borderColor: selected ? "var(--theme-primary, #58CC02)" : "var(--app-border, #E5E5E5)",
        boxShadow: selected ? "0 0 0 1px var(--theme-primary, #58CC02)" : "0 2px 5px rgba(0,0,0,.025)",
      }}
    >
      {/* 縮略預覽 */}
      <ItemThumb item={item} />

      {/* 資訊 */}
      <div className="px-3 py-3 flex flex-col gap-2">
        <div data-shop-name className="text-base font-bold text-ink leading-relaxed break-words">
          {item.name}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <span
            className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap font-medium text-ink-light"
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: rarityColor }} aria-hidden />
            {RARITY_LABELS[item.rarity]}
          </span>
          {equipped ? (
            <span className="text-xs font-semibold text-ink-light">
              已裝備
            </span>
          ) : owned ? (
            <span className="text-xs font-semibold text-ink-light">
              已擁有
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1 text-xs font-semibold tabular-nums text-ink-light"
            >
              <Gem className="w-3.5 h-3.5 text-gem" />
              {item.cost}
            </span>
          )}
        </div>
      </div>
    </motion.button>
  );
}

// ============================================================
// 縮略預覽（卡片頂部）
// ============================================================
function ItemThumb({ item }: { item: CosmeticItem }) {
  if (item.type === "mascot_skin") {
    return (
      <div
        className="h-32 w-full flex items-center justify-center pt-3 bg-bg-soft"
      >
        <Mascot size={96} skinOverride={item.id} animate={false} mood="happy" />
      </div>
    );
  }
  if (item.type === "ui_theme") {
    const t = (item as UiTheme).data;
    return (
      <div className="h-32 w-full px-3 py-3 flex flex-col gap-2" style={{ background: t.bg }}>
        <div className="bg-white/90 rounded-md h-3 w-3/4" />
        <div
          className="rounded-md h-6 mt-auto"
          style={{
            background: t.primary,
            color: "#071317",
            boxShadow: `0 2px 0 0 ${t.primaryDark}`,
          }}
        />
      </div>
    );
  }
  if (item.type === "lesson_backdrop") {
    const bd = (item as LessonBackdrop).data;
    return (
      <div className="relative h-32 w-full" style={{ background: bd.background }}>
        {bd.needsOverlay && <div className="absolute inset-0 bg-white/30" />}
      </div>
    );
  }
  return null;
}
