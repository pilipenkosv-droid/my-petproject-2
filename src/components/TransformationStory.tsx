import { BlurFade } from "@/components/ui/blur-fade";

interface Story {
  id: string;
  heading: string;
  subheading: string;
  before: {
    label: string;
    text: string;
    attribution: string;
  };
  after: {
    label: string;
    text: string;
    attribution: string;
  };
}

const stories: Story[] = [
  {
    id: "deadline",
    heading: "Ты узнаёшь эту ночь",
    subheading: "Один и тот же диплом. Два разных способа.",
    before: {
      label: "Без Diplox",
      text: "Сдача послезавтра. Текст готов. Открываю методичку: поля 30-15-20-20, Times New Roman 14, интервал 1,5... Начинаю вручную. Час прошёл — а я только на третьей странице. Преподаватель говорит: «Переделай оформление.» Ещё день потерян.",
      attribution: "— Настя, ВШЭ, 3 курс",
    },
    after: {
      label: "С Diplox",
      text: "Загрузила методичку и документ. Через 3 минуты скачала готовый файл. Нормоконтроль — без единого замечания. Однокурсники всё ещё правят отступы вручную.",
      attribution: "— Настя, ВШЭ, 3 курс — тот же диплом, другой способ",
    },
  },
  {
    id: "writing-block",
    heading: "Пустой экран в час ночи",
    subheading: "Та же глава. Два разных вечера.",
    before: {
      label: "Без Diplox",
      text: "Магистратура, первая глава, сдача через неделю. Сижу перед пустым Word — лобная кора саботирует всё. Час смотрю в экран, пишу абзац, удаляю. Снова открываю соцсети. К полуночи — полторы страницы ни о чём.",
      attribution: "— Ксения, МГУ, 1 курс магистратуры",
    },
    after: {
      label: "С Diplox",
      text: "Написала боту /outline + тему главы. За 20 минут получила структуру из 7 разделов с тезисами. Стало ясно, что писать. За вечер закрыла черновик первой главы — 18 страниц. Научрук принял с первого раза.",
      attribution: "— Ксения, МГУ, 1 курс магистратуры — та же глава, другой вечер",
    },
  },
];

export function TransformationStory() {
  return (
    <section className="relative py-24 px-6">
      <div className="relative mx-auto max-w-4xl space-y-12">
        {stories.map((story, storyIndex) => (
          <div key={story.id}>
            <BlurFade delay={0.1 + storyIndex * 0.15} inView>
              <h2 className="text-2xl sm:text-3xl font-bold text-center mb-4">
                {story.heading}
              </h2>
            </BlurFade>
            <BlurFade delay={0.2 + storyIndex * 0.15} inView>
              <p className="text-center text-on-surface-subtle mb-12 max-w-xl mx-auto">
                {story.subheading}
              </p>
            </BlurFade>

            <div className="border border-border">
              <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
                {/* Before */}
                <BlurFade delay={0.3 + storyIndex * 0.15} inView>
                  <div className="p-8">
                    <span className="text-xs font-mono text-red-400 uppercase tracking-widest mb-4 block">
                      {story.before.label}
                    </span>
                    <p className="text-on-surface-muted leading-relaxed text-sm">
                      {story.before.text}
                    </p>
                    <p className="text-xs text-muted-foreground mt-4 italic">
                      {story.before.attribution}
                    </p>
                  </div>
                </BlurFade>

                {/* After */}
                <BlurFade delay={0.4 + storyIndex * 0.15} inView>
                  <div className="p-8">
                    <span className="text-xs font-mono text-emerald-500 uppercase tracking-widest mb-4 block">
                      {story.after.label}
                    </span>
                    <p className="text-on-surface-muted leading-relaxed text-sm">
                      {story.after.text}
                    </p>
                    <p className="text-xs text-muted-foreground mt-4 italic">
                      {story.after.attribution}
                    </p>
                  </div>
                </BlurFade>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
