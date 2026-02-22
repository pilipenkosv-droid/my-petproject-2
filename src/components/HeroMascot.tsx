"use client";

import { useCallback, useState, useRef, useEffect } from "react";
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
  const [visible, setVisible] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Hide mascot when hero section scrolls out of view
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const burstId = Date.now();
    // Spawn fireflies at click position relative to viewport
    const x = e.clientX;
    const y = e.clientY;
    setBursts((prev) => [...prev, { id: burstId, flies: spawnFireflies(x, y) }]);

    setTimeout(() => {
      setBursts((prev) => prev.filter((b) => b.id !== burstId));
    }, 6000);
  }, []);

  return (
    <>
      {/* Invisible sentinel to detect when hero is in view */}
      <div ref={sentinelRef} className="absolute inset-0 pointer-events-none" aria-hidden="true" />

      {/* Fixed mascot — sticks to bottom-left of viewport while hero is visible */}
      <div
        ref={containerRef}
        onClick={handleClick}
        className={`hidden md:block fixed bottom-0 left-0 z-20 cursor-pointer select-none transition-opacity duration-500 ${
          visible ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
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

      {/* Fireflies overlay — fixed fullscreen, doesn't block clicks */}
      {bursts.length > 0 && (
        <div className="fixed inset-0 z-30 pointer-events-none overflow-hidden" aria-hidden="true">
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
