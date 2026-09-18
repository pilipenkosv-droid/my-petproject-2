/**
 * Этапы воркера: что происходит между захватом задачи и её результатом.
 *
 * Проверяются свойства, которые ломают пользователя молча: задача после
 * разбора методички не должна выглядеть захваченной, MIME методички не должен
 * зависеть от расширения имени, а классификация ошибок — от этапа.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createThenableSupabaseMock } from "../../mocks/supabase";
import { AIBudgetExceededError } from "@/lib/ai/gateway";
import { RulesExtractionError } from "@/lib/ai/provider";

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: vi.fn() }));

vi.mock("@/lib/storage/job-store", () => ({
  getJob: vi.fn().mockResolvedValue({ statistics: { rulesConfidence: 0.9 } }),
  updateJobProgress: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/storage/file-storage", () => ({
  getFile: vi.fn().mockResolvedValue(Buffer.from("guide")),
}));

vi.mock("@/lib/payment/access", () => ({
  getUserAccess: vi.fn().mockResolvedValue({ accessType: "trial" }),
}));

vi.mock("@/lib/processing/extract-rules-job", () => ({
  processExtractRulesJob: vi.fn().mockResolvedValue({
    rules: {},
    confidence: 0.9,
    warnings: [],
    missingRules: [],
  }),
}));

import { permanentStageMessage, releaseWorkerClaim, runStage } from "../../../ops/worker/stages";
import { processExtractRulesJob } from "@/lib/processing/extract-rules-job";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { JobState } from "@/lib/storage/job-store";

const mockGetSupabaseAdmin = vi.mocked(getSupabaseAdmin);
type Admin = ReturnType<typeof getSupabaseAdmin>;

function extractJob(overrides: Partial<JobState> = {}): JobState {
  return {
    id: "job-1",
    status: "pending",
    progress: 15,
    statusMessage: "В очереди",
    requirementsMode: "upload",
    requirementsDocumentId: "req-1",
    requirementsOriginalName: "download",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as JobState;
}

function context(job: JobState) {
  return { jobId: "job-1", job, stage: "extract-rules" as const, isShadow: false, log: () => {} };
}

beforeEach(() => vi.clearAllMocks());

describe("этап extract-rules", () => {
  it("снимает признаки захвата: задача ждёт пользователя, а не воркер", async () => {
    const supabase = createThenableSupabaseMock({ jobs: [{ data: null, error: null }] });
    mockGetSupabaseAdmin.mockReturnValue(supabase as unknown as Admin);

    await runStage(context(extractJob({ statistics: { requirementsMimeType: "text/plain" } as never })));

    const update = supabase.calls["jobs.update"].mock.calls[0][0] as Record<string, unknown>;
    expect(update).toEqual({
      worker_id: null,
      worker_claimed_at: null,
      worker_heartbeat_at: null,
    });
    // Статус не трогаем: его выставил сам разбор методички.
    expect(update.status).toBeUndefined();
  });

  it("MIME берётся из задачи, а не из расширения имени файла", async () => {
    const supabase = createThenableSupabaseMock({ jobs: [{ data: null, error: null }] });
    mockGetSupabaseAdmin.mockReturnValue(supabase as unknown as Admin);

    await runStage(context(extractJob({ statistics: { requirementsMimeType: "application/pdf" } as never })));

    expect(vi.mocked(processExtractRulesJob).mock.calls[0][2]).toBe("application/pdf");
  });

  it("без сохранённого MIME — откат на расширение имени", async () => {
    const supabase = createThenableSupabaseMock({ jobs: [{ data: null, error: null }] });
    mockGetSupabaseAdmin.mockReturnValue(supabase as unknown as Admin);

    await runStage(context(extractJob({ requirementsOriginalName: "guide.docx" })));

    expect(vi.mocked(processExtractRulesJob).mock.calls[0][2]).toContain("wordprocessingml");
  });
});

describe("releaseWorkerClaim", () => {
  it("ошибка UPDATE не роняет обработку", async () => {
    const supabase = createThenableSupabaseMock({
      jobs: [{ data: null, error: { message: "boom" } }],
    });
    mockGetSupabaseAdmin.mockReturnValue(supabase as unknown as Admin);

    await expect(releaseWorkerClaim("job-1")).resolves.toBeUndefined();
  });
});

describe("permanentStageMessage", () => {
  it("отказ разбора методички терминален на любом этапе", () => {
    const error = new RulesExtractionError("timeout", "no answer");
    expect(permanentStageMessage(error, "extract-rules")).toContain("методички");
    expect(permanentStageMessage(error, "gost")).toContain("методички");
  });

  it("исчерпанный бюджет AI терминален только на разборе методички", () => {
    const error = new AIBudgetExceededError("Бюджет AI-запроса исчерпан");
    expect(permanentStageMessage(error, "extract-rules")).toContain("выберите ГОСТ");
    // На ГОСТе и форматировании задача должна сохранить право на повтор.
    expect(permanentStageMessage(error, "gost")).toBeUndefined();
    expect(permanentStageMessage(error, "confirm-rules")).toBeUndefined();
  });

  it("обычная ошибка — не наш случай", () => {
    expect(permanentStageMessage(new Error("fetch failed"), "gost")).toBeUndefined();
  });
});
