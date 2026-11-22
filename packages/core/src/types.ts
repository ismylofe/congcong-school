// ============================================================
// 題目相關
// ============================================================

export type QuestionType =
  | "true_false"
  | "choice"
  | "fill_blank"        // 數字鍵盤（數學 / 科學）
  | "calculation"       // 數字鍵盤（數學）
  | "fill_blank_text"   // 文字輸入（語文 / 英語 / 科學術語）
  | "word_order"        // 詞語排序（語文 / 英語）
  | "matching"          // 連線配對（語文 / 英語）
  | "word_problem";     // 歷史保留

export interface Question {
  /** Optional curated visual task; legacy questions remain unchanged. */
  numberTask?: import("./numberSense").NumberTask;
  id: number;
  type: QuestionType;
  score: number;
  difficulty: 1 | 2 | 3 | 4 | 5;
  knowledge_point: string;
  question: string;
  options: string[]; // 選擇題 4 項；其他為空
  answer: string;
  explanation: string;
  /** 題幹 / 選項 / 解析的 TTS 音訊相對路徑，由 build-data 注入 */
  audio?: {
    question?: string;
    options?: (string | null)[];
    explanation?: string;
  };
}

// ============================================================
// 單元 / 知識點 / 課程
// ============================================================

export interface KnowledgeSummary {
  point: string;
  core_concept: string;
  key_formula: string;
  common_mistakes: string[];
  tips: string;
  /** 各欄位的 TTS 音訊相對路徑 */
  audio?: {
    point?: string;
    core_concept?: string;
    key_formula?: string;
    tips?: string;
    common_mistakes?: (string | null)[];
  };
}

export interface QuizFile {
  textbook: string;
  unit: string;
  unit_number: number;
  unit_test: { title: string; total_score: number; time_minutes: number; questions: Question[] };
  exam: { title: string; total_score: number; time_minutes: number; questions: Question[] };
  knowledge_summary: KnowledgeSummary[];
}

/**
 * 一節"小課" = 一個知識點 + 該知識點對應的題目（5-7 道）
 * 這是多鄰國式的最小學習單位
 */
export interface Lesson {
  /** Extra practice retains pre-pilot questions without replacing the visual pilot. */
  legacyPracticeLessonId?: string;
  /** Original lesson whose questions this practice lesson preserves. */
  restoresLessonId?: string;
  id: string; // e.g. "g1up-u3-kp2"
  title: string; // 知識點名
  bookId: string; // "g1up"
  unitNumber: number;
  unitTitle: string;
  unitLabel?: string;
  kpIndex: number; // 在單元內的序號 (從 0 開始)
  kpTotal: number; // 本單元知識點總數
  questions: Question[];
  knowledge: KnowledgeSummary | null;
}

// ============================================================
// 教材 / 大綱
// ============================================================

export interface KnowledgePoint {
  name: string;
  description: string;
  difficulty: number;
  question_types: string[];
}

export interface Unit {
  unit_number: number;
  label?: string;
  title: string;
  knowledge_points: KnowledgePoint[];
  /**
   * 單元挑戰課 id（"{bookId}-u{n}-exam"），由 build-data 在該單元
   * exam 題數 ≥4 時注入；預設表示該單元沒有挑戰課。
   * iOS 容錯：outline 有此欄位但本地課程檔案缺失時，節點隱藏。
   */
  examLessonId?: string;
  /** 單元挑戰題目數（取 exam 全部，上限 15，超出均勻抽樣後的實際數） */
  examQuestionCount?: number;
}

export interface Outline {
  textbook: string;
  schoolSystem?: "6-3" | "5-4";
  publisherLabel?: string;
  sourceEdition?: string;
  sourcePrinting?: string;
  edition?: string;
  editionLabel?: string;
  supersedes?: string;
  /** Required edition readings; fail the build when the matching source pack is missing. */
  requiredPassageTitles?: string[];
  units: Unit[];
}

/**
 * 學科標識 —— 當前只有 math；未來新增 chinese/english/science 時保持同一 key。
 * 欄位在 Book 上為可選以便老資料降級到 "math"。
 */
export type SubjectId = "math" | "chinese" | "english" | "science";

