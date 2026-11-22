import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";

/** 尚未上架的功能頁：顯示「即將推出」並提供回首頁的按鈕，避免死連結。 */
export function ComingSoonPage({ title }: { title: string }) {
  return (
    <AppShell right={null} centerMaxWidth={760}>
      <main className="px-4 py-16 flex flex-col items-center text-center">
        <h1 className="text-3xl font-extrabold text-ink mb-3">即將推出</h1>
        <p className="text-base text-ink-light mb-8">「{title}」正在準備中，敬請期待。</p>
        <Link className="btn-chunky-primary px-8" href="/">
          回首頁
        </Link>
      </main>
    </AppShell>
  );
}
