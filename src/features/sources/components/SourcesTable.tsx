"use client";

import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CheckCircle, AlertTriangle, ExternalLink } from "lucide-react";
import type { FormattedSource } from "@/lib/sources/types";

interface SourcesTableProps {
  sources: FormattedSource[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
}

export function SourcesTable({
  sources,
  selectedIds,
  onToggle,
  onToggleAll,
}: SourcesTableProps) {
  const allSelected = sources.length > 0 && selectedIds.size === sources.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < sources.length;

  return (
    <div className="space-y-3">
      {/* Select all row */}
      <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/50 border border-surface-border">
        <Checkbox
          checked={allSelected}
          ref={(el) => {
            if (el) {
              const input = el as unknown as HTMLButtonElement;
              input.dataset.indeterminate = someSelected ? "true" : "false";
            }
          }}
          onCheckedChange={onToggleAll}
          aria-label="Выбрать все"
        />
        <span className="text-sm text-muted-foreground">
          {selectedIds.size > 0
            ? `Выбрано: ${selectedIds.size} из ${sources.length}`
            : "Выбрать все"}
        </span>
      </div>

      {/* Sources list */}
      <div className="space-y-2">
        {sources.map((source, index) => (
          <SourceRow
            key={source.id}
            source={source}
            index={index + 1}
            selected={selectedIds.has(source.id)}
            onToggle={() => onToggle(source.id)}
          />
        ))}
      </div>
    </div>
  );
}

interface SourceRowProps {
  source: FormattedSource;
  index: number;
  selected: boolean;
  onToggle: () => void;
}

function SourceRow({ source, index, selected, onToggle }: SourceRowProps) {
  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
        selected
          ? "border-teal-500/30 bg-teal-500/5"
          : "border-surface-border bg-surface hover:bg-surface-hover"
      }`}
    >
      <Checkbox
        checked={selected}
        onCheckedChange={onToggle}
        className="mt-0.5"
        aria-label={`Выбрать источник ${index}`}
      />

      <span className="text-sm font-medium text-muted-foreground min-w-[1.5rem] mt-0.5">
        {index}.
      </span>

      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-sm text-foreground leading-relaxed break-words">
          {source.formatted}
        </p>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Relevance indicator */}
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1 text-xs">
                  {source.relevant ? (
                    <>
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-emerald-600 dark:text-emerald-400">
                        Релевантен
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-3.5 h-3.5 text-gray-400" />
                      <span className="text-muted-foreground">
                        Малорелевантен
                      </span>
                    </>
                  )}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p className="text-xs">{source.relevanceNote}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Year */}
          {source.raw.year && (
            <span className="text-xs text-muted-foreground">
              {source.raw.year} г.
            </span>
          )}

          {/* Source API badge */}
          <span className="text-xs text-muted-foreground opacity-60">
            {source.raw.source === "openalex" ? "OpenAlex" : "CrossRef"}
          </span>

          {/* DOI link */}
          {source.raw.doi && (
            <a
              href={`https://doi.org/${source.raw.doi}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400 hover:underline"
            >
              <ExternalLink className="w-3 h-3" />
              DOI
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
