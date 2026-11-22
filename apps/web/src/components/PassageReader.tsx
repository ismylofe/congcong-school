"use client";

/**
 * PassageReader — 課文聽讀 / 跟讀元件。
 *
 * 三種模式：
 *   1. 聽讀：順序播放每句 mp3，當前播放句高亮
 *   2. 單句：點每句前的小喇叭播這一句
 *   3. 跟讀：對每句先播原音、再錄音、走完全文後可逐句回放（原音 vs 我的）
 *
 * 複用 `lib/tts.ts` 的單例 audio + mute 狀態，避免兩段同時播。
 * 錄音用原生 MediaRecorder（`useRecorder`），不上傳、重新整理即丟。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Play, Pause, Mic, Square, RotateCcw } from "lucide-react";
import { readingId, type ReadingKind } from "@cstf/core/reading";
import { Volume, Lightning } from "@/components/icons";
import { MuteToggle, useSyncMute } from "@/components/MuteToggle";
import { InnerHeader } from "@/components/InnerHeader";
import { playTTSResult, preloadTTS, stopTTS } from "@/lib/tts";
import { listenToPassage, followPassage, recordingForSession, type ReadingResult } from "@/lib/readingSession";
import { useRecorder } from "@/lib/useRecorder";
import { useProgressStore } from "@/store/progress";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import { cn } from "@/lib/cn";
import type { Passage } from "@/types";

/**
 * 課文聽讀/跟讀獎勵的兩種型別：獎勵記錄存在 progress store 的 completedReadings 裡。
 * 鍵一律用 core 的規範閱讀 id（`reading:{kind}:{rawId}`），與 iOS / 備份互通。
 */
type RewardKind = Extract<ReadingKind, "listen" | "followup">;

const XP_LISTEN = 5;
const XP_FOLLOWUP = 10;

interface Props {
  passage: Passage;
  backHref: string;
}

type Mode = "idle" | "playing" | "followup";

