import { describe, it, expect } from "vitest";
import {
  newStoryQuiz,
  advanceStoryQuiz,
  visibleStoryEvidence,
  restoreStoryQuiz,
  storySessionKey,
} from "../storyQuiz";
import type { Story } from "../types";
const story = {
  id: "test-story",
  sentences: [{ text: "小鳥飛來了。" }, { text: "小鳥停在樹上。" }],
  questions: [
    {
      id: 1,
      type: "choice",
      question: "小鳥停在哪裡？",
      options: ["樹上", "河裡"],
      answer: "樹上",
      explanation: "第2句說明小鳥在樹上。",
      evidence_sentence_indices: [2, 2, 99, -1],
    },
    {
      id: 2,
      type: "fill_blank_text",
      question: "誰停在樹上？",
      options: [],
      answer: "小鳥",
      explanation: "原文寫的是小鳥。",
      evidence_sentence_indices: [1, 2],
    },
  ],
} as Story;
describe("story evidence and quiz continuity", () => {
  it("does not expose reference evidence before checking; selecting text preserves the answer", () => {
    let s = advanceStoryQuiz(newStoryQuiz(), { type: "start" }, story);
    s = advanceStoryQuiz(s, { type: "answer", value: "A" }, story);
    s = advanceStoryQuiz(s, { type: "evidence", sentence: 2 }, story);
    expect(s.answer).toBe("A");
    expect(s.evidence[1]).toEqual([2]);
    expect(visibleStoryEvidence(story, 0, false)).toEqual([]);
    s = advanceStoryQuiz(s, { type: "check" }, story);
    expect(visibleStoryEvidence(story, 0, s.checked)).toEqual([2]);
    expect(
      advanceStoryQuiz(s, { type: "evidence", sentence: 1 }, story),
    ).toEqual(s);
  });
  it("cannot double-count checks or skip a question with repeated next clicks", () => {
    let s = advanceStoryQuiz(newStoryQuiz(), { type: "start" }, story);
    s = advanceStoryQuiz(s, { type: "answer", value: "A" }, story);
    s = advanceStoryQuiz(s, { type: "check" }, story);
    s = advanceStoryQuiz(s, { type: "check" }, story);
    expect(s.correctIds).toEqual([1]);
    s = advanceStoryQuiz(s, { type: "next" }, story);
    s = advanceStoryQuiz(s, { type: "next" }, story);
    expect(s.index).toBe(1);
    expect(s.checked).toBe(false);
    s = advanceStoryQuiz(s, { type: "answer", value: "小鳥" }, story);
    s = advanceStoryQuiz(s, { type: "check" }, story);
    s = advanceStoryQuiz(s, { type: "next" }, story);
    expect(s.phase).toBe("result");
    expect(s.correctIds).toHaveLength(2);
    expect(advanceStoryQuiz(s, { type: "next" }, story)).toEqual(s);
  });
  it("restores a draft, evidence and checked feedback only for identical content", () => {
    let s = advanceStoryQuiz(newStoryQuiz(), { type: "start" }, story);
    s = advanceStoryQuiz(s, { type: "answer", value: "A" }, story);
    s = advanceStoryQuiz(s, { type: "evidence", sentence: 2 }, story);
    const raw = { contentKey: storySessionKey(story), state: s };
    expect(restoreStoryQuiz(raw, story)).toEqual(s);
    const revised = { ...story, sentences: [{ text: "小鳥在地上。" }] };
    expect(restoreStoryQuiz(raw, revised)).toEqual(newStoryQuiz());
    const media = {
      ...story,
      sentences: story.sentences.map((s) => ({ ...s, audio: "/new.mp3" })),
    };
    expect(restoreStoryQuiz(raw, media)).toEqual(s);
    expect(
      restoreStoryQuiz(
        { contentKey: raw.contentKey, state: { ...s, index: 99 } },
        story,
      ),
    ).toEqual(newStoryQuiz());
  });
});
