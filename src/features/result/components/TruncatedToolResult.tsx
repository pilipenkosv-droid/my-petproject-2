"use client";

import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics/events";
import { EmailGateModal } from "@/features/result/components/EmailGateModal";
import { ProUpsellBanner } from "@/features/result/components/ProUpsellBanner";

type ToolName = "rewrite" | "summarize" | "outline" | "ask-guidelines";

interface TruncatedToolResultProps {
  tool: ToolName;
  outputId: string;
  hiddenChars?: number;
  hiddenSections?: number;
}

export function TruncatedToolResult({
  tool,
  outputId,
  hiddenChars,
  hiddenSections,
}: TruncatedToolResultProps) {
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    trackEvent("tool_truncated_shown", {
      tool,
      hidden_chars: hiddenChars,
      hidden_sections: hiddenSections,
    });
    // fire once per outputId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outputId]);

  const hiddenLabel =
    typeof hiddenSections === "number"
      ? `Скрыто ${hiddenSections.toLocaleString("ru-RU")} разделов.`
      : typeof hiddenChars === "number"
        ? `Скрыто ${hiddenChars.toLocaleString("ru-RU")} символов.`
        : "Полная версия доступна по email или в Pro.";

  return (
    <div className="space-y-4">
      <div className="border border-dashed border-surface-border bg-muted/40 p-4 text-sm text-foreground/80 flex items-start gap-3">
        <Lock className="w-4 h-4 mt-0.5 shrink-0 text-foreground/60" />
        <div>
          <p className="font-medium text-foreground">Показано 50% результата</p>
          <p className="text-foreground/60 mt-0.5">{hiddenLabel}</p>
        </div>
      </div>

      <div className="flex justify-center">
        <Button onClick={() => setModalOpen(true)}>
          Получить полную версию по email
        </Button>
      </div>

      <ProUpsellBanner context="tool" />

      <EmailGateModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        source={{ kind: "tool", outputId, tool }}
      />
    </div>
  );
}
