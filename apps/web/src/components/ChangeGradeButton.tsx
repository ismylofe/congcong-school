"use client";

/**
 * ChangeGradeButton —— 在 grade 頁頭部顯示的"切換年級"按鈕
 * 點選後清空 selectedGrade 並跳回 / ，觸發 GradePicker 重新選擇。
 */

import { useRouter } from "next/navigation";
import { useProgressStore } from "@/store/progress";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";

export function ChangeGradeButton() {
  const router = useRouter();
  const setSelectedGrade = useProgressStore(s => s.setSelectedGrade);

  return (
    <button
      type="button"
      onClick={() => {
        playSfx("tap");
        haptic("light");
        setSelectedGrade(null);
        router.push("/");
      }}
      className="ui-text-button text-secondary hover:underline"
    >
      切換年級
    </button>
  );
}
