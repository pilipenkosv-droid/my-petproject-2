import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();

vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        order: () => mockSelect(),
      }),
    }),
  }),
}));

import { fetchGostPosts, fetchSecondBrainPosts } from "@/lib/blog/posts-db";

function row(slug: string, cluster: "gost" | "second-brain") {
  return {
    slug,
    title: `Заголовок ${slug}`,
    description: "описание",
    content: "текст",
    date_published: "2026-09-01",
    date_modified: null,
    keywords: ["гост"],
    reading_time: "5 мин",
    cover_image: null,
    faqs: null,
    tldr: null,
    cluster,
  };
}

beforeEach(() => {
  mockSelect.mockReset();
});

describe("posts-db cluster filters", () => {
  it("fetchSecondBrainPosts returns only second-brain rows", async () => {
    mockSelect.mockResolvedValue({
      data: [row("a", "gost"), row("b", "second-brain")],
      error: null,
    });
    const posts = await fetchSecondBrainPosts();
    expect(posts.map((p) => p.slug)).toEqual(["b"]);
  });

  it("fetchGostPosts returns only gost rows", async () => {
    mockSelect.mockResolvedValue({
      data: [row("a", "gost"), row("b", "second-brain")],
      error: null,
    });
    const posts = await fetchGostPosts();
    expect(posts.map((p) => p.slug)).toEqual(["a"]);
  });

  it("rows without cluster fall back to second-brain", async () => {
    const legacy = { ...row("c", "second-brain"), cluster: null };
    mockSelect.mockResolvedValue({ data: [legacy], error: null });
    expect((await fetchGostPosts()).length).toBe(0);
    expect((await fetchSecondBrainPosts()).map((p) => p.slug)).toEqual(["c"]);
  });

  it("db error yields empty lists, not a throw", async () => {
    mockSelect.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await fetchGostPosts()).toEqual([]);
    expect(await fetchSecondBrainPosts()).toEqual([]);
  });
});
