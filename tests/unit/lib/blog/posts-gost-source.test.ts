import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGost = vi.fn();
const mockSecondBrain = vi.fn();

vi.mock("@/lib/blog/posts-db", () => ({
  BLOG_POSTS_CACHE_TAG: "blog-posts",
  fetchGostPosts: () => mockGost(),
  fetchSecondBrainPosts: () => mockSecondBrain(),
}));

import { getAllPosts, getPostBySlug } from "@/lib/blog/posts";
import { blogPostsGost } from "@/lib/blog/posts-gost";

const dbGostPost = {
  slug: "nochnaya-statya",
  title: "Ночная статья про ГОСТ",
  description: "из БД",
  content: "текст",
  datePublished: "2026-09-18",
  keywords: ["гост"],
  readingTime: "5 мин",
};

beforeEach(() => {
  mockGost.mockReset();
  mockSecondBrain.mockReset();
  mockSecondBrain.mockResolvedValue([]);
});

describe("gost cluster source selection", () => {
  it("uses DB gost posts when the table has at least one row", async () => {
    mockGost.mockResolvedValue([dbGostPost]);
    const posts = await getAllPosts();
    expect(posts.map((p) => p.slug)).toEqual([dbGostPost.slug]);
  });

  it("falls back to static gost posts when the DB returns none", async () => {
    mockGost.mockResolvedValue([]);
    const posts = await getAllPosts();
    expect(posts.length).toBeGreaterThan(blogPostsGost.length - 1);
    expect(posts.some((p) => p.slug === blogPostsGost[0].slug)).toBe(true);
  });

  it("merges both clusters and sorts by date desc", async () => {
    mockGost.mockResolvedValue([dbGostPost]);
    mockSecondBrain.mockResolvedValue([
      { ...dbGostPost, slug: "bot-post", datePublished: "2026-09-19" },
    ]);
    const posts = await getAllPosts();
    expect(posts.map((p) => p.slug)).toEqual(["bot-post", "nochnaya-statya"]);
  });

  it("getPostBySlug finds a DB gost post", async () => {
    mockGost.mockResolvedValue([dbGostPost]);
    const post = await getPostBySlug(dbGostPost.slug);
    expect(post?.description).toBe("из БД");
  });

  it("getPostBySlug falls back to static when DB is empty", async () => {
    mockGost.mockResolvedValue([]);
    const post = await getPostBySlug(blogPostsGost[0].slug);
    expect(post?.slug).toBe(blogPostsGost[0].slug);
  });
});
