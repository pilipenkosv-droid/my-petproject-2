import Link from "next/link";
import { HelpCircle } from "lucide-react";

const faqItems = [
  {
    question: "Какие способы оплаты доступны?",
    answer: "Принимаем банковские карты (Visa, MasterCard, МИР), а также оплату через СБП и электронные кошельки.",
  },
  {
    question: "Как работает пробный период?",
    answer: "Первый документ обрабатывается бесплатно без привязки карты. Вы сможете оценить качество форматирования перед покупкой.",
  },
  {
    question: "Можно ли отменить подписку?",
    answer: "Да, подписку можно отменить в любой момент. Доступ сохранится до конца оплаченного периода.",
  },
];

export function PricingFaq() {
  return (
    <div className="mt-16 pt-12 border-t border-surface-border">
      <div className="flex items-center justify-center gap-2 mb-8">
        <HelpCircle className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-semibold text-foreground">Частые вопросы об оплате</h2>
      </div>

      <div className="grid gap-6 max-w-2xl mx-auto">
        {faqItems.map((item) => (
          <div key={item.question} className="bg-surface p-6 border border-surface-border">
            <h3 className="font-medium text-foreground mb-2">{item.question}</h3>
            <p className="text-on-surface-muted text-sm">{item.answer}</p>
          </div>
        ))}
      </div>

      <div className="text-center mt-8">
        <Link
          href="/faq"
          className="text-primary hover:text-primary/80 text-sm transition-colors"
        >
          Все вопросы и ответы →
        </Link>
      </div>
    </div>
  );
}
