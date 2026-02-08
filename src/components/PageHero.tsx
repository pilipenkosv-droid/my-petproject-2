"use client";

import { ReactNode } from "react";
import { BackgroundBeams } from "@/components/ui/background-beams";

interface PageHeroProps {
  badge?: ReactNode;
  title: string;
  subtitle?: string;
  children?: ReactNode;
}

export function PageHero({ badge, title, subtitle, children }: PageHeroProps) {
  return (
    <div className="relative overflow-hidden min-h-[70vh] flex items-center justify-center">
      <div className="relative z-10 mx-auto max-w-4xl px-6 py-24 sm:py-32 text-center">
        {badge}
        <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-foreground mb-6">
          {title}
        </h1>
        {subtitle && (
          <p className="text-on-surface-muted text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed">
            {subtitle}
          </p>
        )}
        {children}
      </div>
      <BackgroundBeams />
    </div>
  );
}
