"use client";

import { useEffect, useState } from "react";
import { Loader2, FileText } from "lucide-react";

interface DocumentViewerProps {
  title: string;
  htmlContent?: string;
  htmlUrl?: string;
  isLoading?: boolean;
  accentColor?: "red" | "green";
}

export function DocumentViewer({
  title,
  htmlContent,
  htmlUrl,
  isLoading = false,
  accentColor,
}: DocumentViewerProps) {
  const [content, setContent] = useState(htmlContent || "");
  const [loading, setLoading] = useState(isLoading);

  useEffect(() => {
    if (htmlUrl && !htmlContent) {
      setLoading(true);
      fetch(htmlUrl)
        .then((res) => res.text())
        .then((html) => {
          setContent(html);
          setLoading(false);
        })
        .catch(() => {
          setContent("<p>Ошибка загрузки документа</p>");
          setLoading(false);
        });
    }
  }, [htmlUrl, htmlContent]);

  useEffect(() => {
    if (htmlContent) {
      setContent(htmlContent);
    }
  }, [htmlContent]);

  useEffect(() => {
    setLoading(isLoading);
  }, [isLoading]);

  const accentStyles = {
    red: {
      border: "border-l-4 border-l-red-500",
      dot: "bg-gradient-to-br from-red-500 to-rose-600",
    },
    green: {
      border: "border-l-4 border-l-emerald-500",
      dot: "bg-gradient-to-br from-emerald-500 to-teal-600",
    },
  };

  const accent = accentColor ? accentStyles[accentColor] : null;

  const isEmpty = !content || content.trim() === "" || content.includes("Не удалось загрузить");

  return (
    <div className={`h-full flex flex-col rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl overflow-hidden ${accent?.border || ""}`}>
      <div className="flex-shrink-0 px-5 py-4 border-b border-white/10">
        <h3 className="text-base font-semibold text-white flex items-center gap-2">
          {accent && (
            <span className={`w-3 h-3 rounded-full ${accent.dot}`} />
          )}
          {title}
        </h3>
      </div>
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-white/50" />
            <p className="text-sm text-white/40">Загрузка превью...</p>
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
            <FileText className="h-12 w-12 text-white/20" />
            <p className="text-sm text-white/40">
              Скачайте документ для просмотра полного содержимого
            </p>
          </div>
        ) : (
          <div className="h-full overflow-auto">
            {/* Имитация страницы Word */}
            <div className="min-h-full bg-gradient-to-b from-slate-800/50 to-slate-900/50 p-4">
              <div className="mx-auto max-w-[21cm] bg-white shadow-2xl rounded-sm">
                <div 
                  className="document-page p-[2cm] min-h-[29.7cm]"
                  dangerouslySetInnerHTML={{ __html: content }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
      <style jsx global>{`
        .document-page {
          font-family: "Times New Roman", Georgia, serif;
          font-size: 14pt;
          line-height: 1.5;
          color: #1a1a1a;
          background: white;
        }
        
        .document-page p {
          margin-bottom: 0;
          margin-top: 0;
          text-indent: 1.25cm;
          text-align: justify;
          min-height: 1.5em;
        }
        
        .document-page p:first-child {
          text-indent: 0;
        }
        
        .document-page h1 {
          font-size: 16pt;
          font-weight: bold;
          text-transform: uppercase;
          text-align: center;
          text-indent: 0;
          margin: 24pt 0 12pt 0;
          color: #000;
        }
        
        .document-page h2 {
          font-size: 14pt;
          font-weight: bold;
          text-align: left;
          text-indent: 0;
          margin: 18pt 0 6pt 0;
          color: #000;
        }
        
        .document-page h3 {
          font-size: 14pt;
          font-weight: bold;
          font-style: italic;
          text-align: left;
          text-indent: 0;
          margin: 12pt 0 6pt 0;
          color: #000;
        }
        
        .document-page h4 {
          font-size: 14pt;
          font-weight: normal;
          font-style: italic;
          text-align: left;
          text-indent: 0;
          margin: 12pt 0 6pt 0;
          color: #000;
        }
        
        .document-page ul, .document-page ol {
          margin: 6pt 0;
          padding-left: 1.25cm;
        }
        
        .document-page li {
          margin-bottom: 3pt;
          text-indent: 0;
        }
        
        .document-page table {
          width: 100%;
          border-collapse: collapse;
          margin: 12pt 0;
        }
        
        .document-page th, .document-page td {
          border: 1px solid #000;
          padding: 6pt 8pt;
          text-align: left;
          text-indent: 0;
        }
        
        .document-page th {
          font-weight: bold;
          background: #f5f5f5;
        }
        
        .document-page img {
          max-width: 100%;
          height: auto;
          display: block;
          margin: 12pt auto;
        }
        
        .document-page strong, .document-page b {
          font-weight: bold;
        }
        
        .document-page em, .document-page i {
          font-style: italic;
        }
        
        .document-page mark.error {
          background-color: rgba(239, 68, 68, 0.3);
          padding: 1px 4px;
          border-radius: 2px;
          color: #b91c1c;
        }
        
        .document-page mark.success {
          background-color: rgba(34, 197, 94, 0.3);
          padding: 1px 4px;
          border-radius: 2px;
          color: #15803d;
        }
        
        .document-page blockquote {
          margin: 12pt 1.25cm;
          padding-left: 12pt;
          border-left: 3px solid #ccc;
          font-style: italic;
          color: #555;
        }
        
        .document-page hr {
          border: none;
          border-top: 1px solid #ccc;
          margin: 18pt 0;
        }
        
        .document-page .document-content > p:first-child {
          text-indent: 1.25cm;
        }
      `}</style>
    </div>
  );
}
