/**
 * Интеграционный тест: POST /api/extract-rules при провале извлечения.
 * Главное свойство — пользователь не получает ГОСТ под видом своих правил:
 * job падает с понятным текстом, ответ 422.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/storage/job-store", () => ({
  createJob: vi.fn().mockResolvedValue(undefined),
  updateJobProgress: vi.fn().mockResolvedValue(undefined),
  updateJob: vi.fn().mockResolvedValue(undefined),
  failJob: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/storage/file-storage", () => ({
  saveFile: vi.fn().mockResolvedValue({ id: "file-1" }),
}));

vi.mock("@/lib/pipeline/text-extractor", () => ({
  extractText: vi.fn().mockResolvedValue("Т".repeat(200)),
  isValidSourceDocument: () => true,
  isValidRequirementsDocument: () => true,
  getMimeTypeByExtension: () => "text/plain",
}));

vi.mock("@/lib/auth/api-auth", () => ({
  checkProcessingAccess: vi.fn().mockResolvedValue({ type: "anonymous" }),
}));

vi.mock("@/lib/auth/trial", () => ({ markTrialUsed: vi.fn() }));

vi.mock("@/lib/ai/gateway", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/gateway")>();
  return { ...actual, warmupModels: vi.fn().mockResolvedValue({ total: 0, alive: [], dead: [] }) };
});

vi.mock("@/lib/ai/provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/provider")>();
  return { ...actual, parseFormattingRules: vi.fn() };
});

import { POST } from "@/app/api/extract-rules/route";
import { failJob, updateJob } from "@/lib/storage/job-store";
import { parseFormattingRules, RulesExtractionError } from "@/lib/ai/provider";

function makeRequest() {
  const form = new FormData();
  form.append("sourceDocument", new File(["x"], "work.docx"));
  form.append("requirementsDocument", new File(["y"], "guide.docx"));
  form.append("workType", "diploma");
  return new NextRequest(
    new Request("http://localhost/api/extract-rules", { method: "POST", body: form })
  );
}

describe("POST /api/extract-rules", () => {
  beforeEach(() => vi.clearAllMocks());

  it("RulesExtractionError → 422, failJob с понятным текстом, правила не сохраняются", async () => {
    vi.mocked(parseFormattingRules).mockRejectedValue(
      new RulesExtractionError("schema_mismatch", "ZodError: rules.text")
    );

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.reason).toBe("schema_mismatch");
    expect(body.error).toContain("Не удалось извлечь правила из методички");
    expect(body.error).not.toContain("ZodError");

    expect(failJob).toHaveBeenCalledWith(expect.any(String), expect.stringContaining("методички"));
    // Ни одного обновления со статусом awaiting_confirmation и правилами.
    for (const call of vi.mocked(updateJob).mock.calls) {
      expect(call[1].rules).toBeUndefined();
    }
  });

  it("успех → правила и метаданные извлечения пишутся в statistics", async () => {
    vi.mocked(parseFormattingRules).mockResolvedValue({
      rules: { text: { fontSize: 13 } },
      confidence: 0.8,
      warnings: [],
      missingRules: [],
      normalized: true,
      retriedCompact: false,
      droppedChars: 1200,
    } as never);

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.rules.text.fontSize).toBe(13);
    // Дефолты закрыли пробелы, но шрифт остался из методички.
    expect(body.rules.text.fontFamily).toBe("Times New Roman");

    const saved = vi.mocked(updateJob).mock.calls.find((c) => c[1].status === "awaiting_confirmation");
    expect(saved?.[1].statistics).toMatchObject({
      rulesConfidence: 0.8,
      rulesSource: "методичка",
      rulesNormalized: true,
      rulesDroppedChars: 1200,
    });
  });
});
