"use client";

/**
 * useAutoNarrate — 面向低齡的自動朗讀 hook。
 *
 * 場景：進入一道題、一張知識卡、一次答題反饋時，
 * 自動序列播放給定音訊（只播有 src 的部分），避免小學生找不到喇叭。
 *
 * 行為：
 *   - 當 key 變化（或 autoNarrate / muted 開關切換到可播）時觸發
 *   - 序列播 srcs 裡所有非空 src，每段之間留 gapMs 間隔
 *   - 元件卸載 / key 再次變化 / 呼叫返回的 cancel() → 立刻停止
 *   - autoNarrate=false 或全域 muted → 不播
 *
 * 使用：
 *   const cancelNarrate = useAutoNarrate([q.audio?.question], q.id);
 *   // 使用者點選項時：
 *   onSelect={(v) => { cancelNarrate(); ... }}
 */

import { useCallback, useEffect, useRef } from "react";
import { playTTS, stopTTS } from "./tts";
import { useProgressStore } from "@/store/progress";

interface Opts {
  /** 段間間隔，預設 200ms */
  gapMs?: number;
  /** 首段開始前的延遲，預設 0。僅在需要避開入場動畫時才傳 >0 值。 */
  startDelayMs?: number;
  /** 每段開始播放時回呼，便於父元件做"當前播放項"高亮。idx 是過濾後非空 src 列表的 0 起索引。 */
  onSrcStart?: (idx: number) => void;
  /** 全部播放完畢（或被取消）時回呼，可用於清理高亮狀態。 */
  onAllDone?: () => void;
}

export function useAutoNarrate(
  srcs: Array<string | null | undefined>,
  key: string | number,
  opts: Opts = {},
): () => void {
  const { gapMs = 200, startDelayMs = 0, onSrcStart, onAllDone } = opts;
  const autoNarrate = useProgressStore(s => s.autoNarrate);
  const muted = useProgressStore(s => s.muted);

  // 用 ref 持有 srcs / 回呼，避免引用變化造成 effect 反覆重跑；
  // 觸發重播只依賴語義 key / 開關。
  const srcsRef = useRef(srcs);
  srcsRef.current = srcs;
  const onSrcStartRef = useRef(onSrcStart);
  onSrcStartRef.current = onSrcStart;
  const onAllDoneRef = useRef(onAllDone);
  onAllDoneRef.current = onAllDone;

  const cancelledRef = useRef(false);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    stopTTS();
  }, []);

  useEffect(() => {
    if (!autoNarrate || muted) return;
    cancelledRef.current = false;

    const run = async () => {
      // 可選入場延遲（預設 0，不打斷使用者手勢鏈）
      if (startDelayMs > 0) {
        await sleep(startDelayMs);
        if (cancelledRef.current) return;
      }

      const list = srcsRef.current.filter(
        (s): s is string => typeof s === "string" && s.length > 0,
      );
      for (let i = 0; i < list.length; i++) {
        if (cancelledRef.current) return;
        onSrcStartRef.current?.(i);
        await playTTS(list[i]);
        if (cancelledRef.current) return;
        if (i < list.length - 1) await sleep(gapMs);
      }
      if (!cancelledRef.current) onAllDoneRef.current?.();
    };

    void run();

    return () => {
      cancelledRef.current = true;
      stopTTS();
      onAllDoneRef.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, autoNarrate, muted]);

  return cancel;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
