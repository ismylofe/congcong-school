"use client";

/**
 * sfx.ts — 零依賴 Web Audio 高品質音效庫
 *
 * 架構：
 *   聲音源 ──┬── master gain ── lowpass ── compressor ── destination
 *           └── reverb send (delay + lowpass + feedback) ── master gain
 *
 * 關鍵技術：
 *   - FM bell 合成（正弦載波 + 調製器）實現鍾/鈴/木琴音色，替代粗糙的 square/triangle
 *   - 主通道低通濾波 + 壓縮器，去掉刺耳高頻 + 統一響度
 *   - 基於延遲反饋的輕量混響"空間感"，無需 IR 檔案
 *   - 指數包絡（exponentialRampToValueAtTime）模擬真實樂器自然衰減
 *
 * 所有參數都精心調校以貼近多鄰國的溫暖、清亮、圓潤的音色。
 */

export type SfxName =
  | "correct"
  | "wrong"
  | "tap"
  | "complete"
  | "star"
  | "heartLoss"
  | "combo"
  | "unlock"
  | "progressTick";

let ctx: AudioContext | null = null;
let muted = false;
let masterGain: GainNode | null = null;
let masterFilter: BiquadFilterNode | null = null;
let compressor: DynamicsCompressorNode | null = null;
/** 混響"傳送"輸入口——任何源連線到此即獲得房間混響 */
let reverbIn: GainNode | null = null;

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();

    // 主通道：gain → 低通濾波 → 壓縮器 → 輸出
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.55;

    masterFilter = ctx.createBiquadFilter();
    masterFilter.type = "lowpass";
    masterFilter.frequency.value = 7000; // 去掉刺耳高頻
    masterFilter.Q.value = 0.7;

    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 12;
    compressor.ratio.value = 3.5;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;

    masterGain.connect(masterFilter);
    masterFilter.connect(compressor);
    compressor.connect(ctx.destination);

    // 混響：反饋延遲 + 低通 → master
    // 構造類似小房間的溫暖殘響
    const delayA = ctx.createDelay(0.5);
    delayA.delayTime.value = 0.071;
    const delayB = ctx.createDelay(0.5);
    delayB.delayTime.value = 0.097;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.32;
    const revFilter = ctx.createBiquadFilter();
    revFilter.type = "lowpass";
    revFilter.frequency.value = 2800;
    revFilter.Q.value = 0.5;
    const revOut = ctx.createGain();
    revOut.gain.value = 0.22;

    reverbIn = ctx.createGain();
    reverbIn.gain.value = 1;
    // reverbIn → delayA → revFilter → feedback → delayB → revFilter (loop)
    reverbIn.connect(delayA);
    delayA.connect(revFilter);
    revFilter.connect(feedback);
    feedback.connect(delayB);
    delayB.connect(revFilter);
    revFilter.connect(revOut);
    revOut.connect(masterGain);
  }
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

export function setMuted(value: boolean) {
  muted = value;
}
export function isMuted(): boolean {
  return muted;
}

// ============================================================
// 合成原語
// ============================================================

interface BellOpts {
  freq: number;
  start: number;
  duration: number;
  volume?: number;
  /** 調製比：決定諧波結構。1.5~4 出鈴音，5+ 出金屬音 */
  modRatio?: number;
  /** 調製深度：越大音色越尖利/金屬 */
  modDepth?: number;
  attack?: number;
  /** 是否送入混響 */
  reverb?: number;
}

