import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { JsonLd } from "@/components/JsonLd";
import { getBreadcrumbSchema, getArticleSchema } from "@/lib/seo/schemas";
import { getPostBySlug, getAllPosts } from "@/lib/blog/posts";
import { Clock, ArrowLeft, ArrowRight, Sparkles, BookOpen } from "lucide-react";

interface BlogPostPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const posts = getAllPosts();
  return posts.map((post) => ({
    slug: post.slug,
  }));
}

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    return {
      title: "Статья не найдена",
    };
  }

  return {
    title: post.title,
    description: post.description,
    keywords: post.keywords,
    alternates: {
      canonical: `https://ai-sformat.vercel.app/blog/${slug}`,
    },
    openGraph: {
      title: post.title,
      description: post.description,
      type: "article",
      publishedTime: post.datePublished,
      modifiedTime: post.dateModified || post.datePublished,
      url: `https://ai-sformat.vercel.app/blog/${slug}`,
    },
  };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const allPosts = getAllPosts();
  const currentIndex = allPosts.findIndex((p) => p.slug === slug);
  const prevPost = currentIndex < allPosts.length - 1 ? allPosts[currentIndex + 1] : null;
  const nextPost = currentIndex > 0 ? allPosts[currentIndex - 1] : null;

  return (
    <div className="min-h-screen">
      <Header showBack backHref="/blog" />

      {/* JSON-LD Schema */}
      <JsonLd
        data={getBreadcrumbSchema([
          { name: "Главная", url: "/" },
          { name: "Блог", url: "/blog" },
          { name: post.title, url: `/blog/${slug}` },
        ])}
      />
      <JsonLd
        data={getArticleSchema({
          title: post.title,
          description: post.description,
          slug: post.slug,
          datePublished: post.datePublished,
          dateModified: post.dateModified,
        })}
      />

      <main className="mx-auto max-w-3xl px-6 py-16">
        {/* Заголовок */}
        <div className="mb-8">
          <div className="flex items-center gap-4 text-white/40 text-sm mb-4">
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {post.readingTime}
            </span>
            <span>
              {new Date(post.datePublished).toLocaleDateString("ru-RU", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-4">
            {post.title}
          </h1>
          <p className="text-white/60 text-lg">{post.description}</p>
        </div>

        {/* Контент */}
        <article className="prose prose-invert prose-violet max-w-none mb-12">
          <div
            className="
              [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-white [&_h2]:mt-8 [&_h2]:mb-4
              [&_h3]:text-lg [&_h3]:font-medium [&_h3]:text-white [&_h3]:mt-6 [&_h3]:mb-3
              [&_p]:text-white/70 [&_p]:leading-relaxed [&_p]:mb-4
              [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:text-white/70 [&_ul]:mb-4
              [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:text-white/70 [&_ol]:mb-4
              [&_li]:mb-2
              [&_strong]:text-white [&_strong]:font-medium
              [&_table]:w-full [&_table]:border-collapse [&_table]:mb-4
              [&_th]:bg-white/10 [&_th]:px-4 [&_th]:py-2 [&_th]:text-left [&_th]:text-white [&_th]:font-medium [&_th]:border [&_th]:border-white/20
              [&_td]:px-4 [&_td]:py-2 [&_td]:text-white/70 [&_td]:border [&_td]:border-white/10
              [&_blockquote]:border-l-4 [&_blockquote]:border-violet-500 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-white/60
              [&_code]:bg-white/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-violet-400 [&_code]:text-sm
            "
            dangerouslySetInnerHTML={{ __html: formatContent(post.content) }}
          />
        </article>

        {/* Теги */}
        <div className="mb-12">
          <div className="flex flex-wrap gap-2">
            {post.keywords.map((keyword) => (
              <span
                key={keyword}
                className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/50 text-sm"
              >
                {keyword}
              </span>
            ))}
          </div>
        </div>

        {/* Навигация между статьями */}
        <div className="grid sm:grid-cols-2 gap-4 mb-12">
          {prevPost && (
            <Link
              href={`/blog/${prevPost.slug}`}
              className="flex items-center gap-3 bg-white/5 rounded-xl border border-white/10 p-4 hover:bg-white/10 transition-colors group"
            >
              <ArrowLeft className="w-5 h-5 text-white/40 group-hover:text-violet-400 transition-colors shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-white/40 text-xs mb-1">Предыдущая статья</div>
                <div className="text-white text-sm font-medium truncate">
                  {prevPost.title}
                </div>
              </div>
            </Link>
          )}
          {nextPost && (
            <Link
              href={`/blog/${nextPost.slug}`}
              className="flex items-center gap-3 bg-white/5 rounded-xl border border-white/10 p-4 hover:bg-white/10 transition-colors group sm:text-right"
            >
              <div className="flex-1 min-w-0">
                <div className="text-white/40 text-xs mb-1">Следующая статья</div>
                <div className="text-white text-sm font-medium truncate">
                  {nextPost.title}
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-white/40 group-hover:text-violet-400 transition-colors shrink-0" />
            </Link>
          )}
        </div>

        {/* CTA */}
        <div className="text-center">
          <div className="bg-gradient-to-r from-violet-500/10 to-indigo-500/10 rounded-2xl border border-violet-500/20 p-8">
            <Sparkles className="w-8 h-8 text-violet-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">
              Не хотите разбираться в правилах?
            </h2>
            <p className="text-white/60 mb-6">
              SmartFormat автоматически оформит работу по методичке вашего вуза
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/create"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-violet-500 text-white font-medium hover:bg-violet-600 transition-colors"
              >
                Попробовать бесплатно
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/blog"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white/10 text-white font-medium hover:bg-white/20 transition-colors"
              >
                <BookOpen className="w-4 h-4" />
                Все статьи
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// Простой конвертер markdown в HTML
function formatContent(content: string): string {
  return content
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^\- (.+)$/gm, '<li>$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, (match) => {
      if (match.includes('[ ]') || match.includes('[x]')) {
        return `<ul class="checklist">${match}</ul>`;
      }
      return `<ul>${match}</ul>`;
    })
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hulo])/gm, '<p>')
    .replace(/(?<![>])$/gm, '</p>')
    .replace(/<p><\/p>/g, '')
    .replace(/<p>(<[hulo])/g, '$1')
    .replace(/(<\/[hulo][^>]*>)<\/p>/g, '$1')
    .replace(/\| (.+) \|/g, (match) => {
      const cells = match.split('|').filter(Boolean).map(c => c.trim());
      const isHeader = cells.some(c => c.includes('---'));
      if (isHeader) return '';
      const tag = match.includes('Параметр') || match.includes('Год') ? 'th' : 'td';
      return `<tr>${cells.map(c => `<${tag}>${c}</${tag}>`).join('')}</tr>`;
    })
    .replace(/(<tr>.*<\/tr>\n?)+/g, (match) => `<table><tbody>${match}</tbody></table>`);
}
