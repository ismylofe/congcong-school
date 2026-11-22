/**
 * uiAudio.ts — UI 激勵語 / 動作語的預生成 TTS 音訊路徑查詢。
 *
 * 這些短句不在題庫資料裡，由 scripts/tts/ui_tts.py 單獨生成。
 * 路徑規則與 build-data.ts 一致（sha1 內容定址）。
 *
 * 用法：
 *   import { uiAudio } from "@/lib/uiAudio";
 *   playTTS(uiAudio("太棒了！"));
 */

const UI_AUDIO_MAP: Record<string, string> = {
  "太棒了！": "/audio/62/629784182421fb47b5d1eedd59e643c2e2a1102e.opus",
  "完美！": "/audio/7f/7f7cb35ef89ba028f36eea59663dfbbe1eefeca1.opus",
  "做得好！": "/audio/d6/d64d5971671dcbe2ad69696973f47858495a1aeb.opus",
  "天才！": "/audio/2b/2bedb0e27acfdf79b65d0f62735bc33250a5560c.opus",
  "繼續保持！": "/audio/ae/aec950a8a897d09eadadff8e35e856d5149d5c7d.opus",
  "漂亮！": "/audio/cd/cd1fe3e29bd077497a23828c8f51c4cdaddbf6ff.opus",
  "再想想": "/audio/6b/6b7712fdce323a40b24d5be4f4ec005461082940.opus",
  "差一點": "/audio/9a/9a8c263a863413ae8c38c7110a27ab6e00ef6cc7.opus",
  "加油": "/audio/1a/1a736f5321b4fff655f5d3886a127fcd400c6ca1.opus",
  "沒關係": "/audio/df/df96e37ca4b98b56ef2462a6dce478475e0bd398.opus",
  "下次就對！": "/audio/c0/c04b3b4cc4570238055e6fd15cd92c9ee8055177.opus",
  "太棒!": "/audio/1a/1a13489e3c0df2e5a5225f2d4a61326bcdd72f35.opus",
  "完美!": "/audio/43/43e5b642b2748e03cbf7ef1a11157d1134c899b2.opus",
  "漂亮!": "/audio/76/76e84500d6940f45857eaaf0b752fed04c27578d.opus",
  "好厲害!": "/audio/a7/a75cf87d6005d179f260cbdde020055d9e63381b.opus",
  "繼續!": "/audio/0e/0e291fa5e93f4a79cca9e3c8599568b91ade151e.opus",
  "別灰心!": "/audio/da/da0f4ce86427a0145f55930b25b0bd5041083e3b.opus",
  "再來一次!": "/audio/8f/8f78afe4f57d231bc389e647a30bdcfcb94aaab8.opus",
  "沒關係!": "/audio/b3/b33d7cbb934e53f87c2804473ddbdf570a1c2cb6.opus",
  "加油!": "/audio/29/2910136ec001880e4c02966f3b773614aa1421f8.opus",
  "連擊!": "/audio/b7/b75db7e22c0503b5f22aa50de2549900faf0ec20.opus",
  "火力全開!": "/audio/b8/b83c9dc2183f933137ddc89667ce0048352dd0a1.opus",
  "勢不可擋!": "/audio/34/3418af62da5ef1a1e384ac176ef8b781e2448591.opus",
  "連擊 三連!": "/audio/34/3492002839654d118cdcdb5d67815676c9e66bed.opus",
  "連擊 五連!": "/audio/99/9953ef19b08b7289bdbae12e64c078cb09d592fb.opus",
  "連擊 十連!": "/audio/39/39a23fe808a4c63cdd8f0be17f27221acd1ebc5c.opus",
  "一起學！": "/audio/cc/ccd353f69f162112ce59aea1b6203fb5823e8edd.opus",
  "超級重要!": "/audio/f0/f062e12606bb5a232cdb2cc722fa6a094a77d242.opus",
  "別踩坑哦!": "/audio/b6/b67584c38db840b2b0bc94423748dfdfbb39aed2.opus",
  "你最棒!": "/audio/8b/8b8c04471a92d28843603c3b549f7495f22999e6.opus",
  "完成!": "/audio/af/af23b834c0033a78598840b095f6d03559d7a80a.opus",
  "零失誤": "/audio/95/95e047b97a93a531eed966289103706e6146352e.opus",
  "繼續": "/audio/1f/1fc1afc5c55ed8c0cc28f99715b53cace4c37228.opus",
  "檢查": "/audio/40/40ffb34860e71de82970a3e403de97c4728fc76c.opus",
  "繼續學習": "/audio/c4/c45adf1c7f0bbbdff52ea382160c291d669730da.opus",
  "聽全文": "/audio/f8/f8392e9568982b7b165983d2fcffe7c50bf4ee1d.opus",
  "跟讀": "/audio/eb/eb1ccd80b6b6cac1c2fadee2e7113a88917db4ff.opus",
  "開始練習": "/audio/5c/5c007a10e6450db837f03cd6a81fc1d0924e820f.opus",
};

/** 查詢 UI 短句的預生成 TTS 音訊路徑。找不到返回 undefined。 */
export function uiAudio(text: string): string | undefined {
  return UI_AUDIO_MAP[text]?.replace(/\.opus$/, ".mp3");
}
