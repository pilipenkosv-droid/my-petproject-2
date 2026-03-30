import { NextResponse } from "next/server";
import { searchSources } from "@/lib/sources/search";

export const maxDuration = 60;

const VALID_COUNTS = [5, 10, 15, 20];

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { topic, workType, count } = body;

    // Валидация
    if (!topic || typeof topic !== "string") {
      return NextResponse.json(
        { error: "Укажите тему работы" },
        { status: 400 }
      );
    }

    const trimmed = topic.trim();
    if (trimmed.length < 5) {
      return NextResponse.json(
        { error: "Тема должна содержать не менее 5 символов" },
        { status: 400 }
      );
    }

    if (trimmed.length > 500) {
      return NextResponse.json(
        { error: "Тема не должна превышать 500 символов" },
        { status: 400 }
      );
    }

    if (!workType || typeof workType !== "string") {
      return NextResponse.json(
        { error: "Укажите тип работы" },
        { status: 400 }
      );
    }

    const sourceCount =
      typeof count === "number" && VALID_COUNTS.includes(count) ? count : 10;

    const result = await searchSources({
      topic: trimmed,
      workType,
      count: sourceCount,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[find-sources] Error:", error);

    return NextResponse.json(
      { error: "Извините, сервис временно недоступен. Мы уже работаем над этим. Попробуйте через пару минут." },
      { status: 503 }
    );
  }
}
