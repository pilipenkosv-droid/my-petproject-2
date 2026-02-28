"use client";

import { useCallback, useState, useRef, useEffect } from "react";
import Image from "next/image";
import { X } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Firefly types & helpers                                           */
/* ------------------------------------------------------------------ */

interface Firefly {
  id: number;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
  driftX: number;
  driftY: number;
}

function spawnFireflies(originX: number, originY: number): Firefly[] {
  return Array.from({ length: 25 }, (_, i) => ({
    id: i,
    x: originX + (Math.random() - 0.5) * 120,
    y: originY + (Math.random() - 0.5) * 120,
    size: 3 + Math.random() * 5,
    duration: 2 + Math.random() * 3,
    delay: Math.random() * 0.6,
    driftX: (Math.random() - 0.5) * 350,
    driftY: -(80 + Math.random() * 280),
  }));
}

const MAX_BURSTS = 3;
const COOLDOWN_MS = 500;

/* ------------------------------------------------------------------ */
/*  Section → speech-bubble phrases                                   */
/* ------------------------------------------------------------------ */

const SECTION_BUBBLES: Record<string, string> = {
  "how-it-works": "Всего 4 шага — проще простого!",
  "before-after": "Почувствуй разницу!",
  tools: "Тут все инструменты собраны!",
  "pain-points": "Эти проблемы теперь в прошлом!",
  testimonials: "Смотри, что говорят ребята!",
  security: "Всё безопасно, не переживай!",
  cta: "Давай попробуем? Это быстро!",
};

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export function HeroMascot() {
  const [bursts, setBursts] = useState<{ id: number; flies: Firefly[] }[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [currentSection, setCurrentSection] = useState<string | null>(null);
  const [bubbleVisible, setBubbleVisible] = useState(false);
  const lastClickRef = useRef(0);

  /* ---------- restore dismiss state from sessionStorage ---------- */
  useEffect(() => {
    if (sessionStorage.getItem("mascot-dismissed") === "true") {
      setDismissed(true);
    }
  }, []);

  /* ---------- detect which section the mascot visually overlaps ---------- */
  useEffect(() => {
    if (dismissed) return;

    // The mascot's vertical midpoint is roughly 70% down the viewport
    // (it's fixed at bottom-0, image height ≈ 30% of viewport on xl).
    // We check which section contains that Y coordinate.
    let rafId = 0;

    const detect = () => {
      const probeY = window.innerHeight * 0.75;
      const sections = document.querySelectorAll<HTMLElement>("[data-section]");
      let found: string | null = null;

      for (const section of sections) {
        const rect = section.getBoundingClientRect();
        if (rect.top <= probeY && rect.bottom >= probeY) {
          found = section.getAttribute("data-section");
          break;
        }
      }

      setCurrentSection(found);
    };

    const onScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(detect);
    };

    // Initial check + listen for scroll
    detect();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafId);
    };
  }, [dismissed]);

  /* ---------- animate bubble in / out on section change ---------- */
  const bubbleText = currentSection
    ? (SECTION_BUBBLES[currentSection] ?? null)
    : null;

  useEffect(() => {
    if (bubbleText) {
      const t = setTimeout(() => setBubbleVisible(true), 150);
      return () => clearTimeout(t);
    }
    setBubbleVisible(false);
  }, [bubbleText]);

  /* ---------- firefly click + telegram easter egg ---------- */
  const handleClick = useCallback((e: React.MouseEvent) => {
    const now = Date.now();
    if (now - lastClickRef.current < COOLDOWN_MS) return;
    lastClickRef.current = now;

    setBursts((prev) => {
      if (prev.length >= MAX_BURSTS) return prev;

      const burstId = now;
      const newBursts = [
        ...prev,
        { id: burstId, flies: spawnFireflies(e.clientX, e.clientY) },
      ];

      setTimeout(() => {
        setBursts((p) => p.filter((b) => b.id !== burstId));
      }, 6000);

      return newBursts;
    });

    // Open Telegram sticker pack after the user sees the fireflies
    setTimeout(() => {
      window.open(
        "https://t.me/addstickers/DiploxDino_by_diploxsbot",
        "_blank",
        "noopener",
      );
    }, 1500);
  }, []);

  /* ---------- dismiss mascot ---------- */
  const handleDismiss = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissed(true);
    sessionStorage.setItem("mascot-dismissed", "true");
  }, []);

  /* ---------- render ---------- */
  return (
    <>
      {/* Fixed mascot — sticks to bottom-left of viewport */}
      {!dismissed && (
        <div className="hidden md:block fixed bottom-0 left-0 z-20 select-none group">
          {/* Speech bubble */}
          {bubbleText && (
            <div
              className={`mascot-bubble absolute bottom-full left-12 mb-2 max-w-[200px]
                transition-all duration-300 ease-out pointer-events-none
                ${
                  bubbleVisible
                    ? "opacity-100 translate-y-0 scale-100"
                    : "opacity-0 translate-y-2 scale-95"
                }
              `}
            >
              <div className="bg-surface border border-surface-border backdrop-blur-xl rounded-2xl rounded-bl-none px-4 py-3 shadow-lg">
                <p className="text-sm text-foreground leading-snug">
                  {bubbleText}
                </p>
              </div>
            </div>
          )}

          {/* Close (dismiss) button — visible on hover */}
          <button
            onClick={handleDismiss}
            className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full
              bg-surface/80 border border-surface-border backdrop-blur-sm
              flex items-center justify-center
              opacity-0 group-hover:opacity-100 transition-opacity duration-200
              hover:bg-surface-hover"
            aria-label="Скрыть маскот"
          >
            <X className="w-3.5 h-3.5 text-on-surface-muted" />
          </button>

          {/* Clickable mascot image */}
          <div onClick={handleClick} className="cursor-pointer">
            <Image
              src="/mascot/hero-light.png"
              alt="Дипломированный диплодок — маскот Diplox"
              width={1536}
              height={1024}
              className="w-48 lg:w-64 xl:w-72 h-auto drop-shadow-2xl"
              priority
            />
          </div>
        </div>
      )}

      {/* Fireflies overlay — fixed fullscreen, doesn't block clicks */}
      {bursts.length > 0 && (
        <div
          className="fixed inset-0 z-30 pointer-events-none overflow-hidden"
          aria-hidden="true"
        >
          {bursts.map((burst) =>
            burst.flies.map((f) => (
              <span
                key={`${burst.id}-${f.id}`}
                className="firefly-particle"
                style={
                  {
                    left: f.x,
                    top: f.y,
                    width: f.size,
                    height: f.size,
                    "--drift-x": `${f.driftX}px`,
                    "--drift-y": `${f.driftY}px`,
                    "--duration": `${f.duration}s`,
                    "--delay": `${f.delay}s`,
                  } as React.CSSProperties
                }
              />
            )),
          )}
        </div>
      )}
    </>
  );
}
