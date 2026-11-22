"use client";

/**
 * SoundLink — Next.js Link 的有聲版本
 *
 * 與 <Link> API 完全一致，多了一層"點選時播放 tap 音效 + 觸感反饋"。
 * 用於所有需要導航的卡片/按鈕型連結，避免每個元件都重複寫 onClick + playSfx + haptic。
 */

import Link, { type LinkProps } from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { playSfx, type SfxName } from "@/lib/sfx";
import { haptic, type HapticKind } from "@/lib/haptic";

type AnchorProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps>;

interface SoundLinkProps extends LinkProps, AnchorProps {
  children: ReactNode;
  /** 音效名，預設 "tap" */
  sfx?: SfxName;
  /** 觸感強度，預設 "light" */
  hapticIntensity?: HapticKind;
}

export function SoundLink({
  children,
  onClick,
  sfx = "tap",
  hapticIntensity = "light",
  ...rest
}: SoundLinkProps) {
  return (
    <Link
      {...rest}
      onClick={e => {
        playSfx(sfx);
        haptic(hapticIntensity);
        onClick?.(e);
      }}
    >
      {children}
    </Link>
  );
}
