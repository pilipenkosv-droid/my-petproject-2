/**
 * Кастомные ошибки приложения
 */

export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "VALIDATION_ERROR", 400, details);
    this.name = "ValidationError";
  }
}

export class FileProcessingError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "FILE_PROCESSING_ERROR", 422, details);
    this.name = "FileProcessingError";
  }
}

export class AIError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "AI_ERROR", 500, details);
    this.name = "AIError";
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, "NOT_FOUND", 404);
    this.name = "NotFoundError";
  }
}

/**
 * Безопасное получение сообщения об ошибке
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof AppError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Произошла неизвестная ошибка";
}

/**
 * Получение кода ошибки для логирования
 */
export function getErrorCode(error: unknown): string {
  if (error instanceof AppError) {
    return error.code;
  }
  return "UNKNOWN_ERROR";
}

/**
 * Безопасный логгер ошибок (не выводит чувствительные данные)
 */
export function logError(error: unknown, context?: string): void {
  const message = getErrorMessage(error);
  const code = getErrorCode(error);
  
  // В production не логируем стектрейс и детали
  if (process.env.NODE_ENV === "production") {
    console.error(`[${code}] ${context ? `${context}: ` : ""}${message}`);
  } else {
    console.error(`[${code}] ${context ? `${context}: ` : ""}${message}`, error);
  }
}
