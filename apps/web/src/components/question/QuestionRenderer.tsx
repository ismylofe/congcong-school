"use client";

/**
 * QuestionRenderer — 根據題型分發到對應的子元件。
 *
 * 設計：受控元件，父元件持有 currentAnswer 和 disabled 狀態。
 * 子元件負責呈現選項 / 輸入框，並在使用者操作時呼叫 onChange。
 */

import { NumberSenseQuestion } from "./NumberSenseQuestion";
import type { Question } from "@/types";
import { ChoiceQuestion } from "./ChoiceQuestion";
import { TrueFalseQuestion } from "./TrueFalseQuestion";
import { FillBlankQuestion } from "./FillBlankQuestion";
import { FillBlankTextQuestion } from "./FillBlankTextQuestion";
import { WordOrderQuestion } from "./WordOrderQuestion";
import { MatchingQuestion } from "./MatchingQuestion";

export type QuestionPhase = "answering" | "checked";

export interface QuestionRendererProps {
  question: Question;
  answer: string;
  phase: QuestionPhase;
  isCorrect: boolean | null;
  onChange: (value: string) => void;
  /**
   * 🔒 遮罩開啟時為 true（退出確認 / 斷心遮罩 / 設定彈層 / 課前講解）。
   * 各題型必須據此停掉鍵盤快捷鍵、點選與自動提交，避免使用者在彈層前面把題判掉。
   */
  locked?: boolean;
  visualDraft?: number[];
  onVisualDraft?: (ids: number[]) => void;
  hintLevel?: number;
  onHint?: () => void;
}

export function QuestionRenderer(props: QuestionRendererProps) {
  const { question } = props;

  if (question.numberTask) return <NumberSenseQuestion {...props} />;

  switch (question.type) {
    case "choice":
      return <ChoiceQuestion {...props} />;
    case "true_false":
      return <TrueFalseQuestion {...props} />;
    case "fill_blank":
    case "calculation":
    case "word_problem":
      return <FillBlankQuestion {...props} />;
    case "fill_blank_text":
      return <FillBlankTextQuestion {...props} />;
    case "word_order":
      return <WordOrderQuestion {...props} />;
    case "matching":
      return <MatchingQuestion {...props} />;
    default:
      return <div className="text-danger">未知題型: {question.type}</div>;
  }
}
