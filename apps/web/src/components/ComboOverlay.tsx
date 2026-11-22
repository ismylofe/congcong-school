"use client";

/**
 * ComboOverlay — 連擊里程碑居中大提示
 *
 * 在連對達到 3 / 5 / 10 時，從螢幕中央噴出一個大號 "連擊 xN" 徽章，
 * spring 彈入 + 旋轉 + 縮放，800ms 後上浮淡出。
 */

import { motion, AnimatePresence } from "framer-motion";
import { Flame } from "@/components/icons";

interface ComboOverlayProps {
  /** 觸發次數計數器（每次變化時播放一次動畫） */
  triggerKey: number;
  combo: number;
  visible: boolean;
}

export function ComboOverlay({ triggerKey, combo, visible }: ComboOverlayProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={triggerKey}
          initial={{ scale: 0.2, rotate: -15, opacity: 0, y: 0 }}
          animate={{
            scale: [0.2, 1.25, 1, 1, 1],
            rotate: [-15, 5, 0, 0, 0],
            opacity: [0, 1, 1, 1, 0],
            y: [0, 0, 0, -20, -50],
          }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.4, times: [0, 0.25, 0.5, 0.85, 1] }}
          className="fixed inset-0 z-[90] flex items-center justify-center pointer-events-none"
        >
          <div
            className="flex items-center gap-3 px-7 py-4 rounded-3xl text-white font-extrabold text-4xl"
            style={{
              background: "linear-gradient(135deg, #FFC800 0%, #FF9600 50%, #FF4B4B 100%)",
              boxShadow: "0 8px 0 0 rgba(180,90,0,0.4), 0 20px 40px rgba(255,150,0,0.4)",
              textShadow: "0 2px 0 rgba(0,0,0,0.2)",
            }}
          >
            <Flame className="w-10 h-10 drop-shadow" />
            <span>連擊 x{combo}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
