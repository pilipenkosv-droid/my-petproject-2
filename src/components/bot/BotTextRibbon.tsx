"use client";

import { useEffect, useState } from "react";
import { TextRibbon } from "@/components/ui/text-ribbon";
import { Bot, Mic, Image, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

const BEFORE_TEXT =
  "лекция 14/03  эффект фрей...  куда записал??  личка + заметки в телефоне + ещё где-то  потерялось...";

const AFTER_TEXT =
  "14 марта · Эффект фрейминга · Каннеман, 1981 · /ask → мгновенно · архив структурирован · ничего не теряется";

// Цикл: mic → bot(think) → image → bot(think) → doc → bot(think) → ...
type Phase = "mic" | "image" | "doc" | "bot";

const CYCLE: { phase: Phase; duration: number }[] = [
  { phase: "mic", duration: 2000 },
  { phase: "bot", duration: 2500 },
  { phase: "image", duration: 2000 },
  { phase: "bot", duration: 2500 },
  { phase: "doc", duration: 2000 },
  { phase: "bot", duration: 2500 },
];

function AnimatedBotBadge() {
  const [step, setStep] = useState(0);
  const current = CYCLE[step % CYCLE.length];

  useEffect(() => {
    const timer = setTimeout(() => {
      setStep((s) => (s + 1) % CYCLE.length);
    }, current.duration);
    return () => clearTimeout(timer);
  }, [step, current.duration]);

  const isBot = current.phase === "bot";

  const iconClass = (active: boolean) =>
    cn(
      "w-6 h-6 sm:w-7 sm:h-7 text-background absolute transition-all duration-500 ease-out",
      active ? "opacity-100 scale-100 rotate-0" : "opacity-0 scale-75 rotate-12"
    );

  return (
    <div className="relative">
      <div
        className="flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-foreground relative"
        style={{
          boxShadow: isBot
            ? "0 0 0 3px rgba(168,85,247,0.3), 0 0 20px 8px rgba(168,85,247,0.25)"
            : "0 4px 6px -1px rgba(0,0,0,0.1)",
          animation: isBot ? "bot-pulse 2s ease-in-out infinite" : "none",
        }}
      >
        <Mic className={iconClass(current.phase === "mic")} />
        <Image className={iconClass(current.phase === "image")} />
        <FileText className={iconClass(current.phase === "doc")} />
        <Bot className={iconClass(isBot)} />
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes bot-pulse {
          0%, 100% {
            box-shadow: 0 0 0 3px rgba(168,85,247,0.2), 0 0 14px 4px rgba(168,85,247,0.15);
          }
          50% {
            box-shadow: 0 0 0 5px rgba(168,85,247,0.35), 0 0 28px 10px rgba(168,85,247,0.3);
          }
        }
      `}} />
    </div>
  );
}

export function BotTextRibbon() {
  return (
    <section className="relative -mt-8 sm:-mt-12">
      <TextRibbon
        beforeText={BEFORE_TEXT}
        afterText={AFTER_TEXT}
        centerIcon={<AnimatedBotBadge />}
        beforeSpeed={35}
        afterSpeed={45}
      />
    </section>
  );
}
