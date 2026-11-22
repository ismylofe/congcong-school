"use client";

/**
 * MathText — 把含 $...$ 的字串拆開，行內 LaTeX 用 KaTeX 渲染。
 *
 * 支援美元符號及 TeX 圓括號/方括號分隔的行內和塊級公式。
 * 未配對的分隔符保留為普通文字。
 */

import dynamic from "next/dynamic";
import { Fragment } from "react";
import { splitMath } from "@/lib/math-segments";

// react-katex + katex 的體積較大 (~100KB+)，改為按需載入，
// 讓 LessonRunner 初次渲染時不阻塞在 KaTeX chunk 上。
// 首屏先顯示原始 LaTeX 字串（等公式 chunk 到位後自動替換為渲染結果）。
const InlineMath = dynamic(
  () => import("react-katex").then(m => ({ default: m.InlineMath })),
  {
    ssr: false,
    loading: () => <span className="opacity-60">…</span>,
  },
);
const BlockMath = dynamic(
  () => import("react-katex").then(m => ({ default: m.BlockMath })),
  {
    ssr: false,
    loading: () => <span className="block my-2 opacity-60">…</span>,
  },
);

interface MathTextProps {
  text: string;
  block?: boolean;
}

export function MathText({ text, block = false }: MathTextProps) {
  const parts = splitMath(text);

  return (
    <span>
      {parts.map((p, idx) => {
        if (p.type === "text") return <Fragment key={idx}>{p.value}</Fragment>;
        if (p.type === "block")
          return (
            <span key={idx} className="block my-2 max-w-full overflow-x-auto">
              <BlockMath math={p.value} />
            </span>
          );
        return <span key={idx} className="inline-block max-w-full overflow-x-auto overflow-y-hidden align-middle py-1"><InlineMath math={p.value} /></span>;
      })}
    </span>
  );
}
