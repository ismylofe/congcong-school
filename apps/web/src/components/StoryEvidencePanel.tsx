"use client";
import type { Story } from "@/types";
import { Volume } from "@/components/icons";
import { cn } from "@/lib/cn";

export function StoryEvidencePanel({
  story,
  selected,
  reference,
  checked,
  playing,
  onSelect,
  onPlay,
}: {
  story: Story;
  selected: number[];
  reference: number[];
  checked: boolean;
  playing: number | null;
  onSelect: (sentence: number) => void;
  onPlay: (index: number) => void;
}) {
  return (
    <section aria-label="故事原文與證據">
      <h2 className="text-xl font-extrabold text-ink">原文 · {story.title}</h2>
      <p className="text-sm text-ink-light mt-2 mb-4">
        {checked
          ? reference.length
            ? "標出的句子是參考依據。看看它們怎樣支持答案。"
            : "這道題沒有標註參考句子，可以對照全文和解析再想一想。"
          : "可以點一句或幾句有幫助的話，再回到題目作答。"}
      </p>
      <ol className="space-y-3">
        {story.sentences.map((sentence, i) => {
          const number = i + 1;
          const marked = reference.includes(number);
          const chosen = selected.includes(number);
          return (
            <li
              key={i}
              className={cn(
                "rounded-2xl border-2 p-3",
                marked
                  ? "border-primary bg-primary/10"
                  : chosen
                    ? "border-secondary bg-secondary/10"
                    : "border-bg-softer",
                playing === i && "ring-2 ring-secondary",
              )}
            >
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  disabled={checked}
                  aria-pressed={chosen}
                  aria-label={`第${number}句：${sentence.text}`}
                  onClick={() => onSelect(number)}
                  className="min-h-11 flex-1 text-left text-base lg:text-lg leading-loose text-ink rounded-lg focus-visible:ring-2 focus-visible:ring-secondary"
                >
                  <span className="inline-flex mr-2 min-w-7 min-h-7 items-center justify-center rounded-full bg-bg-soft text-sm font-extrabold">
                    {number}
                  </span>
                  {sentence.text}
                </button>
                {sentence.audio && (
                  <button
                    type="button"
                    aria-label={`朗讀原文第${number}句`}
                    onClick={() => onPlay(i)}
                    className="w-11 h-11 shrink-0 rounded-full bg-bg-soft text-secondary inline-flex items-center justify-center"
                  >
                    <Volume className="w-5 h-5" />
                  </button>
                )}
              </div>
              {(marked || chosen) && (
                <p className="mt-2 text-sm font-bold text-ink-light">
                  {marked ? "參考證據" : "我找到的句子"}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-sm text-ink-light">
        找證據幫助理解，選句子本身不計分。
      </p>
    </section>
  );
}
