"use client";

import { useState, useCallback } from "react";
import { UploadedFile, FileStatus } from "../components/FileUploadZone";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PDF_MIME = "application/pdf";
const TXT_MIME = "text/plain";

// Максимальный размер файла: 50MB
const MAX_FILE_SIZE = 50 * 1024 * 1024;

interface UseDocumentUploadOptions {
  /** Допустимые MIME-типы */
  acceptedTypes: string[];
  /** Максимальный размер файла в байтах */
  maxSize?: number;
}

export function useDocumentUpload(options: UseDocumentUploadOptions) {
  const { acceptedTypes, maxSize = MAX_FILE_SIZE } = options;
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);

  const validateFile = useCallback(
    (file: File): { valid: boolean; error?: string } => {
      // Проверка размера
      if (file.size > maxSize) {
        return {
          valid: false,
          error: `Файл слишком большой (максимум ${Math.round(maxSize / 1024 / 1024)} MB)`,
        };
      }

      // Проверка типа
      // Браузеры могут возвращать пустой MIME-тип, поэтому проверяем и расширение
      const ext = file.name.split(".").pop()?.toLowerCase();
      const mimeTypeValid = acceptedTypes.includes(file.type);
      
      const extToMime: Record<string, string> = {
        docx: DOCX_MIME,
        pdf: PDF_MIME,
        txt: TXT_MIME,
      };
      
      const extValid = ext && acceptedTypes.includes(extToMime[ext] || "");

      if (!mimeTypeValid && !extValid) {
        const extensions = acceptedTypes.map((mime) => {
          if (mime === DOCX_MIME) return ".docx";
          if (mime === PDF_MIME) return ".pdf";
          if (mime === TXT_MIME) return ".txt";
          return "";
        }).filter(Boolean);
        
        return {
          valid: false,
          error: `Неподдерживаемый формат. Допустимые: ${extensions.join(", ")}`,
        };
      }

      return { valid: true };
    },
    [acceptedTypes, maxSize]
  );

  const handleFileSelect = useCallback(
    (file: File) => {
      // Сначала показываем файл в состоянии валидации
      setUploadedFile({
        file,
        status: "validating",
      });

      // Валидируем (в реальности может быть асинхронно, например, проверка на сервере)
      setTimeout(() => {
        const validation = validateFile(file);
        
        setUploadedFile({
          file,
          status: validation.valid ? "valid" : "invalid",
          error: validation.error,
        });
      }, 300); // Небольшая задержка для UX
    },
    [validateFile]
  );

  const handleFileRemove = useCallback(() => {
    setUploadedFile(null);
  }, []);

  const reset = useCallback(() => {
    setUploadedFile(null);
  }, []);

  return {
    uploadedFile,
    handleFileSelect,
    handleFileRemove,
    reset,
    isValid: uploadedFile?.status === "valid",
  };
}

/**
 * Конфигурации для разных типов документов
 */
export const SOURCE_DOCUMENT_CONFIG = {
  acceptedTypes: [DOCX_MIME],
  acceptedExtensions: [".docx"],
};

export const REQUIREMENTS_DOCUMENT_CONFIG = {
  acceptedTypes: [DOCX_MIME, PDF_MIME, TXT_MIME],
  acceptedExtensions: [".docx", ".pdf", ".txt"],
};

/** Общий конфиг для инструментов, принимающих текстовые документы (summarize, rewrite) */
export const TEXT_DOCUMENT_CONFIG = {
  acceptedTypes: [DOCX_MIME, PDF_MIME, TXT_MIME],
  acceptedExtensions: [".docx", ".pdf", ".txt"],
};
