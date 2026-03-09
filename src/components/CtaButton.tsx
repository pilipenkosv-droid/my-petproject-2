"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { BorderBeam } from "@/components/ui/border-beam";
import { Zap, Loader2 } from "lucide-react";

export function CtaButton({
  className,
  workType,
}: {
  className?: string;
  workType?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [clicked, setClicked] = useState(false);

  const loading = isPending || clicked;

  const handleClick = () => {
    setClicked(true);
    const url = workType ? `/create?type=${workType}` : "/create";
    startTransition(() => {
      router.push(url);
    });
  };

  return (
    <div className="relative inline-flex overflow-hidden rounded-lg">
      <Button
        size="lg"
        className={className}
        onClick={handleClick}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="w-5 h-5 mr-2 flex-shrink-0 animate-spin" />
        ) : (
          <Zap className="w-5 h-5 mr-2 flex-shrink-0" />
        )}
        {loading ? "Загрузка…" : "Начать форматирование"}
      </Button>
      {!loading && (
        <BorderBeam
          size={60}
          duration={4}
          colorFrom="hsl(var(--foreground))"
          colorTo="hsl(var(--muted-foreground))"
          borderWidth={1.5}
        />
      )}
    </div>
  );
}
