"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { Zap, Loader2 } from "lucide-react";

export function CtaButton({ className }: { className?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [clicked, setClicked] = useState(false);

  const loading = isPending || clicked;

  const handleClick = () => {
    setClicked(true);
    startTransition(() => {
      router.push("/create");
    });
  };

  return (
    <ShimmerButton
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
    </ShimmerButton>
  );
}
