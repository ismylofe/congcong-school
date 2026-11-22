import { promises as fs } from "fs";
import path from "path";
import type { Lesson, SiteIndex } from "@/types";
import type { PathLessonMeta } from "@/components/PathMap";
import { findChestAfterLesson } from "@/lib/chestLogic";
import LessonPageClient from "./LessonPageClient";

async function getIndex(): Promise<SiteIndex> {
  const p = path.join(process.cwd(), "public", "data", "index.json");
  return JSON.parse(await fs.readFile(p, "utf-8"));
}

interface OutlineFile {
  lessons: PathLessonMeta[];
  /** 單元挑戰課經由 units[].examLessonId 暴露（不進 lessons 普通節點） */
  units?: Array<{ unit_number: number; examLessonId?: string }>;
}

async function getOutline(bookId: string): Promise<OutlineFile> {
  const p = path.join(process.cwd(), "public", "data", "books", bookId, "outline.json");
  return JSON.parse(await fs.readFile(p, "utf-8"));
}

async function getLesson(bookId: string, lessonId: string): Promise<Lesson> {
  const p = path.join(process.cwd(), "public", "data", "books", bookId, "lessons", `${lessonId}.json`);
  return JSON.parse(await fs.readFile(p, "utf-8"));
}

export async function generateStaticParams() {
  const index = await getIndex();
  const params: { book: string; lesson: string }[] = [];
  for (const book of index.books) {
    const outline = await getOutline(book.id);
    for (const l of outline.lessons) {
      params.push({ book: book.id, lesson: l.id });
    }
    // ⚔️ 單元挑戰課（exam）也要預渲染
    for (const u of outline.units ?? []) {
      if (u.examLessonId) {
        params.push({ book: book.id, lesson: u.examLessonId });
      }
    }
  }
  return params;
}

export default async function LessonPage({
  params,
}: {
  params: Promise<{ book: string; lesson: string }>;
}) {
  const { book, lesson: lessonId } = await params;
  const [lesson, outline] = await Promise.all([
    getLesson(book, lessonId),
    getOutline(book),
  ]);
  // 本節課結束後是否緊跟一個寶箱 slot
  const chestSlot = findChestAfterLesson(book, outline.lessons, lessonId);
  const index = outline.lessons.findIndex(item => item.id === lessonId);
  const nextLessonId = index >= 0 ? outline.lessons[index + 1]?.id : undefined;
  return <LessonPageClient lesson={lesson} chestSlot={chestSlot} nextLessonId={nextLessonId} />;
}
