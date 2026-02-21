"use client";

import { useCallback, useState, useRef } from "react";
import Image from "next/image";

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

export function HeroMascot() {
  const [bursts, setBursts] = useState<{ id: number; flies: Firefly[] }[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!container) return;

    // Get click position relative to the hero section (parent with relative)
    const section = container.closest("section");
    if (!section) return;

    const rect = section.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const burstId = Date.now();
    setBursts((prev) => [...prev, { id: burstId, flies: spawnFireflies(x, y) }]);

    setTimeout(() => {
      setBursts((prev) => prev.filter((b) => b.id !== burstId));
    }, 6000);
  }, []);

  return (
    <>
      {/* Clickable mascot */}
      <div
        ref={containerRef}
        onClick={handleClick}
        className="hidden md:block absolute bottom-0 left-0 z-20 cursor-pointer select-none"
      >
        <Image
          src="/mascot/hero-light.png"
          alt="Дипломированный диплодок — маскот Diplox"
          width={1536}
          height={1024}
          className="w-48 lg:w-64 xl:w-72 h-auto drop-shadow-2xl"
          priority
        />
      </div>

      {/* Fireflies overlay — covers hero section, doesn't block clicks */}
      {bursts.length > 0 && (
        <div className="absolute inset-0 z-30 pointer-events-none overflow-hidden" aria-hidden="true">
          {bursts.map((burst) =>
            burst.flies.map((f) => (
              <span
                key={`${burst.id}-${f.id}`}
                className="firefly-particle"
                style={{
                  left: f.x,
                  top: f.y,
                  width: f.size,
                  height: f.size,
                  "--drift-x": `${f.driftX}px`,
                  "--drift-y": `${f.driftY}px`,
                  "--duration": `${f.duration}s`,
                  "--delay": `${f.delay}s`,
                } as React.CSSProperties}
              />
            ))
          )}
        </div>
      )}
    </>
  );
}