export interface Book {
  id: string; // 'g3up'
  grade: number; // 1-6
  semester: "up" | "down"; // 上 / 下
  subject?: SubjectId; // 學科（未來多科支援）
  gradeName: string; // '三年級'
  semesterName: string; // '上冊'
  subjectName?: string; // '數學'（顯示用）
  textbookName: string; // '三年級上冊'
  fullName: string; // '人教版小學數學三年級上冊'
  schoolSystem?: "6-3" | "5-4";
  publisherLabel?: string;
  sourceEdition?: string;
  sourcePrinting?: string;
  editionLabel?: string;
  supersedes?: string;
  supersededBy?: string;
  activitiesCount?: number;
  unitsCount: number;
  lessonsCount: number;
  /** 該書是否有課文聽讀資料（由 build-data 注入） */
  hasPassages?: boolean;
  /** 該書是否有故事閱讀資料（由 build-data 注入） */
  hasStories?: boolean;
}

// ============================================================
// 課文聽讀（語文 / 英語）
// ============================================================

export type PassageKind =
  | "poem"
  | "ancient_poem"
  | "prose"
  | "story"
  | "song"
  | "dialogue";

export interface PassageSentence {
  text: string;
  /** TTS 音訊相對路徑，由 build-data 注入。未生成時為 undefined */
  audio?: string;
}

export interface Passage {
  id: string; // e.g. "chinese-g1up-p3"
  bookId: string;
  unitNumber: number | null;
  lessonNumber: number;
  title: string;
  kind: PassageKind;
  /** The textbook role is separate from literary genre. */
  curriculumRole?: "main" | "garden" | "writing_example" | "optional" | "revision";
  author?: string | null;
  language: "Chinese" | "English";
  sentences: PassageSentence[];
  /** Gemini 從頁首讀到的印刷頁碼（debug 用，前端一般不用）*/
  pageHint?: number | null;
  /** 應用 book-level offset 後的真實 PDF 物理頁 */
  pdfPage?: number | null;
  /**
   * 該篇課文對應的課本原頁 JPG 列表，按物理頁號升序。
   * 通常是 [pdfPage-1, pdfPage, pdfPage+1]，前端預設顯示 pdfPage 那張。
   */
  pageImages?: string[];
}

export interface BookPassages {
  bookId: string;
  subject: SubjectId;
  textbook: string;
  passages: Passage[];
}

// ============================================================
// 故事閱讀（LLM 生成的分級故事 + 閱讀理解題）
// ============================================================

export interface StoryQuestion {
  id: number;
  type: "true_false" | "choice" | "fill_blank_text";
  question: string;
  options: string[];
  answer: string;
  explanation: string;
  skill?: "retrieval" | "vocabulary" | "inference" | "structure" | "expression" | "evaluation";
  /** One-based sentence numbers; revealed only after answering. */
  evidence_sentence_indices?: number[];
  audio?: {
    question?: string;
    options?: (string | null)[];
    explanation?: string;
  };
}

export interface Story {
  id: string; // e.g. "chinese-g3up-s1"
  bookId: string;
  unitNumber: number;
  unitTitle: string;
  storyIndex: number;
  title: string;
  language: "Chinese" | "English";
  sentences: PassageSentence[];
  questions: StoryQuestion[];
  /** 故事配圖路徑（由 build-data 注入） */
  image?: string;
}

export interface BookStories {
  bookId: string;
  subject: SubjectId;
  textbook: string;
  stories: Story[];
}

// ============================================================
// 全站索引
// ============================================================

export interface SiteIndex {
  books: Book[];
  generatedAt: string;
  totalLessons: number;
  totalQuestions: number;
}

// ============================================================
// 使用者進度（localStorage）
// ============================================================

export interface LessonResult {
  lessonId: string;
  stars: 1 | 2 | 3;
  accuracy: number; // 0-1
  completedAt: string;
}

export interface UserProgress {
  xp: number;
  streak: number;
  lastActiveDate: string; // YYYY-MM-DD
  completedLessons: Record<string, LessonResult>;
  mistakesBank: { lessonId: string; question: Question }[];
}

// ============================================================
// 玩法 UI 域型別（被 Mascot / PathMap / chestLogic / mascotTriggers 共用）
// ============================================================

export type MascotMood =
  | "happy"
  | "cheer"
  | "sad"
  | "think"
  | "wave"
  | "surprise"
  | "proud"
  | "embarrassed";

export type MascotReaction = "correct" | "wrong" | "levelup" | null;

export interface PathLessonMeta {
  id: string;
  title: string;
  unitNumber: number;
  unitTitle: string;
  unitLabel?: string;
  kpIndex: number;
  kpTotal: number;
  questionCount: number;
}

export type LessonStatus = "completed" | "current" | "locked";
