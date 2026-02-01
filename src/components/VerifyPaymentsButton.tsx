"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

export function VerifyPaymentsButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleVerify = async () => {
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/payment/verify", { method: "POST" });
      const data = await res.json();

      if (data.verified > 0) {
        setResult(data.message);
        router.refresh();
      } else {
        setResult(data.message || "Оплаченных платежей не найдено");
      }
    } catch {
      setResult("Ошибка проверки");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleVerify}
        disabled={loading}
        className="text-white/50 hover:text-white"
      >
        <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
        {loading ? "Проверяю..." : "Проверить оплату"}
      </Button>
      {result && (
        <span className="text-xs text-white/50">{result}</span>
      )}
    </div>
  );
}
