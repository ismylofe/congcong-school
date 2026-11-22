"use client";

/**
 * ChestModal —— 寶箱開箱彈窗。
 *
 * 流程：
 *   1. 彈入（蓋子還是合著的 Chest 圖示）
 *   2. 使用者點"開啟"按鈕 → 蓋子動畫 + 音效 + 觸覺 + 寶石飛出
 *   3. 展示 "+N 寶石" 卡片
 *   4. 底部按鈕關閉彈窗
 *
 * 分層演出（web-economy-13）—— tier 由 chestLogic.rollChestReward 透傳：
 *   - common：金色脈衝 + 8 顆寶石粒子
 *   - rare  ：藍色光環 + 12 顆粒子 + 中等觸覺
 *   - epic  ：紫金光環 + 18 顆粒子 + 更長的綵帶線 + 重觸覺
 *
 * 獎勵已經在外層元件裡 addGems 過了，這裡只負責動畫演出。
 * 已領取過的寶箱不會再進入這裡（外層直接彈輕提示）。
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Modal } from "./Modal";
import { Chest, ChestOpen, Gem, Sparkle } from "@/components/icons";
import type { ChestRewardTier } from "@/lib/chestLogic";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";

interface ChestModalProps {
  open: boolean;
  gems: number;
  /** 獎勵檔位，決定開箱演出強度（預設 common） */
  tier?: ChestRewardTier;
  onClose: () => void;
}

/** 每檔的演出參數 */
const TIER_FX: Record<
  ChestRewardTier,
  {
    label: string | null;
    labelColor: string;
    glow: string;
    ringShadow: string;
    particles: number;
    particleDuration: number;
    rewardBg: string;
    rewardShadow: string;
    haptic: "success" | "medium" | "heavy";
    ribbons: number;
  }
> = {
  common: {
    label: null,
    labelColor: "#FFC800",
    glow: "rgba(255, 200, 0, 0.35)",
    ringShadow: "0 0 0 6px rgba(255, 200, 0, 0.35)",
    particles: 8,
    particleDuration: 1.1,
    rewardBg: "linear-gradient(135deg, #1CB0F6, #1899D6)",
    rewardShadow: "0 5px 0 0 #0d7aa8",
    haptic: "success",
    ribbons: 0,
  },
  rare: {
    label: "稀有寶箱！",
    labelColor: "#1CB0F6",
    glow: "rgba(28, 176, 246, 0.4)",
    ringShadow: "0 0 0 8px rgba(28, 176, 246, 0.4), 0 0 28px rgba(28, 176, 246, 0.5)",
    particles: 12,
    particleDuration: 1.3,
    rewardBg: "linear-gradient(135deg, #1CB0F6, #1899D6)",
    rewardShadow: "0 5px 0 0 #0d7aa8",
    haptic: "medium",
    ribbons: 8,
  },
  epic: {
    label: "超級驚喜！",
    labelColor: "#CE82FF",
    glow: "rgba(206, 130, 255, 0.45)",
    ringShadow:
      "0 0 0 8px rgba(206, 130, 255, 0.45), 0 0 36px rgba(255, 200, 0, 0.6)",
    particles: 18,
    particleDuration: 1.6,
    rewardBg: "linear-gradient(135deg, #CE82FF, #FFC800)",
    rewardShadow: "0 5px 0 0 #A560E8",
    haptic: "heavy",
    ribbons: 14,
  },
};

const RIBBON_COLORS = ["#FFC800", "#CE82FF", "#1CB0F6", "#58CC02", "#FF4B4B", "#FF9600"];

