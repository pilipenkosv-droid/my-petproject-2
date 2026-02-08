import { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Header } from "@/components/Header";
import { JsonLd } from "@/components/JsonLd";
import { getBreadcrumbSchema } from "@/lib/seo/schemas";
import { getAllPosts } from "@/lib/blog/posts";
import { BookOpen, Clock, ArrowRight, Sparkles, SpellCheck, Pencil, FileText } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { ShareButtons } from "@/components/ShareButtons";

export const metadata: Metadata = {
  title: "Блог — статьи об оформлении научных работ по ГОСТу",
  description:
    "Полезные статьи о форматировании дипломов, курсовых и рефератов. Требования ГОСТ, оформление списка литературы, отступы и интервалы.",
  keywords: [
    "блог SmartFormat",
    "статьи об оформлении",
    "ГОСТ научные работы",
    "форматирование по ГОСТу",
  ],
  alternates: {
    canonical: "https://sformat.online/blog",
  },
};

export default function BlogPage() {
  const posts = getAllPosts();

  return (
    <div className="min-h-screen">
      <Header showBack backHref="/" />

      {/* JSON-LD Schema */}
      <JsonLd
        data={getBreadcrumbSchema([
          { name: "Главная", url: "/" },
          { name: "Блог", url: "/blog" },
        ])}
      />

      <PageHero
        badge={
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500/10 border border-violet-500/20 text-primary text-sm mb-6">
            <BookOpen className="w-4 h-4" />
            Блог
          </div>
        }
        title="Статьи об оформлении научных работ"
        subtitle="Полезные материалы о форматировании по ГОСТу, требованиях вузов и правилах оформления"
      />

      <main className="mx-auto max-w-4xl px-6 py-12">

        {/* Список статей */}
        <div className="space-y-6 mb-12">
          {posts.map((post) => (
            <div
              key={post.slug}
              className="relative bg-surface rounded-xl border border-surface-border hover:bg-surface-hover hover:border-violet-500/30 transition-all group"
            >
              <Link
                href={`/blog/${post.slug}`}
                className="block"
              >
                {post.coverImage && (
                  <div className="overflow-hidden rounded-t-xl">
                    <Image
                      src={post.coverImage}
                      alt={post.title}
                      width={1792}
                      height={1024}
                      className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                )}
                <div className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h2 className="text-lg font-semibold text-foreground mb-2 group-hover:text-primary transition-colors">
                        {post.title}
                      </h2>
                      <p className="text-on-surface-muted text-sm mb-4 line-clamp-2 pr-8">
                        {post.description}
                      </p>
                      <div className="flex items-center gap-4 text-muted-foreground text-sm">
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
                    </div>
                    <ArrowRight className="w-5 h-5 text-muted-foreground/60 group-hover:text-primary transition-colors shrink-0 mt-1" />
                  </div>
                </div>
              </Link>
              <div className="absolute bottom-4 right-4">
                <ShareButtons
                  variant="compact"
                  url={`https://sformat.online/blog/${post.slug}`}
                  title={post.title}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Категории / Теги */}
        <div className="mb-12">
          <h2 className="text-lg font-semibold text-foreground mb-4">
            Популярные темы
          </h2>
          <div className="flex flex-wrap gap-3">
            {[
              "ГОСТ 7.32",
              "Список литературы",
              "Оформление диплома",
              "Курсовая работа",
              "Отступы и интервалы",
              "Таблицы и рисунки",
            ].map((tag) => (
              <span
                key={tag}
                className="px-4 py-2 rounded-full bg-surface border border-surface-border text-on-surface-muted text-sm"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <div className="bg-gradient-to-r from-violet-500/10 to-indigo-500/10 rounded-2xl border border-violet-500/20 p-8">
            <Sparkles className="w-8 h-8 text-primary mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">
              Не хотите разбираться в ГОСТах?
            </h2>
            <p className="text-on-surface-muted mb-6">
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
                href="/faq"
                className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-surface-hover text-foreground font-medium hover:bg-surface-hover transition-colors"
              >
                Частые вопросы
              </Link>
            </div>
            <div className="flex flex-wrap gap-2 justify-center mt-5">
              <span className="text-xs text-muted-foreground self-center">Также попробуйте:</span>
              {[
                { href: "/grammar", icon: SpellCheck, label: "Грамматика" },
                { href: "/sources", icon: BookOpen, label: "Литература" },
                { href: "/rewrite", icon: Pencil, label: "Уникальность" },
                { href: "/outline", icon: FileText, label: "План работы" },
              ].map((tool) => (
                <Link
                  key={tool.href}
                  href={tool.href}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface border border-surface-border text-xs text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                >
                  <tool.icon className="w-3 h-3" />
                  {tool.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
