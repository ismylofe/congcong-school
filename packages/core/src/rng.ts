/**
 * rng.ts —— 跨端確定性隨機的公共原語（quests / league 共用）
 *
 * TS 端用 BigInt 模擬 Swift 的 UInt64 環繞運算（&+ / &*），位運算逐位一致。
 * iOS `Domain/Quests.swift` / `Domain/League.swift` 必須鏡像同名實現：
 *   - djb2Hash: UTF-8 位元組 djb2 滾動雜湊（seed 5381，×33 + byte，64 位環繞）
 *   - mix64:    SplitMix64 finalizer 雪崩
 * 任何一端改動這裡都會導致雙端榜單 / 任務漂移，禁止單獨修改。
 */

export const U64_MASK = (1n << 64n) - 1n;

/**
 * SplitMix64 finalizer —— 與 Swift 側位運算逐位一致
 * （&+ / &* 用 BigInt + 64 位掩碼模擬環繞）。
 */
export function mix64(value: bigint): bigint {
  let x = (value + 0x9e3779b97f4a7c15n) & U64_MASK;
  x = ((x ^ (x >> 30n)) * 0xbf58476d1ce4e5b9n) & U64_MASK;
  x = ((x ^ (x >> 27n)) * 0x94d049bb133111ebn) & U64_MASK;
  return x ^ (x >> 31n);
}

/** 字串 → UTF-8 位元組序列（與 Swift `Array(s.utf8)` 一致）。 */
export function utf8Bytes(s: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let code = s.codePointAt(i)!;
    if (code > 0xffff) i++; // 代理對佔兩個 code unit
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return bytes;
}

/** djb2 滾動雜湊（64 位環繞，未做雪崩——通常再套一層 mix64 使用）。 */
export function djb2Hash(s: string): bigint {
  let hash = 5381n;
  for (const byte of utf8Bytes(s)) {
    hash = (hash * 33n + BigInt(byte)) & U64_MASK;
  }
  return hash;
}
