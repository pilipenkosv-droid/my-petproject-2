import { Sparkles } from "lucide-react";
import { TextRibbon } from "@/components/ui/text-ribbon";

const BEFORE_TEXT =
  "arial 12pt  одинарный интервал  ЗАГОЛОВОК КАПСОМ  нет абзаца  поля 10мм  шрифт неверный  нумерация с 1 стр";

const AFTER_TEXT =
  "Times New Roman · 14pt · интервал 1,5 · поля 30/20/15/15 мм · Заголовок по ГОСТу · отступ 1,25 см · нумерация с 3 стр";

export function TextRibbonSection() {
  return (
    <TextRibbon
      beforeText={BEFORE_TEXT}
      afterText={AFTER_TEXT}
      beforeSpeed={40}
      afterSpeed={50}
      centerIcon={
        <div className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 bg-foreground shadow-lg">
          <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-background" />
        </div>
      }
    />
  );
}
