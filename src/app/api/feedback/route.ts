/**
 * API endpoint для сбора обратной связи (CSAT)
 */

import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

interface FeedbackData {
  jobId: string;
  rating: number;
  feedback?: string;
  timestamp: string;
}

export async function POST(request: NextRequest) {
  try {
    const data: FeedbackData = await request.json();

    // Валидация
    if (!data.jobId || !data.rating || data.rating < 1 || data.rating > 5) {
      return NextResponse.json(
        { error: "Invalid feedback data" },
        { status: 400 }
      );
    }

    // Сохраняем feedback в файл (простое решение для MVP)
    // В продакшене можно использовать БД или аналитический сервис
    const feedbackDir = path.join(process.cwd(), ".data", "feedback");
    
    if (!existsSync(feedbackDir)) {
      await mkdir(feedbackDir, { recursive: true });
    }

    const feedbackFile = path.join(
      feedbackDir,
      `feedback-${Date.now()}-${data.jobId}.json`
    );

    await writeFile(feedbackFile, JSON.stringify(data, null, 2));

    console.log(`📊 CSAT Feedback received: ${data.rating}/5 for job ${data.jobId}`);
    if (data.feedback) {
      console.log(`   Comment: ${data.feedback.substring(0, 100)}${data.feedback.length > 100 ? '...' : ''}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving feedback:", error);
    return NextResponse.json(
      { error: "Failed to save feedback" },
      { status: 500 }
    );
  }
}