export function PassageReader({ passage, backHref }: Props) {
  useSyncMute();
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("idle");
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  /** 跟讀模式下每句的學生錄音 blob URL */
  const [recordings, setRecordings] = useState<(string | null)[]>(
    () => passage.sentences.map(() => null),
  );
  const abortRef = useRef(false);
  const playbackGenerationRef = useRef(0);
  const rec = useRecorder();

  // XP 獎勵整合：走 store 的 completeReading（純 XP、不發寶石、不算課時）
  const completeReading = useProgressStore(s => s.completeReading);
  const [xpToast, setXpToast] = useState<{ amount: number; key: number } | null>(null);

  function grantPassageReward(kind: RewardKind, xp: number) {
    // 規範閱讀 id（core readingId）：`reading:listen:{passageId}` / `reading:followup:{passageId}`，
    // 與 iOS 同一鍵空間，備份互導後不會重複領 XP、也不會顯示成未讀。
    const id = readingId(kind, passage.id);
    // 冪等：領過就不再發（store 內也會查重，這裡提前 return 避免重複 toast）。
    // 走 store 的 isReadingDone，別自己翻 completedReadings —— 表裡的值是完成日期，
    // 老檔/另一端匯入的檔可能沒有日期，手寫真值判斷會把已讀當成未讀、重複發 XP。
    if (useProgressStore.getState().isReadingDone(kind, passage.id)) return;
    completeReading(id, xp);
    setXpToast({ amount: xp, key: Date.now() });
    playSfx("star");
    haptic("success");
  }

  // 課本原頁：render_pages.py 已經應用了書級 offset 算出真實 PDF 物理頁 pdfPage，
  // pageImages 一般是 [pdfPage-1, pdfPage, pdfPage+1] 按頁號升序。預設顯示 pdfPage。
  const pageImages = passage.pageImages ?? [];
  const defaultPageIdx = useMemo(() => {
    if (pageImages.length === 0) return 0;
    if (!passage.pdfPage) return Math.floor(pageImages.length / 2);
    for (let i = 0; i < pageImages.length; i++) {
      const m = /p(\d+)\.jpg/.exec(pageImages[i]);
      if (m && parseInt(m[1], 10) === passage.pdfPage) return i;
    }
    return Math.floor(pageImages.length / 2);
  }, [pageImages, passage.pdfPage]);
  const [pageIdx, setPageIdx] = useState(defaultPageIdx);
  useEffect(() => setPageIdx(defaultPageIdx), [defaultPageIdx]);

  // 預載入全部句子音訊，減少切換時的停頓
  useEffect(() => {
    for (const s of passage.sentences) {
      if (s.audio) preloadTTS(s.audio);
    }
  }, [passage]);

  // 清理：卸載時停掉一切
  useEffect(() => {
    return () => {
      abortRef.current = true;
      playbackGenerationRef.current++;
      stopTTS();
    };
  }, []);

  const sleep = (ms: number) =>
    new Promise<void>(resolve => setTimeout(resolve, ms));

  const playSingle = useCallback(async (idx: number) => {
    const s = passage.sentences[idx];
    if (!s?.audio) return;
    const generation = ++playbackGenerationRef.current;
    stopTTS();
    setPlaybackError(null);
    setMode("playing");
    setCurrentIndex(idx);
    const result = await playTTSResult(s.audio);
    if (generation !== playbackGenerationRef.current) return;
    if (result !== "ended") showPlaybackError("audio-unavailable");
    setCurrentIndex(null);
    setMode("idle");
  }, [passage]);

  const playAll = useCallback(async () => {
    if (mode === "playing") {
      abortRef.current = true;
      playbackGenerationRef.current++;
      stopTTS();
      setMode("idle");
      setCurrentIndex(null);
      return;
    }
    const generation = ++playbackGenerationRef.current;
    abortRef.current = false;
    setMode("playing");
    setPlaybackError(null);
    const result = await listenToPassage(passage.sentences, {
      play: playTTSResult, cancelled: () => abortRef.current || generation !== playbackGenerationRef.current, onSentence: setCurrentIndex, wait: sleep,
    });
    if (generation !== playbackGenerationRef.current) return;
    setCurrentIndex(null);
    setMode("idle");
    if (result === "completed") grantPassageReward("listen", XP_LISTEN);
    else showPlaybackError(result);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, passage]);

  // 跟讀流程：逐句 → 播原音 → 錄音 → 下一句
  const runFollowup = useCallback(async () => {
    if (mode === "followup") {
      // 中斷
      abortRef.current = true;
      playbackGenerationRef.current++;
      await rec.stop();
      stopTTS();
      setMode("idle");
      setCurrentIndex(null);
      return;
    }
    const generation = ++playbackGenerationRef.current;
    abortRef.current = false;
    setMode("followup");
    recordings.forEach(url => { if (url) URL.revokeObjectURL(url); });
    setRecordings(passage.sentences.map(() => null));
    setPlaybackError(null);
    const recording = recordingForSession(rec, () => generation === playbackGenerationRef.current);
    const result = await followPassage(passage.sentences, {
      play: playTTSResult, cancelled: () => abortRef.current || generation !== playbackGenerationRef.current, onSentence: setCurrentIndex, wait: sleep,
      startRecording: recording.start, stopRecording: recording.stop,
      onRecording: (index, url) => setRecordings(previous => {
        const next = [...previous]; next[index] = url; return next;
      }),
    });
    if (generation !== playbackGenerationRef.current) return;
    setCurrentIndex(null);
    setMode("idle");
    if (result === "completed") grantPassageReward("followup", XP_FOLLOWUP);
    else showPlaybackError(result);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, passage, rec]);

  function showPlaybackError(result: ReadingResult) {
    if (result === "audio-unavailable") setPlaybackError("聲音未能完整播放，請確認聲音已開啟並重試。本次未記錄完成。");
    if (result === "recording-unavailable") setPlaybackError("錄音未完成，請檢查麥克風許可權後重試。本次未記錄完成。");
  }

  const playMyRecording = useCallback(async (idx: number) => {
    const url = recordings[idx];
    if (!url) return;
    const generation = ++playbackGenerationRef.current;
    stopTTS();
    setPlaybackError(null);
    setMode("playing");
    setCurrentIndex(idx);
    const result = await playTTSResult(url);
    if (generation !== playbackGenerationRef.current) return;
    if (result !== "ended") showPlaybackError("audio-unavailable");
    setMode("idle");
    setCurrentIndex(null);
  }, [recordings]);

  const resetRecordings = useCallback(() => {
    playbackGenerationRef.current++;
    stopTTS();
    setMode("idle");
    setCurrentIndex(null);
    recordings.forEach(u => {
      if (u) URL.revokeObjectURL(u);
    });
    setRecordings(passage.sentences.map(() => null));
  }, [recordings, passage]);

  const hasAnyAudio = passage.sentences.some(s => s.audio);
  const isPoem =
    passage.kind === "poem" ||
    passage.kind === "ancient_poem" ||
    passage.kind === "song";

  return (
    <main className="reading-screen min-h-screen bg-bg" style={{ paddingBottom: "calc(10rem + env(safe-area-inset-bottom))" }}>
      <InnerHeader
        backHref={backHref}
        title={passage.title}
        right={<MuteToggle />}
        subtitle={passage.author ?? undefined}
      />

      {/* 桌面雙欄：lg+ 時課本原頁(左) + 課文正文(右) 並排；移動端順序堆疊 */}
      <div
        className={cn(
          "max-w-md lg:max-w-6xl mx-auto",
          pageImages.length > 0 && "lg:grid lg:grid-cols-[3fr_2fr] lg:gap-6 lg:items-start",
        )}
      >
      {/* 課本原頁 */}
      {pageImages.length > 0 && (
        <div className="px-4 pt-4 lg:pt-5">
          <div className="relative rounded-2xl overflow-hidden bg-white border border-bg-softer shadow-sm">
            <img
              src={pageImages[pageIdx]}
              alt={`${passage.title} - 課本原頁`}
              className="w-full h-auto block"
            />
            {pageImages.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="上一頁"
                  disabled={pageIdx === 0}
                  onClick={() => setPageIdx(i => Math.max(0, i - 1))}
                  className={cn(
                    "absolute left-2 top-1/2 -translate-y-1/2",
                    "w-11 h-11 rounded-full bg-white/90 text-ink shadow-md backdrop-blur",
                    "inline-flex items-center justify-center",
                    pageIdx === 0 && "opacity-30 cursor-not-allowed",
                  )}
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  aria-label="下一頁"
                  disabled={pageIdx === pageImages.length - 1}
                  onClick={() =>
                    setPageIdx(i => Math.min(pageImages.length - 1, i + 1))
                  }
                  className={cn(
                    "absolute right-2 top-1/2 -translate-y-1/2",
                    "w-11 h-11 rounded-full bg-white/90 text-ink shadow-md backdrop-blur",
                    "inline-flex items-center justify-center",
                    pageIdx === pageImages.length - 1 && "opacity-30 cursor-not-allowed",
                  )}
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/75 text-white text-xs px-2 py-0.5 rounded-full">
                  {pageIdx + 1} / {pageImages.length}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 課文正文 */}
      <div className="px-4 pt-5 lg:pt-5">
        {!hasAnyAudio && (
          <div className="mb-4 rounded-xl bg-warning/10 text-ink-light text-xs px-3 py-2">
            本課文的朗讀音訊還在生成中，暫時只能看文字
          </div>
        )}

        <div
          className={cn(
            "rounded-2xl bg-white border border-bg-softer p-4 shadow-sm",
            isPoem && "text-center",
          )}
        >
          {passage.sentences.map((s, i) => {
            const active = currentIndex === i;
            return (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-2 rounded-lg px-2 py-2 my-0.5 transition-colors",
                  active && "bg-primary/10 ring-1 ring-primary/40",
                  isPoem && "justify-center",
                )}
              >
                {!isPoem && (
                  <button
                    type="button"
                    aria-label={`朗讀第 ${i + 1} 句`}
                    onClick={() => playSingle(i)}
                    disabled={!s.audio || mode !== "idle"}
                    className={cn(
                      "shrink-0 w-11 h-11 inline-flex items-center justify-center rounded-full",
                      "bg-bg-soft text-secondary hover:bg-secondary/10 transition-colors",
                      (!s.audio || mode !== "idle") && "opacity-40 cursor-not-allowed",
                    )}
                  >
                    <Volume className="w-4 h-4" />
                  </button>
                )}
                <span
                  className={cn(
                    "min-w-0 break-words text-lg leading-[2] text-ink",
                    isPoem && "text-center",
                    active && "font-bold text-primary",
                  )}
                >
                  {s.text}
                </span>
              </div>
            );
          })}
        </div>

        {/* 跟讀模式：已錄音列表，可回放原音 vs 我的 */}
        <AnimatePresence>
          {recordings.some(Boolean) && mode !== "followup" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-5 rounded-2xl bg-white border border-bg-softer p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-bold text-ink">我的朗讀</div>
                <button
                  type="button"
                  onClick={resetRecordings}
                  className="min-h-11 min-w-11 inline-flex items-center justify-center gap-1 text-sm text-ink-light hover:text-danger"
                >
                  <RotateCcw className="w-3 h-3" />
                  清空
                </button>
              </div>
              <ul className="space-y-2">
                {passage.sentences.map((s, i) => {
                  const myUrl = recordings[i];
                  return (
                    <li
                      key={i}
                      className="flex items-center gap-2 text-sm text-ink"
                    >
                      <span className="shrink-0 w-5 text-ink-light tabular-nums">
                        {i + 1}.
                      </span>
                      <span className="flex-1 min-w-0 break-words leading-relaxed">{s.text}</span>
                      <button
                        type="button"
                        onClick={() => playSingle(i)}
                        disabled={!s.audio}
                        className="shrink-0 min-h-11 min-w-11 inline-flex items-center justify-center text-xs px-2 py-1 rounded-xl bg-bg-soft text-primary disabled:opacity-40"
                      >
                        原音
                      </button>
                      <button
                        type="button"
                        onClick={() => playMyRecording(i)}
                        disabled={!myUrl}
                        className="shrink-0 min-h-11 min-w-11 inline-flex items-center justify-center text-xs px-2 py-1 rounded-xl bg-secondary/15 text-secondary disabled:opacity-40"
                      >
                        我的
                      </button>
                    </li>
                  );
                })}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      </div>

      {/* 底部操作欄 */}
      {/* z-40：與 BottomNav 同層，任何時候都不會被固定底欄壓住（閱讀器本就隱藏底欄，
          這裡顯式給層級，防止將來改路由匹配時重演「按鈕被蓋住」） */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-bg-softer shadow-[0_-4px_12px_rgba(0,0,0,0.04)]" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="max-w-md lg:max-w-6xl mx-auto px-4 py-3 flex gap-3">
          <motion.button
            type="button"
            onClick={playAll}
            disabled={!hasAnyAudio || mode === "followup"}
            className={cn(
              "flex-1 gap-2",
              mode === "playing" ? "btn-chunky-danger" : "btn-chunky-primary",
              (!hasAnyAudio || mode === "followup") && "btn-chunky-disabled",
            )}
          >
            {mode === "playing" ? (
              <>
                <Pause className="w-5 h-5" />
                停止
              </>
            ) : (
              <>
                <Play className="w-5 h-5" />
                聽全文
              </>
            )}
          </motion.button>

          <motion.button
            type="button"
            onClick={runFollowup}
            disabled={!hasAnyAudio || mode === "playing"}
            className={cn(
              "flex-1 gap-2",
              mode === "followup" ? "btn-chunky-danger" : "btn-chunky-secondary",
              (!hasAnyAudio || mode === "playing") && "btn-chunky-disabled",
            )}
          >
            {mode === "followup" ? (
              <>
                <Square className="w-5 h-5" />
                結束跟讀
              </>
            ) : (
              <>
                <Mic className="w-5 h-5" />
                跟讀
              </>
            )}
          </motion.button>
        </div>
        {playbackError && <div role="alert" className="max-w-md lg:max-w-6xl mx-auto px-4 pb-2 text-sm text-danger">{playbackError}</div>}

      </div>

      {/* +XP 獎勵 toast（首次聽完整篇 / 首次跟讀全篇） */}
      <AnimatePresence>
        {xpToast && (
          <motion.div
            key={xpToast.key}
            initial={{ opacity: 0, y: 30, scale: 0.6 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ type: "spring", damping: 14, stiffness: 240 }}
            onAnimationComplete={() => {
              setTimeout(() => setXpToast(null), 1600);
            }}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-5 py-3 rounded-2xl text-white font-extrabold"
            style={{
              background: "linear-gradient(135deg, #1CB0F6, #1899D6)",
              boxShadow: "0 5px 0 0 #0d7aa8",
            }}
          >
            <Lightning className="w-5 h-5" />
            +{xpToast.amount} XP
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