/** FM 鈴音合成：正弦載波 + 正弦調製器 */
function fmBell(c: AudioContext, opts: BellOpts) {
  const {
    freq,
    start,
    duration,
    volume = 0.28,
    modRatio = 3.5,
    modDepth = 120,
    attack = 0.004,
    reverb = 0.35,
  } = opts;

  const carrier = c.createOscillator();
  const modulator = c.createOscillator();
  const modGain = c.createGain();
  const env = c.createGain();

  carrier.type = "sine";
  carrier.frequency.setValueAtTime(freq, start);
  modulator.type = "sine";
  modulator.frequency.setValueAtTime(freq * modRatio, start);

  // 調製深度自身也有包絡（鐘的敲擊感）：打擊瞬間深，然後快速衰減
  modGain.gain.setValueAtTime(modDepth, start);
  modGain.gain.exponentialRampToValueAtTime(0.01, start + duration * 0.6);

  modulator.connect(modGain);
  modGain.connect(carrier.frequency);

  // 響度包絡
  env.gain.setValueAtTime(0, start);
  env.gain.linearRampToValueAtTime(volume, start + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  carrier.connect(env);
  if (masterGain) env.connect(masterGain);

  // 混響傳送
  if (reverb > 0 && reverbIn) {
    const send = c.createGain();
    send.gain.value = reverb;
    env.connect(send);
    send.connect(reverbIn);
  }

  modulator.start(start);
  carrier.start(start);
  modulator.stop(start + duration + 0.02);
  carrier.stop(start + duration + 0.02);
}

interface ToneOpts {
  freq: number;
  endFreq?: number;
  type?: OscillatorType;
  start: number;
  duration: number;
  volume?: number;
  attack?: number;
  release?: number;
  filterFreq?: number;
  reverb?: number;
}

/** 基本振盪器（帶濾波 + 包絡），用於非鈴音場景 */
function tone(c: AudioContext, opts: ToneOpts) {
  const {
    freq,
    endFreq,
    type = "sine",
    start,
    duration,
    volume = 0.25,
    attack = 0.005,
    release = 0.08,
    filterFreq,
    reverb = 0,
  } = opts;

  const osc = c.createOscillator();
  const env = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (endFreq !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), start + duration);
  }

  env.gain.setValueAtTime(0, start);
  env.gain.linearRampToValueAtTime(volume, start + attack);
  env.gain.setValueAtTime(volume, start + Math.max(attack, duration - release));
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  let node: AudioNode = env;
  osc.connect(env);

  if (filterFreq !== undefined) {
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = filterFreq;
    filter.Q.value = 1;
    env.connect(filter);
    node = filter;
  }

  if (masterGain) node.connect(masterGain);

  if (reverb > 0 && reverbIn) {
    const send = c.createGain();
    send.gain.value = reverb;
    node.connect(send);
    send.connect(reverbIn);
  }

  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** 短促噪聲爆破（用於 tap 點選、heart loss 破裂） */
function noiseBurst(
  c: AudioContext,
  opts: { start: number; duration: number; volume?: number; filterFreq?: number; highpass?: number },
) {
  const { start, duration, volume = 0.15, filterFreq, highpass } = opts;
  const bufferSize = Math.max(1, Math.floor(c.sampleRate * duration));
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const src = c.createBufferSource();
  src.buffer = buffer;

  const env = c.createGain();
  env.gain.setValueAtTime(volume, start);
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  let node: AudioNode = env;
  src.connect(env);

  if (filterFreq !== undefined) {
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = filterFreq;
    lp.Q.value = 0.8;
    env.connect(lp);
    node = lp;
  }
  if (highpass !== undefined) {
    const hp = c.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = highpass;
    node.connect(hp);
    node = hp;
  }

  if (masterGain) node.connect(masterGain);
  src.start(start);
  src.stop(start + duration + 0.02);
}

// ============================================================
// 播放器
// ============================================================

