import Link from 'next/link';
import { Mascot } from '@/components/Mascot';

export default function NotFound() {
  return <main className="min-h-screen bg-bg-soft flex flex-col items-center justify-center px-6 py-12 text-center">
    <Mascot size={128} mood="think" animate={false} />
    <h1 className="text-2xl font-extrabold text-ink mt-6">這頁走丟了</h1>
    <p className="text-sm text-ink-light leading-relaxed mt-3 max-w-xs">連結可能已更新。回到學習頁面，繼續剛才的學習吧。</p>
    <Link href="/" className="btn-chunky-primary mt-7">返回學習頁面</Link>
  </main>;
}
