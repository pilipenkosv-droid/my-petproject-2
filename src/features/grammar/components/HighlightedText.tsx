"use client";

import { useMemo } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { GrammarError } from "@/lib/grammar/types";
import { ErrorPopover } from "./ErrorPopover";
import { getCategoryHighlight } from "./grammar-utils";

interface HighlightedTextProps {
  text: string;
  errors: GrammarError[];
  onApplyReplacement?: (errorId: string, replacement: string) => void;
}

/**
 * Рендерит текст с inline-подсветкой ошибок.
 * Клик по ошибке открывает Popover с описанием и заменами.
 */
export function HighlightedText({
  text,
  errors,
  onApplyReplacement,
}: HighlightedTextProps) {
  const segments = useMemo(() => buildSegments(text, errors), [text, errors]);

  if (errors.length === 0) {
    return (
      <div className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground bg-muted/50 rounded-lg p-4 max-h-[500px] overflow-y-auto">
        {text}
      </div>
    );
  }

  return (
    <div className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground bg-muted/50 rounded-lg p-4 max-h-[500px] overflow-y-auto">
      {segments.map((segment, i) => {
        if (segment.type === "text") {
          return <span key={i}>{segment.content}</span>;
        }

        const error = segment.error!;
        const highlightClass = getCategoryHighlight(error.category);

        return (
          <Popover key={error.id}>
            <PopoverTrigger asChild>
              <span
                className={`${highlightClass} rounded-sm px-0.5 -mx-0.5 inline`}
                role="button"
                tabIndex={0}
              >
                {segment.content}
              </span>
            </PopoverTrigger>
            <PopoverContent
              side="bottom"
              align="start"
              className="w-auto p-3"
            >
              <ErrorPopover
                error={error}
                onApplyReplacement={onApplyReplacement}
              />
            </PopoverContent>
          </Popover>
        );
      })}
    </div>
  );
}

// ── Построение сегментов ───────────────────────────────

interface TextSegment {
  type: "text";
  content: string;
  error?: undefined;
}

interface ErrorSegment {
  type: "error";
  content: string;
  error: GrammarError;
}

type Segment = TextSegment | ErrorSegment;

function buildSegments(text: string, errors: GrammarError[]): Segment[] {
  if (errors.length === 0) {
    return [{ type: "text", content: text }];
  }

  // Сортируем по offset и фильтруем перекрывающиеся
  const sorted = [...errors].sort((a, b) => a.offset - b.offset);
  const filtered = filterOverlapping(sorted);

  const segments: Segment[] = [];
  let cursor = 0;

  for (const error of filtered) {
    // Защита от невалидных offset
    if (error.offset < cursor || error.offset + error.length > text.length) {
      continue;
    }

    // Текст до ошибки
    if (error.offset > cursor) {
      segments.push({
        type: "text",
        content: text.slice(cursor, error.offset),
      });
    }

    // Ошибочный фрагмент
    segments.push({
      type: "error",
      content: text.slice(error.offset, error.offset + error.length),
      error,
    });

    cursor = error.offset + error.length;
  }

  // Оставшийся текст
  if (cursor < text.length) {
    segments.push({
      type: "text",
      content: text.slice(cursor),
    });
  }

  return segments;
}

/**
 * Убираем перекрывающиеся ошибки — оставляем первую
 */
function filterOverlapping(sorted: GrammarError[]): GrammarError[] {
  const result: GrammarError[] = [];
  let lastEnd = 0;

  for (const error of sorted) {
    if (error.offset >= lastEnd) {
      result.push(error);
      lastEnd = error.offset + error.length;
    }
  }

  return result;
}