export function playSfx(name: SfxName, opts: { volume?: number } = {}) {
  if (muted) return;
  const c = ensureCtx();
  if (!c) return;
  const now = c.currentTime;
  const v = opts.volume ?? 1;

  switch (name) {
    case "correct": {
      // 兩音鈴（F#5 → A#5），FM 鍾音，帶輕混響
      fmBell(c, {
        freq: 739.99,
        start: now,
        duration: 0.42,
        volume: 0.3 * v,
        modRatio: 3.01,
        modDepth: 180,
        reverb: 0.32,
      });
      fmBell(c, {
        freq: 932.33,
        start: now + 0.11,
        duration: 0.55,
        volume: 0.34 * v,
        modRatio: 3.01,
        modDepth: 200,
        reverb: 0.38,
      });
      // 一層高頻 shimmer 增加"光亮感"
      fmBell(c, {
        freq: 1864.66,
        start: now + 0.11,
        duration: 0.35,
        volume: 0.08 * v,
        modRatio: 4.5,
        modDepth: 60,
        reverb: 0.5,
      });
      break;
    }

    case "wrong": {
      // 溫柔下行二度"哦-哦"（E4 → D4），三角波，強烈低通，輕微顫音
      tone(c, {
        freq: 329.63,
        endFreq: 277.18,
        type: "triangle",
        start: now,
        duration: 0.32,
        volume: 0.26 * v,
        attack: 0.008,
        release: 0.18,
        filterFreq: 1400,
        reverb: 0.2,
      });
      // 低頻墊音增加"厚度"
      tone(c, {
        freq: 164.81,
        endFreq: 138.59,
        type: "sine",
        start: now,
        duration: 0.34,
        volume: 0.18 * v,
        attack: 0.01,
        release: 0.2,
        filterFreq: 900,
      });
      break;
    }

    case "tap": {
      // 柔和短促的"嗒"：濾波噪聲 + 高頻正弦
      noiseBurst(c, {
        start: now,
        duration: 0.025,
        volume: 0.1 * v,
        filterFreq: 3500,
        highpass: 1500,
      });
      tone(c, {
        freq: 2400,
        type: "sine",
        start: now,
        duration: 0.04,
        volume: 0.1 * v,
        attack: 0.0005,
        release: 0.03,
      });
      break;
    }

    case "complete": {
      // 勝利鈴聲：C5-E5-G5-C6 琶音，FM 鈴音 + 混響 + 最後齊奏
      const notes: Array<[number, number]> = [
        [523.25, 0],     // C5
        [659.25, 0.12],  // E5
        [783.99, 0.24],  // G5
        [1046.5, 0.36],  // C6
      ];
      for (const [f, t] of notes) {
        fmBell(c, {
          freq: f,
          start: now + t,
          duration: 0.6,
          volume: 0.28 * v,
          modRatio: 3.01,
          modDepth: 160,
          reverb: 0.45,
        });
      }
      // 最後疊加一個閃亮的高泛音
      fmBell(c, {
        freq: 2093,
        start: now + 0.36,
        duration: 0.8,
        volume: 0.14 * v,
        modRatio: 4.2,
        modDepth: 80,
        reverb: 0.55,
      });
      break;
    }

    case "star": {
      // 兩連鈴（A6 → E7），短促明亮
      fmBell(c, {
        freq: 1760,
        start: now,
        duration: 0.28,
        volume: 0.28 * v,
        modRatio: 3.5,
        modDepth: 100,
        reverb: 0.4,
      });
      fmBell(c, {
        freq: 2637,
        start: now + 0.08,
        duration: 0.32,
        volume: 0.22 * v,
        modRatio: 3.5,
        modDepth: 90,
        reverb: 0.5,
      });
      break;
    }

    case "heartLoss": {
      // 柔和下滑鈴 + 輕微噪聲"破碎"
      fmBell(c, {
        freq: 523.25,
        start: now,
        duration: 0.35,
        volume: 0.24 * v,
        modRatio: 2.8,
        modDepth: 140,
        reverb: 0.35,
      });
      // 下降一個小三度
      tone(c, {
        freq: 440,
        endFreq: 220,
        type: "triangle",
        start: now + 0.05,
        duration: 0.38,
        volume: 0.18 * v,
        attack: 0.005,
        release: 0.25,
        filterFreq: 1600,
        reverb: 0.25,
      });
      noiseBurst(c, {
        start: now + 0.02,
        duration: 0.06,
        volume: 0.06 * v,
        filterFreq: 2000,
        highpass: 600,
      });
      break;
    }

    case "combo": {
      // 上行三鈴琶音 C5-E5-G5（大三和絃分解）+ 混響
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((f, i) => {
        fmBell(c, {
          freq: f,
          start: now + i * 0.07,
          duration: 0.34,
          volume: 0.26 * v,
          modRatio: 3.01,
          modDepth: 150,
          reverb: 0.4,
        });
      });
      break;
    }

    case "unlock": {
      // 多鄰國解鎖：明亮鈴音疊加多個諧波，略帶金屬感 + 深混響
      const fundamental = 1046.5; // C6
      [1, 2, 3.01].forEach((mult, i) => {
        fmBell(c, {
          freq: fundamental * mult,
          start: now + i * 0.02,
          duration: 0.9,
          volume: (0.22 / (i + 1)) * v,
          modRatio: 3.5,
          modDepth: 120,
          reverb: 0.6,
        });
      });
      // 柔和持續尾音
      fmBell(c, {
        freq: 523.25,
        start: now + 0.06,
        duration: 1.0,
        volume: 0.1 * v,
        modRatio: 2.01,
        modDepth: 80,
        reverb: 0.7,
      });
      break;
    }

    case "progressTick": {
      // 極短的"叮"，用於進度條推進
      fmBell(c, {
        freq: 1760,
        start: now,
        duration: 0.08,
        volume: 0.12 * v,
        modRatio: 3.01,
        modDepth: 60,
        reverb: 0.2,
      });
      break;
    }
  }
}

/** 掛一次性全域手勢監聽，確保 iOS/Safari 解鎖 AudioContext */
export function primeAudioOnFirstGesture() {
  if (typeof window === "undefined") return;
  const prime = () => {
    ensureCtx();
    window.removeEventListener("pointerdown", prime);
    window.removeEventListener("keydown", prime);
  };
  window.addEventListener("pointerdown", prime, { once: false });
  window.addEventListener("keydown", prime, { once: false });
}
