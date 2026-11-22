import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { NumberSenseProgress } from "@/components/NumberSenseProgress";
import { ComingSoonPage } from "@/components/ComingSoonPage";
import { isNumberSensePublished, NUMBER_SENSE_BOOK_ID } from "@/lib/numberSensePublished";
export default async function NumberSensePage() {
  // 預設只上架台灣版教材時，示範單元依附的 g1up 不存在 → 顯示「即將推出」
  if (!(await isNumberSensePublished())) return <ComingSoonPage title="數一數、比一比" />;
  return (
    <AppShell right={null} centerMaxWidth={760}>
      <main className="px-4 py-4 sm:py-6">
        <Link
          className="min-h-11 inline-flex items-center font-bold text-secondary-dark mb-2"
          href={`/book/${NUMBER_SENSE_BOOK_ID}/`}
        >
          ← 回到一年級數學
        </Link>
        <h1 className="text-3xl font-extrabold text-ink mb-3">
          一起數一數、比一比
        </h1>
        <p className="text-base text-ink-light mb-5">
          用小物體動手試，可以看提示，也可以放心改錯。這三節練習不扣紅心。
        </p>
        <NumberSenseProgress expanded />
        <section className="ui-card rounded-2xl bg-bg-soft p-4 text-ink">
          <h2 className="font-extrabold text-lg">學完，和家人一起試試</h2>
          <p className="mt-2 leading-loose">
            數數桌上的物品，把它們擺開後再數。再給每個人分一件，看看夠不夠。
          </p>
          <p className="mt-2 text-sm text-ink-light">
            「能獨立做」是看這次沒看提示的第一次作答；「隔天仍會」要等隔天用新題檢查。學習記錄只存在這台裝置，可以在「我的」裡備份。
          </p>
        </section>
      </main>
    </AppShell>
  );
}
