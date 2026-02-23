"use client";

import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { Upload, File, X, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export type FileStatus = "idle" | "validating" | "valid" | "invalid";

export interface UploadedFile {
  file: File;
  status: FileStatus;
  error?: string;
}

interface FileUploadZoneProps {
  label: string;
  description: string;
  acceptedTypes: string[];
  acceptedExtensions: string[];
  uploadedFile: UploadedFile | null;
  onFileSelect: (file: File) => void;
  onFileRemove: () => void;
  disabled?: boolean;
}

export function FileUploadZone({
  label,
  description,
  acceptedTypes,
  acceptedExtensions,
  uploadedFile,
  onFileSelect,
  onFileRemove,
  disabled = false,
}: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      if (disabled) return;

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        onFileSelect(files[0]);
      }
    },
    [disabled, onFileSelect]
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        onFileSelect(files[0]);
      }
      e.target.value = "";
    },
    [onFileSelect]
  );

  const getStatusIcon = (status: FileStatus) => {
    switch (status) {
      case "validating":
        return <Loader2 className="h-5 w-5 animate-spin text-on-surface-subtle" />;
      case "valid":
        return <CheckCircle className="h-5 w-5 text-emerald-400" />;
      case "invalid":
        return <AlertCircle className="h-5 w-5 text-red-400" />;
      default:
        return <File className="h-5 w-5 text-on-surface-subtle" />;
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-3">
      {label && <label className="text-sm font-medium text-foreground">{label}</label>}

      {!uploadedFile ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-all duration-300",
            isDragging
              ? "border-brand-1 border-solid bg-brand-2/10"
              : "border-surface-border hover:border-surface-border hover:bg-surface",
            disabled && "cursor-not-allowed opacity-50"
          )}
        >
          <div className="w-14 h-14 rounded-2xl bg-surface border border-surface-border flex items-center justify-center mb-4">
            <Upload className="h-6 w-6 text-on-surface-subtle" />
          </div>
          <p className="text-sm text-on-surface-muted text-center mb-3">
            Перетащите файл сюда или
          </p>
          <label className="cursor-pointer">
            <Button variant="secondary" size="sm" disabled={disabled} asChild>
              <span>Выберите файл</span>
            </Button>
            <input
              type="file"
              className="sr-only"
              accept={acceptedTypes.join(",")}
              onChange={handleFileInputChange}
              disabled={disabled}
            />
          </label>
          <p className="text-xs text-muted-foreground mt-4">
            {description}
          </p>
        </div>
      ) : (
        <div
          className={cn(
            "flex items-center gap-4 rounded-xl border p-4 transition-all duration-300",
            uploadedFile.status === "invalid"
              ? "border-red-500/30 bg-red-500/10 animate-shake"
              : uploadedFile.status === "valid"
              ? "border-emerald-500/30 bg-emerald-500/10"
              : "border-surface-border bg-surface"
          )}
        >
          <div className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center",
            uploadedFile.status === "valid" ? "bg-emerald-500/20" : 
            uploadedFile.status === "invalid" ? "bg-red-500/20" : "bg-surface-hover"
          )}>
            {getStatusIcon(uploadedFile.status)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {uploadedFile.file.name}
            </p>
            <p className="text-xs text-on-surface-subtle">
              {formatFileSize(uploadedFile.file.size)}
              {uploadedFile.error && (
                <span className="text-red-400 ml-2">
                  — {uploadedFile.error}
                </span>
              )}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onFileRemove}
            disabled={disabled}
            className="flex-shrink-0 hover:bg-surface-hover"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Форматы: {acceptedExtensions.join(", ")}
      </p>
    </div>
  );
}
