// A4 regression: paid full versions (results/<jobId>/{original,formatted}_full.docx)
// must survive the 48h sweep and only be swept on the 30-day job TTL — otherwise
// /api/download/[fileId] silently serves the truncated trial file to a paying user.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

// cleanupOldFiles остаётся настоящей (тесты ниже проверяют её саму), но обёрнута
// в spy — тест runCleanup подменяет реализацию, чтобы проверить именно проводку.
vi.mock("@/lib/storage/file-storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage/file-storage")>();
  return { ...actual, cleanupOldFiles: vi.fn(actual.cleanupOldFiles) };
});

// runCleanup дёргает ещё три источника — в этом файле они не интересны.
vi.mock("@/lib/storage/job-store", () => ({
  cleanupOldJobs: vi.fn().mockResolvedValue(0),
}));
vi.mock("@/lib/storage/job-stuck", () => ({
  resetStuckJobs: vi.fn().mockResolvedValue(0),
}));
vi.mock("@/lib/storage/retention", () => ({
  cleanupRetentionTables: vi.fn().mockResolvedValue({}),
}));

import { cleanupOldFiles } from "@/lib/storage/file-storage";
import { runCleanup } from "@/lib/storage/cleanup";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const mockGetSupabaseAdmin = vi.mocked(getSupabaseAdmin);
const mockCleanupOldFiles = vi.mocked(cleanupOldFiles);

const NOW = Date.now();
const hoursAgo = (h: number) => new Date(NOW - h * 60 * 60 * 1000).toISOString();
const daysAgo = (d: number) => hoursAgo(d * 24);

// Fixed dataset simulating what the `list_old_storage_objects` RPC would
// return for the "results" bucket, before any cutoff filtering.
const RESULTS_OBJECTS = [
  { name: "job1/formatted.docx", updated_at: hoursAgo(72) }, // plain result, older than 48h
  { name: "job1/formatted_full.docx", updated_at: hoursAgo(30) }, // full version, young (<30d)
  { name: "job2/formatted_full.docx", updated_at: daysAgo(40) }, // full version, old (>30d)
];

function makeSupabaseMock() {
  const removeCalls: { bucket: string; paths: string[] }[] = [];
  const supabase = {
    rpc: vi.fn((fn: string, params: { p_bucket: string; p_cutoff: string }) => {
      if (fn !== "list_old_storage_objects") return Promise.resolve({ data: [], error: null });
      const cutoff = new Date(params.p_cutoff).getTime();
      const source = params.p_bucket === "results" ? RESULTS_OBJECTS : [];
      const data = source.filter((o) => new Date(o.updated_at).getTime() < cutoff);
      return Promise.resolve({ data, error: null });
    }),
    storage: {
      from: vi.fn((bucket: string) => ({
        remove: vi.fn((paths: string[]) => {
          removeCalls.push({ bucket, paths });
          return Promise.resolve({ error: null });
        }),
      })),
    },
  };
  return { supabase, removeCalls };
}

describe("cleanupOldFiles — full-version exclusion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("48h sweep with excludePattern deletes the plain result but not any _full.docx", async () => {
    const { supabase, removeCalls } = makeSupabaseMock();
    mockGetSupabaseAdmin.mockReturnValue(supabase as unknown as ReturnType<typeof getSupabaseAdmin>);

    const deleted = await cleanupOldFiles(48 * 60 * 60 * 1000, { excludePattern: /_full\.docx$/ });

    expect(deleted).toBe(1);
    const resultsRemoves = removeCalls.filter((c) => c.bucket === "results").flatMap((c) => c.paths);
    expect(resultsRemoves).toEqual(["job1/formatted.docx"]);
  });

  it("30-day sweep with includePattern deletes only the _full.docx older than 30 days", async () => {
    const { supabase, removeCalls } = makeSupabaseMock();
    mockGetSupabaseAdmin.mockReturnValue(supabase as unknown as ReturnType<typeof getSupabaseAdmin>);

    const deleted = await cleanupOldFiles(30 * 24 * 60 * 60 * 1000, { includePattern: /_full\.docx$/ });

    expect(deleted).toBe(1);
    const resultsRemoves = removeCalls.filter((c) => c.bucket === "results").flatMap((c) => c.paths);
    expect(resultsRemoves).toEqual(["job2/formatted_full.docx"]);
  });
});

// Ошибка, которую чинили: обе метлы шли с одним TTL и без паттернов, поэтому
// купленные _full.docx сметались вместе с обычными результатами через 48 ч.
describe("runCleanup — проводка двух метел по файлам", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("зовёт cleanupOldFiles дважды: 48 ч с excludePattern и 30 дней с includePattern", async () => {
    mockCleanupOldFiles.mockResolvedValue(0);

    await runCleanup();

    expect(mockCleanupOldFiles).toHaveBeenCalledTimes(2);

    const [plainTtl, plainOpts] = mockCleanupOldFiles.mock.calls[0];
    expect(plainTtl).toBe(48 * 60 * 60 * 1000);
    expect(plainOpts?.includePattern).toBeUndefined();
    expect("job1/formatted_full.docx").toMatch(plainOpts!.excludePattern!);
    expect("job1/formatted.docx").not.toMatch(plainOpts!.excludePattern!);

    const [fullTtl, fullOpts] = mockCleanupOldFiles.mock.calls[1];
    expect(fullTtl).toBe(30 * 24 * 60 * 60 * 1000);
    expect(fullOpts?.excludePattern).toBeUndefined();
    expect("job2/formatted_full.docx").toMatch(fullOpts!.includePattern!);
    expect("job2/formatted.docx").not.toMatch(fullOpts!.includePattern!);
  });

  it("суммирует удалённое из обеих метел", async () => {
    mockCleanupOldFiles.mockResolvedValueOnce(3).mockResolvedValueOnce(2);

    const result = await runCleanup();

    expect(result.filesDeleted).toBe(5);
  });
});
