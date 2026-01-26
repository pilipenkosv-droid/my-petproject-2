"use client";

import { DocumentViewer } from "./DocumentViewer";

interface DualDocumentViewProps {
  /** HTML-контент оригинального документа с пометками */
  originalHtml: string;
  /** HTML-контент отформатированного документа */
  formattedHtml: string;
  /** Индикатор загрузки */
  isLoading?: boolean;
}

export function DualDocumentView({
  originalHtml,
  formattedHtml,
  isLoading = false,
}: DualDocumentViewProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-[600px]">
      <DocumentViewer
        title="Исходный документ (с пометками)"
        htmlContent={originalHtml}
        isLoading={isLoading}
        accentColor="red"
      />
      <DocumentViewer
        title="Исправленный документ"
        htmlContent={formattedHtml}
        isLoading={isLoading}
        accentColor="green"
      />
    </div>
  );
}
