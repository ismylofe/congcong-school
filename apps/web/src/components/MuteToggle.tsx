"use client";

import { useEffect } from "react";
import { Volume, VolumeMute } from "@/components/icons";
import { useProgressStore } from "@/store/progress";
import { setMuted, playSfx, primeAudioOnFirstGesture } from "@/lib/sfx";

/** 同步 store.muted → sfx 全域靜音 & 首次啟動 prime AudioContext */
export function useSyncMute() {
  const muted = useProgressStore(s => s.muted);
  useEffect(() => {
    setMuted(muted);
  }, [muted]);
  useEffect(() => {
    primeAudioOnFirstGesture();
  }, []);
}

interface MuteToggleProps {
  className?: string;
}

export function MuteToggle({ className }: MuteToggleProps) {
  const muted = useProgressStore(s => s.muted);
  const toggleMute = useProgressStore(s => s.toggleMute);

  return (
    <button
      type="button"
      aria-pressed={!muted}
      aria-label={muted ? "開啟音效" : "關閉音效"}
      onClick={() => {
        toggleMute();
        // 解除瞬間播一下反饋（僅在從 muted 切回 on 時）
        if (muted) {
          setMuted(false);
          playSfx("tap");
        }
      }}
      className={`ui-icon-button text-ink-light hover:text-ink hover:bg-bg-softer transition-colors ${className ?? ""}`}
    >
      {muted ? <VolumeMute className="w-5 h-5" /> : <Volume className="w-5 h-5" />}
    </button>
  );
}

/**
 * 自動朗讀開關 —— 控制題幹/知識卡/講解是否自動播 TTS。
 * 面向家長/大童：預設開；低齡從此免找喇叭。
 */
export function AutoNarrateToggle({ className }: MuteToggleProps) {
  const autoNarrate = useProgressStore(s => s.autoNarrate);
  const toggleAutoNarrate = useProgressStore(s => s.toggleAutoNarrate);

  return (
    <button
      type="button"
      aria-pressed={autoNarrate}
      aria-label={autoNarrate ? "關閉自動朗讀" : "開啟自動朗讀"}
      title={autoNarrate ? "自動朗讀：開" : "自動朗讀：關"}
      onClick={() => {
        toggleAutoNarrate();
        playSfx("tap");
      }}
      className={`min-h-11 px-3 inline-flex items-center gap-1 rounded-xl text-sm font-bold transition-colors ${
        autoNarrate
          ? "bg-primary/15 text-primary-dark hover:bg-primary/25"
          : "bg-bg-soft text-ink-softer hover:bg-bg-softer"
      } ${className ?? ""}`}
    >
      <Volume className="w-3.5 h-3.5" />
      <span>自動</span>
    </button>
  );
}
