import { NextRequest, NextResponse } from "next/server";
import { getJob, updateJob, updateJobProgress, failJob, type JobState } from "@/lib/storage/job-store";
import { getFile } from "@/lib/storage/file-storage";
import { AccessType } from "@/lib/pipeline/document-formatter";
import { FormattingRules } from "@/types/formatting-rules";
import { getUserAccess } from "@/lib/payment/access";
import { processConfirmRulesJob } from "@/lib/processing/confirm-rules-job";
import { shouldQueueForWorker } from "@/lib/processing/mode";
import { markJobQueued } from "@/lib/processing/enqueue";

export const maxDuration = 60; // Vercel Hobby cap = 60s (было 300 на Pro)

type ResolveResult =
  | { ok: true; job: JobState; rules: FormattingRules; sourceDocumentId: string }
  | { ok: false; response: NextResponse };

/** Проверки входа: задача существует, ждёт подтверждения и знает свои файлы. */
async function resolveTarget(
  jobId: string,
  updatedRules: FormattingRules | undefined
): Promise<ResolveResult> {
  const fail = (error: string, status: number): ResolveResult => ({
    ok: false,
    response: NextResponse.json({ error }, { status }),
  });

  const job = await getJob(jobId);
  if (!job) return fail("Задача не найдена", 404);
  if (job.status !== "awaiting_confirmation") {
    return fail(`Задача в неверном статусе: ${job.status}`, 400);
  }
  if (!job.sourceDocumentId) {
    return fail("Исходный документ не найден в задаче", 400);
  }

  // Используем обновлённые правила или сохранённые ранее
  const rules = updatedRules || job.rules;
  if (!rules) return fail("Правила форматирования не найдены", 400);

  return { ok: true, job, rules, sourceDocumentId: job.sourceDocumentId };
}

/**
 * Второй этап: подтверждение правил и обработка документа
 * Получает jobId и опционально отредактированные правила
 */
export async function POST(request: NextRequest) {
  let jobId: string | undefined;
  // Дедлайн всего запроса: maxDuration = 60 с, 10 с оставляем на сохранение
  // результатов и ответ. AI-разметка не должна выедать этот запас.
  const deadline = Date.now() + 50_000;

  try {
    const body = await request.json();
    jobId = body.jobId;
    const updatedRules = body.rules as FormattingRules | undefined;

    if (!jobId) {
      return NextResponse.json({ error: "jobId обязателен" }, { status: 400 });
    }

    const target = await resolveTarget(jobId, updatedRules);
    if (!target.ok) return target.response;
    const { job, rules, sourceDocumentId } = target;

    // Режим очереди: документ форматирует воркер на VDS, роут отвечает сразу.
    // Правки пользователя должны лечь в строку до захвата: воркер читает
    // правила из job, а не из тела запроса. Не встала в очередь — инлайн.
    if (await shouldQueueForWorker(jobId)) {
      await updateJob(jobId, { rules });
      if (await markJobQueued(jobId, "В очереди на форматирование")) {
        return NextResponse.json({ jobId, status: "pending" }, { status: 202 });
      }
    }

    // Определяем тип доступа пользователя для обрезки trial.
    // Анонимные (userId === null) остаются "trial".
    let userAccessType: AccessType = "trial";
    if (job.userId) {
      const access = await getUserAccess(job.userId);
      userAccessType = access.accessType;
    }

    // Получаем исходный документ из хранилища
    await updateJobProgress(jobId, "analyzing", 50, "Получение исходного документа");
    const sourceBuffer = await getFile(sourceDocumentId);
    if (!sourceBuffer) {
      await failJob(jobId, "Не удалось получить исходный документ");
      return NextResponse.json(
        { error: "Не удалось получить исходный документ" },
        { status: 500 }
      );
    }

    const { statistics, violationsCount } = await processConfirmRulesJob(
      jobId,
      sourceBuffer,
      rules,
      userAccessType,
      { deadline, priorStatistics: job.statistics }
    );

    return NextResponse.json({
      jobId,
      status: "completed",
      statistics,
      violationsCount,
    });

  } catch (error) {
    console.error("Confirm rules error:", error);

    const errorMessage = error instanceof Error ? error.message : "Неизвестная ошибка";

    // КРИТИЧЕСКИЙ FIX: помечаем job как failed, чтобы не зависал навечно
    if (jobId) {
      try {
        await failJob(jobId, errorMessage);
      } catch (failError) {
        console.error("Failed to mark job as failed:", failError);
      }
      // Возврата использования тут нет: этот роут ничего не списывает —
      // задачу создаёт /api/extract-rules, а списывают только /api/process и
      // /api/process-gost, каждый со своим возвратом.
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
