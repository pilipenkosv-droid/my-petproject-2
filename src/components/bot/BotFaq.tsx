import { BlurFade } from "@/components/ui/blur-fade";
import { HelpCircle } from "lucide-react";
import Link from "next/link";

const faqItems = [
  {
    q: "Это сложно настроить?",
    a: "Нет. После оплаты ты получаешь ссылку — кликаешь, открывается Telegram, пишешь /start. Занимает 30 секунд.",
  },
  {
    q: "Бот отвечает из интернета или из моих заметок?",
    a: "Только из твоих. Если ты не сохранял про квантовую физику — бот честно скажет, что в твоём архиве этого нет. Никаких галлюцинаций.",
  },
  {
    q: "А если я не особо пользуюсь Telegram?",
    a: "Telegram бесплатный и устанавливается за минуту. 80 миллионов россиян им пользуются — скорее всего, он уже у тебя есть.",
  },
  {
    q: "Мои заметки в безопасности?",
    a: "Да. Хранилище привязано к твоему аккаунту, доступ только у тебя. Никто — даже мы — не читает твои записи.",
  },
  {
    q: "Что входит в Pro Plus кроме бота?",
    a: "10 обработок документов в месяц (форматирование по ГОСТу), проверка грамматики, рерайт, генерация плана работы, подбор литературы. Всё это ещё и доступно прямо в Telegram.",
  },
  {
    q: "Можно отменить подписку?",
    a: "Да, в любой момент. Пишешь в поддержку или отменяешь в личном кабинете. Доступ сохраняется до конца оплаченного периода.",
  },
];

export function BotFaq() {
  return (
    <section className="relative py-24 px-6">
      <div className="mx-auto max-w-3xl">
        <BlurFade delay={0.1} inView>
          <div className="flex items-center justify-center gap-2 mb-8">
            <HelpCircle className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-semibold text-foreground">Частые вопросы</h2>
          </div>
        </BlurFade>

        <div className="grid gap-4">
          {faqItems.map((item, i) => (
            <BlurFade key={i} delay={0.15 + i * 0.05} inView>
              <div className="bg-surface border border-surface-border p-6">
                <h3 className="font-medium text-foreground mb-2">{item.q}</h3>
                <p className="text-sm text-on-surface-muted leading-relaxed">{item.a}</p>
              </div>
            </BlurFade>
          ))}
        </div>

        <div className="text-center mt-6">
          <Link
            href="/faq#bot"
            className="text-primary hover:text-primary/80 text-sm transition-colors"
          >
            Все вопросы и ответы →
          </Link>
        </div>
      </div>
    </section>
  );
}
