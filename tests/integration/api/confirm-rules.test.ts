/**
 * Интеграционный тест: POST /api/confirm-rules.
 *
 * Проверяются три ветки: отказ при неверном статусе, постановка в очередь
 * воркера (202 и сохранённые правки правил) и синхронная обработка.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { DEFAULT_GOST_RULES } from "@/types/formatting-rules";

const job = {
  id: "job-1",
  status: "awaiting_confirmation",
  userId: undefined as string | undefined,
  sourceDocumentId: "src-1",
  rules: DEFAULT_GOST_RULES,
  statistics: { rulesConfidence: 0.7, rulesSource: "методичка" },
};

vi.mock("@/lib/storage/job-store", () => ({
  getJob: vi.fn(),
  updateJob: vi.fn().mockResolvedValue(undefined),
  updateJobProgress: vi.fn().mockResolvedValue(undefined),
  completeJob: vi.fn().mockResolvedValue({ id: "job-1" }),
  failJob: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/storage/file-storage", () => ({
  getFile: vi.fn().mockResolvedValue(Buffer.from("docx")),
  saveResultFile: vi.fn().mockResolvedValue(undefined),
  saveFullVersionFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/pipeline/document-analyzer", () => ({
  parseDocxStructure: vi.fn().mockResolvedValue({ paragraphs: [] }),
  enrichWithBlockMarkup: vi.fn().mockResolvedValue({
    paragraphs: [],
    markupDurationMs: 12,
    markupDegraded: false,
    markupDegradedChunks: 0,
  }),
  analyzeDocument: vi.fn().mockResolvedValue({
    violations: [{ id: "v1" }],
    statistics: { pageCount: 10 },
  }),
}));

vi.mock("@/lib/pipeline/document-formatter", () => ({
  formatDocument: vi.fn().mockResolvedValue({
    markedOriginal: Buffer.from("m"),
    formattedDocument: Buffer.from("f"),
  }),
}));

vi.mock("@/lib/payment/access", () => ({
  getUserAccess: vi.fn().mockResolvedValue({ accessType: "trial" }),
}));

vi.mock("@/lib/processing/mode", () => ({
  shouldQueueForWorker: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/lib/processing/enqueue", () => ({
  markJobQueued: vi.fn().mockResolvedValue(true),
}));

import { POST } from "@/app/api/confirm-rules/route";
import { getJob, updateJob, completeJob } from "@/lib/storage/job-store";
import { shouldQueueForWorker } from "@/lib/processing/mode";
import { markJobQueued } from "@/lib/processing/enqueue";
import { formatDocument } from "@/lib/pipeline/document-formatter";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest(
    new Request("http://localhost/api/confirm-rules", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    })
  );
}

const editedRules = {
  ...DEFAULT_GOST_RULES,
  text: { ...DEFAULT_GOST_RULES.text, fontSize: 13 },
};

describe("POST /api/confirm-rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getJob).mockResolvedValue(job as never);
    vi.mocked(shouldQueueForWorker).mockResolvedValue(false);
  });

  it("задача не в статусе awaiting_confirmation → 400", async () => {
    vi.mocked(getJob).mockResolvedValue({ ...job, status: "completed" } as never);

    const res = await POST(makeRequest({ jobId: "job-1" }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("неверном статусе");
    expect(formatDocument).not.toHaveBeenCalled();
  });

  it("режим воркера → 202, правки правил сохранены до захвата", async () => {
    vi.mocked(shouldQueueForWorker).mockResolvedValue(true);

    const res = await POST(makeRequest({ jobId: "job-1", rules: editedRules }));
    const body = await res.json();

    expect(res.status).toBe(202);
    expect(body).toMatchObject({ jobId: "job-1", status: "pending" });

    // Воркер читает правила из строки задачи, а не из тела запроса.
    expect(updateJob).toHaveBeenCalledWith("job-1", { rules: editedRules });
    expect(markJobQueued).toHaveBeenCalledWith("job-1", expect.stringContaining("очереди"));
    expect(formatDocument).not.toHaveBeenCalled();
  });

  it("инлайн-режим → 200 и завершённая задача", async () => {
    const res = await POST(makeRequest({ jobId: "job-1", rules: editedRules }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("completed");
    expect(body.violationsCount).toBe(1);
    expect(markJobQueued).not.toHaveBeenCalled();

    // Правки пользователя ушли в форматтер, метаданные разбора не затёрты.
    expect(vi.mocked(formatDocument).mock.calls[0][1]).toEqual(editedRules);
    expect(vi.mocked(completeJob).mock.calls[0][1].statistics).toMatchObject({
      pageCount: 10,
      rulesConfidence: 0.7,
      rulesSource: "методичка",
      markupTimeMs: 12,
    });
  });
});
