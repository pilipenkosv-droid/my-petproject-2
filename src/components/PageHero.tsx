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
    <div className="relative overflow-hidden">
      <div className="relative z-10 mx-auto max-w-4xl px-6 pt-16 pb-12 text-center">
        {badge}
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">
          {title}
        </h1>
        {subtitle && (
          <p className="text-white/60 text-lg max-w-xl mx-auto">
            {subtitle}
          </p>
        )}
        {children}
      </div>
      <BackgroundBeams />
    </div>
  );
}
