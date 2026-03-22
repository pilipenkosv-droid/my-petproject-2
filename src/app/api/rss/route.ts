import { getAllPosts } from "@/lib/blog/posts";
import { buildRssFeed } from "@/lib/distribution/rss";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

export async function GET() {
  const posts = getAllPosts();
  const xml = buildRssFeed(posts);

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "s-maxage=3600, stale-while-revalidate",
    },
  });
}