export function ChestModal({ open, gems, tier = "common", onClose }: ChestModalProps) {
  const [opened, setOpened] = useState(false);
  const prefersReduced = useReducedMotion();
  const fx = TIER_FX[tier];

  // 彈窗關閉後重置內部狀態，下次彈開重新從"合著"開始
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => setOpened(false), 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  function handleOpen() {
    if (opened) return;
    playSfx("unlock");
    haptic(fx.haptic);
    setOpened(true);
  }

  return (
    <Modal ariaLabel="學習寶箱" open={open} onClose={onClose}>
      <div className="flex flex-col items-center text-center">
        <h2 className="text-2xl font-extrabold text-ink mb-1">寶箱來啦！</h2>
        <p className="text-ink-light text-sm mb-4">點一下打開，領取獎勵</p>

        <div className="relative w-36 h-36 flex items-center justify-center">
          {/* 脈衝光圈（未開時；rare/epic 顏色更亮） */}
          {!opened && !prefersReduced && (
            <motion.div
              aria-hidden
              animate={{ scale: [1, 1.25, 1], opacity: [0.35, 0, 0.35] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
              className="absolute inset-0 rounded-full"
              style={{ backgroundColor: fx.glow }}
            />
          )}

          <AnimatePresence mode="wait">
            {!opened ? (
              <motion.button
                key="closed"
                type="button"
                onClick={handleOpen}
                initial={{ scale: 0.3, opacity: 0, rotate: -20 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                exit={{ scale: 0.5, opacity: 0 }}
                transition={{ type: "spring", damping: 12, stiffness: 220 }}
                whileHover={{ y: -4, scale: 1.05 }}
                whileTap={{ scale: 0.92 }}
                className="relative text-warning"
                aria-label="開啟寶箱"
              >
                <motion.div
                  animate={prefersReduced ? undefined : { y: [0, -4, 0] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Chest className="w-28 h-28 drop-shadow-lg" />
                </motion.div>
              </motion.button>
            ) : (
              <motion.div
                key="open"
                initial={{ scale: 0.5, opacity: 0, rotate: -10 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                transition={{ type: "spring", damping: 10, stiffness: 220 }}
                className="text-warning"
              >
                {/* 開箱後按檔位掛一圈光環 */}
                <motion.div
                  aria-hidden
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 1, 0.6] }}
                  transition={{ duration: 0.8 }}
                  className="absolute inset-2 rounded-full pointer-events-none"
                  style={{ boxShadow: fx.ringShadow }}
                />
                <ChestOpen className="w-28 h-28 drop-shadow-lg" />
              </motion.div>
            )}
          </AnimatePresence>

          {/* 開箱後飛出的寶石粒子 */}
          <AnimatePresence>
            {opened &&
              Array.from({ length: fx.particles }).map((_, i) => {
                const angle = (i / fx.particles) * Math.PI * 2 - Math.PI / 2;
                const dist = 70 + Math.random() * (tier === "epic" ? 40 : 20);
                return (
                  <motion.div
                    key={i}
                    initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
                    animate={{
                      x: Math.cos(angle) * dist,
                      y: Math.sin(angle) * dist - 10,
                      opacity: [0, 1, 1, 0],
                      scale: [0.4, 1.1, 1, 0.6],
                    }}
                    transition={{
                      duration: fx.particleDuration,
                      delay: 0.05 * i,
                      ease: "easeOut",
                    }}
                    className="absolute text-secondary pointer-events-none"
                  >
                    {tier === "epic" && i % 3 === 2 ? (
                      <Sparkle className="w-5 h-5 drop-shadow" style={{ color: "#FFC800" }} />
                    ) : (
                      <Gem className="w-5 h-5 drop-shadow" />
                    )}
                  </motion.div>
                );
              })}
          </AnimatePresence>

          {/* rare/epic：更長的綵帶雨 */}
          <AnimatePresence>
            {opened &&
              !prefersReduced &&
              fx.ribbons > 0 &&
              Array.from({ length: fx.ribbons }).map((_, i) => {
                const x0 = (i / fx.ribbons - 0.5) * 160 + (Math.random() * 24 - 12);
                return (
                  <motion.span
                    key={`ribbon-${i}`}
                    aria-hidden
                    initial={{ x: x0 * 0.3, y: -10, opacity: 0, rotate: 0 }}
                    animate={{
                      x: x0,
                      y: 120 + Math.random() * 40,
                      opacity: [0, 1, 1, 0],
                      rotate: (Math.random() - 0.5) * 540,
                    }}
                    transition={{
                      duration: tier === "epic" ? 2.2 : 1.5,
                      delay: 0.15 + 0.06 * i,
                      ease: "easeIn",
                    }}
                    className="absolute pointer-events-none"
                    style={{
                      width: 6,
                      height: 12,
                      borderRadius: 2,
                      backgroundColor: RIBBON_COLORS[i % RIBBON_COLORS.length],
                    }}
                  />
                );
              })}
          </AnimatePresence>
        </div>

        {/* 檔位標籤（rare/epic） */}
        <AnimatePresence>
          {opened && fx.label && (
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", damping: 12, delay: 0.35 }}
              className="mt-3 text-sm font-extrabold"
              style={{ color: fx.labelColor }}
            >
              {fx.label}
            </motion.div>
          )}
        </AnimatePresence>

        {/* 獎勵數字 */}
        <AnimatePresence>
          {opened && (
            <motion.div
              initial={{ scale: 0, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              transition={{ type: "spring", damping: 14, delay: 0.55 }}
              className="mt-3 inline-flex items-center gap-2 px-5 py-3 rounded-2xl font-extrabold text-2xl text-white"
              style={{
                background: fx.rewardBg,
                boxShadow: fx.rewardShadow,
              }}
            >
              <Gem className="w-7 h-7" />
              <span className="tabular-nums">+{gems}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          type="button"
          onClick={() => {
            playSfx("tap");
            haptic("light");
            onClose();
          }}
          className={`mt-6 w-full ${opened ? "btn-chunky-primary" : "btn-chunky-disabled"}`}
          disabled={!opened}
        >
          {opened ? "收下" : "先點開寶箱"}
        </button>
      </div>
    </Modal>
  );
}
