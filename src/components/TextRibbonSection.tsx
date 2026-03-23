import { TextRibbon } from "@/components/ui/text-ribbon";
import { Sparkles } from "lucide-react";

const BEFORE_TEXT =
  "arial 12pt  одинарный интервал  ЗАГОЛОВОК КАПСОМ  нет абзаца  поля 10мм  шрифт неверный  нумерация с 1 стр";

const AFTER_TEXT =
  "Times New Roman · 14pt · интервал 1,5 · поля 30/20/15/15 мм · Заголовок по ГОСТу · отступ 1,25 см · нумерация с 3 стр";

function CenterBadge() {
  return (
    <div className="flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-foreground shadow-lg">
      <Sparkles className="w-6 h-6 sm:w-7 sm:h-7 text-background" />
    </div>
  );
}

export function TextRibbonSection() {
  return (
    <section className="relative -mt-8 sm:-mt-12">
      <TextRibbon
        beforeText={BEFORE_TEXT}
        afterText={AFTER_TEXT}
        centerIcon={<CenterBadge />}
        beforeSpeed={40}
        afterSpeed={50}
      />
    </section>
  );
}
